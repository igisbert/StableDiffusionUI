use std::path::Path;
use std::process::Command;
use tauri::Emitter;

use crate::cli::builder;
use crate::process::manager;

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

    let timestamp = builder::now_secs();
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

    let (status, was_running) = manager::spawn_sd_process(cmd, &app).map_err(|e| e.to_string())?;

    if !was_running {
        let _ = app.emit("console-line", "[ABORTADO] Upscale cancelado.");
        return Ok(());
    }

    if status.success() {
        let _ = app.emit("upscale-done", output_file.to_string_lossy().to_string());
        Ok(())
    } else {
        Err(format!("sd-cli terminó con código {:?}", status.code()))
    }
}
