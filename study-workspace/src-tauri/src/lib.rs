mod data;
mod downloads;
mod launch;

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_window_state::StateFlags;

struct DataLock(Mutex<()>);
struct SessionRunning(Mutex<bool>);

#[tauri::command]
fn load_data(
    app: tauri::AppHandle,
    state: tauri::State<'_, DataLock>,
) -> Result<data::AppData, String> {
    let _guard = state
        .0
        .lock()
        .map_err(|_| "Local data lock is unavailable.".to_string())?;
    data::load(&app)
}

#[tauri::command]
fn save_data(
    app: tauri::AppHandle,
    state: tauri::State<'_, DataLock>,
    data: data::AppData,
) -> Result<(), String> {
    let _guard = state
        .0
        .lock()
        .map_err(|_| "Local data lock is unavailable.".to_string())?;
    data::save(&app, &data)
}

#[tauri::command]
fn launch_course(
    app: tauri::AppHandle,
    state: tauri::State<'_, DataLock>,
    course_id: String,
) -> Result<launch::LaunchReport, String> {
    let course = {
        let _guard = state
            .0
            .lock()
            .map_err(|_| "Local data lock is unavailable.".to_string())?;
        let data = data::load(&app)?;
        data.courses
            .into_iter()
            .find(|course| course.id == course_id)
            .ok_or_else(|| "The selected course could not be found.".to_string())?
    };

    Ok(launch::open_course(&course))
}

#[tauri::command]
fn open_resource(
    app: tauri::AppHandle,
    state: tauri::State<'_, DataLock>,
    course_id: String,
    kind: String,
    target: String,
) -> Result<(), String> {
    let _guard = state
        .0
        .lock()
        .map_err(|_| "Local data lock is unavailable.".to_string())?;
    let data = data::load(&app)?;
    let course = data
        .courses
        .iter()
        .find(|course| course.id == course_id)
        .ok_or_else(|| "The selected course could not be found.".to_string())?;
    let is_saved_resource = match kind.as_str() {
        "folder" => course.folder == target || course.additional_folders.contains(&target),
        "file" => course.apps.contains(&target),
        "link" => course.links.iter().any(|link| link.url == target),
        _ => false,
    };
    if !is_saved_resource {
        return Err("The selected resource is not saved in this course.".to_string());
    }
    drop(_guard);
    launch::open_resource(&kind, &target)
}

#[tauri::command]
fn set_download_watching(
    app: tauri::AppHandle,
    state: tauri::State<'_, downloads::DownloadState>,
    enabled: bool,
) -> Result<(), String> {
    downloads::set_watching(&app, &state, enabled)
}

#[tauri::command]
fn move_download_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, downloads::DownloadState>,
    course_id: String,
    path: String,
) -> Result<downloads::MoveReceipt, String> {
    downloads::move_download(&app, &state, &course_id, std::path::Path::new(&path))
}

#[tauri::command]
fn undo_download_move(
    state: tauri::State<'_, downloads::DownloadState>,
    id: String,
) -> Result<(), String> {
    downloads::undo_move(&state, &id)
}

#[tauri::command]
fn set_session_running(
    state: tauri::State<'_, SessionRunning>,
    running: bool,
) -> Result<(), String> {
    *state
        .0
        .lock()
        .map_err(|_| "Session state is unavailable.".to_string())? = running;
    Ok(())
}

#[tauri::command]
fn quit_from_tray(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all())
                .build(),
        )
        .manage(DataLock(Mutex::new(())))
        .manage(downloads::DownloadState::default())
        .manage(SessionRunning(Mutex::new(false)))
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            launch_course,
            open_resource,
            set_download_watching,
            move_download_file,
            undo_download_move,
            set_session_running,
            quit_from_tray
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "tray-show", "Show Desk Drawer", true, None::<&str>)?;
            let start =
                MenuItem::with_id(app, "tray-start", "Start focus session", true, None::<&str>)?;
            let pause =
                MenuItem::with_id(app, "tray-toggle", "Pause or resume", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "tray-quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &start, &pause, &quit])?;
            let icon = app.default_window_icon().cloned().ok_or_else(|| {
                std::io::Error::other("The default application icon is unavailable.")
            })?;
            TrayIconBuilder::with_id("desk-drawer")
                .icon(icon)
                .menu(&menu)
                .tooltip("Desk Drawer")
                .on_menu_event(|app, event| {
                    let action = match event.id().as_ref() {
                        "tray-show" => "show",
                        "tray-start" => "start",
                        "tray-toggle" => "toggle",
                        "tray-quit" => "quit",
                        _ => return,
                    };
                    if let Err(error) = app.emit("tray-action", action) {
                        eprintln!("Could not send tray action to Desk Drawer: {error}");
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } | TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        }
                    ) {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            if let Err(error) = window.show() {
                                eprintln!("Could not show Desk Drawer from tray: {error}");
                            }
                            if let Err(error) = window.set_focus() {
                                eprintln!("Could not focus Desk Drawer from tray: {error}");
                            }
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<SessionRunning>();
                let running = match state.0.lock() {
                    Ok(running) => *running,
                    Err(error) => {
                        eprintln!("Could not read session state while closing: {error}");
                        api.prevent_close();
                        return;
                    }
                };
                if running {
                    api.prevent_close();
                    if let Err(error) = window.hide() {
                        eprintln!("Could not hide Desk Drawer to the tray: {error}");
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Desk Drawer");
}
