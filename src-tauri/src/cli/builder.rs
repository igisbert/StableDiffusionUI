use serde::Deserialize;
use std::path::{Path, PathBuf};

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

pub fn push_backend_args(
    args: &mut Vec<String>,
    force_cuda: bool,
    clip_on_cpu: bool,
    vae_on_cpu: bool,
) {
    let assignment = backend_assignment(force_cuda, clip_on_cpu, vae_on_cpu);
    if !assignment.is_empty() {
        args.push("--backend".to_string());
        args.push(assignment);
    }
    if force_cuda {
        args.push("--params-backend".to_string());
        args.push("cpu".to_string());
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

pub fn push_flash_attn(args: &mut Vec<String>, fa: bool, diffusion_fa: bool) {
    let mode = flash_attn_mode(fa, diffusion_fa);
    if !mode.is_empty() {
        args.push("--flash-attn".to_string());
        args.push(mode.to_string());
    }
}

pub fn push_model_arg(args: &mut Vec<String>, flag: &str, dir: &str, file: &str) {
    if file.is_empty() {
        return;
    }
    let p = Path::new(dir).join(file);
    if p.exists() {
        args.push(flag.to_string());
        args.push(p.to_string_lossy().into_owned());
    }
}

pub fn push_prompt(args: &mut Vec<String>, prompt: &str, lora: &str, lora_weight: f32) {
    let mut full = prompt.to_string();
    if !lora.is_empty() {
        let name = Path::new(lora)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(lora);
        full.push_str(&format!(" <lora:{}:{}>", name, lora_weight));
    }
    push_prompt_value(args, full);
}

pub fn push_prompt_with_loras(args: &mut Vec<String>, prompt: &str, loras: &[LoraItem]) {
    let mut full = prompt.to_string();
    for l in loras {
        if l.file.is_empty() { continue; }
        let name = Path::new(&l.file)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&l.file);
        full.push_str(&format!(" <lora:{}:{}>", name, l.weight));
    }
    push_prompt_value(args, full);
}

/// An empty prompt is not sent: there is nothing for `sd-cli` to render.
fn push_prompt_value(args: &mut Vec<String>, prompt: String) {
    if prompt.is_empty() {
        return;
    }
    args.push("-p".to_string());
    args.push(prompt);
}

/// Splits the "extra flags" text box, honouring double quotes so a value with
/// spaces (`--name "a b"`) stays a single argument.
pub fn split_custom_flags(flags: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut has_token = false;

    for c in flags.chars() {
        match c {
            '"' => {
                in_quotes = !in_quotes;
                has_token = true;
            }
            c if c.is_whitespace() && !in_quotes => {
                if has_token {
                    args.push(std::mem::take(&mut current));
                    has_token = false;
                }
            }
            c => {
                current.push(c);
                has_token = true;
            }
        }
    }
    if has_token {
        args.push(current);
    }
    args
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
        let mut args = Vec::new();
        push_backend_args(&mut args, false, false, false);
        assert!(args.is_empty());
    }

    #[test]
    fn push_backend_args_force_cuda_params() {
        let mut args = Vec::new();
        push_backend_args(&mut args, true, true, true);
        assert_eq!(args, vec!["--backend", "all=cuda0,te=cpu,vae=cpu", "--params-backend", "cpu"]);
    }

    #[test]
    fn push_flash_attn_modes() {
        let mut args = Vec::new();
        push_flash_attn(&mut args, true, true);
        assert_eq!(args, vec!["--flash-attn", "on"]);

        let mut args = Vec::new();
        push_flash_attn(&mut args, false, true);
        assert_eq!(args, vec!["--flash-attn", "off,diffusion=on"]);

        let mut args = Vec::new();
        push_flash_attn(&mut args, false, false);
        assert!(args.is_empty());
    }

    #[test]
    fn now_secs_positive() {
        assert!(now_secs() > 0);
    }

    #[test]
    fn push_model_arg_noop_on_empty() {
        let mut args = Vec::new();
        push_model_arg(&mut args, "--llm", "/tmp", "");
        assert!(args.is_empty());
    }

    #[test]
    fn push_model_arg_with_existing_file() {
        let dir = std::env::temp_dir();
        let file = format!("test_builder_{}.gguf", std::process::id());
        let path = dir.join(&file);
        std::fs::write(&path, b"dummy").unwrap();
        let mut args = Vec::new();
        push_model_arg(&mut args, "--llm", dir.to_str().unwrap(), &file);
        assert_eq!(args[0], "--llm");
        assert!(args[1].ends_with(&file));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn push_prompt_skips_empty_value() {
        let mut args = Vec::new();
        push_prompt(&mut args, "", "", 1.0);
        assert!(args.is_empty());
    }

    #[test]
    fn push_prompt_keeps_lora_when_prompt_is_empty() {
        let mut args = Vec::new();
        push_prompt(&mut args, "", "style.safetensors", 0.8);
        assert_eq!(args, vec!["-p", " <lora:style:0.8>"]);
    }

    #[test]
    fn split_custom_flags_empty() {
        assert!(split_custom_flags("   \n  ").is_empty());
    }

    #[test]
    fn split_custom_flags_plain() {
        assert_eq!(
            split_custom_flags("--foo 1\n--bar baz"),
            vec!["--foo", "1", "--bar", "baz"]
        );
    }

    #[test]
    fn split_custom_flags_quoted_values() {
        assert_eq!(
            split_custom_flags("--name \"a b\" --flag"),
            vec!["--name", "a b", "--flag"]
        );
    }
}
