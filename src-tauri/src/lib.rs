mod database;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "main";
const WIDGET_WINDOW_LABEL: &str = "widget";
const OPEN_BACKLOG_MENU_ID: &str = "open-backlog";
const QUIT_MENU_ID: &str = "quit";

fn open_backlog(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            open_backlog(app);
        }))
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

            let open_backlog_item = MenuItem::with_id(
                app,
                OPEN_BACKLOG_MENU_ID,
                "Open backlog",
                true,
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, QUIT_MENU_ID, "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_backlog_item, &quit_item])?;
            let mut tray =
                TrayIconBuilder::new()
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        OPEN_BACKLOG_MENU_ID => open_backlog(app),
                        QUIT_MENU_ID => app.exit(0),
                        _ => {}
                    });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                match window.label() {
                    MAIN_WINDOW_LABEL => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    WIDGET_WINDOW_LABEL => {
                        api.prevent_close();
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            database::select,
            database::execute,
            database::batch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
