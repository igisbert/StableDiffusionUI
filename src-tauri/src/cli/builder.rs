use std::path::{Path, PathBuf};
use std::process::Command;

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn resolve_output_dir(base: &Path, has_mask: bool, has_edit: bool, has_input: bool) -> PathBuf {
    if has_mask {
        base.join("inpainting")
    } else if has_edit {
        base.join("edit")
    } else if has_input {
        base.join("img2img")
    } else {
        base.to_path_buf()
    }
}

pub fn push_model_arg(cmd: &mut Command, flag: &str, dir: &str, file: &str) {
    if file.is_empty() {
        return;
    }
    let p = Path::new(dir).join(file);
    if p.exists() {
        cmd.arg(flag).arg(p);
    }
}

pub fn push_prompt(cmd: &mut Command, prompt: &str, lora: &str, lora_weight: f32) {
    let mut full = prompt.to_string();
    if !lora.is_empty() {
        let name = Path::new(lora)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(lora);
        full.push_str(&format!(" <lora:{}:{}>", name, lora_weight));
    }
    cmd.arg("-p").arg(full);
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
        assert_eq!(resolve_output_dir(base, true, false, true), base.join("inpainting"));
        assert_eq!(resolve_output_dir(base, true, true, false), base.join("inpainting"));
        assert_eq!(resolve_output_dir(base, false, true, true), base.join("edit"));
    }

    #[test]
    fn now_secs_positive() {
        assert!(now_secs() > 0);
    }

    #[test]
    fn push_model_arg_noop_on_empty() {
        let mut cmd = Command::new("echo");
        push_model_arg(&mut cmd, "--llm", "/tmp", "");
        // no arg added, just check it doesn't panic
        let args: Vec<String> = cmd.get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.is_empty());
    }

    #[test]
    fn push_model_arg_with_existing_file() {
        let dir = std::env::temp_dir();
        let file = format!("test_builder_{}.gguf", std::process::id());
        let path = dir.join(&file);
        std::fs::write(&path, b"dummy").unwrap();
        let mut cmd = Command::new("echo");
        push_model_arg(&mut cmd, "--llm", dir.to_str().unwrap(), &file);
        let args: Vec<String> = cmd.get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert_eq!(args[0], "--llm");
        assert!(args[1].ends_with(&file));
        let _ = std::fs::remove_file(&path);
    }
}
