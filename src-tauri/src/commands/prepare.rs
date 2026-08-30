use std::io::Cursor;

use exif::{In, Tag};

use crate::image::temp::normalize_orientation;

#[tauri::command]
pub async fn prepare_inpaint_image(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        let orientation = {
            let mut cursor = Cursor::new(&bytes);
            let exifreader = exif::Reader::new();
            exifreader
                .read_from_container(&mut cursor)
                .ok()
                .and_then(|exif_data| {
                    exif_data
                        .get_field(Tag::Orientation, In::PRIMARY)
                        .and_then(|f| f.value.get_uint(0))
                })
                .unwrap_or(1)
        };

        if orientation == 1 {
            return Ok(path);
        }

        let corrected = normalize_orientation(&bytes).map_err(|e| e.to_string())?;
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        path.hash(&mut hasher);
        let temp_path = std::env::temp_dir().join(format!("sd_frontend_inpaint_{:x}.png", hasher.finish()));
        corrected.save(&temp_path).map_err(|e| e.to_string())?;
        Ok(temp_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
