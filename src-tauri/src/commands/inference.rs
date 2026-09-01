use serde::Deserialize;
use std::path::Path;
use std::process::Command;
use tauri::Emitter;

use crate::cli::builder;
use crate::cli::builder::LoraItem;
use crate::image::temp::{save_normalized, TempFiles};
use crate::process::manager;

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
    #[serde(default)]
    pub lora: String,
    #[serde(default)]
    pub lora_weight: f32,
    #[serde(default)]
    pub loras: Vec<LoraItem>,
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
    pub threads: i32,
    pub sampler: String,
    pub scheduler: String,
    pub vae_on_cpu: bool,
    pub clip_on_cpu: bool,
    pub offload_to_cpu: bool,
    pub fa: bool,
    pub diffusion_fa: bool,
    pub vae_tiling: bool,
    pub mmap: bool,
    pub verbose: bool,
    pub force_cuda: bool,
    pub custom_flags: String,
    pub edit_image: Option<String>,
    pub input_image: Option<String>,
    pub strength: Option<f32>,
    pub mask_image: Option<String>,
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

fn resolve_output_dir(base: &Path, has_mask: bool, has_edit: bool, has_input: bool) -> std::path::PathBuf {
    builder::resolve_output_dir(base, has_mask, has_edit, has_input)
}

