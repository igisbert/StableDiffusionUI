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
pub async fn pick_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().add_filter("Imágenes", &["png", "jpg", "jpeg", "webp"]).pick_file(move |path| {
        let _ = tx.send(path);
    });
    let result = rx.await.map_err(|e| e.to_string())?;
    Ok(result.map(|p| p.to_string()))
}

#[tauri::command]
pub fn scan_models(base_path: String) -> Result<ModelFiles, String> {
    let files = scan_dir(Path::new(&base_path));
    Ok(ModelFiles {
        models: files.clone(),
        vaes: files.clone(),
        loras: files.clone(),
        text_encoders: files,
    })
}

fn scan_dir(dir: &Path) -> Vec<String> {
    let exts = ["safetensors", "ckpt", "bin", "gguf"];
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
            let ext = p.extension()?.to_str()?.to_ascii_lowercase();
            if exts.contains(&ext.as_str()) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_dir(name: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("fs_test_{}_{}", name, std::process::id()));
        let _ = fs::create_dir_all(&p);
        p
    }

    #[test]
    fn scan_case_insensitive() {
        let dir = tmp_dir("case");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.SAFETENSORS"), b"x").unwrap();
        fs::write(dir.join("b.GgUf"), b"x").unwrap();
        fs::write(dir.join("c.txt"), b"x").unwrap();
        fs::write(dir.join("d.CkPt"), b"x").unwrap();
        let res = scan_models(dir.to_string_lossy().to_string()).unwrap();
        assert_eq!(res.models.len(), 3);
        assert!(res.models.iter().any(|m| m == "a.SAFETENSORS"));
        assert!(res.models.iter().any(|m| m == "b.GgUf"));
        assert!(res.models.iter().any(|m| m == "d.CkPt"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn scan_empty_dir() {
        let dir = tmp_dir("empty");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let res = scan_models(dir.to_string_lossy().to_string()).unwrap();
        assert!(res.models.is_empty());
        assert!(res.vaes.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn scan_clones_equal() {
        let dir = tmp_dir("clones");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("x.gguf"), b"x").unwrap();
        let res = scan_models(dir.to_string_lossy().to_string()).unwrap();
        assert_eq!(res.models, res.vaes);
        assert_eq!(res.vaes, res.loras);
        assert_eq!(res.loras, res.text_encoders);
        let _ = fs::remove_dir_all(&dir);
    }
}
