use serde::Deserialize;
use std::io::{BufRead, BufReader, Cursor};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;

use exif::{In, Tag};
use image::DynamicImage;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

static CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);
static RUNNING: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
static CHILD_JOB: Mutex<Option<win32job::Job>> = Mutex::new(None);

#[cfg(target_os = "windows")]
fn assign_child_to_job(child: &std::process::Child) -> Result<(), String> {
    use std::os::windows::io::AsRawHandle;
    let job = win32job::Job::create().map_err(|e| e.to_string())?;
    let mut info = job.query_extended_limit_info().map_err(|e| e.to_string())?;
    info.limit_kill_on_job_close();
    job.set_extended_limit_info(&info).map_err(|e| e.to_string())?;
    job.assign_process(child.as_raw_handle() as isize)
        .map_err(|e| e.to_string())?;
    *CHILD_JOB.lock().unwrap() = Some(job);
    Ok(())
}

#[cfg(target_os = "windows")]
fn release_child_job() {
    *CHILD_JOB.lock().unwrap() = None;
}

#[derive(Deserialize)]
pub struct InferenceParams {
    pub sd_path: String,
    pub output_path: String,
    pub models_path: String,
    pub vae_path: String,
    pub llm_path: String,
    pub lora_path: String,
    pub llm_vision_path: String,
    pub clip_l_path: String,
    pub clip_g_path: String,
    pub t5xxl_path: String,
    pub model: String,
    pub model_type: String,
    pub llm: String,
    pub vae: String,
    pub lora: String,
    pub lora_weight: f32,
    pub llm_vision: String,
    pub clip_l: String,
    pub clip_g: String,
    pub t5xxl: String,
    pub prompt: String,
    pub negative_prompt: String,
    pub width: u32,
    pub height: u32,
    pub steps: Option<u32>,
    pub cfg_scale: Option<f32>,
    pub guidance: Option<f32>,
    pub seed: i64,
    pub batch_count: u32,
    pub max_vram: f32,
    pub sampler: String,
    pub scheduler: String,
    pub vae_on_cpu: bool,
    pub clip_on_cpu: bool,
    pub offload_to_cpu: bool,
    pub diffusion_fa: bool,
    pub vae_tiling: bool,
    pub verbose: bool,
    pub force_cuda: bool,
    pub custom_flags: String,
    pub input_image: Option<String>,
    pub strength: Option<f32>,
    pub mask_image: Option<String>,
}

fn normalize_orientation(bytes: &[u8]) -> Result<DynamicImage, Box<dyn std::error::Error>> {
    let orientation = {
        let mut cursor = Cursor::new(bytes);
        let exifreader = exif::Reader::new();
        match exifreader.read_from_container(&mut cursor) {
            Ok(exif_data) => exif_data
                .get_field(Tag::Orientation, In::PRIMARY)
                .and_then(|f| f.value.get_uint(0))
                .unwrap_or(1),
            Err(_) => 1,
        }
    };

    let img = image::load_from_memory(bytes)?;

    let corrected = match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    };

    Ok(corrected)
}

fn decode_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    let b64 = data_url
        .split_once(',')
        .map(|(_, b64)| b64)
        .ok_or("Data URL de máscara inválida")?;
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("No se pudo decodificar la máscara: {}", e))
}

fn cleanup_temp_files(
    temp_input: &Option<std::path::PathBuf>,
    temp_mask: &Option<std::path::PathBuf>,
) {
    if let Some(temp) = temp_input {
        let _ = std::fs::remove_file(temp);
    }
    if let Some(temp) = temp_mask {
        let _ = std::fs::remove_file(temp);
    }
}

