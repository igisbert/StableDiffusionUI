pub mod cli;
pub mod commands;
pub mod image;
pub mod process;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::fs::pick_folder,
            commands::fs::pick_file,
            commands::fs::scan_models,
            commands::fs::ensure_output_dir,
            commands::fs::open_folder,
            commands::inference::run_inference,
            commands::inference::abort_inference,
            commands::upscale::run_upscale,
            commands::prepare::prepare_inpaint_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
