use std::io::Cursor;
use std::path::{Path, PathBuf};

use exif::{In, Tag};
use image::DynamicImage;

pub struct TempFiles {
    pub edit: Option<PathBuf>,
    pub input: Option<PathBuf>,
    pub mask: Option<PathBuf>,
}

impl TempFiles {
    pub fn new() -> Self {
        Self {
            edit: None,
            input: None,
            mask: None,
        }
    }
}

impl Drop for TempFiles {
    fn drop(&mut self) {
        if let Some(p) = &self.edit {
            let _ = std::fs::remove_file(p);
        }
        if let Some(p) = &self.input {
            let _ = std::fs::remove_file(p);
        }
        if let Some(p) = &self.mask {
            let _ = std::fs::remove_file(p);
        }
    }
}

pub fn normalize_orientation(bytes: &[u8]) -> Result<DynamicImage, Box<dyn std::error::Error>> {
    let orientation = {
        let mut cursor = Cursor::new(bytes);
        let exifreader = exif::Reader::new();
        match exifreader.read_from_container(&mut cursor) {
            Ok(exif_data) => exif_data
                .get_field(Tag::Orientation, In::PRIMARY)
                .and_then(|f| f.value.get_uint(0))
                .unwrap_or(1),
            Err(_) => 1,
        }
    };

    let img = image::load_from_memory(bytes)?;

    let corrected = match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    };

    Ok(corrected)
}

pub fn save_normalized(src: &str, dst: &Path) -> Result<(), String> {
    let bytes = std::fs::read(src).map_err(|e| e.to_string())?;
    let corrected = normalize_orientation(&bytes).map_err(|e| e.to_string())?;
    corrected.save(dst).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn temp_files_drop_removes_files() {
        let dir = std::env::temp_dir();
        let p1 = dir.join(format!("test_temp_drop_{}_edit.png", std::process::id()));
        let p2 = dir.join(format!("test_temp_drop_{}_input.png", std::process::id()));
        fs::write(&p1, b"a").unwrap();
        fs::write(&p2, b"b").unwrap();
        {
            let _temps = TempFiles {
                edit: Some(p1.clone()),
                input: Some(p2.clone()),
                mask: None,
            };
            assert!(p1.exists());
            assert!(p2.exists());
        }
        assert!(!p1.exists());
        assert!(!p2.exists());
    }

    #[test]
    fn normalize_orientation_no_exif() {
        // 1x1 png without EXIF should pass through
        let png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD.decode(png_b64).unwrap();
        let img = normalize_orientation(&bytes).unwrap();
        assert_eq!(img.width(), 1);
        assert_eq!(img.height(), 1);
    }

    #[test]
    fn save_normalized_nonexistent_fails() {
        let dst = std::env::temp_dir().join("nonexistent_save_test.png");
        let res = save_normalized("/no/such/file.png", &dst);
        assert!(res.is_err());
        assert!(!dst.exists());
    }
}
