use serde::Deserialize;
use std::path::{Path, PathBuf};
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
    #[serde(default)]
    pub edit_images: Vec<String>,
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

/// Number of usable reference images (empty entries are ignored).
fn count_edit_images(edit_images: &[String]) -> usize {
    edit_images.iter().filter(|p| !p.is_empty()).count()
}

fn validate_edit_images(edit_images: &[String]) -> Result<usize, String> {
    let count = count_edit_images(edit_images);
    if count > builder::MAX_REFERENCE_IMAGES {
        return Err(format!(
            "Máximo {} imágenes de referencia (se han recibido {}).",
            builder::MAX_REFERENCE_IMAGES,
            count
        ));
    }
    Ok(count)
}

fn validate_params(params: &InferenceParams) -> Result<(), String> {
    if params.sampler.trim().is_empty() {
        return Err("Selecciona un método de muestreo (sampler) antes de continuar.".to_string());
    }
    Ok(())
}

/// Concrete paths the CLI needs. The run uses normalized temp files; the
/// preview uses the original files and a placeholder mask.
struct CliPaths {
    refs: Vec<PathBuf>,
    input: Option<PathBuf>,
    mask: Option<PathBuf>,
    output: Option<PathBuf>,
}

/// Single source of truth for the argument list: used both by "Copiar"
/// (`preview_inference_command`) and by the real run.
fn build_cli_args(params: &InferenceParams, paths: &CliPaths) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();

    builder::push_backend_args(
        &mut args,
        params.force_cuda,
        params.clip_on_cpu,
        params.vae_on_cpu,
    );

    if !params.model.is_empty() {
        let flag = if params.model_type == "diffusion" {
            "--diffusion-model"
        } else {
            "-m"
        };
        args.push(flag.to_string());
        args.push(
            Path::new(&params.models_path)
                .join(&params.model)
                .to_string_lossy()
                .into_owned(),
        );
    }

    builder::push_model_arg(&mut args, "--llm", &params.llm_path, &params.llm);
    builder::push_model_arg(&mut args, "--vae", &params.vae_path, &params.vae);
    if !params.lora.is_empty() || !params.loras.is_empty() {
        let lora_dir = Path::new(&params.lora_path);
        if lora_dir.exists() {
            args.push("--lora-model-dir".to_string());
            args.push(lora_dir.to_string_lossy().into_owned());
        }
    }
    builder::push_model_arg(&mut args, "--llm_vision", &params.llm_vision_path, &params.llm_vision);
    builder::push_model_arg(&mut args, "--clip_l", &params.clip_l_path, &params.clip_l);
    builder::push_model_arg(&mut args, "--clip_g", &params.clip_g_path, &params.clip_g);
    builder::push_model_arg(&mut args, "--t5xxl", &params.t5xxl_path, &params.t5xxl);

    if !params.loras.is_empty() {
        builder::push_prompt_with_loras(&mut args, &params.prompt, &params.loras);
    } else {
        builder::push_prompt(&mut args, &params.prompt, &params.lora, params.lora_weight);
    }

    if !params.negative_prompt.is_empty() {
        args.push("-n".to_string());
        args.push(params.negative_prompt.clone());
    }

    args.push("-W".to_string());
    args.push(params.width.to_string());
    args.push("-H".to_string());
    args.push(params.height.to_string());
    args.push("-s".to_string());
    args.push(params.seed.to_string());
    args.push("-b".to_string());
    args.push(params.batch_count.to_string());

    if !params.sampler.is_empty() {
        args.push("--sampling-method".to_string());
        args.push(params.sampler.clone());
    }

    if let Some(output) = &paths.output {
        args.push("-o".to_string());
        args.push(output.to_string_lossy().into_owned());
    }

    if let Some(steps) = params.steps {
        args.push("--steps".to_string());
        args.push(steps.to_string());
    }

    if let Some(cfg) = params.cfg_scale {
        args.push("--cfg-scale".to_string());
        args.push(cfg.to_string());
    }

    if let Some(guidance) = params.guidance {
        args.push("--guidance".to_string());
        args.push(guidance.to_string());
    }

    if !params.scheduler.is_empty() {
        args.push("--scheduler".to_string());
        args.push(params.scheduler.clone());
    }

    if params.max_vram != 0.0 {
        args.push("--max-vram".to_string());
        args.push(params.max_vram.to_string());
    }

    if params.threads != -1 {
        args.push("-t".to_string());
        args.push(params.threads.to_string());
    }

    if params.offload_to_cpu {
        args.push("--offload-to-cpu".to_string());
    }
    builder::push_flash_attn(&mut args, params.fa, params.diffusion_fa);
    if params.vae_tiling {
        args.push("--vae-tiling".to_string());
    }
    if params.mmap {
        args.push("--mmap".to_string());
    }
    if params.verbose {
        args.push("-v".to_string());
    }

    for reference in &paths.refs {
        args.push("-r".to_string());
        args.push(reference.to_string_lossy().into_owned());
    }

    if let Some(input) = &paths.input {
        args.push("-i".to_string());
        args.push(input.to_string_lossy().into_owned());
        if let Some(strength) = params.strength {
            args.push("--strength".to_string());
            args.push(strength.to_string());
        }
    }

    if let Some(mask) = &paths.mask {
        args.push("--mask".to_string());
        args.push(mask.to_string_lossy().into_owned());
    }

    for arg in builder::split_custom_flags(&params.custom_flags) {
        args.push(arg);
    }

    args
}

