use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size, State,
    WebviewWindow, WebviewWindowBuilder,
};

const BUDDY_WINDOW_SIZE: f64 = 48.0;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorArea {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
    screen_x: i32,
    screen_y: i32,
    screen_width: u32,
    screen_height: u32,
}

#[derive(Default)]
pub struct RoamState {
    manually_hidden: Mutex<bool>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorTarget {
    monitor_index: usize,
    x: i32,
    y: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoamBuddyConfig {
    assets: Option<(serde_json::Value, Vec<u8>)>,
    cursor_enabled: bool,
    clinginess: u8,
}

fn monitor_areas(app: &AppHandle) -> Result<Vec<MonitorArea>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable for monitor detection.".to_string())?;
    let mut areas = window
        .available_monitors()
        .map_err(|error| format!("Could not enumerate displays: {error}"))?
        .into_iter()
        .map(|monitor| {
            let work = monitor.work_area();
            let position = monitor.position();
            let size = monitor.size();
            MonitorArea {
                x: work.position.x,
                y: work.position.y,
                width: work.size.width,
                height: work.size.height,
                scale_factor: monitor.scale_factor(),
                screen_x: position.x,
                screen_y: position.y,
                screen_width: size.width,
                screen_height: size.height,
            }
        })
        .collect::<Vec<_>>();
    areas.sort_by_key(|area| (area.x, area.y));
    if areas.is_empty() {
        return Err("Windows did not report any available displays.".to_string());
    }
    Ok(areas)
}

fn create_overlay(app: &AppHandle, label: &str, page: &str) -> Result<WebviewWindow, String> {
    WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::App(page.into()))
        .title("Desk Drawer Buddy")
        .inner_size(BUDDY_WINDOW_SIZE, BUDDY_WINDOW_SIZE)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .focusable(false)
        .visible(false)
        .resizable(false)
        .shadow(false)
        .build()
        .map_err(|error| format!("Could not create desktop buddy window {label}: {error}"))
}

pub fn reconcile_roam_window(app: &AppHandle, mode: &str) -> Result<(), String> {
    if mode != "roam" {
        set_manually_hidden(app, true)?;
        hide_and_close(app, "roam")?;
        hide_and_close(app, "roam_hitbox")?;
        return Ok(());
    }
    set_manually_hidden(app, false)?;

    let roam = match app.get_webview_window("roam") {
        Some(window) => window,
        None => create_overlay(app, "roam", "index.html")?,
    };
    let hitbox = match app.get_webview_window("roam_hitbox") {
        Some(window) => window,
        None => match create_overlay(app, "roam_hitbox", "index.html") {
            Ok(window) => window,
            Err(error) => {
                let _ = roam.close();
                return Err(error);
            }
        },
    };
    roam.set_ignore_cursor_events(true)
        .map_err(|error| format!("Could not make buddy art click-through: {error}"))?;
    hitbox
        .set_ignore_cursor_events(false)
        .map_err(|error| format!("Could not enable buddy interaction: {error}"))?;

    let area = monitor_areas(app)?
        .into_iter()
        .next()
        .ok_or_else(|| "No usable display work area was found.".to_string())?;
    let x = area.x + 32;
    let y = area.y + area.height as i32 - (BUDDY_WINDOW_SIZE * area.scale_factor).round() as i32;
    set_size_for_scale(&roam, area.scale_factor)?;
    set_size_for_scale(&hitbox, area.scale_factor)?;
    set_position(&roam, x, y)?;
    set_position(&hitbox, x, y)?;
    show_without_focus(&roam)?;
    show_without_focus(&hitbox)?;
    Ok(())
}

fn hide_and_close(app: &AppHandle, label: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        window
            .hide()
            .map_err(|error| format!("Could not hide desktop buddy window {label}: {error}"))?;
        window
            .close()
            .map_err(|error| format!("Could not close desktop buddy window {label}: {error}"))?;
    }
    Ok(())
}

