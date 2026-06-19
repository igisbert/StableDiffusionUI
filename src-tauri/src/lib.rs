pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::fs::pick_folder,
            commands::fs::scan_models,
            commands::fs::ensure_output_dir,
            commands::fs::open_folder,
            commands::inference::run_inference,
            commands::inference::abort_inference,
            commands::inference::run_upscale,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
