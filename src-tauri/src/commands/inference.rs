use serde::Deserialize;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::path::Path;
use tauri::Emitter;

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
    pub vae_on_cpu: bool,
    pub clip_on_cpu: bool,
    pub offload_to_cpu: bool,
    pub diffusion_fa: bool,
    pub vae_tiling: bool,
}

fn sampler_flag(name: &str) -> &str {
    match name {
        "Euler"           => "euler",
        "Euler a"         => "euler_a",
        "Heun"            => "heun",
        "DPM2"            => "dpm2",
        "DPM++ 2S a"      => "dpm++2s_a",
        "DPM++ 2M"        => "dpm++2m",
        "DPM++ 2M v2"     => "dpm++2mv2",
        "DPM++ SDE"       => "dpm++2mv2",
        "LCM"             => "lcm",
        "DDIM"            => "ddim_trailing",
        "TCD"             => "tcd",
        _                 => "euler_a",
    }
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

    let _ = app.emit("console-line", format!("[DEBUG] Looking for: {:?}", sd_bin));
    let _ = app.emit("console-line", format!("[DEBUG] File exists: {}", sd_bin.exists()));

    let mut cmd = Command::new(&sd_bin);

    // Modelo
    if !params.model.is_empty() {
        let flag = if params.model_type == "diffusion" {
            "--diffusion-model"
        } else {
            "-m"
        };
        cmd.arg(flag)
           .arg(Path::new(&params.models_path).join(&params.model));
    }

    // LLM encoder
    if !params.llm.is_empty() {
        let p = Path::new(&params.llm_path).join(&params.llm);
        if p.exists() { cmd.arg("--llm").arg(p); }
    }

    // VAE
    if !params.vae.is_empty() {
        let p = Path::new(&params.vae_path).join(&params.vae);
        if p.exists() {
            cmd.arg("--vae").arg(p);
        }
    }

    // LoRA
    if !params.lora.is_empty() {
        let p = Path::new(&params.lora_path).join(&params.lora);
        if p.exists() {
            cmd.arg("--lora-model-dir").arg(p);
        }
    }

    // Prompt y parámetros
    cmd.arg("-p").arg(&params.prompt)
       .arg("-n").arg(&params.negative_prompt)
       .arg("-W").arg(params.width.to_string())
       .arg("-H").arg(params.height.to_string())
       .arg("--steps").arg(params.steps.to_string())
       .arg("--cfg-scale").arg(params.cfg_scale.to_string())
       .arg("--guidance").arg(params.guidance.to_string())
       .arg("-s").arg(params.seed.to_string())
       .arg("-b").arg(params.batch_count.to_string())
       .arg("--sampling-method").arg(sampler_flag(&params.sampler))
       .arg("-o").arg(&output_file);

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

    if let Some(stdout) = child.stdout.take() {
        let app_c = app.clone();
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            let _ = app_c.emit("console-line", &line);
        }
    }

    if let Some(stderr) = child.stderr.take() {
        let app_c = app.clone();
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            let _ = app_c.emit("console-line", &line);
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;

    if status.success() {
        let _ = app.emit("inference-done", &output_file);
        Ok(())
    } else {
        Err(format!("sd-cli terminó con código {:?}", status.code()))
    }
}