fn show_without_focus(window: &WebviewWindow) -> Result<(), String> {
    window
        .show()
        .map_err(|error| format!("Could not show desktop buddy window: {error}"))?;
    window
        .set_focusable(false)
        .map_err(|error| format!("Could not keep desktop buddy non-focusable: {error}"))
}

fn set_position(window: &WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    window
        .set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|error| format!("Could not move desktop buddy window: {error}"))
}

#[tauri::command]
pub fn roam_monitor_areas(app: AppHandle) -> Result<Vec<MonitorArea>, String> {
    monitor_areas(&app)
}

#[tauri::command]
pub fn set_roam_buddy_position(
    app: AppHandle,
    x: i32,
    y: i32,
    scale_factor: f64,
) -> Result<(), String> {
    if !scale_factor.is_finite() || !(0.5..=4.0).contains(&scale_factor) {
        return Err("The display scaling value is invalid.".to_string());
    }
    let areas = monitor_areas(&app)?;
    let area = areas
        .iter()
        .min_by_key(|area| {
            let right = area.x + area.width as i32;
            let bottom = area.y + area.height as i32;
            let dx = if x < area.x {
                area.x - x
            } else if x > right {
                x - right
            } else {
                0
            };
            let dy = if y < area.y {
                area.y - y
            } else if y > bottom {
                y - bottom
            } else {
                0
            };
            dx.saturating_mul(dx).saturating_add(dy.saturating_mul(dy))
        })
        .ok_or_else(|| "No display is available for the desktop buddy.".to_string())?;
    let scale_factor = area.scale_factor;
    let physical_size = (BUDDY_WINDOW_SIZE * scale_factor).round() as u32;
    let x = x.clamp(area.x, area.x + area.width as i32 - physical_size as i32);
    let y = y.clamp(area.y, area.y + area.height as i32 - physical_size as i32);
    for label in ["roam", "roam_hitbox"] {
        let window = app
            .get_webview_window(label)
            .ok_or_else(|| format!("Desktop buddy window {label} is unavailable."))?;
        if window
            .inner_size()
            .map_err(|error| format!("Could not inspect desktop buddy size: {error}"))?
            .width
            != physical_size
        {
            window
                .set_size(Size::Physical(PhysicalSize::new(
                    physical_size,
                    physical_size,
                )))
                .map_err(|error| format!("Could not size desktop buddy window {label}: {error}"))?;
        }
        set_position(&window, x, y)?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_roam_buddy_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let manually_hidden = *app
        .try_state::<RoamState>()
        .ok_or_else(|| "Desktop buddy visibility state is unavailable.".to_string())?
        .manually_hidden
        .lock()
        .map_err(|error| format!("Could not read desktop buddy visibility: {error}"))?;
    set_windows_visible(&app, visible && !manually_hidden)
}

fn set_windows_visible(app: &AppHandle, visible: bool) -> Result<(), String> {
    for label in ["roam", "roam_hitbox"] {
        let window = app
            .get_webview_window(label)
            .ok_or_else(|| format!("Desktop buddy window {label} is unavailable."))?;
        if visible {
            show_without_focus(&window)?;
        } else {
            window
                .hide()
                .map_err(|error| format!("Could not hide desktop buddy window {label}: {error}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn roam_is_allowed(app: AppHandle) -> Result<bool, String> {
    let state = app
        .try_state::<RoamState>()
        .ok_or_else(|| "Desktop buddy visibility state is unavailable.".to_string())?;
    if *state
        .manually_hidden
        .lock()
        .map_err(|error| format!("Could not read desktop buddy visibility: {error}"))?
    {
        return Ok(false);
    }
    if !input_desktop_is_default()? {
        return Ok(false);
    }
    #[cfg(target_os = "windows")]
    if foreground_window_is_fullscreen(&app)? || do_not_disturb_is_active()? {
        return Ok(false);
    }
    Ok(true)
}

#[tauri::command]
pub fn roam_action(app: AppHandle, action: String) -> Result<(), String> {
    match action.as_str() {
        "pet" | "sleep" => app
            .emit_to("roam", "roam-action", action)
            .map_err(|error| format!("Could not notify the desktop buddy: {error}")),
        "wake" => {
            set_manually_hidden(&app, false)?;
            app.emit_to("roam", "roam-action", action)
                .map_err(|error| format!("Could not notify the desktop buddy: {error}"))?;
            Ok(())
        }
        "open" => super::show_main_window(&app)
            .map_err(|error| format!("Could not open Desk Drawer: {error}")),
        "hide" => {
            set_manually_hidden(&app, true)?;
            set_windows_visible(&app, false)?;
            Ok(())
        }
        "quit" => {
            app.exit(0);
            Ok(())
        }
        _ => Err(format!("Unknown desktop buddy action: {action}")),
    }
}

fn set_manually_hidden(app: &AppHandle, hidden: bool) -> Result<(), String> {
    let state = app
        .try_state::<RoamState>()
        .ok_or_else(|| "Desktop buddy visibility state is unavailable.".to_string())?;
    *state
        .manually_hidden
        .lock()
        .map_err(|error| format!("Could not update desktop buddy visibility: {error}"))? = hidden;
    Ok(())
}

fn set_size_for_scale(window: &WebviewWindow, scale_factor: f64) -> Result<(), String> {
    if !scale_factor.is_finite() || !(0.5..=4.0).contains(&scale_factor) {
        return Err("The display scaling value is invalid.".to_string());
    }
    let size = (BUDDY_WINDOW_SIZE * scale_factor).round() as u32;
    if window
        .inner_size()
        .map_err(|error| format!("Could not inspect desktop buddy size: {error}"))?
        .width
        == size
    {
        return Ok(());
    }
    window
        .set_size(Size::Physical(PhysicalSize::new(size, size)))
        .map_err(|error| format!("Could not size desktop buddy window: {error}"))
}

#[tauri::command]
pub fn roam_buddy_config(
    app: AppHandle,
    state: State<'_, super::AppState>,
) -> Result<RoamBuddyConfig, String> {
    let (pack_id, cursor_enabled) = {
        let preferences = state
            .preferences
            .lock()
            .map_err(|error| format!("Could not read buddy preferences: {error}"))?;
        (
            preferences.enabled_pack.clone(),
            preferences
                .buddy_sensors
                .get("cursor")
                .copied()
                .unwrap_or(true),
        )
    };
    let assets = match pack_id {
        Some(id) => {
            let directory = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("Could not locate app data directory: {error}"))?
                .join("packs");
            Some(super::installed_pack_assets(&directory, &id)?)
        }
        None => None,
    };
    let clinginess = assets
        .as_ref()
        .and_then(|(pack, _)| pack.pointer("/personality/clinginess"))
        .and_then(serde_json::Value::as_u64)
        .filter(|value| *value <= 100)
        .unwrap_or(20) as u8;
    Ok(RoamBuddyConfig {
        assets,
        cursor_enabled,
        clinginess,
    })
}

#[tauri::command]
pub fn set_roam_context_menu(app: AppHandle, open: bool) -> Result<(), String> {
    let hitbox = app
        .get_webview_window("roam_hitbox")
        .ok_or_else(|| "Desktop buddy interaction window is unavailable.".to_string())?;
    let buddy = app
        .get_webview_window("roam")
        .ok_or_else(|| "Desktop buddy window is unavailable.".to_string())?;
    let position = buddy
        .outer_position()
        .map_err(|error| format!("Could not locate the desktop buddy: {error}"))?;
    if open {
        let scale = buddy
            .scale_factor()
            .map_err(|error| format!("Could not read display scaling: {error}"))?;
        let areas = monitor_areas(&app)?;
        let area = areas
            .iter()
            .find(|area| {
                position.x >= area.x
                    && position.x < area.x + area.width as i32
                    && position.y >= area.y
                    && position.y < area.y + area.height as i32
            })
            .ok_or_else(|| "The buddy is not on an available display.".to_string())?;
        let width = (202.0 * scale).round() as u32;
        let height = (224.0 * scale).round() as u32;
        let x = position
            .x
            .clamp(area.x, area.x + area.width as i32 - width as i32);
        let y = (position.y - height as i32 + (48.0 * scale).round() as i32)
            .clamp(area.y, area.y + area.height as i32 - height as i32);
        hitbox
            .set_size(Size::Physical(PhysicalSize::new(width, height)))
            .map_err(|error| format!("Could not resize the buddy menu area: {error}"))?;
        set_position(&hitbox, x, y)?;
    } else {
        let scale = buddy
            .scale_factor()
            .map_err(|error| format!("Could not read display scaling: {error}"))?;
        set_size_for_scale(&hitbox, scale)?;
        set_position(&hitbox, position.x, position.y)?;
    }
    app.emit_to("roam", "roam-menu", open)
        .map_err(|error| format!("Could not update buddy menu state: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn roam_cursor_target(app: AppHandle) -> Result<Option<CursorTarget>, String> {
    let cursor_enabled = {
        let state = app
            .try_state::<super::AppState>()
            .ok_or_else(|| "Application preferences are unavailable.".to_string())?;
        state
            .preferences
            .lock()
            .map_err(|error| format!("Could not read buddy sensor settings: {error}"))?
            .buddy_sensors
            .get("cursor")
            .copied()
            .unwrap_or(true)
    };
    if !cursor_enabled {
        return Ok(None);
    }
    #[cfg(target_os = "windows")]
    {
        use windows::{Win32::Foundation::POINT, Win32::UI::WindowsAndMessaging::GetCursorPos};
        let mut point = POINT::default();
        unsafe { GetCursorPos(&mut point) }
            .map_err(|error| format!("Could not read the pointer position: {error}"))?;
        let areas = monitor_areas(&app)?;
        let monitor_index = areas
            .iter()
            .position(|area| {
                point.x >= area.screen_x
                    && point.x < area.screen_x + area.screen_width as i32
                    && point.y >= area.screen_y
                    && point.y < area.screen_y + area.screen_height as i32
            })
            .ok_or_else(|| "The pointer is outside the available display areas.".to_string())?;
        let area = areas[monitor_index];
        return Ok(Some(CursorTarget {
            monitor_index,
            x: (((point.x - area.x) as f64 / area.scale_factor).round() as i32)
                .clamp(0, (area.width as f64 / area.scale_factor).round() as i32),
            y: (((point.y - area.y) as f64 / area.scale_factor).round() as i32)
                .clamp(0, (area.height as f64 / area.scale_factor).round() as i32),
        }));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Ok(None)
    }
}

#[cfg(target_os = "windows")]
fn input_desktop_is_default() -> Result<bool, String> {
    use windows::Win32::System::StationsAndDesktops::{
        CloseDesktop, DESKTOP_READOBJECTS, GetUserObjectInformationW, HDESK, OpenInputDesktop,
        UOI_NAME,
    };

    let desktop = match unsafe { OpenInputDesktop(Default::default(), false, DESKTOP_READOBJECTS) }
    {
        Ok(desktop) => desktop,
        Err(error) if error.code().0 == 0x80070005_u32 as i32 => return Ok(false),
        Err(error) => {
            return Err(format!(
                "Could not inspect the Windows input desktop: {error}"
            ));
        }
    };
    let result = (|| {
        let handle = windows::Win32::Foundation::HANDLE(desktop.0);
        let mut byte_count = 0;
        let _ =
            unsafe { GetUserObjectInformationW(handle, UOI_NAME, None, 0, Some(&mut byte_count)) };
        if byte_count < 2 || byte_count % 2 != 0 {
            return Err("Windows returned an invalid input desktop name.".to_string());
        }
        let mut name = vec![0_u16; byte_count as usize / 2];
        unsafe {
            GetUserObjectInformationW(
                handle,
                UOI_NAME,
                Some(name.as_mut_ptr().cast()),
                byte_count,
                Some(&mut byte_count),
            )
        }
        .map_err(|error| format!("Could not read the Windows input desktop name: {error}"))?;
        let end = name
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(name.len());
        Ok(String::from_utf16_lossy(&name[..end]) == "Default")
    })();
    if let Err(error) = unsafe { CloseDesktop(HDESK(desktop.0)) } {
        return Err(format!(
            "Could not close the Windows input desktop handle: {error}"
        ));
    }
    result
}

#[cfg(not(target_os = "windows"))]
fn input_desktop_is_default() -> Result<bool, String> {
    Ok(true)
}

#[cfg(target_os = "windows")]
fn foreground_window_is_fullscreen(app: &AppHandle) -> Result<bool, String> {
    use windows::Win32::{
        Foundation::RECT,
        UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId},
    };

    let foreground = unsafe { GetForegroundWindow() };
    if foreground.0.is_null() {
        return Ok(false);
    }
    let mut process_id = 0;
    unsafe { GetWindowThreadProcessId(foreground, Some(&mut process_id)) };
    if process_id == std::process::id() {
        return Ok(false);
    }
    let mut rect = RECT::default();
    unsafe { GetWindowRect(foreground, &mut rect) }
        .map_err(|error| format!("Could not inspect the foreground window: {error}"))?;
    let areas = monitor_areas(app)?;
    Ok(areas.iter().any(|area| {
        rect.left <= area.screen_x + 2
            && rect.top <= area.screen_y + 2
            && rect.right >= area.screen_x + area.screen_width as i32 - 2
            && rect.bottom >= area.screen_y + area.screen_height as i32 - 2
    }))
}

#[cfg(target_os = "windows")]
fn do_not_disturb_is_active() -> Result<bool, String> {
    use windows::Win32::UI::Shell::{
        QUNS_BUSY, QUNS_NOT_PRESENT, QUNS_PRESENTATION_MODE, QUNS_QUIET_TIME,
        QUNS_RUNNING_D3D_FULL_SCREEN, SHQueryUserNotificationState,
    };

    let state = unsafe { SHQueryUserNotificationState() }
        .map_err(|error| format!("Could not inspect Windows notification state: {error}"))?;
    Ok([
        QUNS_NOT_PRESENT,
        QUNS_BUSY,
        QUNS_RUNNING_D3D_FULL_SCREEN,
        QUNS_PRESENTATION_MODE,
        QUNS_QUIET_TIME,
    ]
    .contains(&state))
}

#[cfg(not(target_os = "windows"))]
fn foreground_window_is_fullscreen(_app: &AppHandle) -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub fn move_roam_buddy_to_cursor(
    app: AppHandle,
    offset_x: i32,
    offset_y: i32,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::{Win32::Foundation::POINT, Win32::UI::WindowsAndMessaging::GetCursorPos};
        let mut point = POINT::default();
        unsafe { GetCursorPos(&mut point) }
            .map_err(|error| format!("Could not read the pointer position: {error}"))?;
        let area = monitor_areas(&app)?
            .into_iter()
            .min_by_key(|area| {
                let right = area.x + area.width as i32;
                let bottom = area.y + area.height as i32;
                let dx = if point.x < area.x {
                    area.x - point.x
                } else if point.x > right {
                    point.x - right
                } else {
                    0
                };
                let dy = if point.y < area.y {
                    area.y - point.y
                } else if point.y > bottom {
                    point.y - bottom
                } else {
                    0
                };
                dx.saturating_mul(dx).saturating_add(dy.saturating_mul(dy))
            })
            .ok_or_else(|| "No display is available for the desktop buddy.".to_string())?;
        let scale = area.scale_factor;
        let x = (point.x - (offset_x as f64 * scale).round() as i32).clamp(
            area.x,
            area.x + area.width as i32 - (BUDDY_WINDOW_SIZE * scale) as i32,
        );
        let baseline = area.y + area.height as i32 - (BUDDY_WINDOW_SIZE * scale) as i32;
        let y = (point.y - (offset_y as f64 * scale).round() as i32).clamp(area.y, baseline);
        for label in ["roam", "roam_hitbox"] {
            let window = app
                .get_webview_window(label)
                .ok_or_else(|| format!("Desktop buddy window {label} is unavailable."))?;
            set_position(&window, x, y)?;
        }
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, offset_x, offset_y);
        Err("Desktop roaming is only supported on Windows.".to_string())
    }
}