/// Windows/cmd quoting for the copied command line.
fn quote_arg(arg: &str) -> String {
    if arg.is_empty() {
        return "\"\"".to_string();
    }
    let needs_quotes = arg
        .chars()
        .any(|c| c.is_whitespace() || "\"&|<>^()".contains(c));
    if !needs_quotes {
        return arg.to_string();
    }

    let mut quoted = String::with_capacity(arg.len() + 2);
    quoted.push('"');
    let mut backslashes = 0;
    for c in arg.chars() {
        match c {
            '\\' => {
                backslashes += 1;
                quoted.push('\\');
            }
            '"' => {
                quoted.push_str(&"\\".repeat(backslashes + 1));
                quoted.push('"');
                backslashes = 0;
            }
            _ => {
                backslashes = 0;
                quoted.push(c);
            }
        }
    }
    quoted.push_str(&"\\".repeat(backslashes));
    quoted.push('"');
    quoted
}

fn format_command_line(args: &[String]) -> String {
    let mut line = String::from("sd-cli.exe");
    for arg in args {
        line.push(' ');
        line.push_str(&quote_arg(arg));
    }
    line
}

/// Builds the command exactly like `run_inference` would, but without
/// touching the filesystem. Original image paths are shown; the mask is a
/// placeholder because the real one is a temp file created on run.
#[tauri::command]
pub fn preview_inference_command(params: InferenceParams) -> Result<String, String> {
    validate_params(&params)?;
    let has_mask = params.mask_image.as_ref().is_some_and(|m| !m.is_empty());
    let edit_count = validate_edit_images(&params.edit_images)?;
    let has_edit_image = edit_count > 0;
    let has_input_image = params.input_image.as_ref().is_some_and(|m| !m.is_empty());
    validate_image_params(has_edit_image, has_input_image, has_mask)?;

    let output = if params.output_path.is_empty() {
        None
    } else {
        let dir = resolve_output_dir(
            Path::new(&params.output_path),
            has_mask,
            has_edit_image,
            has_input_image,
        );
        Some(dir.join(format!("gen_{}.png", builder::now_secs())))
    };

    let refs: Vec<PathBuf> = params
        .edit_images
        .iter()
        .filter(|p| !p.is_empty())
        .cloned()
        .map(PathBuf::from)
        .collect();
    let input = if has_input_image {
        params.input_image.as_ref().map(PathBuf::from)
    } else {
        None
    };
    let mask = if has_mask {
        Some(PathBuf::from("mask.png"))
    } else {
        None
    };

    let args = build_cli_args(
        &params,
        &CliPaths {
            refs,
            input,
            mask,
            output,
        },
    );
    Ok(format_command_line(&args))
}

