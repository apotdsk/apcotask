mod database;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let app_data_dir = app.path().app_data_dir()?;
            let database = database::initialize(&app_data_dir)?;
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            database::select,
            database::execute,
            database::batch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