fn validate_image_params(has_edit: bool, has_input: bool, has_mask: bool) -> Result<(), String> {
    if has_edit && has_input {
        return Err("No se puede usar -r (edit) y -i (img2img) a la vez.".to_string());
    }
    if has_edit && has_mask {
        return Err("No se puede usar -r (edit) con --mask.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn run_inference(app: tauri::AppHandle, params: InferenceParams) -> Result<(), String> {
    let timestamp = builder::now_secs();

    let has_mask = params.mask_image.as_ref().is_some_and(|m| !m.is_empty());
    let has_edit_image = params.edit_image.as_ref().is_some_and(|m| !m.is_empty());
    let has_input_image = params.input_image.as_ref().is_some_and(|m| !m.is_empty());

    validate_image_params(has_edit_image, has_input_image, has_mask)?;

    let output_dir = resolve_output_dir(Path::new(&params.output_path), has_mask, has_edit_image, has_input_image);
    if output_dir != Path::new(&params.output_path) && !output_dir.exists() {
        std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;
    }

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

    builder::push_model_arg(&mut cmd, "--llm", &params.llm_path, &params.llm);
    builder::push_model_arg(&mut cmd, "--vae", &params.vae_path, &params.vae);
    if !params.lora.is_empty() || !params.loras.is_empty() {
        let lora_dir = Path::new(&params.lora_path);
        if lora_dir.exists() {
            cmd.arg("--lora-model-dir").arg(lora_dir);
        }
    }
    builder::push_model_arg(&mut cmd, "--llm_vision", &params.llm_vision_path, &params.llm_vision);
    builder::push_model_arg(&mut cmd, "--clip_l", &params.clip_l_path, &params.clip_l);
    builder::push_model_arg(&mut cmd, "--clip_g", &params.clip_g_path, &params.clip_g);
    builder::push_model_arg(&mut cmd, "--t5xxl", &params.t5xxl_path, &params.t5xxl);

    if !params.loras.is_empty() {
        builder::push_prompt_with_loras(&mut cmd, &params.prompt, &params.loras);
    } else {
        builder::push_prompt(&mut cmd, &params.prompt, &params.lora, params.lora_weight);
    }
    cmd.arg("-n")
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

    if params.threads != -1 {
        cmd.arg("-t").arg(params.threads.to_string());
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
    if params.fa {
        cmd.arg("--fa");
    } else if params.diffusion_fa {
        cmd.arg("--diffusion-fa");
    }
    if params.vae_tiling {
        cmd.arg("--vae-tiling");
    }
    if params.mmap {
        cmd.arg("--mmap");
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

    let mut temps = TempFiles::new();

    if let Some(ref edit_image) = params.edit_image {
        let temp_path = output_dir.join(format!("temp_edit_{}.png", timestamp));
        save_normalized(edit_image, &temp_path)?;
        cmd.arg("-r").arg(&temp_path);
        temps.edit = Some(temp_path);
    }

    if let Some(ref input_image) = params.input_image {
        let temp_path = output_dir.join(format!("temp_input_{}.png", timestamp));
        save_normalized(input_image, &temp_path)?;
        cmd.arg("-i").arg(&temp_path);
        temps.input = Some(temp_path);
    }
    if has_input_image {
        if let Some(strength) = params.strength {
            cmd.arg("--strength").arg(strength.to_string());
        }
    }

    if has_mask {
        let mask_bytes = decode_data_url(params.mask_image.as_ref().unwrap())?;
        let mask_img = image::load_from_memory(&mask_bytes)
            .map_err(|e| format!("No se pudo leer la máscara: {}", e))?;
        let mask_path = output_dir.join(format!("temp_mask_{}.png", timestamp));
        mask_img.save(&mask_path).map_err(|e| e.to_string())?;
        cmd.arg("--mask").arg(&mask_path);
        temps.mask = Some(mask_path);
    }

    let (status, was_running) = manager::spawn_sd_process(cmd, &app).map_err(|e| e.to_string())?;

    // Keep temps alive until after spawn; Drop will clean on any return
    let _keep = &temps;

    if !was_running {
        let _ = app.emit("console-line", "[ABORTADO] Inferencia cancelada.");
        let _ = app.emit("inference-aborted", ());
        return Ok(());
    }

    if status.success() {
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

        let _ = app.emit("inference-done", &files);
        Ok(())
    } else {
        Err(format!("sd-cli terminó con código {:?}", status.code()))
    }
}

#[tauri::command]
pub async fn abort_inference(app: tauri::AppHandle) -> Result<(), String> {
    manager::abort_process(&app)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn resolve_output_dir_exact() {
        let base = Path::new("/tmp/out");
        assert_eq!(resolve_output_dir(base, true, false, false), base.join("inpainting"));
        assert_eq!(resolve_output_dir(base, false, true, false), base.join("edit"));
        assert_eq!(resolve_output_dir(base, false, false, true), base.join("img2img"));
        assert_eq!(resolve_output_dir(base, false, false, false), base);
    }

    #[test]
    fn resolve_output_dir_priority() {
        let base = Path::new("/tmp/out");
        // mask wins over everything
        assert_eq!(resolve_output_dir(base, true, false, true), base.join("inpainting"));
        assert_eq!(resolve_output_dir(base, true, true, false), base.join("inpainting"));
        assert_eq!(resolve_output_dir(base, true, true, true), base.join("inpainting"));
        // edit wins over input
        assert_eq!(resolve_output_dir(base, false, true, true), base.join("edit"));
    }

    #[test]
    fn validate_exclusive_ok() {
        assert!(validate_image_params(false, false, false).is_ok());
        assert!(validate_image_params(true, false, false).is_ok());
        assert!(validate_image_params(false, true, false).is_ok());
        assert!(validate_image_params(false, false, true).is_ok());
        assert!(validate_image_params(false, true, true).is_ok());
    }

    #[test]
    fn validate_edit_input_fails_exact() {
        let err = validate_image_params(true, true, false).unwrap_err();
        assert_eq!(err, "No se puede usar -r (edit) y -i (img2img) a la vez.");
    }

    #[test]
    fn validate_edit_mask_fails_exact() {
        let err = validate_image_params(true, false, true).unwrap_err();
        assert_eq!(err, "No se puede usar -r (edit) con --mask.");
    }

    #[test]
    fn validate_all_combinations() {
        let cases = [
            ((false, false, false), true),
            ((true, false, false), true),
            ((false, true, false), true),
            ((false, false, true), true),
            ((false, true, true), true),
            ((true, true, false), false),
            ((true, false, true), false),
            ((true, true, true), false),
        ];
        for ((e, i, m), ok) in cases {
            assert_eq!(validate_image_params(e, i, m).is_ok(), ok, "e={e} i={i} m={m}");
        }
    }

    #[test]
    fn decode_data_url_ok() {
        let png_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
        let bytes = decode_data_url(png_b64).unwrap();
        assert_eq!(bytes.len(), 68);
        assert_eq!(&bytes[0..8], &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    }

    #[test]
    fn decode_data_url_invalid() {
        assert_eq!(decode_data_url("not-a-data-url").unwrap_err(), "Data URL de máscara inválida");
        assert!(decode_data_url("data:image/png;base64,@@@").unwrap_err().contains("No se pudo decodificar"));
        assert_eq!(decode_data_url("data:text/plain;base64,SGVsbG8=").unwrap(), b"Hello");
    }
}