#[tauri::command]
pub async fn run_inference(app: tauri::AppHandle, params: InferenceParams) -> Result<(), String> {
    let timestamp = builder::now_secs();

    validate_params(&params)?;

    let has_mask = params.mask_image.as_ref().is_some_and(|m| !m.is_empty());
    let edit_count = validate_edit_images(&params.edit_images)?;
    let has_edit_image = edit_count > 0;
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

    let mut temps = TempFiles::new();

    let mut refs = Vec::new();
    for (index, edit_image) in params.edit_images.iter().enumerate() {
        if edit_image.is_empty() {
            continue;
        }
        let temp_path = output_dir.join(format!("temp_ref_{}_{}.png", timestamp, index + 1));
        save_normalized(edit_image, &temp_path)?;
        refs.push(temp_path.clone());
        temps.refs.push(temp_path);
    }

    let input = if has_input_image {
        let source = params.input_image.as_deref().unwrap_or_default();
        let temp_path = output_dir.join(format!("temp_input_{}.png", timestamp));
        save_normalized(source, &temp_path)?;
        temps.input = Some(temp_path.clone());
        Some(temp_path)
    } else {
        None
    };

    let mask = if has_mask {
        let mask_bytes = decode_data_url(params.mask_image.as_deref().unwrap_or_default())?;
        let mask_img = image::load_from_memory(&mask_bytes)
            .map_err(|e| format!("No se pudo leer la máscara: {}", e))?;
        let mask_path = output_dir.join(format!("temp_mask_{}.png", timestamp));
        mask_img.save(&mask_path).map_err(|e| e.to_string())?;
        temps.mask = Some(mask_path.clone());
        Some(mask_path)
    } else {
        None
    };

    let args = build_cli_args(
        &params,
        &CliPaths {
            refs,
            input,
            mask,
            output: Some(PathBuf::from(&output_file)),
        },
    );

    let mut cmd = Command::new(&sd_bin);
    cmd.args(&args);

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
    use std::path::{Path, PathBuf};

    fn test_params() -> InferenceParams {
        InferenceParams {
            sd_path: "C:\\sd".to_string(),
            output_path: "C:\\out".to_string(),
            models_path: "C:\\models".to_string(),
            vae_path: String::new(),
            llm_path: String::new(),
            lora_path: String::new(),
            llm_vision_path: String::new(),
            clip_l_path: String::new(),
            clip_g_path: String::new(),
            t5xxl_path: String::new(),
            model: String::new(),
            model_type: "monolithic".to_string(),
            llm: String::new(),
            vae: String::new(),
            lora: String::new(),
            lora_weight: 1.0,
            loras: Vec::new(),
            llm_vision: String::new(),
            clip_l: String::new(),
            clip_g: String::new(),
            t5xxl: String::new(),
            prompt: "a cat".to_string(),
            negative_prompt: String::new(),
            width: 512,
            height: 512,
            steps: None,
            cfg_scale: None,
            guidance: None,
            seed: -1,
            batch_count: 1,
            max_vram: -1.0,
            threads: -1,
            sampler: "euler".to_string(),
            scheduler: String::new(),
            vae_on_cpu: false,
            clip_on_cpu: false,
            offload_to_cpu: false,
            fa: false,
            diffusion_fa: false,
            vae_tiling: false,
            mmap: false,
            verbose: false,
            force_cuda: false,
            custom_flags: String::new(),
            edit_images: Vec::new(),
            input_image: None,
            strength: None,
            mask_image: None,
        }
    }

    fn empty_paths() -> CliPaths {
        CliPaths {
            refs: Vec::new(),
            input: None,
            mask: None,
            output: None,
        }
    }

    #[test]
    fn empty_optional_fields_are_omitted() {
        let mut params = test_params();
        params.prompt = String::new();
        params.negative_prompt = String::new();
        params.sampler = String::new();
        params.scheduler = String::new();
        params.max_vram = 0.0;

        let args = build_cli_args(&params, &empty_paths());
        assert!(!args.iter().any(|a| a == "-p"), "empty prompt must be omitted");
        assert!(!args.iter().any(|a| a == "-n"), "empty negative prompt must be omitted");
        assert!(!args.iter().any(|a| a == "--sampling-method"));
        assert!(!args.iter().any(|a| a == "--scheduler"));
        assert!(!args.iter().any(|a| a == "--max-vram"));
        assert!(!args.iter().any(|a| a == "--guidance"));
    }

    #[test]
    fn negative_prompt_is_emitted_when_present() {
        let mut params = test_params();
        params.negative_prompt = "bad".to_string();
        let args = build_cli_args(&params, &empty_paths());
        let idx = args.iter().position(|a| a == "-n").expect("-n missing");
        assert_eq!(args[idx + 1], "bad");
    }

    #[test]
    fn sampler_is_emitted_when_present() {
        let params = test_params();
        let args = build_cli_args(&params, &empty_paths());
        let idx = args
            .iter()
            .position(|a| a == "--sampling-method")
            .expect("--sampling-method missing");
        assert_eq!(args[idx + 1], "euler");
    }

    #[test]
    fn guidance_is_emitted_when_present() {
        let mut params = test_params();
        params.guidance = Some(3.5);
        let args = build_cli_args(&params, &empty_paths());
        let idx = args.iter().position(|a| a == "--guidance").expect("--guidance missing");
        assert_eq!(args[idx + 1], "3.5");
    }

    #[test]
    fn reference_images_keep_order() {
        let mut params = test_params();
        params.edit_images = vec!["a.png".into(), "b.png".into()];
        let paths = CliPaths {
            refs: vec![PathBuf::from("a.png"), PathBuf::from("b.png")],
            ..empty_paths()
        };
        let args = build_cli_args(&params, &paths);
        let refs: Vec<String> = args
            .windows(2)
            .filter(|w| w[0] == "-r")
            .map(|w| w[1].clone())
            .collect();
        assert_eq!(refs, vec!["a.png".to_string(), "b.png".to_string()]);
    }

    #[test]
    fn quote_arg_plain() {
        assert_eq!(quote_arg("euler"), "euler");
        assert_eq!(quote_arg("C:\\models\\flux.gguf"), "C:\\models\\flux.gguf");
    }

    #[test]
    fn quote_arg_spaces_and_quotes() {
        assert_eq!(quote_arg("C:\\my models\\flux.gguf"), "\"C:\\my models\\flux.gguf\"");
        assert_eq!(quote_arg("a \"cat\""), "\"a \\\"cat\\\"\"");
    }

    #[test]
    fn quote_arg_trailing_backslash() {
        assert_eq!(quote_arg("C:\\my dir\\"), "\"C:\\my dir\\\\\"");
    }

    #[test]
    fn preview_command_starts_with_binary_and_keeps_images() {
        let mut params = test_params();
        params.edit_images = vec!["C:\\a.png".into()];
        let line = format_command_line(&build_cli_args(
            &params,
            &CliPaths {
                refs: vec![PathBuf::from("C:\\a.png")],
                ..empty_paths()
            },
        ));
        assert!(line.starts_with("sd-cli.exe "));
        assert!(line.contains(" -r C:\\a.png"));
    }

    #[test]
    fn validate_params_requires_sampler() {
        let mut params = test_params();
        params.sampler = "   ".to_string();
        assert!(validate_params(&params).is_err());
        params.sampler = "euler".to_string();
        assert!(validate_params(&params).is_ok());
    }

    #[test]
    fn custom_flags_keep_quoted_values() {
        let mut params = test_params();
        params.custom_flags = "--foo \"a b\" --bar".to_string();
        let args = build_cli_args(&params, &empty_paths());
        assert!(args.windows(2).any(|w| w[0] == "--foo" && w[1] == "a b"));
        assert!(args.iter().any(|a| a == "--bar"));
    }

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
    fn count_edit_images_ignores_empty() {
        assert_eq!(count_edit_images(&[]), 0);
        assert_eq!(count_edit_images(&["".to_string()]), 0);
        assert_eq!(count_edit_images(&["a.png".to_string()]), 1);
        assert_eq!(
            count_edit_images(&["a.png".to_string(), "".to_string(), "b.png".to_string()]),
            2
        );
    }

    #[test]
    fn validate_edit_images_accepts_up_to_max() {
        let images: Vec<String> = (0..builder::MAX_REFERENCE_IMAGES)
            .map(|i| format!("ref_{}.png", i))
            .collect();
        assert_eq!(validate_edit_images(&images).unwrap(), builder::MAX_REFERENCE_IMAGES);
    }

    #[test]
    fn validate_edit_images_rejects_over_max() {
        let images: Vec<String> = (0..builder::MAX_REFERENCE_IMAGES + 1)
            .map(|i| format!("ref_{}.png", i))
            .collect();
        let err = validate_edit_images(&images).unwrap_err();
        assert!(err.contains(&builder::MAX_REFERENCE_IMAGES.to_string()));
        assert!(err.contains(&(builder::MAX_REFERENCE_IMAGES + 1).to_string()));
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
