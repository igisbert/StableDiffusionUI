use serde::Deserialize;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::Emitter;

static CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);
static RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Deserialize)]
pub struct InferenceParams {
    pub sd_path: String,
    pub output_path: String,
    pub models_path: String,
    pub vae_path: String,
    pub llm_path: String,
    pub lora_path: String,
    pub model: String,
    pub model_type: String,
    pub llm: String,
    pub vae: String,
    pub lora: String,
    pub lora_weight: f32,
    pub prompt: String,
    pub negative_prompt: String,
    pub width: u32,
    pub height: u32,
    pub steps: u32,
    pub cfg_scale: f32,
    pub guidance: f32,
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
}

#[tauri::command]
pub async fn run_inference(
    app: tauri::AppHandle,
    params: InferenceParams,
) -> Result<(), String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let output_file = Path::new(&params.output_path)
        .join(format!("gen_{}.png", timestamp))
        .to_string_lossy()
        .to_string();

    let sd_bin = Path::new(&params.sd_path)
        .join(format!("sd-cli.{}", std::env::consts::EXE_EXTENSION));

    let mut cmd = Command::new(&sd_bin);

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
        if p.exists() { cmd.arg("--llm").arg(p); }
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

    let mut prompt = params.prompt.clone();
    if !params.lora.is_empty() {
        let lora_name = Path::new(&params.lora)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&params.lora);
        prompt.push_str(&format!(" <lora:{}:{}>", lora_name, params.lora_weight));
    }

    cmd.arg("-p").arg(&prompt)
       .arg("-n").arg(&params.negative_prompt)
       .arg("-W").arg(params.width.to_string())
       .arg("-H").arg(params.height.to_string())
       .arg("--steps").arg(params.steps.to_string())
       .arg("--cfg-scale").arg(params.cfg_scale.to_string())
       .arg("--guidance").arg(params.guidance.to_string())
       .arg("-s").arg(params.seed.to_string())
       .arg("-b").arg(params.batch_count.to_string())
       .arg("--sampling-method").arg(&params.sampler)
       .arg("-o").arg(&output_file);

    if !params.scheduler.is_empty() {
        cmd.arg("--scheduler").arg(&params.scheduler);
    }

    if params.max_vram != 0.0 {
        cmd.arg("--max-vram").arg(params.max_vram.to_string());
    }

    if params.vae_on_cpu    { cmd.arg("--vae-on-cpu"); }
    if params.clip_on_cpu   { cmd.arg("--clip-on-cpu"); }
    if params.offload_to_cpu { cmd.arg("--offload-to-cpu"); }
    if params.diffusion_fa  { cmd.arg("--diffusion-fa"); }
    if params.vae_tiling    { cmd.arg("--vae-tiling"); }

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn()
        .map_err(|e| format!("No se pudo lanzar sd-cli: {}", e))?;

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
                if !RUNNING.load(Ordering::SeqCst) { break; }
                let _ = app_stdout.emit("console-line", &line);
            }
        }
    });

    let t_stderr = std::thread::spawn(move || {
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if !RUNNING.load(Ordering::SeqCst) { break; }
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

    let _ = t_stdout.join();
    let _ = t_stderr.join();

    if !was_running {
        let _ = app.emit("console-line", "[ABORTADO] Inferencia cancelada.");
        let _ = app.emit("inference-aborted", ());
        return Ok(());
    }

    match status {
        Ok(s) if s.success() => {
            let prefix = format!("gen_{}", timestamp);
            let out_dir = Path::new(&params.output_path);
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

            let _ = app.emit("inference-done", &files);
            Ok(())
        }
        Ok(s) => Err(format!("sd-cli terminó con código {:?}", s.code())),
        Err(e) => Err(e),
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