#[tauri::command]
pub async fn prepare_inpaint_image(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        let orientation = {
            let mut cursor = Cursor::new(&bytes);
            let exifreader = exif::Reader::new();
            exifreader
                .read_from_container(&mut cursor)
                .ok()
                .and_then(|exif_data| {
                    exif_data
                        .get_field(Tag::Orientation, In::PRIMARY)
                        .and_then(|f| f.value.get_uint(0))
                })
                .unwrap_or(1)
        };

        if orientation == 1 {
            return Ok(path);
        }

        let corrected = normalize_orientation(&bytes).map_err(|e| e.to_string())?;
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        path.hash(&mut hasher);
        let temp_path = std::env::temp_dir().join(format!("sd_frontend_inpaint_{:x}.png", hasher.finish()));
        corrected.save(&temp_path).map_err(|e| e.to_string())?;
        Ok(temp_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn run_inference(app: tauri::AppHandle, params: InferenceParams) -> Result<(), String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let has_mask = params.mask_image.as_ref().is_some_and(|m| !m.is_empty());
    let has_input_image = params.input_image.is_some();
    let output_dir = if has_mask {
        let inpaint_dir = Path::new(&params.output_path).join("inpainting");
        if !inpaint_dir.exists() {
            std::fs::create_dir_all(&inpaint_dir).map_err(|e| e.to_string())?;
        }
        inpaint_dir
    } else if has_input_image {
        let img2img_dir = Path::new(&params.output_path).join("img2img");
        if !img2img_dir.exists() {
            std::fs::create_dir_all(&img2img_dir).map_err(|e| e.to_string())?;
        }
        img2img_dir
    } else {
        Path::new(&params.output_path).to_path_buf()
    };

    let output_file = output_dir
        .join(format!("gen_{}.png", timestamp))
        .to_string_lossy()
        .to_string();

    let sd_bin =
        Path::new(&params.sd_path).join(format!("sd-cli.{}", std::env::consts::EXE_EXTENSION));

    let mut cmd = Command::new(&sd_bin);

    if params.force_cuda {
        cmd.arg("--backend")
            .arg("cuda0")
            .arg("--params-backend")
            .arg("cpu");
    }

    if !params.model.is_empty() {
        let flag = if params.model_type == "diffusion" {
            "--diffusion-model"
        } else {
            "-m"
        };
        cmd.arg(flag)
            .arg(Path::new(&params.models_path).join(&params.model));
    }

    if !params.llm.is_empty() {
        let p = Path::new(&params.llm_path).join(&params.llm);
        if p.exists() {
            cmd.arg("--llm").arg(p);
        }
    }

    if !params.vae.is_empty() {
        let p = Path::new(&params.vae_path).join(&params.vae);
        if p.exists() {
            cmd.arg("--vae").arg(p);
        }
    }

    if !params.lora.is_empty() {
        let lora_dir = Path::new(&params.lora_path);
        if lora_dir.exists() {
            cmd.arg("--lora-model-dir").arg(lora_dir);
        }
    }

    if !params.llm_vision.is_empty() {
        let p = Path::new(&params.llm_vision_path).join(&params.llm_vision);
        if p.exists() {
            cmd.arg("--llm_vision").arg(p);
        }
    }

    if !params.clip_l.is_empty() {
        let p = Path::new(&params.clip_l_path).join(&params.clip_l);
        if p.exists() {
            cmd.arg("--clip_l").arg(p);
        }
    }

    if !params.clip_g.is_empty() {
        let p = Path::new(&params.clip_g_path).join(&params.clip_g);
        if p.exists() {
            cmd.arg("--clip_g").arg(p);
        }
    }

    if !params.t5xxl.is_empty() {
        let p = Path::new(&params.t5xxl_path).join(&params.t5xxl);
        if p.exists() {
            cmd.arg("--t5xxl").arg(p);
        }
    }

    let mut prompt = params.prompt.clone();
    if !params.lora.is_empty() {
        let lora_name = Path::new(&params.lora)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&params.lora);
        prompt.push_str(&format!(" <lora:{}:{}>", lora_name, params.lora_weight));
    }

    cmd.arg("-p")
        .arg(&prompt)
        .arg("-n")
        .arg(&params.negative_prompt)
        .arg("-W")
        .arg(params.width.to_string())
        .arg("-H")
        .arg(params.height.to_string())
        .arg("-s")
        .arg(params.seed.to_string())
        .arg("-b")
        .arg(params.batch_count.to_string())
        .arg("--sampling-method")
        .arg(&params.sampler)
        .arg("-o")
        .arg(&output_file);

    if let Some(steps) = params.steps {
        cmd.arg("--steps").arg(steps.to_string());
    }

    if let Some(cfg) = params.cfg_scale {
        cmd.arg("--cfg-scale").arg(cfg.to_string());
    }

    if let Some(guid) = params.guidance {
        cmd.arg("--guidance").arg(guid.to_string());
    }

    if !params.scheduler.is_empty() {
        cmd.arg("--scheduler").arg(&params.scheduler);
    }

    if params.max_vram != 0.0 {
        cmd.arg("--max-vram").arg(params.max_vram.to_string());
    }

    if params.vae_on_cpu {
        cmd.arg("--vae-on-cpu");
    }
    if params.clip_on_cpu {
        cmd.arg("--clip-on-cpu");
    }
    if params.offload_to_cpu {
        cmd.arg("--offload-to-cpu");
    }
    if params.diffusion_fa {
        cmd.arg("--diffusion-fa");
    }
    if params.vae_tiling {
        cmd.arg("--vae-tiling");
    }
    if params.verbose {
        cmd.arg("-v");
    }

    if !params.custom_flags.is_empty() {
        for line in params.custom_flags.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                for arg in trimmed.split_whitespace() {
                    cmd.arg(arg);
                }
            }
        }
    }

    let temp_input = if let Some(ref input_image) = params.input_image {
        let bytes = std::fs::read(input_image).map_err(|e| e.to_string())?;
        let corrected = normalize_orientation(&bytes).map_err(|e| e.to_string())?;
        let temp_path = output_dir.join(format!("temp_input_{}.png", timestamp));
        corrected.save(&temp_path).map_err(|e| e.to_string())?;
        cmd.arg("-i").arg(&temp_path);
        Some(temp_path)
    } else {
        None
    };
    if let Some(strength) = params.strength {
        cmd.arg("--strength").arg(strength.to_string());
    }

    let temp_mask = if has_mask {
        let mask_bytes = decode_data_url(params.mask_image.as_ref().unwrap())?;
        let mask_img = image::load_from_memory(&mask_bytes)
            .map_err(|e| format!("No se pudo leer la máscara: {}", e))?;
        let mask_path = output_dir.join(format!("temp_mask_{}.png", timestamp));
        mask_img.save(&mask_path).map_err(|e| e.to_string())?;
        cmd.arg("--mask").arg(&mask_path);
        Some(mask_path)
    } else {
        None
    };

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("No se pudo lanzar sd-cli: {}", e))?;

    #[cfg(target_os = "windows")]
    if let Err(e) = assign_child_to_job(&child) {
        let _ = child.kill();
        return Err(e);
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    RUNNING.store(true, Ordering::SeqCst);
    *CHILD.lock().unwrap() = Some(child);

    let app_stdout = app.clone();
    let app_stderr = app.clone();

    let t_stdout = std::thread::spawn(move || {
        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                if !RUNNING.load(Ordering::SeqCst) {
                    break;
                }
                let _ = app_stdout.emit("console-line", &line);
            }
        }
    });

    let t_stderr = std::thread::spawn(move || {
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if !RUNNING.load(Ordering::SeqCst) {
                    break;
                }
                let _ = app_stderr.emit("console-line", &line);
            }
        }
    });

    let status = loop {
        {
            let mut guard = CHILD.lock().unwrap();
            match guard.as_mut() {
                Some(child) => match child.try_wait() {
                    Ok(Some(exit)) => break Ok(exit),
                    Ok(None) => {}
                    Err(e) => break Err(e.to_string()),
                },
                None => break Err("No hay proceso hijo".to_string()),
            }
        }
        std::thread::sleep(Duration::from_secs(1));
    };

    let was_running = RUNNING.swap(false, Ordering::SeqCst);
    *CHILD.lock().unwrap() = None;
    #[cfg(target_os = "windows")]
    release_child_job();

    let _ = t_stdout.join();
    let _ = t_stderr.join();

    if !was_running {
        cleanup_temp_files(&temp_input, &temp_mask);
        let _ = app.emit("console-line", "[ABORTADO] Inferencia cancelada.");
        let _ = app.emit("inference-aborted", ());
        return Ok(());
    }

    match status {
        Ok(s) if s.success() => {
            let prefix = format!("gen_{}", timestamp);
            let out_dir = &output_dir;
            let mut files: Vec<String> = Vec::new();

            if let Ok(entries) = std::fs::read_dir(out_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let name_str = name.to_string_lossy();
                    if name_str.starts_with(&prefix) && name_str.ends_with(".png") {
                        files.push(entry.path().to_string_lossy().to_string());
                    }
                }
            }

            files.sort();
            if files.is_empty() {
                files.push(output_file);
            }

            cleanup_temp_files(&temp_input, &temp_mask);

            let _ = app.emit("inference-done", &files);
            Ok(())
        }
        Ok(s) => {
            cleanup_temp_files(&temp_input, &temp_mask);
            Err(format!("sd-cli terminó con código {:?}", s.code()))
        }
        Err(e) => {
            cleanup_temp_files(&temp_input, &temp_mask);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn abort_inference(app: tauri::AppHandle) -> Result<(), String> {
    RUNNING.store(false, Ordering::SeqCst);
    let mut guard = CHILD.lock().unwrap();
    if let Some(child) = guard.as_mut() {
        let _ = child.kill();
        let _ = app.emit("console-line", "[ABORTADO] Terminando proceso...");
    }
    Ok(())
}

#[tauri::command]
pub async fn run_upscale(
    app: tauri::AppHandle,
    sd_path: String,
    output_path: String,
    upscalers_path: String,
    model: String,
    input_image: String,
) -> Result<(), String> {
    let scaled_dir = Path::new(&output_path).join("scaled");
    if !scaled_dir.exists() {
        std::fs::create_dir_all(&scaled_dir).map_err(|e| e.to_string())?;
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let output_file = scaled_dir.join(format!("scaled_{}.png", timestamp));

    let sd_bin = Path::new(&sd_path).join(format!("sd-cli.{}", std::env::consts::EXE_EXTENSION));

    let upscale_model = Path::new(&upscalers_path).join(&model);

    let mut cmd = Command::new(&sd_bin);
    cmd.arg("--mode")
        .arg("upscale")
        .arg("--upscale-model")
        .arg(upscale_model)
        .arg("-i")
        .arg(&input_image)
        .arg("-o")
        .arg(&output_file);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    if let Err(e) = assign_child_to_job(&child) {
        let _ = child.kill();
        return Err(e);
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    RUNNING.store(true, Ordering::SeqCst);
    *CHILD.lock().unwrap() = Some(child);

    let app_stdout = app.clone();
    let app_stderr = app.clone();

    let t_stdout = std::thread::spawn(move || {
        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                if !RUNNING.load(Ordering::SeqCst) {
                    break;
                }
                let _ = app_stdout.emit("console-line", &line);
            }
        }
    });

    let t_stderr = std::thread::spawn(move || {
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if !RUNNING.load(Ordering::SeqCst) {
                    break;
                }
                let _ = app_stderr.emit("console-line", &line);
            }
        }
    });

    let status = loop {
        {
            let mut guard = CHILD.lock().unwrap();
            match guard.as_mut() {
                Some(child) => match child.try_wait() {
                    Ok(Some(exit)) => break Ok(exit),
                    Ok(None) => {}
                    Err(e) => break Err(e.to_string()),
                },
                None => break Err("No hay proceso hijo".to_string()),
            }
        }
        std::thread::sleep(Duration::from_secs(1));
    };

    let was_running = RUNNING.swap(false, Ordering::SeqCst);
    *CHILD.lock().unwrap() = None;
    #[cfg(target_os = "windows")]
    release_child_job();

    let _ = t_stdout.join();
    let _ = t_stderr.join();

    if !was_running {
        let _ = app.emit("console-line", "[ABORTADO] Upscale cancelado.");
        return Ok(());
    }

    match status {
        Ok(s) if s.success() => {
            let _ = app.emit("upscale-done", output_file.to_string_lossy().to_string());
            Ok(())
        }
        Ok(s) => Err(format!("sd-cli terminó con código {:?}", s.code())),
        Err(e) => Err(e),
    }
}
