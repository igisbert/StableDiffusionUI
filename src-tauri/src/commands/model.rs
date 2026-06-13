use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

#[tauri::command]
pub fn detect_model_arch(base_path: String, filename: String) -> String {
    let candidates = [
        Path::new(&base_path).join(&filename),
    ];

    for path in &candidates {
        if path.exists() {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            let result = match ext {
                "gguf"         => detect_gguf(path),
                "safetensors"  => detect_safetensors(path),
                _              => None,
            };
            return result.unwrap_or_else(|| "unknown".to_string());
        }
    }
    "unknown".to_string()
}

fn detect_gguf(path: &Path) -> Option<String> {
    let mut f = File::open(path).ok()?;

    let mut magic = [0u8; 4];
    f.read_exact(&mut magic).ok()?;
    if &magic != b"GGUF" { return None }

    let mut version = [0u8; 4];
    f.read_exact(&mut version).ok()?;

    let mut tensor_count = [0u8; 8];
    f.read_exact(&mut tensor_count).ok()?;

    let mut kv_count_bytes = [0u8; 8];
    f.read_exact(&mut kv_count_bytes).ok()?;
    let kv_count = u64::from_le_bytes(kv_count_bytes);

    for _ in 0..kv_count {
        let key = read_gguf_string(&mut f)?;
        let value_type = read_u32(&mut f)?;

        if key == "general.architecture" && value_type == 8 {
            let arch = read_gguf_string(&mut f)?;
            return Some(normalize_arch(&arch));
        } else {
            skip_gguf_value(&mut f, value_type)?;
        }
    }
    None
}

fn read_gguf_string(f: &mut File) -> Option<String> {
    let len = read_u64(f)? as usize;
    let mut buf = vec![0u8; len];
    f.read_exact(&mut buf).ok()?;
    String::from_utf8(buf).ok()
}

fn read_u32(f: &mut File) -> Option<u32> {
    let mut b = [0u8; 4];
    f.read_exact(&mut b).ok()?;
    Some(u32::from_le_bytes(b))
}

fn read_u64(f: &mut File) -> Option<u64> {
    let mut b = [0u8; 8];
    f.read_exact(&mut b).ok()?;
    Some(u64::from_le_bytes(b))
}

fn skip_gguf_value(f: &mut File, value_type: u32) -> Option<()> {
    match value_type {
        0 => { f.seek(SeekFrom::Current(1)).ok()?; }
        1 => { f.seek(SeekFrom::Current(1)).ok()?; }
        2 => { f.seek(SeekFrom::Current(2)).ok()?; }
        3 => { f.seek(SeekFrom::Current(2)).ok()?; }
        4 => { f.seek(SeekFrom::Current(4)).ok()?; }
        5 => { f.seek(SeekFrom::Current(4)).ok()?; }
        6 => { f.seek(SeekFrom::Current(4)).ok()?; }
        7 => { f.seek(SeekFrom::Current(1)).ok()?; }
        8 => { let len = read_u64(f)? as i64; f.seek(SeekFrom::Current(len)).ok()?; }
        9 => {
            let item_type = read_u32(f)?;
            let count = read_u64(f)?;
            for _ in 0..count { skip_gguf_value(f, item_type)?; }
        }
        10 => { f.seek(SeekFrom::Current(8)).ok()?; }
        11 => { f.seek(SeekFrom::Current(8)).ok()?; }
        12 => { f.seek(SeekFrom::Current(8)).ok()?; }
        _  => return None,
    }
    Some(())
}

fn detect_safetensors(path: &Path) -> Option<String> {
    let mut f = File::open(path).ok()?;
    let mut len_bytes = [0u8; 8];
    f.read_exact(&mut len_bytes).ok()?;
    let header_len = u64::from_le_bytes(len_bytes) as usize;

    if header_len > 1_048_576 { return None }

    let mut header_bytes = vec![0u8; header_len];
    f.read_exact(&mut header_bytes).ok()?;
    let header: serde_json::Value = serde_json::from_slice(&header_bytes).ok()?;

    if let Some(meta) = header.get("__metadata__") {
        if let Some(arch) = meta.get("modelspec.architecture")
            .or_else(|| meta.get("architecture"))
            .or_else(|| meta.get("ss_base_model_version"))
            .and_then(|v| v.as_str())
        {
            return Some(normalize_arch(arch));
        }
    }

    let keys: Vec<&str> = header.as_object()?.keys().map(|k| k.as_str()).collect();
    if keys.iter().any(|k| k.contains("double_stream_blocks") || k.contains("img_in")) {
        return Some("flux".to_string());
    }
    if keys.iter().any(|k| k.contains("conditioner.embedders.1")) {
        return Some("sdxl".to_string());
    }
    if keys.iter().any(|k| k.starts_with("model.diffusion_model")) {
        return Some("sd1".to_string());
    }

    None
}

fn normalize_arch(arch: &str) -> String {
    let a = arch.to_lowercase();
    if a.contains("flux2") || a.contains("flux-2") { return "flux2".to_string() }
    if a.contains("flux")  { return "flux".to_string() }
    if a.contains("sdxl")  { return "sdxl".to_string() }
    if a.contains("sd_xl") { return "sdxl".to_string() }
    if a.contains("sd2") || a.contains("v2") { return "sd2".to_string() }
    if a.contains("sd1") || a.contains("v1") { return "sd1".to_string() }
    "unknown".to_string()
}
