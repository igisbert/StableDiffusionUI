use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Deserialize, Clone, Debug)]
pub struct LoraItem {
    pub file: String,
    pub weight: f32,
}

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

pub const MAX_REFERENCE_IMAGES: usize = 10;

pub fn backend_assignment(force_cuda: bool, clip_on_cpu: bool, vae_on_cpu: bool) -> String {
    let mut parts: Vec<&str> = Vec::new();
    if force_cuda {
        parts.push("all=cuda0");
    }
    if clip_on_cpu {
        parts.push("te=cpu");
    }
    if vae_on_cpu {
        parts.push("vae=cpu");
    }
    parts.join(",")
}

pub fn push_backend_args(cmd: &mut Command, force_cuda: bool, clip_on_cpu: bool, vae_on_cpu: bool) {
    let assignment = backend_assignment(force_cuda, clip_on_cpu, vae_on_cpu);
    if !assignment.is_empty() {
        cmd.arg("--backend").arg(assignment);
    }
    if force_cuda {
        cmd.arg("--params-backend").arg("cpu");
    }
}

pub fn flash_attn_mode(fa: bool, diffusion_fa: bool) -> &'static str {
    if fa {
        "on"
    } else if diffusion_fa {
        "off,diffusion=on"
    } else {
        ""
    }
}

pub fn push_flash_attn(cmd: &mut Command, fa: bool, diffusion_fa: bool) {
    let mode = flash_attn_mode(fa, diffusion_fa);
    if !mode.is_empty() {
        cmd.arg("--flash-attn").arg(mode);
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

pub fn push_prompt_with_loras(cmd: &mut Command, prompt: &str, loras: &[LoraItem]) {
    let mut full = prompt.to_string();
    for l in loras {
        if l.file.is_empty() { continue; }
        let name = Path::new(&l.file)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&l.file);
        full.push_str(&format!(" <lora:{}:{}>", name, l.weight));
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
    fn backend_assignment_combinations() {
        assert_eq!(backend_assignment(false, false, false), "");
        assert_eq!(backend_assignment(false, true, false), "te=cpu");
        assert_eq!(backend_assignment(false, false, true), "vae=cpu");
        assert_eq!(backend_assignment(false, true, true), "te=cpu,vae=cpu");
        assert_eq!(backend_assignment(true, false, false), "all=cuda0");
        assert_eq!(backend_assignment(true, true, false), "all=cuda0,te=cpu");
        assert_eq!(backend_assignment(true, true, true), "all=cuda0,te=cpu,vae=cpu");
    }

    #[test]
    fn flash_attn_mode_combinations() {
        assert_eq!(flash_attn_mode(false, false), "");
        assert_eq!(flash_attn_mode(true, false), "on");
        assert_eq!(flash_attn_mode(true, true), "on");
        assert_eq!(flash_attn_mode(false, true), "off,diffusion=on");
    }

    #[test]
    fn push_backend_args_empty_when_no_flags() {
        let mut cmd = Command::new("echo");
        push_backend_args(&mut cmd, false, false, false);
        let args: Vec<String> = cmd.get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.is_empty());
    }

    #[test]
    fn push_backend_args_force_cuda_params() {
        let mut cmd = Command::new("echo");
        push_backend_args(&mut cmd, true, true, true);
        let args: Vec<String> = cmd.get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert_eq!(args, vec!["--backend", "all=cuda0,te=cpu,vae=cpu", "--params-backend", "cpu"]);
    }

    #[test]
    fn push_flash_attn_modes() {
        let mut cmd = Command::new("echo");
        push_flash_attn(&mut cmd, true, true);
        let args: Vec<String> = cmd.get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert_eq!(args, vec!["--flash-attn", "on"]);

        let mut cmd = Command::new("echo");
        push_flash_attn(&mut cmd, false, true);
        let args: Vec<String> = cmd.get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert_eq!(args, vec!["--flash-attn", "off,diffusion=on"]);

        let mut cmd = Command::new("echo");
        push_flash_attn(&mut cmd, false, false);
        let args: Vec<String> = cmd.get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.is_empty());
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
