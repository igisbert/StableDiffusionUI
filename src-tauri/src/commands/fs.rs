use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
pub struct ModelFiles {
    pub models: Vec<String>,
    pub vaes: Vec<String>,
    pub loras: Vec<String>,
    pub text_encoders: Vec<String>,
}

#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path);
    });
    let result = rx.await.map_err(|e| e.to_string())?;
    Ok(result.map(|p| p.to_string()))
}

#[tauri::command]
pub fn scan_models(base_path: String) -> Result<ModelFiles, String> {
    let exts = ["safetensors", "ckpt", "bin", "gguf"];
    Ok(ModelFiles {
        models: read_dir_files(&base_path, &exts),
        vaes: read_dir_files(&base_path, &exts),
        loras: read_dir_files(&base_path, &exts),
        text_encoders: read_dir_files(&base_path, &exts),
    })
}

fn read_dir_files(path: &str, exts: &[&str]) -> Vec<String> {
    let dir = Path::new(path);
    let Ok(entries) = fs::read_dir(dir) else {
        return vec![];
    };
    entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let p = e.path();
            if !p.is_file() {
                return None;
            }
            let ext = p.extension()?.to_str()?;
            if exts.contains(&ext) {
                p.file_name()?.to_str().map(|s| s.to_string())
            } else {
                None
            }
        })
        .collect()
}

#[tauri::command]
pub fn ensure_output_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
