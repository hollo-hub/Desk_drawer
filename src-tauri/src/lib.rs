use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::{Cursor, Read, Seek, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    sync::{Mutex, mpsc},
    thread::JoinHandle,
    time::{SystemTime, UNIX_EPOCH},
};
#[cfg(target_os = "windows")]
use std::{thread, time::Duration};
use tauri::{
    AppHandle, Emitter, Manager, State, Wry,
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

mod overlay;
#[cfg(target_os = "windows")]
mod windows_platform;

const CLIPBOARD_LIMIT: usize = 50;
const CLIPBOARD_EXPIRY_MS: u64 = 24 * 60 * 60 * 1000;
const PREFERENCES_SCHEMA_VERSION: u32 = 14;
const MODULE_IDS: [&str; 12] = [
    "clipboard",
    "links",
    "layouts",
    "rename",
    "break",
    "color-picker",
    "keep-awake",
    "pin-window",
    "notes",
    "focus",
    "tidy-downloads",
    "scenes",
];
static CLIP_ID_COUNTER: AtomicU64 = AtomicU64::new(0);
static CUSTOM_ASSET_COUNTER: AtomicU64 = AtomicU64::new(0);
const DESK_PACK_LIMIT_BYTES: u64 = 20 * 1024 * 1024;
const DESK_PACK_SPRITE_LIMIT_BYTES: u64 = 4 * 1024 * 1024;
const CUSTOM_IMAGE_LIMIT_BYTES: u64 = 5 * 1024 * 1024;
const THEME_ASSET_LIMIT_BYTES: u64 = 4 * 1024 * 1024;
const THEME_BUNDLE_LIMIT_BYTES: u64 = 20 * 1024 * 1024;
const CUSTOM_IMAGE_LIMIT_PIXELS: u64 = 4_000_000;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum ClipboardKind {
    Text,
    Link,
    Color,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipboardEntry {
    id: String,
    text: String,
    kind: ClipboardKind,
    pinned: bool,
    copied_at: u64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum LinkKind {
    Url,
    Folder,
    App,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedLink {
    id: String,
    title: String,
    kind: LinkKind,
    target: String,
    tags: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedScene {
    id: String,
    name: String,
    layout: String,
    focus_minutes: u32,
    break_after: bool,
    #[serde(default)]
    open_links: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
struct FocusTimerSettings {
    schema_version: u32,
    duration_minutes: u32,
    text_color: Option<String>,
}

impl Default for FocusTimerSettings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            duration_minutes: 25,
            text_color: None,
        }
    }
}

fn validate_focus_timer_settings(settings: &FocusTimerSettings) -> Result<(), String> {
    if settings.schema_version != 1 {
        return Err("Focus timer settings schemaVersion must be 1.".to_string());
    }
    if !(1..=10_080).contains(&settings.duration_minutes) {
        return Err("Focus timer duration must be from 1 minute to 7 days.".to_string());
    }
    if settings.text_color.as_deref().is_some_and(|color| {
        color.len() != 7
            || !color.starts_with('#')
            || !color[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
    }) {
        return Err("Focus timer text color must be a six-digit hex color.".to_string());
    }
    Ok(())
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct TidyMove {
    original: String,
    destination: String,
    size_bytes: u64,
    modified_at_ms: u64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(default)]
struct Preferences {
    #[serde(rename = "schemaVersion", default)]
    schema_version: u32,
    clipboard_history: Vec<ClipboardEntry>,
    clipboard_paused: bool,
    theme: String,
    theme_preferences: ThemePreferences,
    #[serde(default = "default_glass_opacity")]
    glass_opacity: u8,
    desk_background: Option<String>,
    desk_stickers: Vec<DeskSticker>,
    active_layout: String,
    close_to_tray: bool,
    close_confirmation_seen: bool,
    enabled_modules: HashMap<String, bool>,
    links: Vec<SavedLink>,
    buddy_sensors: HashMap<String, bool>,
    buddy_rules: Option<Vec<serde_json::Value>>,
    enabled_pack: Option<String>,
    buddy_pack_initialized: bool,
    buddy_mode: String,
    animations_enabled: bool,
    animation_settings: AnimationSettings,
    developer_mode: bool,
    window_style: String,
    interface_motion: InterfaceMotionSettings,
    notes: String,
    saved_scenes: Vec<SavedScene>,
    focus_timer_settings: FocusTimerSettings,
    window_pinned: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
struct ThemePreferences {
    schema_version: u32,
    font_override: Option<String>,
    follow_system: bool,
    light_theme: String,
    dark_theme: String,
    schedule_enabled: bool,
    light_start: String,
    dark_start: String,
    accent_override: Option<String>,
    opacity_overrides: HashMap<String, u8>,
    custom_themes: Vec<String>,
    buddy_follows_theme: bool,
}

impl Default for ThemePreferences {
    fn default() -> Self {
        Self {
            schema_version: 2,
            font_override: None,
            follow_system: false,
            light_theme: "cozy".to_string(),
            dark_theme: "night".to_string(),
            schedule_enabled: false,
            light_start: "07:00".to_string(),
            dark_start: "19:00".to_string(),
            accent_override: None,
            opacity_overrides: HashMap::new(),
            custom_themes: Vec::new(),
            buddy_follows_theme: false,
        }
    }
}

fn validate_theme_preferences(settings: &ThemePreferences) -> Result<(), String> {
    if ![1, 2].contains(&settings.schema_version) {
        return Err("Theme preferences schemaVersion must be 1 or 2.".to_string());
    }
    if settings
        .font_override
        .as_deref()
        .is_some_and(|font| !["pixel", "readable", "mono"].contains(&font))
    {
        return Err("Theme font override must be pixel, readable, or mono.".to_string());
    }
    for (name, time) in [
        ("lightStart", &settings.light_start),
        ("darkStart", &settings.dark_start),
    ] {
        if time.len() != 5
            || !time.is_ascii()
            || !time.bytes().enumerate().all(|(index, byte)| {
                if index == 2 {
                    byte == b':'
                } else {
                    byte.is_ascii_digit()
                }
            })
        {
            return Err(format!("{name} must use 24-hour HH:MM format."));
        }
        let hour = time[..2].parse::<u8>().unwrap_or(255);
        let minute = time[3..].parse::<u8>().unwrap_or(255);
        if hour > 23 || minute > 59 {
            return Err(format!("{name} must be a valid 24-hour time."));
        }
    }
    if settings.accent_override.as_deref().is_some_and(|color| {
        color.len() != 7
            || !color.starts_with('#')
            || !color[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
    }) {
        return Err("Accent override must be a six-digit hex color.".to_string());
    }
    if settings
        .opacity_overrides
        .values()
        .any(|opacity| *opacity > 100)
    {
        return Err("Theme opacity overrides must be percentages from 0 to 100.".to_string());
    }
    let custom_theme_bytes = settings
        .custom_themes
        .iter()
        .try_fold(0usize, |total, theme| total.checked_add(theme.len()))
        .ok_or_else(|| "Saved custom theme size overflowed.".to_string())?;
    if custom_theme_bytes > 512 * 1024
        || settings.custom_themes.iter().any(|theme| {
            theme.len() > 50 * 1024 || serde_json::from_str::<serde_json::Value>(theme).is_err()
        })
    {
        return Err(
            "Saved custom themes must be valid JSON totaling no more than 512 KiB.".to_string(),
        );
    }
    Ok(())
}

fn saved_theme_effect(preferences: &Preferences, theme_id: &str) -> Option<String> {
    if theme_id == "glass" {
        return Some("mica".to_string());
    }
    preferences
        .theme_preferences
        .custom_themes
        .iter()
        .filter_map(|theme| serde_json::from_str::<serde_json::Value>(theme).ok())
        .find(|theme| theme.pointer("/meta/id").and_then(|id| id.as_str()) == Some(theme_id))
        .and_then(|theme| {
            theme
                .pointer("/effects/windowEffect")
                .and_then(|effect| effect.as_str())
                .filter(|effect| matches!(*effect, "mica" | "acrylic"))
                .map(str::to_string)
        })
        .or_else(|| (theme_id == "frost").then(|| "mica".to_string()))
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(default, deny_unknown_fields)]
struct InterfaceMotionSettings {
    drawer_style: String,
    dock_magnification: bool,
    rubber_band: bool,
    cursor_tilt: bool,
    reminder_bounce: bool,
    taskbar_flash: bool,
    list_item_motion: bool,
    loading_idle: bool,
    theme_crossfade: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
struct AnimationEffectSettings {
    buddy_movement: bool,
    buddy_animation: bool,
    soft_window_jelly: bool,
    window_open_close: bool,
    hide_to_tray: bool,
    elastic_resize: bool,
    buddy_transitions: bool,
    buddy_impacts: bool,
    sticker_motion: bool,
    particles: bool,
}

impl Default for AnimationEffectSettings {
    fn default() -> Self {
        Self {
            buddy_movement: true,
            buddy_animation: true,
            soft_window_jelly: true,
            window_open_close: true,
            hide_to_tray: true,
            elastic_resize: true,
            buddy_transitions: true,
            buddy_impacts: true,
            sticker_motion: true,
            particles: true,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
struct AnimationSettings {
    schema_version: u32,
    intensity: String,
    speed_multiplier: f64,
    stiffness: f64,
    bounciness: f64,
    slow_motion_multiplier: f64,
    eco_mode: bool,
    effects: AnimationEffectSettings,
}

impl Default for AnimationSettings {
    fn default() -> Self {
        Self {
            schema_version: 2,
            intensity: "calm".to_string(),
            speed_multiplier: 1.0,
            stiffness: 900.0,
            bounciness: 0.5,
            slow_motion_multiplier: 1.0,
            eco_mode: false,
            effects: AnimationEffectSettings::default(),
        }
    }
}

fn validate_animation_settings(settings: &AnimationSettings) -> Result<(), String> {
    if ![1, 2].contains(&settings.schema_version) {
        return Err("Animation settings schemaVersion must be 1 or 2.".to_string());
    }
    if !["off", "calm", "lively"].contains(&settings.intensity.as_str()) {
        return Err("Animation intensity must be off, calm, or lively.".to_string());
    }
    if !settings.speed_multiplier.is_finite() || !(0.5..=2.0).contains(&settings.speed_multiplier) {
        return Err("Animation speed multiplier must be from 0.5 to 2.".to_string());
    }
    if !settings.stiffness.is_finite() || !(100.0..=1000.0).contains(&settings.stiffness) {
        return Err("Animation stiffness must be from 100 to 1000.".to_string());
    }
    if !settings.bounciness.is_finite() || !(0.0..=1.0).contains(&settings.bounciness) {
        return Err("Animation bounciness must be from 0 to 1.".to_string());
    }
    if !settings.slow_motion_multiplier.is_finite()
        || !(0.1..=1.0).contains(&settings.slow_motion_multiplier)
    {
        return Err("Slow-motion multiplier must be from 0.1 to 1.".to_string());
    }
    Ok(())
}

impl Default for InterfaceMotionSettings {
    fn default() -> Self {
        Self {
            drawer_style: "slide".to_string(),
            dock_magnification: true,
            rubber_band: true,
            cursor_tilt: false,
            reminder_bounce: true,
            taskbar_flash: false,
            list_item_motion: true,
            loading_idle: true,
            theme_crossfade: true,
        }
    }
}

fn validate_interface_motion(settings: &InterfaceMotionSettings) -> Result<(), String> {
    if ["slide", "pop", "instant"].contains(&settings.drawer_style.as_str()) {
        Ok(())
    } else {
        Err("Drawer style must be slide, pop, or instant.".to_string())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeskSticker {
    id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn default_glass_opacity() -> u8 {
    88
}

fn is_valid_theme_id(theme: &str) -> bool {
    !theme.is_empty()
        && theme.len() <= 60
        && theme.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || (index > 0 && byte == b'-')
        })
}

fn validate_window_style(style: &str) -> Result<(), String> {
    if ["native", "soft"].contains(&style) {
        Ok(())
    } else {
        Err("Window style must be Native or Soft.".to_string())
    }
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            schema_version: PREFERENCES_SCHEMA_VERSION,
            clipboard_history: Vec::new(),
            clipboard_paused: false,
            theme: "cozy".to_string(),
            theme_preferences: ThemePreferences::default(),
            glass_opacity: default_glass_opacity(),
            desk_background: None,
            desk_stickers: Vec::new(),
            active_layout: "coding".to_string(),
            close_to_tray: true,
            close_confirmation_seen: false,
            enabled_modules: default_enabled_modules(),
            links: Vec::new(),
            buddy_sensors: default_buddy_sensors(),
            buddy_rules: None,
            enabled_pack: None,
            buddy_pack_initialized: false,
            buddy_mode: "desk".to_string(),
            animations_enabled: true,
            animation_settings: AnimationSettings::default(),
            developer_mode: false,
            window_style: "native".to_string(),
            interface_motion: InterfaceMotionSettings::default(),
            notes: String::new(),
            saved_scenes: Vec::new(),
            focus_timer_settings: FocusTimerSettings::default(),
            window_pinned: false,
        }
    }
}

fn default_buddy_sensors() -> HashMap<String, bool> {
    ["clipboard", "files", "breaks", "cursor"]
        .into_iter()
        .map(|id| (id.to_string(), false))
        .collect()
}

fn default_enabled_modules() -> HashMap<String, bool> {
    MODULE_IDS
        .into_iter()
        .map(|id| (id.to_string(), false))
        .collect()
}

fn module_enabled(preferences: &Preferences, id: &str) -> bool {
    preferences
        .enabled_modules
        .get(id)
        .copied()
        .unwrap_or(false)
}

fn require_module_enabled(state: &AppState, id: &str) -> Result<(), String> {
    let preferences = state
        .preferences
        .lock()
        .map_err(|error| format!("Could not check the {id} module state: {error}"))?;
    if module_enabled(&preferences, id) {
        Ok(())
    } else {
        Err(format!("The {id} module is disabled."))
    }
}

struct AppState {
    preferences: Mutex<Preferences>,
    preferences_path: PathBuf,
    hotkey_error: Mutex<Option<String>>,
    pause_menu_item: Mutex<Option<CheckMenuItem<Wry>>>,
    clipboard_monitor: Mutex<Option<JoinHandle<()>>>,
    keep_awake_worker: Mutex<Option<KeepAwakeWorker>>,
}

struct KeepAwakeWorker {
    stop: mpsc::Sender<()>,
    thread: JoinHandle<()>,
}

#[tauri::command]
fn set_module_enabled(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    if !MODULE_IDS.contains(&id.as_str()) {
        return Err(format!("Unknown module: {id}"));
    }
    let is_clipboard = id == "clipboard";
    if !enabled && id == "keep-awake" {
        set_keep_awake_inner(&state, false)?;
    } else if !enabled && id == "pin-window" {
        set_window_pinned_inner(&app, &state, false)?;
    }
    mutate_preferences(&state, |preferences| {
        preferences.enabled_modules.insert(id, enabled);
        Ok(())
    })?;
    if is_clipboard {
        reconcile_clipboard_monitor(&app)?;
    }
    Ok(())
}

#[tauri::command]
fn set_buddy_sensor_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    if !["clipboard", "files", "breaks", "cursor"].contains(&id.as_str()) {
        return Err(format!("Unknown buddy sensor: {id}"));
    }
    mutate_preferences(&state, |preferences| {
        preferences.buddy_sensors.insert(id, enabled);
        Ok(())
    })
}

#[tauri::command]
fn set_animations_enabled(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    mutate_preferences(&state, |preferences| {
        preferences.animations_enabled = enabled;
        Ok(())
    })
}

#[tauri::command]
fn set_animation_settings(
    state: State<'_, AppState>,
    settings: AnimationSettings,
) -> Result<(), String> {
    validate_animation_settings(&settings)?;
    mutate_preferences(&state, |preferences| {
        preferences.animation_settings = settings;
        Ok(())
    })
}

#[tauri::command]
fn set_focus_timer_settings(
    state: State<'_, AppState>,
    settings: FocusTimerSettings,
) -> Result<(), String> {
    validate_focus_timer_settings(&settings)?;
    mutate_preferences(&state, |preferences| {
        preferences.focus_timer_settings = settings;
        Ok(())
    })
}

#[tauri::command]
fn set_interface_motion(
    state: State<'_, AppState>,
    settings: InterfaceMotionSettings,
) -> Result<(), String> {
    validate_interface_motion(&settings)?;
    mutate_preferences(&state, |preferences| {
        preferences.interface_motion = settings;
        Ok(())
    })
}

#[tauri::command]
fn set_developer_mode(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    mutate_preferences(&state, |preferences| {
        preferences.developer_mode = enabled;
        Ok(())
    })
}

#[tauri::command]
fn set_window_style(
    app: AppHandle,
    state: State<'_, AppState>,
    style: String,
) -> Result<(), String> {
    validate_window_style(&style)?;
    let previous = state
        .preferences
        .lock()
        .map_err(|error| format!("Could not access local preferences: {error}"))?
        .window_style
        .clone();
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "The main window was not found.".to_string())?;
    let decorations = style == "native";
    window
        .set_decorations(decorations)
        .map_err(|error| format!("Could not change window decorations: {error}"))?;
    if let Err(error) = mutate_preferences(&state, |preferences| {
        preferences.window_style = style;
        Ok(())
    }) {
        if let Err(rollback_error) = window.set_decorations(previous == "native") {
            return Err(format!(
                "{error}; also could not restore the previous window style: {rollback_error}"
            ));
        }
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
fn complete_window_hide(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "The main window was not found.".to_string())?
        .hide()
        .map_err(|error| format!("Could not hide the main window: {error}"))
}

fn require_developer_mode(state: &AppState) -> Result<(), String> {
    let preferences = state
        .preferences
        .lock()
        .map_err(|error| format!("Could not access local preferences: {error}"))?;
    if preferences.developer_mode {
        Ok(())
    } else {
        Err("Developer mode is turned off.".to_string())
    }
}

#[tauri::command]
fn open_data_directory(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    require_developer_mode(&state)?;
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate the app data folder: {error}"))?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer.exe")
        .arg(directory)
        .spawn()
        .map_err(|error| format!("Could not open the app data folder: {error}"))?;
    #[cfg(not(target_os = "windows"))]
    return Err("Opening the data folder is only supported on Windows.".to_string());
    Ok(())
}

#[tauri::command]
fn append_developer_log(
    app: AppHandle,
    state: State<'_, AppState>,
    entry: String,
) -> Result<(), String> {
    require_developer_mode(&state)?;
    if entry.is_empty() || entry.len() > 4096 || entry.contains('\n') || entry.contains('\r') {
        return Err("A developer log entry must be one line and at most 4 KiB.".to_string());
    }
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate the app data folder: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create the app data folder: {error}"))?;
    let path = directory.join("developer.log");
    let existing_len = match fs::metadata(&path) {
        Ok(metadata) => metadata.len(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
        Err(error) => return Err(format!("Could not inspect developer log: {error}")),
    };
    if existing_len > 1024 * 1024 {
        let bytes =
            fs::read(&path).map_err(|error| format!("Could not rotate developer log: {error}"))?;
        let keep_from = bytes.len().saturating_sub(512 * 1024);
        fs::write(&path, &bytes[keep_from..])
            .map_err(|error| format!("Could not rotate developer log: {error}"))?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("Could not open developer log: {error}"))?;
    writeln!(file, "{entry}").map_err(|error| format!("Could not write developer log: {error}"))
}

#[tauri::command]
fn read_developer_log(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    require_developer_mode(&state)?;
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate the app data folder: {error}"))?
        .join("developer.log");
    match fs::read(&path) {
        Ok(bytes) => {
            let start = bytes.len().saturating_sub(256 * 1024);
            Ok(String::from_utf8_lossy(&bytes[start..]).into_owned())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(format!("Could not read developer log: {error}")),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeveloperPerformance {
    cpu_percent: f64,
    private_bytes: u64,
    working_set_bytes: u64,
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn developer_performance(state: State<'_, AppState>) -> Result<DeveloperPerformance, String> {
    require_developer_mode(&state)?;
    use windows::Win32::{
        Foundation::{CloseHandle, FILETIME},
        System::{
            ProcessStatus::{
                GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX,
            },
            Threading::{
                GetCurrentProcessId, GetProcessTimes, OpenProcess, PROCESS_QUERY_INFORMATION,
                PROCESS_VM_READ,
            },
        },
    };

    fn cpu_ticks(handle: windows::Win32::Foundation::HANDLE) -> Result<u64, String> {
        let (mut created, mut exited, mut kernel, mut user) = (
            FILETIME::default(),
            FILETIME::default(),
            FILETIME::default(),
            FILETIME::default(),
        );
        unsafe { GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) }
            .map_err(|error| format!("Could not read process CPU time: {error}"))?;
        let ticks =
            |time: FILETIME| (u64::from(time.dwHighDateTime) << 32) | u64::from(time.dwLowDateTime);
        Ok(ticks(kernel) + ticks(user))
    }

    let handle = unsafe {
        OpenProcess(
            PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
            false,
            GetCurrentProcessId(),
        )
    }
    .map_err(|error| format!("Could not open the app process for diagnostics: {error}"))?;
    let result = (|| {
        let before = cpu_ticks(handle)?;
        let started = std::time::Instant::now();
        thread::sleep(Duration::from_millis(250));
        let after = cpu_ticks(handle)?;
        let elapsed_100ns = started.elapsed().as_nanos() / 100;
        let processors = std::thread::available_parallelism()
            .map_err(|error| format!("Could not determine processor count: {error}"))?
            .get() as f64;
        let cpu_percent = if elapsed_100ns == 0 {
            0.0
        } else {
            (after.saturating_sub(before) as f64 / elapsed_100ns as f64 / processors * 100.0)
                .clamp(0.0, 100.0)
        };
        let mut counters = PROCESS_MEMORY_COUNTERS_EX {
            cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32,
            ..Default::default()
        };
        unsafe {
            GetProcessMemoryInfo(
                handle,
                &mut counters as *mut PROCESS_MEMORY_COUNTERS_EX as *mut PROCESS_MEMORY_COUNTERS,
                std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32,
            )
        }
        .map_err(|error| format!("Could not read process memory: {error}"))?;
        Ok(DeveloperPerformance {
            cpu_percent,
            private_bytes: counters.PrivateUsage as u64,
            working_set_bytes: counters.WorkingSetSize as u64,
        })
    })();
    let close_result = unsafe { CloseHandle(handle) };
    if let Err(error) = close_result {
        return Err(format!(
            "Could not close the process diagnostics handle: {error}"
        ));
    }
    result
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn developer_performance(_state: State<'_, AppState>) -> Result<DeveloperPerformance, String> {
    Err("Process performance diagnostics are only supported on Windows.".to_string())
}

#[tauri::command]
fn reset_module_data(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<(), String> {
    require_developer_mode(&state)?;
    if !MODULE_IDS.contains(&id.as_str()) {
        return Err(format!("Unknown module: {id}"));
    }
    match id.as_str() {
        "clipboard" => {
            mutate_preferences(&state, |preferences| {
                preferences.clipboard_history.clear();
                preferences.clipboard_paused = false;
                Ok(())
            })?;
            reconcile_clipboard_monitor(&app)?;
            app.emit("clipboard-history-changed", Vec::<ClipboardEntry>::new())
                .map_err(|error| format!("Could not update the clipboard view: {error}"))?;
            app.emit("clipboard-pause-changed", false)
                .map_err(|error| format!("Could not update clipboard pause state: {error}"))?;
        }
        "links" => mutate_preferences(&state, |preferences| {
            preferences.links.clear();
            for scene in &mut preferences.saved_scenes {
                scene.open_links.clear();
            }
            Ok(())
        })?,
        "notes" => mutate_preferences(&state, |preferences| {
            preferences.notes.clear();
            Ok(())
        })?,
        "scenes" => mutate_preferences(&state, |preferences| {
            preferences.saved_scenes.clear();
            Ok(())
        })?,
        "break" => mutate_preferences(&state, |preferences| {
            preferences.buddy_rules = None;
            Ok(())
        })?,
        "keep-awake" => set_keep_awake_inner(&state, false)?,
        "pin-window" => set_window_pinned_inner(&app, &state, false)?,
        _ => {
            return Err(format!(
                "The {id} module has no separate saved data to reset."
            ));
        }
    }
    Ok(())
}

#[tauri::command]
fn set_buddy_mode(app: AppHandle, state: State<'_, AppState>, mode: String) -> Result<(), String> {
    if !["desk", "roam", "off"].contains(&mode.as_str()) {
        return Err(format!("Unknown buddy mode: {mode}"));
    }
    let previous = state
        .preferences
        .lock()
        .map_err(|error| format!("Could not access local preferences: {error}"))?
        .buddy_mode
        .clone();
    crate::overlay::reconcile_roam_window(&app, &mode)?;
    if let Err(error) = mutate_preferences(&state, |preferences| {
        preferences.buddy_mode = mode.clone();
        Ok(())
    }) {
        return match crate::overlay::reconcile_roam_window(&app, &previous) {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(format!(
                "{error}; also could not restore the previous buddy mode: {rollback_error}"
            )),
        };
    }
    Ok(())
}

#[tauri::command]
fn save_buddy_rules(
    state: State<'_, AppState>,
    rules: Vec<serde_json::Value>,
) -> Result<(), String> {
    validate_buddy_rules(&rules)?;
    mutate_preferences(&state, |preferences| {
        preferences.buddy_rules = Some(rules);
        Ok(())
    })
}

fn validate_buddy_rules(rules: &[serde_json::Value]) -> Result<(), String> {
    const RULE_KEYS: [&str; 9] = [
        "id",
        "name",
        "enabled",
        "when",
        "if",
        "then",
        "cooldownSec",
        "priority",
        "weight",
    ];
    const MOOD_KEYS: [&str; 3] = ["energy", "mood", "curiosity"];
    const ANIMATIONS: [&str; 27] = [
        "idle",
        "blink",
        "walk",
        "sit",
        "sleep",
        "yawn",
        "perk",
        "happy",
        "curious",
        "eat",
        "carried",
        "fall",
        "jump_up",
        "jump_down",
        "land",
        "lie_down",
        "loaf",
        "get_up",
        "groom",
        "stretch",
        "tail_flick",
        "ear_twitch",
        "sit_edge",
        "turn",
        "look_up",
        "look_down",
        "sleep_loaf",
    ];
    const BUDDY_ACTION_STATES: [&str; 7] = [
        "idle", "walking", "sitting", "sleeping", "reacting", "carried", "falling",
    ];
    const NUMERIC_VARIABLES: [&str; 12] = [
        "event.count",
        "mood.energy",
        "mood.mood",
        "mood.curiosity",
        "personality.energy",
        "personality.curiosity",
        "personality.chattiness",
        "personality.clinginess",
        "personality.sleepiness",
        "time.hour",
        "time.weekday",
        "idle.seconds",
    ];
    const STRING_VARIABLES: [&str; 2] = ["event.kind", "state"];
    if rules.len() > 200 {
        return Err("Behavior rules cannot contain more than 200 entries.".to_string());
    }
    let mut ids = HashSet::new();
    for (index, rule) in rules.iter().enumerate() {
        let path = format!("Rule {}", index + 1);
        let object = rule
            .as_object()
            .ok_or_else(|| format!("{path} must be an object."))?;
        if object.keys().any(|key| !RULE_KEYS.contains(&key.as_str())) {
            return Err(format!("{path} contains an unknown field."));
        }
        let id = rule
            .get("id")
            .and_then(serde_json::Value::as_str)
            .filter(|id| {
                !id.is_empty()
                    && id.len() <= 64
                    && id.bytes().enumerate().all(|(position, byte)| {
                        byte.is_ascii_lowercase()
                            || byte.is_ascii_digit()
                            || (position > 0 && matches!(byte, b'_' | b'-'))
                    })
            })
            .ok_or_else(|| format!("{path} needs a valid id."))?;
        if !ids.insert(id) {
            return Err(format!("{path} duplicates rule id {id}."));
        }
        let name = rule.get("name").and_then(serde_json::Value::as_str);
        if name.is_none_or(|name| name.trim().is_empty() || name.len() > 120)
            || rule
                .get("enabled")
                .and_then(serde_json::Value::as_bool)
                .is_none()
            || rule
                .get("when")
                .and_then(serde_json::Value::as_str)
                .is_none_or(|event| event.len() > 120 || !event.contains('.'))
            || rule
                .get("if")
                .and_then(serde_json::Value::as_array)
                .is_none_or(|conditions| conditions.len() > 20)
        {
            return Err(format!(
                "{path} has invalid name, state, event, or conditions."
            ));
        }
        let cooldown = rule.get("cooldownSec").and_then(serde_json::Value::as_u64);
        let priority = rule.get("priority").and_then(serde_json::Value::as_f64);
        let weight = rule.get("weight").and_then(serde_json::Value::as_f64);
        let actions = rule.get("then").and_then(serde_json::Value::as_array);
        if cooldown.is_none_or(|seconds| seconds > 86_400)
            || priority.is_none_or(|value| !value.is_finite())
            || weight.is_none_or(|value| !value.is_finite() || value <= 0.0)
            || actions.is_none_or(|actions| actions.is_empty() || actions.len() > 20)
        {
            return Err(format!(
                "{path} has invalid cooldown, priority, weight, or actions."
            ));
        }
        for condition in rule["if"].as_array().expect("conditions were checked") {
            let condition = condition
                .as_object()
                .ok_or_else(|| format!("{path} has an invalid condition."))?;
            let variable = condition
                .get("var")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default();
            let operator = condition
                .get("op")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default();
            let value = condition.get("value").expect("condition value was checked");
            let numeric = NUMERIC_VARIABLES.contains(&variable) || variable == "random";
            let boolean = is_module_enabled_variable(variable);
            let string = STRING_VARIABLES.contains(&variable);
            if condition
                .keys()
                .any(|key| !["var", "op", "value"].contains(&key.as_str()))
                || variable.trim().is_empty()
                || variable.len() > 120
                || (!numeric && !boolean && !string)
                || !["==", "!=", ">", "<", ">=", "<=", "between"].contains(&operator)
                || !condition.contains_key("value")
            {
                return Err(format!("{path} has an invalid condition."));
            }
            if operator == "between" {
                if !numeric
                    || value.as_array().is_none_or(|range| {
                        range.len() != 2
                            || range
                                .iter()
                                .any(|value| value.as_f64().is_none_or(|value| !value.is_finite()))
                    })
                {
                    return Err(format!("{path} has an invalid between condition."));
                }
            } else if (numeric && value.as_f64().is_none())
                || (boolean && !value.is_boolean())
                || (string && value.as_str().is_none_or(|value| value.len() > 200))
                || (["<", ">", "<=", ">="].contains(&operator) && !numeric)
            {
                return Err(format!("{path} has an invalid condition value."));
            }
        }
        for action in actions.expect("actions were checked") {
            let action = action
                .as_object()
                .ok_or_else(|| format!("{path} contains an invalid action."))?;
            if action.len() != 1 {
                return Err(format!("{path} contains an unsupported action."));
            }
            let (kind, value) = action.iter().next().expect("one action key was checked");
            let valid = match kind.as_str() {
                "play" => value
                    .as_str()
                    .is_some_and(|animation| ANIMATIONS.contains(&animation)),
                "say" | "toast" => value
                    .as_str()
                    .is_some_and(|text| !text.trim().is_empty() && text.len() <= 200),
                "setState" => value
                    .as_str()
                    .is_some_and(|state| BUDDY_ACTION_STATES.contains(&state)),
                "adjust" => value.as_object().is_some_and(|adjustments| {
                    !adjustments.is_empty()
                        && adjustments.iter().all(|(key, amount)| {
                            MOOD_KEYS.contains(&key.as_str())
                                && amount
                                    .as_f64()
                                    .is_some_and(|value| value.is_finite() && value.abs() <= 100.0)
                        })
                }),
                _ => false,
            };
            if !valid {
                return Err(format!(
                    "{path} contains an invalid or unsupported {kind} action."
                ));
            }
        }
    }
    Ok(())
}

fn is_module_enabled_variable(variable: &str) -> bool {
    let Some(module) = variable
        .strip_prefix("module.")
        .and_then(|variable| variable.strip_suffix(".enabled"))
    else {
        return false;
    };
    !module.is_empty()
        && module.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'_' | b'-')
        })
}

#[tauri::command]
fn save_links(state: State<'_, AppState>, links: Vec<SavedLink>) -> Result<(), String> {
    let links = validate_links(links)?;
    mutate_preferences(&state, |preferences| {
        preferences.links = links;
        Ok(())
    })
}

#[tauri::command]
fn open_saved_link(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let link = state
        .preferences
        .lock()
        .map_err(|error| format!("Could not read saved links: {error}"))?
        .links
        .iter()
        .find(|link| link.id == id)
        .cloned()
        .ok_or_else(|| "The saved link no longer exists.".to_string())?;
    let link = validate_link_for_open(link)?;
    open_link_target(&link)
}

#[tauri::command]
fn inspect_desk_pack(path: String) -> Result<serde_json::Value, String> {
    let archive_path = PathBuf::from(path);
    let archive_bytes = read_pack_archive(&archive_path)?;
    let (pack, _) = inspect_pack_archive(Cursor::new(archive_bytes))?;
    Ok(pack)
}

#[tauri::command]
fn install_desk_pack(app: AppHandle, path: String, expected_id: String) -> Result<String, String> {
    let archive_path = PathBuf::from(path);
    let archive_bytes = read_pack_archive(&archive_path)?;
    install_desk_pack_archive(&app, &archive_bytes, &expected_id)
}

#[tauri::command]
fn install_builtin_desk_pack(app: AppHandle, id: String) -> Result<String, String> {
    let archive = match id.as_str() {
        "tabby-cat" => include_bytes!("../../packs/tabby-cat.deskpack").as_slice(),
        "midnight-cat" => include_bytes!("../../packs/midnight-cat.deskpack").as_slice(),
        "snow-cat" => include_bytes!("../../packs/snow-cat.deskpack").as_slice(),
        "lime-slime" => include_bytes!("../../packs/lime-slime.deskpack").as_slice(),
        "tabby-cat-full" => include_bytes!("../../packs/tabby-cat-full.deskpack").as_slice(),
        "midnight-cat-full" => include_bytes!("../../packs/midnight-cat-full.deskpack").as_slice(),
        "snow-cat-full" => include_bytes!("../../packs/snow-cat-full.deskpack").as_slice(),
        "aqua-slime" => include_bytes!("../../packs/aqua-slime.deskpack").as_slice(),
        "berry-slime" => include_bytes!("../../packs/berry-slime.deskpack").as_slice(),
        _ => return Err(format!("Unknown built-in buddy pack: {id}")),
    };
    install_desk_pack_archive(&app, archive, &id)
}

fn custom_buddy_id(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 60 {
        return Err("Buddy name must contain 1 to 60 characters.".to_string());
    }
    let mut slug = String::new();
    let mut separator = false;
    for character in name.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            if slug.len() < 55 {
                slug.push(character);
            }
            separator = false;
        } else if !separator && !slug.is_empty() && slug.len() < 55 {
            slug.push('-');
            separator = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        return Err("Buddy name needs at least one English letter or number.".to_string());
    }
    Ok(format!("custom-{slug}"))
}

fn build_custom_buddy_pack(name: &str, sprite_png: &[u8]) -> Result<(String, Vec<u8>), String> {
    if sprite_png.len() as u64 > DESK_PACK_SPRITE_LIMIT_BYTES {
        return Err("Buddy sprite image exceeds the 4 MB size limit.".to_string());
    }
    let name = name.trim();
    let id = custom_buddy_id(name)?;
    let mut pack: serde_json::Value =
        serde_json::from_str(include_str!("../../packs/tabby-cat-full.json"))
            .map_err(|error| format!("Could not load the custom buddy template: {error}"))?;
    pack["id"] = serde_json::Value::String(id.clone());
    pack["name"] = serde_json::Value::String(name.to_string());
    pack["author"] = serde_json::Value::String("Custom".to_string());
    pack["version"] = serde_json::Value::String("1.0.0".to_string());
    pack["license"] = serde_json::Value::String("User supplied".to_string());
    pack["buddy"]["sprite"] = serde_json::Value::String("sprites/custom-buddy.png".to_string());
    for (key, lines) in [
        (
            "linkCopied",
            vec![
                "I found a link!",
                "That looks interesting.",
                "Where does it go?",
            ],
        ),
        (
            "breakTaken",
            vec!["Good break!", "A little stretch helps.", "Welcome back!"],
        ),
        (
            "filesSorted",
            vec!["Nice and tidy!", "That looks better.", "All organized!"],
        ),
        ("yawn", vec!["Getting sleepy.", "Time for a stretch?"]),
        ("pet", vec!["That feels nice!", "Hello, friend!", "Again?"]),
        ("dropInspect", vec!["What is this?", "Let me take a look."]),
        ("wake", vec!["I'm awake!", "Hi there!"]),
    ] {
        pack["lines"][key] = serde_json::Value::Array(
            lines
                .into_iter()
                .map(|line| serde_json::Value::String(line.to_string()))
                .collect(),
        );
    }
    validate_pack_png(sprite_png, highest_pack_frame(&pack)?)?;
    let manifest = serde_json::to_string(&pack)
        .map_err(|error| format!("Could not encode custom buddy manifest: {error}"))?;
    let archive = build_pack_archive(&manifest, "sprites/custom-buddy.png", sprite_png)?;
    Ok((id, archive))
}

#[tauri::command]
fn create_custom_buddy_pack(
    app: AppHandle,
    name: String,
    sprite_path: String,
) -> Result<String, String> {
    let sprite_path = PathBuf::from(sprite_path);
    let metadata = fs::metadata(&sprite_path)
        .map_err(|error| format!("Could not inspect buddy sprite image: {error}"))?;
    if metadata.len() > DESK_PACK_SPRITE_LIMIT_BYTES {
        return Err("Buddy sprite image exceeds the 4 MB size limit.".to_string());
    }
    let sprite_png = fs::read(&sprite_path)
        .map_err(|error| format!("Could not read buddy sprite image: {error}"))?;
    let (id, archive) = build_custom_buddy_pack(&name, &sprite_png)?;
    install_desk_pack_archive(&app, &archive, &id)?;
    Ok(id)
}

#[tauri::command]
fn ensure_default_buddy_pack(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let should_enable = {
        let preferences = state
            .preferences
            .lock()
            .map_err(|error| format!("Could not inspect buddy pack preferences: {error}"))?;
        !preferences.buddy_pack_initialized && preferences.enabled_pack.is_none()
    };
    let bundled_archive = include_bytes!("../../packs/tabby-cat-full.deskpack");
    let (bundled_pack, _) = inspect_pack_archive(Cursor::new(bundled_archive.as_slice()))?;
    let bundled_version = bundled_pack
        .get("version")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "Bundled Tabby pack has no version.".to_string())?;
    let installed_path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate app data directory: {error}"))?
        .join("packs")
        .join("tabby-cat-full.deskpack");
    if !installed_path.exists() {
        install_desk_pack_archive(&app, bundled_archive, "tabby-cat-full")?;
    } else {
        let installed_bytes = read_pack_archive(&installed_path)?;
        let (installed_pack, _) = inspect_pack_archive(Cursor::new(installed_bytes))?;
        if installed_pack.get("id").and_then(serde_json::Value::as_str) != Some("tabby-cat-full") {
            return Err("Installed default buddy pack has an unexpected id.".to_string());
        }
        let installed_version = installed_pack
            .get("version")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "Installed default buddy pack has no version.".to_string())?;
        if version_is_older(installed_version, bundled_version) {
            replace_installed_builtin_pack(&app, bundled_archive, "tabby-cat-full")?;
        }
    }
    mutate_preferences(&state, |preferences| {
        if should_enable {
            preferences.enabled_pack = Some("tabby-cat-full".to_string());
        }
        preferences.buddy_pack_initialized = true;
        Ok(())
    })
}

fn version_is_older(installed: &str, bundled: &str) -> bool {
    let parse = |version: &str| {
        let parts: Vec<u64> = version
            .split('.')
            .map(str::parse)
            .collect::<Result<_, _>>()
            .ok()?;
        (!parts.is_empty()).then_some(parts)
    };
    let (Some(installed), Some(bundled)) = (parse(installed), parse(bundled)) else {
        return false;
    };
    let length = installed.len().max(bundled.len());
    (0..length)
        .find_map(|index| {
            let left = installed.get(index).copied().unwrap_or(0);
            let right = bundled.get(index).copied().unwrap_or(0);
            (left != right).then_some(left < right)
        })
        .unwrap_or(false)
}

fn replace_installed_builtin_pack(
    app: &AppHandle,
    archive_bytes: &[u8],
    expected_id: &str,
) -> Result<String, String> {
    let (pack, _) = inspect_pack_archive(Cursor::new(archive_bytes))?;
    if pack.get("id").and_then(serde_json::Value::as_str) != Some(expected_id)
        || !is_safe_pack_id(expected_id)
    {
        return Err("Bundled buddy pack id is invalid.".to_string());
    }
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate app data directory: {error}"))?
        .join("packs");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create pack directory: {error}"))?;
    let destination = directory.join(format!("{expected_id}.deskpack"));
    let metadata = fs::symlink_metadata(&destination)
        .map_err(|error| format!("Could not inspect installed buddy pack: {error}"))?;
    if !metadata.file_type().is_file() {
        return Err("Installed default buddy pack is not a regular file.".to_string());
    }
    let process_id = std::process::id();
    let temporary = directory.join(format!(".{expected_id}-{process_id}.update.tmp"));
    let backup = directory.join(format!(".{expected_id}-{process_id}.update.bak"));
    let mut staged = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| format!("Could not stage updated buddy pack: {error}"))?;
    staged.write_all(archive_bytes).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Could not stage updated buddy pack: {error}")
    })?;
    drop(staged);
    fs::rename(&destination, &backup).map_err(|error| {
        format!("Could not stage the previous buddy pack for replacement: {error}")
    })?;
    if let Err(error) = fs::rename(&temporary, &destination) {
        if let Err(restore_error) = fs::rename(&backup, &destination) {
            return Err(format!(
                "Could not install updated buddy pack: {error}; restoring the previous pack also failed: {restore_error}"
            ));
        }
        let _ = fs::remove_file(&temporary);
        return Err(format!("Could not install updated buddy pack: {error}"));
    }
    fs::remove_file(&backup)
        .map_err(|error| format!("Updated buddy pack, but could not remove its backup: {error}"))?;
    Ok(destination.to_string_lossy().into_owned())
}

fn install_desk_pack_archive(
    app: &AppHandle,
    archive_bytes: &[u8],
    expected_id: &str,
) -> Result<String, String> {
    if archive_bytes.len() as u64 > DESK_PACK_LIMIT_BYTES {
        return Err("Pack archive exceeds the 20 MB size limit.".to_string());
    }
    let (pack, _) = inspect_pack_archive(Cursor::new(archive_bytes))?;
    let id = pack
        .get("id")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "Pack manifest does not contain a valid id.".to_string())?;
    if id != expected_id || !is_safe_pack_id(id) {
        return Err(
            "Pack id changed after preview; inspect it again before installing.".to_string(),
        );
    }
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate app data directory: {error}"))?
        .join("packs");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create pack directory: {error}"))?;
    let destination = directory.join(format!("{id}.deskpack"));
    if destination.exists() {
        return Err(format!(
            "Pack \"{id}\" is already installed; remove it before replacing it."
        ));
    }
    let temporary = directory.join(format!(".{id}-{}.tmp", std::process::id()));
    let mut staged = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| format!("Could not stage pack for installation: {error}"))?;
    staged.write_all(archive_bytes).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Could not stage pack for installation: {error}")
    })?;
    drop(staged);
    fs::rename(&temporary, &destination)
        .map_err(|error| format!("Could not install pack: {error}"))?;
    Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
fn list_installed_desk_packs(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate app data directory: {error}"))?
        .join("packs");
    read_installed_pack_manifests(&directory)
}

#[tauri::command]
fn delete_installed_desk_pack(app: AppHandle, id: String) -> Result<(), String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate app data directory: {error}"))?
        .join("packs");
    remove_installed_pack(&directory, &id)
}

fn remove_installed_pack(directory: &Path, id: &str) -> Result<(), String> {
    if !is_safe_pack_id(id) {
        return Err("Pack id is not valid.".to_string());
    }
    let path = directory.join(format!("{id}.deskpack"));
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("Could not inspect installed pack {id}: {error}"))?;
    if !metadata.file_type().is_file() {
        return Err(format!("Installed pack {id} is not a regular file."));
    }
    fs::remove_file(&path).map_err(|error| format!("Could not delete installed pack {id}: {error}"))
}

#[tauri::command]
fn installed_pack_assets(
    directory: &Path,
    id: &str,
) -> Result<(serde_json::Value, Vec<u8>), String> {
    if !is_safe_pack_id(id) {
        return Err("Pack id is not valid.".to_string());
    }
    let path = directory.join(format!("{id}.deskpack"));
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("Could not inspect installed pack {id}: {error}"))?;
    if !metadata.file_type().is_file() {
        return Err(format!("Installed pack {id} is not a regular file."));
    }
    let bytes = read_pack_archive(&path)?;
    let (pack, sprite) = inspect_pack_archive(Cursor::new(bytes))?;
    if pack.get("id").and_then(serde_json::Value::as_str) != Some(id) {
        return Err(format!(
            "Installed pack {id} does not match its manifest id."
        ));
    }
    Ok((pack, sprite))
}

#[tauri::command]
fn set_enabled_desk_pack(
    app: AppHandle,
    state: State<'_, AppState>,
    id: Option<String>,
) -> Result<(), String> {
    if let Some(ref pack_id) = id {
        let directory = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Could not locate app data directory: {error}"))?
            .join("packs");
        installed_pack_assets(&directory, pack_id)?;
    }
    mutate_preferences(&state, |preferences| {
        preferences.enabled_pack = id;
        Ok(())
    })?;
    if app.get_webview_window("roam").is_some() {
        app.emit_to("roam", "desk-pack-changed", ())
            .map_err(|error| {
                format!("Pack setting was saved, but the roaming buddy could not refresh: {error}")
            })?;
    }
    Ok(())
}

#[tauri::command]
fn get_installed_desk_pack_assets(
    app: AppHandle,
    id: String,
) -> Result<(serde_json::Value, Vec<u8>), String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate app data directory: {error}"))?
        .join("packs");
    installed_pack_assets(&directory, &id)
}

#[tauri::command]
fn export_desk_pack(pack_json: String, sprite_png: Vec<u8>, path: String) -> Result<(), String> {
    if pack_json.len() as u64 > DESK_PACK_LIMIT_BYTES {
        return Err("Pack manifest exceeds the 20 MB size limit.".to_string());
    }
    if sprite_png.len() as u64 > DESK_PACK_SPRITE_LIMIT_BYTES {
        return Err("Sprite image exceeds the 4 MB size limit.".to_string());
    }
    let pack: serde_json::Value = serde_json::from_str(&pack_json)
        .map_err(|error| format!("Pack manifest is not valid JSON: {error}"))?;
    let sprite_path = pack
        .pointer("/buddy/sprite")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "Pack manifest must name its buddy sprite.".to_string())?;
    if !is_safe_sprite_path(sprite_path) {
        return Err("Pack sprite path must point to a PNG inside sprites/.".to_string());
    }
    validate_pack_png(&sprite_png, highest_pack_frame(&pack)?)?;
    let archive = build_pack_archive(&pack_json, sprite_path, &sprite_png)?;
    let path = PathBuf::from(path);
    if path.exists() {
        return Err("The selected export file already exists; choose a new name.".to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "Choose a valid location for the pack file.".to_string())?;
    let temporary = parent.join(format!(".desk-pack-{}.tmp", std::process::id()));
    let mut staged = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| format!("Could not write pack archive: {error}"))?;
    staged
        .write_all(&archive)
        .map_err(|error| format!("Could not write pack archive: {error}"))?;
    drop(staged);
    fs::rename(&temporary, &path)
        .map_err(|error| format!("Could not finish writing pack archive: {error}"))
}

fn read_pack_archive(path: &Path) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Could not read pack archive {}: {error}", path.display()))?;
    if metadata.len() > DESK_PACK_LIMIT_BYTES {
        return Err("Pack archive exceeds the 20 MB size limit.".to_string());
    }
    let file = fs::File::open(path)
        .map_err(|error| format!("Could not open pack archive {}: {error}", path.display()))?;
    let mut bytes = Vec::new();
    file.take(DESK_PACK_LIMIT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read pack archive {}: {error}", path.display()))?;
    if bytes.len() as u64 > DESK_PACK_LIMIT_BYTES {
        return Err("Pack archive exceeds the 20 MB size limit.".to_string());
    }
    Ok(bytes)
}

fn inspect_pack_archive<R: Read + Seek>(reader: R) -> Result<(serde_json::Value, Vec<u8>), String> {
    let mut archive = ZipArchive::new(reader)
        .map_err(|error| format!("Pack is not a valid ZIP archive: {error}"))?;
    if archive.len() > 16 {
        return Err("Pack archive contains too many files.".to_string());
    }
    let mut manifest = None;
    let mut sprite = None;
    let mut sprite_path = None;
    let mut names = std::collections::HashSet::new();
    let mut total_size = 0_u64;

    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("Could not read pack archive entry {index}: {error}"))?;
        let name = file
            .name()
            .map_err(|error| format!("Could not read pack archive entry {index} name: {error}"))?
            .into_owned();
        register_pack_archive_entry(&mut names, &name)?;
        if file.is_dir() {
            if name != "sprites/" {
                return Err(format!("Pack contains an unsupported folder: {name}"));
            }
            continue;
        }
        let expanded_size = file.size();
        total_size = total_size
            .checked_add(expanded_size)
            .ok_or_else(|| "Pack archive expands beyond the 20 MB size limit.".to_string())?;
        if total_size > DESK_PACK_LIMIT_BYTES {
            return Err("Pack archive expands beyond the 20 MB size limit.".to_string());
        }
        if name == "pack.json" {
            let bytes = read_zip_entry_limited(&mut file, DESK_PACK_LIMIT_BYTES, "pack.json")?;
            if bytes.len() as u64 != expanded_size {
                return Err("pack.json size does not match the ZIP directory.".to_string());
            }
            manifest = Some(
                serde_json::from_slice::<serde_json::Value>(&bytes)
                    .map_err(|error| format!("pack.json is not valid JSON: {error}"))?,
            );
        } else if is_safe_sprite_path(&name) {
            if sprite.is_some() {
                return Err("Pack archive contains more than one sprite image.".to_string());
            }
            let bytes = read_zip_entry_limited(&mut file, DESK_PACK_SPRITE_LIMIT_BYTES, &name)?;
            if bytes.len() as u64 != expanded_size {
                return Err(format!("{name} size does not match the ZIP directory."));
            }
            sprite_path = Some(name);
            sprite = Some(bytes);
        } else {
            return Err(format!(
                "Pack contains an unsupported or unsafe path: {name}"
            ));
        }
    }

    let pack = manifest.ok_or_else(|| "Pack is missing pack.json.".to_string())?;
    let expected_sprite = pack
        .pointer("/buddy/sprite")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "pack.json must name its buddy sprite.".to_string())?;
    let actual_sprite_path =
        sprite_path.ok_or_else(|| format!("Pack is missing {expected_sprite}."))?;
    if actual_sprite_path != expected_sprite {
        return Err(format!(
            "Pack sprite path mismatch: manifest requests {expected_sprite}, archive contains {actual_sprite_path}."
        ));
    }
    validate_pack_png(
        sprite
            .as_deref()
            .expect("sprite bytes are paired with a sprite path"),
        highest_pack_frame(&pack)?,
    )?;
    Ok((
        pack,
        sprite.expect("sprite bytes are paired with a sprite path"),
    ))
}

fn register_pack_archive_entry(names: &mut HashSet<String>, name: &str) -> Result<(), String> {
    if !names.insert(name.to_string()) {
        return Err(format!("Pack contains a duplicate file: {name}"));
    }
    Ok(())
}

fn read_zip_entry_limited<R: Read>(
    reader: &mut R,
    maximum: u64,
    name: &str,
) -> Result<Vec<u8>, String> {
    let capacity = usize::try_from(maximum.min(1024 * 1024))
        .expect("the bounded initial allocation fits usize");
    let mut bytes = Vec::with_capacity(capacity);
    reader
        .take(maximum.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read {name}: {error}"))?;
    if bytes.len() as u64 > maximum {
        return Err(format!("{name} exceeds its uncompressed size limit."));
    }
    Ok(bytes)
}

fn read_installed_pack_manifests(directory: &Path) -> Result<Vec<serde_json::Value>, String> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(format!(
                "Could not list installed packs in {}: {error}",
                directory.display()
            ));
        }
    };
    let mut paths = entries
        .map(|entry| {
            entry
                .map(|entry| entry.path())
                .map_err(|error| format!("Could not read installed pack entry: {error}"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    paths.sort();

    let mut packs = Vec::new();
    for path in paths {
        if path.extension().and_then(|extension| extension.to_str()) != Some("deskpack") {
            continue;
        }
        let metadata = fs::symlink_metadata(&path).map_err(|error| {
            format!(
                "Could not inspect installed pack {}: {error}",
                path.display()
            )
        })?;
        if !metadata.file_type().is_file() {
            return Err(format!(
                "Installed pack {} is not a regular file.",
                path.display()
            ));
        }
        let id = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .filter(|id| is_safe_pack_id(id))
            .ok_or_else(|| format!("Installed pack has an invalid filename: {}", path.display()))?;
        let bytes = read_pack_archive(&path)?;
        let (manifest, _) = inspect_pack_archive(Cursor::new(bytes))?;
        let manifest_id = manifest
            .get("id")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| format!("Installed pack {id} has no valid id."))?;
        if manifest_id != id {
            return Err(format!(
                "Installed pack {id} does not match its manifest id {manifest_id}."
            ));
        }
        packs.push(manifest);
    }
    Ok(packs)
}

fn is_safe_pack_id(id: &str) -> bool {
    if id.is_empty() || id.len() > 64 {
        return false;
    }
    let mut bytes = id.bytes();
    let Some(first) = bytes.next() else {
        return false;
    };
    (first.is_ascii_lowercase() || first.is_ascii_digit())
        && bytes.all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn is_safe_sprite_path(path: &str) -> bool {
    let Some(file_name) = path.strip_prefix("sprites/") else {
        return false;
    };
    let Some(stem) = file_name.strip_suffix(".png") else {
        return false;
    };
    !stem.is_empty()
        && stem
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn highest_pack_frame(pack: &serde_json::Value) -> Result<u32, String> {
    let animations = pack
        .pointer("/buddy/animations")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| "Pack manifest must contain buddy animations.".to_string())?;
    animations
        .values()
        .flat_map(|animation| {
            animation
                .get("frames")
                .and_then(serde_json::Value::as_array)
        })
        .flatten()
        .filter_map(serde_json::Value::as_u64)
        .max()
        .and_then(|frame| u32::try_from(frame).ok())
        .ok_or_else(|| "Pack manifest must contain at least one valid animation frame.".to_string())
}

fn validate_pack_png(bytes: &[u8], highest_frame: u32) -> Result<(), String> {
    let decoder = png::Decoder::new(Cursor::new(bytes));
    let mut reader = decoder
        .read_info()
        .map_err(|_| "Buddy sprite must be a valid PNG image.".to_string())?;
    let (width, height) = (reader.info().width, reader.info().height);
    if width < 32
        || height < 32
        || width > 4096
        || height > 4096
        || width % 32 != 0
        || height % 32 != 0
        || u64::from(width) * u64::from(height) > 16_777_216
        || (width / 32) * (height / 32) <= highest_frame
    {
        return Err(
            "Buddy sprite dimensions must be at most 4096 px, divisible into 32×32 frames, and include every referenced frame."
                .to_string(),
        );
    }
    let output_size = reader
        .output_buffer_size()
        .ok_or_else(|| "Buddy sprite exceeds the decoded image limit.".to_string())?;
    if output_size > 64 * 1024 * 1024 {
        return Err("Buddy sprite expands beyond the 64 MB image limit.".to_string());
    }
    let mut decoded = vec![0; output_size];
    reader
        .next_frame(&mut decoded)
        .map_err(|_| "Buddy sprite must be a valid PNG image.".to_string())?;
    Ok(())
}

fn build_pack_archive(manifest: &str, sprite_path: &str, sprite: &[u8]) -> Result<Vec<u8>, String> {
    let cursor = Cursor::new(Vec::new());
    let mut writer = ZipWriter::new(cursor);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    writer
        .start_file("pack.json", options)
        .map_err(|error| format!("Could not create pack.json in archive: {error}"))?;
    writer
        .write_all(manifest.as_bytes())
        .map_err(|error| format!("Could not write pack manifest: {error}"))?;
    writer
        .start_file(sprite_path, options)
        .map_err(|error| format!("Could not create sprite in archive: {error}"))?;
    writer
        .write_all(sprite)
        .map_err(|error| format!("Could not write sprite image: {error}"))?;
    let cursor = writer
        .finish()
        .map_err(|error| format!("Could not finalize pack archive: {error}"))?;
    let bytes = cursor.into_inner();
    if bytes.len() as u64 > DESK_PACK_LIMIT_BYTES {
        return Err("Exported pack exceeds the 20 MB size limit.".to_string());
    }
    Ok(bytes)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CloseRequestBehavior {
    Confirm,
    Hide,
    Quit,
}

fn now_unix_ms() -> Result<u64, String> {
    let milliseconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock is before the Unix epoch: {error}"))?
        .as_millis();
    u64::try_from(milliseconds)
        .map_err(|error| format!("System clock value is out of range: {error}"))
}

fn classify_clipboard_text(text: &str) -> ClipboardKind {
    if is_safe_http_url(text) {
        ClipboardKind::Link
    } else if matches_hex_color(text) {
        ClipboardKind::Color
    } else {
        ClipboardKind::Text
    }
}

fn matches_hex_color(text: &str) -> bool {
    let digits = text.strip_prefix('#').unwrap_or_default();
    matches!(digits.len(), 3 | 6) && digits.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn migrate_preferences(mut value: serde_json::Value) -> Result<(Preferences, bool), String> {
    let mut version = match value.get("schemaVersion") {
        None => 0,
        Some(value) => u32::try_from(value.as_u64().ok_or_else(|| {
            "The saved preferences schema version must be an integer.".to_string()
        })?)
        .map_err(|error| {
            format!("The saved preferences schema version is out of range: {error}")
        })?,
    };
    if version > PREFERENCES_SCHEMA_VERSION {
        return Err(format!(
            "Preferences schema version {} is newer than supported version {}.",
            version, PREFERENCES_SCHEMA_VERSION
        ));
    }
    let migrated = version != PREFERENCES_SCHEMA_VERSION;
    while version < PREFERENCES_SCHEMA_VERSION {
        match version {
            0 => {
                version = 1;
            }
            1 => {
                let now = now_unix_ms()?;
                let object = value
                    .as_object_mut()
                    .ok_or_else(|| "Preferences must be a JSON object.".to_string())?;
                let entries = object
                    .entry("clipboard_history")
                    .or_insert_with(|| serde_json::json!([]))
                    .as_array_mut()
                    .ok_or_else(|| {
                        "Clipboard history in old preferences must be an array.".to_string()
                    })?;
                for (index, entry) in entries.iter_mut().enumerate() {
                    let text = entry.as_str().ok_or_else(|| {
                        format!("Clipboard history item {index} in old preferences is not text.")
                    })?;
                    let kind = classify_clipboard_text(text);
                    *entry = serde_json::json!({
                        "id": format!("legacy-{now}-{index}"),
                        "text": text,
                        "kind": kind,
                        "pinned": false,
                        "copiedAt": now,
                    });
                }
                version = 2;
            }
            2 => {
                version = 3;
            }
            3 => {
                version = 4;
            }
            4 => {
                version = 5;
            }
            5 => {
                version = 6;
            }
            6 => {
                version = 7;
            }
            7 => {
                version = 8;
            }
            8 => {
                version = 9;
            }
            9 => {
                let object = value
                    .as_object_mut()
                    .ok_or_else(|| "Preferences must be a JSON object.".to_string())?;
                let defaults =
                    serde_json::to_value(ThemePreferences::default()).map_err(|error| {
                        format!("Could not create theme preference defaults: {error}")
                    })?;
                object.entry("theme_preferences").or_insert(defaults);
                version = 10;
            }
            10 => {
                version = 11;
            }
            11 => {
                version = 12;
            }
            12 => {
                version = 13;
            }
            13 => {
                let object = value
                    .as_object_mut()
                    .ok_or_else(|| "Preferences must be a JSON object.".to_string())?;
                if let Some(settings) = object
                    .get_mut("animation_settings")
                    .and_then(serde_json::Value::as_object_mut)
                {
                    settings.insert("schemaVersion".to_string(), serde_json::Value::from(2));
                    settings
                        .entry("ecoMode".to_string())
                        .or_insert(serde_json::Value::Bool(false));
                    let effects = settings
                        .entry("effects".to_string())
                        .or_insert_with(|| serde_json::json!({}));
                    if let Some(effects) = effects.as_object_mut() {
                        effects
                            .entry("buddyMovement".to_string())
                            .or_insert(serde_json::Value::Bool(true));
                        effects
                            .entry("buddyAnimation".to_string())
                            .or_insert(serde_json::Value::Bool(true));
                    }
                }
                if let Some(settings) = object
                    .get_mut("theme_preferences")
                    .and_then(serde_json::Value::as_object_mut)
                {
                    settings.insert("schemaVersion".to_string(), serde_json::Value::from(2));
                    settings
                        .entry("fontOverride".to_string())
                        .or_insert(serde_json::Value::Null);
                }
                version = 14;
            }
            unsupported => {
                return Err(format!(
                    "No preferences migration exists for version {unsupported}."
                ));
            }
        }
    }
    if let Some(object) = value.as_object_mut() {
        object.insert(
            "schemaVersion".to_string(),
            serde_json::Value::from(PREFERENCES_SCHEMA_VERSION),
        );
    } else {
        return Err("Preferences must be a JSON object.".to_string());
    }
    let preferences = serde_json::from_value::<Preferences>(value)
        .map_err(|error| format!("Could not decode saved preferences: {error}"))?;
    if !is_valid_theme_id(&preferences.theme) {
        return Err("The saved theme id is invalid.".to_string());
    }
    validate_theme_preferences(&preferences.theme_preferences)?;
    if !(30..=95).contains(&preferences.glass_opacity) {
        return Err("Saved Glass opacity must be between 30 and 95 percent.".to_string());
    }
    validate_window_style(&preferences.window_style)?;
    validate_interface_motion(&preferences.interface_motion)?;
    validate_animation_settings(&preferences.animation_settings)?;
    validate_focus_timer_settings(&preferences.focus_timer_settings)?;
    if preferences
        .desk_background
        .as_deref()
        .is_some_and(|id| !is_safe_pack_id(id))
    {
        return Err("Saved desk background id is invalid.".to_string());
    }
    validate_desk_stickers(&preferences.desk_stickers)?;
    Ok((preferences, migrated))
}

fn close_request_behavior(preferences: &Preferences) -> CloseRequestBehavior {
    if !preferences.close_confirmation_seen {
        CloseRequestBehavior::Confirm
    } else if preferences.close_to_tray {
        CloseRequestBehavior::Hide
    } else {
        CloseRequestBehavior::Quit
    }
}

fn validate_links(links: Vec<SavedLink>) -> Result<Vec<SavedLink>, String> {
    if links.len() > 200 {
        return Err("Desk Drawer can save at most 200 links.".to_string());
    }
    let mut ids = std::collections::HashSet::new();
    links
        .into_iter()
        .map(|link| {
            if !ids.insert(link.id.clone()) {
                return Err(format!("Duplicate saved-link id: {}", link.id));
            }
            validate_link(link)
        })
        .collect()
}

fn validate_link(mut link: SavedLink) -> Result<SavedLink, String> {
    if link.id.is_empty()
        || link.id.len() > 64
        || !link
            .id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("A saved link needs a valid id.".to_string());
    }
    link.title = link.title.trim().to_string();
    if link.title.is_empty() || link.title.chars().count() > 120 {
        return Err("Saved-link titles must contain 1 to 120 characters.".to_string());
    }
    link.target = link.target.trim().to_string();
    if link.target.is_empty() || link.target.len() > 4096 {
        return Err("Saved-link targets must contain 1 to 4096 characters.".to_string());
    }
    match link.kind {
        LinkKind::Url => {
            if !is_safe_http_url(&link.target) {
                return Err("Only valid http:// and https:// links can be opened.".to_string());
            }
        }
        LinkKind::Folder | LinkKind::App => {
            let path = PathBuf::from(&link.target);
            if !path.is_absolute() {
                return Err("Folder and app links must use an absolute local path.".to_string());
            }
        }
    }
    if link.tags.len() > 20 {
        return Err("A saved link can have at most 20 tags.".to_string());
    }
    let mut tags = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for tag in link.tags {
        let tag = tag.trim().to_string();
        if tag.is_empty() {
            continue;
        }
        if tag.chars().count() > 32 {
            return Err("Saved-link tags must be 32 characters or fewer.".to_string());
        }
        if seen.insert(tag.to_lowercase()) {
            tags.push(tag);
        }
    }
    link.tags = tags;
    Ok(link)
}

fn validate_link_for_open(link: SavedLink) -> Result<SavedLink, String> {
    let mut link = validate_link(link)?;
    if matches!(link.kind, LinkKind::Folder | LinkKind::App) {
        let path = PathBuf::from(&link.target);
        let canonical = fs::canonicalize(&path)
            .map_err(|error| format!("Could not resolve {}: {error}", path.display()))?;
        let metadata = fs::metadata(&canonical)
            .map_err(|error| format!("Could not inspect {}: {error}", canonical.display()))?;
        match link.kind {
            LinkKind::Folder if !metadata.is_dir() => {
                return Err("This saved folder does not point to a folder.".to_string());
            }
            LinkKind::App if !metadata.is_file() => {
                return Err("This saved app does not point to a file.".to_string());
            }
            _ => {}
        }
        link.target = canonical.to_string_lossy().into_owned();
    }
    Ok(link)
}

fn is_safe_http_url(target: &str) -> bool {
    if target
        .chars()
        .any(|character| character.is_whitespace() || character.is_control())
    {
        return false;
    }
    let Some((scheme, rest)) = target.split_once("://") else {
        return false;
    };
    if !scheme.eq_ignore_ascii_case("http") && !scheme.eq_ignore_ascii_case("https") {
        return false;
    }
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    !authority.is_empty() && !authority.contains('@')
}

#[cfg(target_os = "windows")]
fn open_link_target(link: &SavedLink) -> Result<(), String> {
    use windows::{
        Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
        core::{HSTRING, PCWSTR},
    };

    let operation = HSTRING::from("open");
    let target = HSTRING::from(&link.target);
    let result = unsafe {
        ShellExecuteW(
            None,
            &operation,
            &target,
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if result.0 as usize <= 32 {
        return Err(format!(
            "Windows could not open \"{}\" (ShellExecute error {}).",
            link.title, result.0 as usize
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn open_link_target(_link: &SavedLink) -> Result<(), String> {
    Err("Opening saved links is currently supported on Windows only.".to_string())
}

#[derive(Serialize)]
struct RenameOutcome {
    path: String,
    renamed: bool,
    error: Option<String>,
}

fn show_main_window(app: &AppHandle) -> tauri::Result<()> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
    let was_hidden = !window.is_visible()?;
    window.unminimize()?;
    window.show()?;
    window.set_focus()?;
    if was_hidden {
        app.emit("window-show-animation-requested", ())
            .map_err(std::io::Error::other)?;
    }
    Ok(())
}

fn request_main_window_hide(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "The main window was not found.".to_string())?;
    let animate = app
        .try_state::<AppState>()
        .ok_or_else(|| "Application settings are unavailable.".to_string())?
        .preferences
        .lock()
        .map_err(|error| format!("Could not access local preferences: {error}"))
        .map(|preferences| preferences.window_style == "soft" && preferences.animations_enabled)?;
    if animate {
        app.emit("window-hide-animation-requested", ())
            .map_err(|error| format!("Could not request a window hide animation: {error}"))
    } else {
        window
            .hide()
            .map_err(|error| format!("Could not hide the main window: {error}"))
    }
}

fn window_state_flags() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
}

fn persist_window_state(app: &AppHandle) -> Result<(), String> {
    app.save_window_state(window_state_flags())
        .map_err(|error| format!("Could not save window state: {error}"))
}

fn toggle_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "The main window was not found.".to_string())?;
    if window.is_visible().map_err(|error| error.to_string())?
        && window.is_focused().map_err(|error| error.to_string())?
        && !window.is_minimized().map_err(|error| error.to_string())?
    {
        persist_window_state(app)?;
        request_main_window_hide(app)
    } else {
        show_main_window(app).map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn set_close_to_tray(state: State<'_, AppState>, close_to_tray: bool) -> Result<(), String> {
    mutate_preferences(&state, |preferences| {
        preferences.close_to_tray = close_to_tray;
        Ok(())
    })
}

#[tauri::command]
fn resolve_close_request(
    app: AppHandle,
    state: State<'_, AppState>,
    keep_in_tray: bool,
) -> Result<(), String> {
    mutate_preferences(&state, |preferences| {
        preferences.close_confirmation_seen = true;
        preferences.close_to_tray = keep_in_tray;
        Ok(())
    })?;

    if keep_in_tray {
        persist_window_state(&app)?;
        request_main_window_hide(&app)
    } else {
        persist_window_state(&app)?;
        app.exit(0);
        Ok(())
    }
}

#[tauri::command]
fn hotkey_status(state: State<'_, AppState>) -> Result<Option<String>, String> {
    state
        .hotkey_error
        .lock()
        .map_err(|error| error.to_string())
        .map(|error| error.clone())
}

#[tauri::command]
fn app_preferences(state: State<'_, AppState>) -> Result<Preferences, String> {
    let mut preferences = state
        .preferences
        .lock()
        .map_err(|error| format!("Could not access local preferences: {error}"))?;
    let previous_history = preferences.clipboard_history.clone();
    if prune_expired_history(&mut preferences.clipboard_history, now_unix_ms()?) {
        if let Err(error) = save_preferences(&state.preferences_path, &preferences) {
            preferences.clipboard_history = previous_history;
            return Err(error);
        }
    }
    Ok(preferences.clone())
}

#[tauri::command]
fn save_scratch_notes(state: State<'_, AppState>, notes: String) -> Result<(), String> {
    require_module_enabled(&state, "notes")?;
    if notes.len() > 100_000 {
        return Err("Scratch notes must be 100,000 bytes or fewer.".to_string());
    }
    mutate_preferences(&state, |preferences| {
        preferences.notes = notes;
        Ok(())
    })
}

#[tauri::command]
fn save_scenes(state: State<'_, AppState>, scenes: Vec<SavedScene>) -> Result<(), String> {
    require_module_enabled(&state, "scenes")?;
    if scenes.len() > 30 {
        return Err("You can save at most 30 scenes.".to_string());
    }
    let mut ids = HashSet::new();
    let preferences = state
        .preferences
        .lock()
        .map_err(|error| format!("Could not access local preferences: {error}"))?;
    let saved_link_ids = preferences
        .links
        .iter()
        .map(|link| link.id.as_str())
        .collect::<HashSet<_>>();
    for scene in &scenes {
        if scene.id.is_empty()
            || scene.id.len() > 64
            || scene.name.trim().is_empty()
            || scene.name.len() > 80
            || !["coding", "writing", "call"].contains(&scene.layout.as_str())
            || !(1..=10_080).contains(&scene.focus_minutes)
            || !ids.insert(scene.id.as_str())
            || scene.open_links.len() > 10
            || scene
                .open_links
                .iter()
                .any(|link_id| !saved_link_ids.contains(link_id.as_str()))
            || scene.open_links.iter().collect::<HashSet<_>>().len() != scene.open_links.len()
        {
            return Err(
                "A scene has an invalid name, id, layout, focus duration, or duplicate id."
                    .to_string(),
            );
        }
    }
    drop(preferences);
    mutate_preferences(&state, |preferences| {
        preferences.saved_scenes = scenes;
        Ok(())
    })
}

#[tauri::command]
fn set_window_pinned(
    app: AppHandle,
    state: State<'_, AppState>,
    pinned: bool,
) -> Result<(), String> {
    if pinned {
        require_module_enabled(&state, "pin-window")?;
    }
    set_window_pinned_inner(&app, &state, pinned)
}

fn set_window_pinned_inner(app: &AppHandle, state: &AppState, pinned: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "The main window was not found.".to_string())?;
    window
        .set_always_on_top(pinned)
        .map_err(|error| format!("Could not change the window pin: {error}"))?;
    if let Err(error) = mutate_preferences(state, |preferences| {
        preferences.window_pinned = pinned;
        Ok(())
    }) {
        let rollback = window.set_always_on_top(!pinned);
        return match rollback {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(format!(
                "{error}; also could not restore the previous pin state: {rollback_error}"
            )),
        };
    }
    Ok(())
}

#[tauri::command]
fn set_keep_awake(state: State<'_, AppState>, active: bool) -> Result<(), String> {
    if active {
        require_module_enabled(&state, "keep-awake")?;
    }
    set_keep_awake_inner(&state, active)
}

fn set_keep_awake_inner(state: &AppState, active: bool) -> Result<(), String> {
    let mut worker = state
        .keep_awake_worker
        .lock()
        .map_err(|error| format!("Could not access keep-awake state: {error}"))?;
    if active == worker.is_some() {
        return Ok(());
    }
    if active {
        #[cfg(target_os = "windows")]
        {
            let (stop, stopped) = mpsc::channel();
            let (ready, started) = mpsc::channel();
            let thread = thread::spawn(move || {
                let initial = windows_platform::set_execution_state(true);
                let is_active = initial.is_ok();
                let _ = ready.send(initial);
                if !is_active {
                    return;
                }
                loop {
                    match stopped.recv_timeout(Duration::from_secs(30)) {
                        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            if let Err(error) = windows_platform::set_execution_state(true) {
                                log::error!("Could not refresh keep-awake state: {error}");
                                break;
                            }
                        }
                    }
                }
                if let Err(error) = windows_platform::set_execution_state(false) {
                    log::error!("Could not restore normal Windows sleep behavior: {error}");
                }
            });
            match started.recv() {
                Ok(Ok(())) => *worker = Some(KeepAwakeWorker { stop, thread }),
                Ok(Err(error)) => {
                    let _ = thread.join();
                    return Err(error);
                }
                Err(error) => {
                    let _ = thread.join();
                    return Err(format!("Keep-awake worker did not start: {error}"));
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        return Err("Keep awake is currently supported on Windows only.".to_string());
    } else if let Some(current) = worker.take() {
        current
            .stop
            .send(())
            .map_err(|error| format!("Could not stop keep-awake worker: {error}"))?;
        current
            .thread
            .join()
            .map_err(|_| "Keep-awake worker could not be stopped cleanly.".to_string())?;
    }
    Ok(())
}

fn tidy_category(extension: &str) -> &'static str {
    match extension.to_ascii_lowercase().as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" => "Images",
        "pdf" | "doc" | "docx" | "odt" | "rtf" | "txt" => "Documents",
        "mp3" | "wav" | "flac" | "m4a" | "ogg" => "Audio",
        "mp4" | "mov" | "mkv" | "avi" | "webm" => "Video",
        "zip" | "7z" | "rar" | "gz" | "tar" => "Archives",
        "js" | "ts" | "rs" | "py" | "html" | "css" | "json" | "toml" => "Code",
        _ => "Other",
    }
}

fn tidy_plan(directory: &Path) -> Result<Vec<TidyMove>, String> {
    let directory = fs::canonicalize(directory)
        .map_err(|error| format!("Could not open the selected folder: {error}"))?;
    if !directory.is_dir() {
        return Err("Choose a folder to tidy.".to_string());
    }
    let mut entries = fs::read_dir(&directory)
        .map_err(|error| format!("Could not list the selected folder: {error}"))?
        .map(|entry| entry.map_err(|error| format!("Could not read a folder entry: {error}")))
        .collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());

    let mut moves = Vec::new();
    let mut destinations = HashSet::new();
    for entry in entries {
        let kind = entry
            .file_type()
            .map_err(|error| format!("Could not inspect {}: {error}", entry.path().display()))?;
        if !kind.is_file() {
            continue;
        }
        let source = entry.path();
        let metadata = fs::symlink_metadata(&source)
            .map_err(|error| format!("Could not inspect {}: {error}", source.display()))?;
        if !metadata.file_type().is_file() {
            return Err(format!(
                "{} changed while the folder was being previewed.",
                source.display()
            ));
        }
        let modified_at_ms = metadata
            .modified()
            .map_err(|error| {
                format!(
                    "Could not read {} modification time: {error}",
                    source.display()
                )
            })?
            .duration_since(UNIX_EPOCH)
            .map_err(|error| {
                format!(
                    "Invalid modification time for {}: {error}",
                    source.display()
                )
            })?
            .as_millis();
        let modified_at_ms = u64::try_from(modified_at_ms).map_err(|error| {
            format!(
                "Modification time for {} is out of range: {error}",
                source.display()
            )
        })?;
        let extension = source
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        let category_dir = directory.join(tidy_category(extension));
        if category_dir.exists() {
            let metadata = fs::symlink_metadata(&category_dir).map_err(|error| {
                format!("Could not inspect {}: {error}", category_dir.display())
            })?;
            if !metadata.file_type().is_dir() {
                return Err(format!(
                    "{} is not a safe folder; no files were moved.",
                    category_dir.display()
                ));
            }
        }
        let destination = category_dir.join(
            source
                .file_name()
                .ok_or_else(|| "A selected file has no name.".to_string())?,
        );
        let key = destination.to_string_lossy().to_lowercase();
        if !destinations.insert(key) || destination.exists() {
            return Err(format!(
                "{} already exists; nothing was moved.",
                destination.display()
            ));
        }
        moves.push(TidyMove {
            original: source.to_string_lossy().into_owned(),
            destination: destination.to_string_lossy().into_owned(),
            size_bytes: metadata.len(),
            modified_at_ms,
        });
        if moves.len() > 10_000 {
            return Err("The selected folder contains more than 10,000 files.".to_string());
        }
    }
    if moves.is_empty() {
        return Err("The selected folder has no files to organize.".to_string());
    }
    Ok(moves)
}

#[tauri::command]
fn preview_tidy_downloads(
    state: State<'_, AppState>,
    directory: String,
) -> Result<Vec<TidyMove>, String> {
    require_module_enabled(&state, "tidy-downloads")?;
    tidy_plan(Path::new(&directory))
}

#[tauri::command]
fn tidy_downloads(
    state: State<'_, AppState>,
    directory: String,
    preview: Vec<TidyMove>,
) -> Result<Vec<TidyMove>, String> {
    require_module_enabled(&state, "tidy-downloads")?;
    perform_tidy_downloads(directory, preview)
}

fn perform_tidy_downloads(
    directory: String,
    preview: Vec<TidyMove>,
) -> Result<Vec<TidyMove>, String> {
    let current = tidy_plan(Path::new(&directory))?;
    if current != preview {
        return Err(
            "The folder changed after preview. Review a fresh preview before moving files."
                .to_string(),
        );
    }
    let mut moved = Vec::new();
    let mut created_dirs: HashSet<PathBuf> = HashSet::new();
    for item in &current {
        let parent = Path::new(&item.destination)
            .parent()
            .ok_or_else(|| "A tidy destination has no folder.".to_string())?;
        if parent.exists() {
            let metadata = fs::symlink_metadata(parent)
                .map_err(|error| format!("Could not inspect {}: {error}", parent.display()))?;
            if !metadata.file_type().is_dir() {
                return Err(format!("{} is not a safe folder.", parent.display()));
            }
        } else {
            if let Err(error) = fs::create_dir(parent) {
                let cleanup_errors = created_dirs
                    .iter()
                    .filter_map(|created| {
                        fs::remove_dir(created)
                            .err()
                            .map(|cleanup| format!("{}: {cleanup}", created.display()))
                    })
                    .collect::<Vec<_>>();
                return Err(if cleanup_errors.is_empty() {
                    format!("Could not create {}: {error}", parent.display())
                } else {
                    format!(
                        "Could not create {}: {error}; cleanup needs attention: {}",
                        parent.display(),
                        cleanup_errors.join("; ")
                    )
                });
            }
            created_dirs.insert(parent.to_path_buf());
        }
    }
    for item in &current {
        if let Err(error) = fs::rename(&item.original, &item.destination) {
            let mut rollback_errors = Vec::new();
            for prior in moved.iter().rev() {
                let prior: &TidyMove = prior;
                if let Err(rollback) = fs::rename(&prior.destination, &prior.original) {
                    rollback_errors.push(format!("{}: {rollback}", prior.destination));
                }
            }
            for directory in &created_dirs {
                if let Err(cleanup) = fs::remove_dir(directory) {
                    if cleanup.kind() != std::io::ErrorKind::NotFound {
                        rollback_errors.push(format!("{}: {cleanup}", directory.display()));
                    }
                }
            }
            return Err(if rollback_errors.is_empty() {
                format!(
                    "Could not move {}: {error}; earlier moves were rolled back.",
                    item.original
                )
            } else {
                format!(
                    "Could not move {}: {error}; rollback needs attention: {}",
                    item.original,
                    rollback_errors.join("; ")
                )
            });
        }
        moved.push(item.clone());
    }
    Ok(moved)
}

#[tauri::command]
fn undo_tidy_downloads(
    state: State<'_, AppState>,
    directory: String,
    moves: Vec<TidyMove>,
) -> Result<(), String> {
    require_module_enabled(&state, "tidy-downloads")?;
    perform_undo_tidy_downloads(directory, moves)
}

fn perform_undo_tidy_downloads(directory: String, moves: Vec<TidyMove>) -> Result<(), String> {
    let root = fs::canonicalize(&directory)
        .map_err(|error| format!("Could not resolve the selected folder: {error}"))?;
    if moves.is_empty() || moves.len() > 10_000 {
        return Err("The undo list is empty or too large.".to_string());
    }
    let mut original_paths = HashSet::new();
    let mut destination_paths = HashSet::new();
    for item in &moves {
        let original = PathBuf::from(&item.original);
        let destination = PathBuf::from(&item.destination);
        let category = tidy_category(
            original
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or(""),
        );
        let category_dir = root.join(category);
        if original.parent() != Some(root.as_path())
            || destination.parent() != Some(category_dir.as_path())
            || !fs::symlink_metadata(&destination)
                .is_ok_and(|metadata| metadata.file_type().is_file())
            || original.exists()
            || original.file_name() != destination.file_name()
            || !original_paths.insert(original.clone())
            || !destination_paths.insert(destination.clone())
        {
            return Err(format!(
                "Cannot safely undo the move of {}; files or folders have changed.",
                destination.display()
            ));
        }
        let metadata = fs::symlink_metadata(&category_dir)
            .map_err(|error| format!("Could not inspect {}: {error}", category_dir.display()))?;
        if !metadata.file_type().is_dir() {
            return Err(format!("{} is not a safe folder.", category_dir.display()));
        }
    }
    let mut restored: Vec<TidyMove> = Vec::new();
    for item in &moves {
        if let Err(error) = fs::rename(&item.destination, &item.original) {
            let mut rollback_errors = Vec::new();
            for prior in restored.iter().rev() {
                if let Err(rollback) = fs::rename(&prior.original, &prior.destination) {
                    rollback_errors.push(format!("{}: {rollback}", prior.original));
                }
            }
            return Err(if rollback_errors.is_empty() {
                format!(
                    "Could not restore {}: {error}; earlier restores were rolled back.",
                    item.original
                )
            } else {
                format!(
                    "Could not restore {}: {error}; rollback needs attention: {}",
                    item.original,
                    rollback_errors.join("; ")
                )
            });
        }
        restored.push(item.clone());
    }
    Ok(())
}

#[tauri::command]
fn add_clipboard_item(
    app: AppHandle,
    state: State<'_, AppState>,
    text: String,
) -> Result<(), String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Ok(());
    }
    let history = mutate_preferences(&state, |preferences| {
        insert_clip(preferences, text)?;
        Ok(preferences.clipboard_history.clone())
    })?;
    notify_clipboard_kind(
        &app,
        history.first().expect("a saved clip was inserted").kind,
    );
    notify_history_changed(&app, history);
    Ok(())
}

#[tauri::command]
fn set_clipboard_pinned(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    pinned: bool,
) -> Result<(), String> {
    let history = mutate_preferences(&state, |preferences| {
        let item = preferences
            .clipboard_history
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or_else(|| "The clipboard item no longer exists.".to_string())?;
        item.pinned = pinned;
        Ok(preferences.clipboard_history.clone())
    })?;
    notify_history_changed(&app, history);
    Ok(())
}

#[tauri::command]
fn prune_clipboard_history(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut preferences = state
        .preferences
        .lock()
        .map_err(|error| format!("Could not access local preferences: {error}"))?;
    let previous_history = preferences.clipboard_history.clone();
    if prune_expired_history(&mut preferences.clipboard_history, now_unix_ms()?) {
        if let Err(error) = save_preferences(&state.preferences_path, &preferences) {
            preferences.clipboard_history = previous_history;
            return Err(error);
        }
        notify_history_changed(&app, preferences.clipboard_history.clone());
    }
    Ok(())
}

#[tauri::command]
fn clear_clipboard_history(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let history = mutate_preferences(&state, |preferences| {
        preferences.clipboard_history.clear();
        Ok(Vec::new())
    })?;
    notify_history_changed(&app, history);
    Ok(())
}

#[tauri::command]
fn set_clipboard_paused(
    app: AppHandle,
    state: State<'_, AppState>,
    paused: bool,
) -> Result<(), String> {
    set_paused(&app, &state, paused)
}

#[tauri::command]
fn read_clipboard_for_user(_app: AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        return windows_platform::read_clipboard_text();
    }
    #[cfg(not(target_os = "windows"))]
    {
        use tauri_plugin_clipboard_manager::ClipboardExt;
        _app.clipboard()
            .read_text()
            .map(Some)
            .map_err(|error| format!("Could not read the clipboard: {error}"))
    }
}

#[tauri::command]
fn set_theme(
    app: AppHandle,
    state: State<'_, AppState>,
    theme: String,
    effect: String,
) -> Result<bool, String> {
    if !is_valid_theme_id(&theme) {
        return Err(format!("Invalid theme id: {theme}"));
    }
    if !["none", "mica", "acrylic"].contains(&effect.as_str()) {
        return Err("Theme window effect must be none, mica, or acrylic.".to_string());
    }
    let preferences = state
        .preferences
        .lock()
        .map_err(|error| format!("Could not access local preferences: {error}"))?;
    let previous = preferences.theme.clone();
    let previous_effect = saved_theme_effect(&preferences, &previous);
    drop(preferences);
    let native_effect_applied =
        apply_native_theme(&app, &theme, (effect != "none").then_some(effect.as_str()))?;
    if let Err(error) = mutate_preferences(&state, |preferences| {
        preferences.theme = theme;
        Ok(())
    }) {
        return match apply_native_theme(&app, &previous, previous_effect.as_deref()) {
            Ok(_) => Err(error),
            Err(rollback_error) => Err(format!(
                "{error}; also could not restore the previous window effect: {rollback_error}"
            )),
        };
    }
    Ok(native_effect_applied)
}

#[tauri::command]
fn set_theme_preferences(
    state: State<'_, AppState>,
    settings: ThemePreferences,
) -> Result<(), String> {
    validate_theme_preferences(&settings)?;
    mutate_preferences(&state, |preferences| {
        preferences.theme_preferences = settings;
        Ok(())
    })
}

fn apply_native_theme(
    app: &AppHandle,
    theme: &str,
    effect_name: Option<&str>,
) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Main window is unavailable for theme effects.".to_string())?;
        let effects = effect_name.map(|effect| {
            let effect = match effect {
                "mica" => tauri::window::Effect::Mica,
                "acrylic" => tauri::window::Effect::Acrylic,
                _ => unreachable!("theme effects are validated before application"),
            };
            tauri::window::EffectsBuilder::new().effect(effect).build()
        });
        if let Err(error) = window.set_effects(effects) {
            if effect_name.is_some() {
                log::warn!(
                    "Could not apply the native {effect_name:?} effect for {theme}; using CSS fallback: {error}"
                );
                return Ok(false);
            } else {
                return Err(format!(
                    "Could not clear the Windows window effect: {error}"
                ));
            }
        }
        return Ok(effect_name.is_some());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, theme);
        Ok(false)
    }
}

#[tauri::command]
fn set_glass_opacity(state: State<'_, AppState>, opacity: u8) -> Result<(), String> {
    if !(30..=95).contains(&opacity) {
        return Err("Glass opacity must be between 30 and 95 percent.".to_string());
    }
    mutate_preferences(&state, |preferences| {
        preferences.glass_opacity = opacity;
        Ok(())
    })
}

fn custom_image_directory(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate app data directory: {error}"))?
        .join("custom-images"))
}

fn custom_image_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if !is_safe_pack_id(id) {
        return Err("Custom image id is not valid.".to_string());
    }
    let directory = custom_image_directory(app)?;
    for extension in ["png", "jpg", "jpeg", "webp", "gif"] {
        let path = directory.join(format!("{id}.{extension}"));
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_file() => return Ok(path),
            Ok(_) => return Err("Custom image is not a regular file.".to_string()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Could not inspect custom image: {error}")),
        }
    }
    Err("Custom image was not found.".to_string())
}

fn image_dimensions(bytes: &[u8], extension: &str) -> Result<(u32, u32, &'static str), String> {
    let dimensions = match extension {
        "png" => {
            let reader = png::Decoder::new(Cursor::new(bytes))
                .read_info()
                .map_err(|error| format!("PNG image is invalid: {error}"))?;
            (reader.info().width, reader.info().height, "image/png")
        }
        "gif" if bytes.len() >= 10 && (&bytes[..6] == b"GIF87a" || &bytes[..6] == b"GIF89a") => (
            u16::from_le_bytes([bytes[6], bytes[7]]) as u32,
            u16::from_le_bytes([bytes[8], bytes[9]]) as u32,
            "image/gif",
        ),
        "jpeg" | "jpg" => jpeg_dimensions(bytes)?,
        "webp" => webp_dimensions(bytes)?,
        _ => return Err("Use a PNG, JPEG, WebP, or GIF image; SVG is not supported.".to_string()),
    };
    if dimensions.0 == 0
        || dimensions.1 == 0
        || dimensions.0 > 4096
        || dimensions.1 > 4096
        || dimensions.0 as u64 * dimensions.1 as u64 > CUSTOM_IMAGE_LIMIT_PIXELS
    {
        return Err(
            "Image dimensions must be at most 4096 pixels per side and 4 megapixels total."
                .to_string(),
        );
    }
    Ok(dimensions)
}

fn jpeg_dimensions(bytes: &[u8]) -> Result<(u32, u32, &'static str), String> {
    if bytes.len() < 4 || bytes[..2] != [0xff, 0xd8] {
        return Err("JPEG image has an invalid signature.".to_string());
    }
    let mut index = 2;
    while index + 4 <= bytes.len() {
        if bytes[index] != 0xff {
            index += 1;
            continue;
        }
        while index < bytes.len() && bytes[index] == 0xff {
            index += 1;
        }
        if index >= bytes.len() {
            break;
        }
        let marker = bytes[index];
        index += 1;
        if marker == 0xd9 || marker == 0xda {
            break;
        }
        if matches!(marker, 0xd8 | 0x01 | 0xd0..=0xd7) {
            continue;
        }
        if index + 2 > bytes.len() {
            break;
        }
        let length = u16::from_be_bytes([bytes[index], bytes[index + 1]]) as usize;
        if length < 2 || index + length > bytes.len() {
            break;
        }
        if matches!(
            marker,
            0xc0 | 0xc1
                | 0xc2
                | 0xc3
                | 0xc5
                | 0xc6
                | 0xc7
                | 0xc9
                | 0xca
                | 0xcb
                | 0xcd
                | 0xce
                | 0xcf
        ) && length >= 7
        {
            let height = u16::from_be_bytes([bytes[index + 3], bytes[index + 4]]) as u32;
            let width = u16::from_be_bytes([bytes[index + 5], bytes[index + 6]]) as u32;
            return Ok((width, height, "image/jpeg"));
        }
        index += length;
    }
    Err("JPEG image does not contain valid dimensions.".to_string())
}

fn webp_dimensions(bytes: &[u8]) -> Result<(u32, u32, &'static str), String> {
    if bytes.len() < 30 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return Err("WebP image has an invalid signature.".to_string());
    }
    let chunk = &bytes[12..16];
    let (width, height) = match chunk {
        b"VP8X" => (
            1 + bytes[24] as u32 + ((bytes[25] as u32) << 8) + ((bytes[26] as u32) << 16),
            1 + bytes[27] as u32 + ((bytes[28] as u32) << 8) + ((bytes[29] as u32) << 16),
        ),
        b"VP8L" if bytes[20] == 0x2f => (
            1 + bytes[21] as u32 + (((bytes[22] & 0x3f) as u32) << 8),
            1 + ((bytes[22] as u32 >> 6)
                | ((bytes[23] as u32) << 2)
                | (((bytes[24] & 0x0f) as u32) << 10)),
        ),
        b"VP8 " if bytes[23..26] == [0x9d, 0x01, 0x2a] => (
            u16::from_le_bytes([bytes[26], bytes[27]]) as u32 & 0x3fff,
            u16::from_le_bytes([bytes[28], bytes[29]]) as u32 & 0x3fff,
        ),
        _ => return Err("WebP image format is not supported.".to_string()),
    };
    Ok((width, height, "image/webp"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CustomImage {
    mime_type: &'static str,
    bytes: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ThemeBundleAsset {
    id: String,
    extension: String,
    bytes: Vec<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ThemeBundleContents {
    theme_json: String,
    assets: Vec<ThemeBundleAsset>,
}

fn theme_asset_references(theme: &serde_json::Value) -> Result<HashSet<String>, String> {
    let object = theme
        .as_object()
        .ok_or_else(|| "Theme manifest must be a JSON object.".to_string())?;
    let mut references = HashSet::new();
    if let Some(background) = object.get("background") {
        let id = background
            .as_str()
            .filter(|id| is_safe_pack_id(id))
            .ok_or_else(|| "Theme background must be a safe local asset id.".to_string())?;
        references.insert(id.to_string());
    }
    if let Some(stickers) = object.get("stickers") {
        let stickers = stickers
            .as_array()
            .filter(|stickers| stickers.len() <= 12)
            .ok_or_else(|| {
                "Theme stickers must be an array of at most 12 asset ids.".to_string()
            })?;
        let mut sticker_ids = HashSet::new();
        for sticker in stickers {
            let id = sticker
                .as_str()
                .filter(|id| is_safe_pack_id(id))
                .ok_or_else(|| "Theme sticker ids must be safe local asset ids.".to_string())?;
            if !sticker_ids.insert(id) {
                return Err(format!("Theme sticker {id} is referenced more than once."));
            }
            references.insert(id.to_string());
        }
    }
    Ok(references)
}

fn validate_theme_bundle_assets(
    theme: &serde_json::Value,
    assets: &[ThemeBundleAsset],
) -> Result<(), String> {
    let references = theme_asset_references(theme)?;
    let mut asset_ids = HashSet::new();
    let mut total_bytes = 0_u64;
    for asset in assets {
        if !is_safe_pack_id(&asset.id) || !asset_ids.insert(asset.id.as_str()) {
            return Err("Theme asset ids must be safe and unique.".to_string());
        }
        if !["png", "jpg", "jpeg", "webp", "gif"].contains(&asset.extension.as_str()) {
            return Err(format!(
                "Theme asset {} has an unsupported type; SVG and archives are not allowed.",
                asset.id
            ));
        }
        if asset.bytes.is_empty() || asset.bytes.len() as u64 > THEME_ASSET_LIMIT_BYTES {
            return Err(format!(
                "Theme asset {} must be between 1 byte and 4 MB.",
                asset.id
            ));
        }
        image_dimensions(&asset.bytes, &asset.extension)
            .map_err(|error| format!("Theme asset {} is invalid: {error}", asset.id))?;
        total_bytes = total_bytes
            .checked_add(asset.bytes.len() as u64)
            .ok_or_else(|| "Theme assets exceed the 20 MB expanded limit.".to_string())?;
    }
    if total_bytes > THEME_BUNDLE_LIMIT_BYTES {
        return Err("Theme assets exceed the 20 MB expanded limit.".to_string());
    }
    if references != asset_ids.iter().map(|id| (*id).to_string()).collect() {
        return Err(
            "Theme asset files must exactly match its background and sticker references."
                .to_string(),
        );
    }
    Ok(())
}

fn validate_installed_theme_assets(
    app: &AppHandle,
    theme: &serde_json::Value,
) -> Result<(), String> {
    for id in theme_asset_references(theme)? {
        let path = custom_image_path(app, &id)
            .map_err(|error| format!("Theme asset {id} is not installed: {error}"))?;
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .ok_or_else(|| format!("Theme asset {id} has no file extension."))?;
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Could not inspect theme asset {id}: {error}"))?;
        if !metadata.file_type().is_file() || metadata.len() > CUSTOM_IMAGE_LIMIT_BYTES {
            return Err(format!("Theme asset {id} exceeds the image size limit."));
        }
        let bytes =
            fs::read(&path).map_err(|error| format!("Could not read theme asset {id}: {error}"))?;
        image_dimensions(&bytes, extension)
            .map_err(|error| format!("Theme asset {id} is invalid: {error}"))?;
    }
    Ok(())
}

fn inspect_theme_bundle_archive<R: Read + Seek>(reader: R) -> Result<ThemeBundleContents, String> {
    let mut archive = ZipArchive::new(reader)
        .map_err(|error| format!("Theme bundle is not a valid ZIP archive: {error}"))?;
    if archive.len() > 14 {
        return Err("Theme bundle contains too many files.".to_string());
    }
    let mut names = HashSet::new();
    let mut theme_json = None;
    let mut assets = Vec::new();
    let mut total_size = 0_u64;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("Could not read theme bundle entry {index}: {error}"))?;
        let name = file
            .name()
            .map_err(|error| format!("Could not read theme bundle entry {index} name: {error}"))?
            .into_owned();
        register_pack_archive_entry(&mut names, &name)?;
        let mode = file.unix_mode().unwrap_or_default();
        let file_type = mode & 0o170000;
        if file_type != 0 && file_type != 0o100000 && file_type != 0o040000 {
            return Err(format!(
                "Theme bundle contains a link or special file: {name}"
            ));
        }
        if file.is_dir() {
            if name != "assets/" {
                return Err(format!(
                    "Theme bundle contains an unsupported folder: {name}"
                ));
            }
            continue;
        }
        total_size = total_size
            .checked_add(file.size())
            .ok_or_else(|| "Theme bundle expands beyond the 20 MB size limit.".to_string())?;
        if total_size > THEME_BUNDLE_LIMIT_BYTES {
            return Err("Theme bundle expands beyond the 20 MB size limit.".to_string());
        }
        if name == "theme.json" {
            let bytes = read_zip_entry_limited(&mut file, 50 * 1024, "theme.json")?;
            if bytes.len() as u64 != file.size() {
                return Err("theme.json size does not match the ZIP directory.".to_string());
            }
            theme_json = Some(
                String::from_utf8(bytes)
                    .map_err(|error| format!("theme.json must be UTF-8 text: {error}"))?,
            );
            continue;
        }
        let Some(asset_path) = name.strip_prefix("assets/") else {
            return Err(format!(
                "Theme bundle contains an unsupported or unsafe path: {name}"
            ));
        };
        let (id, extension) = asset_path
            .rsplit_once('.')
            .ok_or_else(|| format!("Theme asset path has no file extension: {name}"))?;
        if !is_safe_pack_id(id) || asset_path.contains('/') || asset_path.contains('\\') {
            return Err(format!(
                "Theme bundle contains an unsafe asset path: {name}"
            ));
        }
        let bytes = read_zip_entry_limited(&mut file, THEME_ASSET_LIMIT_BYTES, &name)?;
        if bytes.len() as u64 != file.size() {
            return Err(format!("{name} size does not match the ZIP directory."));
        }
        assets.push(ThemeBundleAsset {
            id: id.to_string(),
            extension: extension.to_ascii_lowercase(),
            bytes,
        });
    }
    let theme_json = theme_json.ok_or_else(|| "Theme bundle is missing theme.json.".to_string())?;
    let theme = serde_json::from_str::<serde_json::Value>(&theme_json)
        .map_err(|error| format!("theme.json is not valid JSON: {error}"))?;
    validate_theme_bundle_assets(&theme, &assets)?;
    Ok(ThemeBundleContents { theme_json, assets })
}

#[tauri::command]
fn inspect_theme_bundle(app: AppHandle, path: String) -> Result<ThemeBundleContents, String> {
    let source = Path::new(&path);
    if source.extension().and_then(|extension| extension.to_str()) != Some("desktheme") {
        return Err("Choose a .desktheme file.".to_string());
    }
    let file =
        fs::File::open(source).map_err(|error| format!("Could not open theme file: {error}"))?;
    if !file
        .metadata()
        .map_err(|error| format!("Could not inspect theme file: {error}"))?
        .is_file()
    {
        return Err("Selected theme is not a regular file.".to_string());
    }
    let mut bytes = Vec::new();
    file.take(THEME_BUNDLE_LIMIT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read theme file: {error}"))?;
    if bytes.is_empty() || bytes.len() as u64 > THEME_BUNDLE_LIMIT_BYTES {
        return Err("Theme bundle must be between 1 byte and 20 MB.".to_string());
    }
    if bytes.starts_with(b"PK\x03\x04") {
        inspect_theme_bundle_archive(Cursor::new(bytes))
    } else {
        let theme_json = String::from_utf8(bytes)
            .map_err(|error| format!("Theme file must be UTF-8 text: {error}"))?;
        if theme_json.len() > 50 * 1024 {
            return Err("Theme file exceeds the 51200-byte limit.".to_string());
        }
        let theme = serde_json::from_str::<serde_json::Value>(&theme_json)
            .map_err(|error| format!("Theme file is not valid JSON: {error}"))?;
        validate_installed_theme_assets(&app, &theme)?;
        Ok(ThemeBundleContents {
            theme_json,
            assets: Vec::new(),
        })
    }
}

#[tauri::command]
fn install_theme_bundle_assets(
    app: AppHandle,
    theme_json: String,
    assets: Vec<ThemeBundleAsset>,
) -> Result<Vec<String>, String> {
    if theme_json.len() > 50 * 1024 {
        return Err("Theme file exceeds the 51200-byte limit.".to_string());
    }
    let theme = serde_json::from_str::<serde_json::Value>(&theme_json)
        .map_err(|error| format!("Theme file is not valid JSON: {error}"))?;
    validate_theme_bundle_assets(&theme, &assets)?;
    let directory = custom_image_directory(&app)?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create theme asset directory: {error}"))?;
    let mut installed = Vec::with_capacity(assets.len());
    for asset in assets {
        let destination = directory.join(format!("{}.{}", asset.id, asset.extension));
        match fs::symlink_metadata(&destination) {
            Ok(metadata) if metadata.file_type().is_file() => {
                let existing = fs::read(&destination)
                    .map_err(|error| format!("Could not inspect existing theme asset: {error}"))?;
                if existing != asset.bytes {
                    return Err(format!(
                        "Theme asset id {} already exists with different contents.",
                        asset.id
                    ));
                }
            }
            Ok(_) => return Err(format!("Theme asset {} is not a regular file.", asset.id)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let temporary =
                    directory.join(format!(".theme-{}-{}.tmp", asset.id, std::process::id()));
                let mut output = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&temporary)
                    .map_err(|error| {
                        format!("Could not stage theme asset {}: {error}", asset.id)
                    })?;
                output.write_all(&asset.bytes).map_err(|error| {
                    let _ = fs::remove_file(&temporary);
                    format!("Could not write theme asset {}: {error}", asset.id)
                })?;
                output.sync_all().map_err(|error| {
                    let _ = fs::remove_file(&temporary);
                    format!("Could not finish theme asset {}: {error}", asset.id)
                })?;
                drop(output);
                fs::rename(&temporary, &destination).map_err(|error| {
                    format!("Could not install theme asset {}: {error}", asset.id)
                })?;
            }
            Err(error) => {
                return Err(format!(
                    "Could not inspect theme asset {}: {error}",
                    asset.id
                ));
            }
        }
        installed.push(asset.id);
    }
    Ok(installed)
}

fn build_theme_bundle(theme_json: &str, assets: &[ThemeBundleAsset]) -> Result<Vec<u8>, String> {
    if theme_json.len() > 50 * 1024 {
        return Err("Theme file exceeds the 51200-byte limit.".to_string());
    }
    let theme = serde_json::from_str::<serde_json::Value>(theme_json)
        .map_err(|error| format!("Theme file is not valid JSON: {error}"))?;
    validate_theme_bundle_assets(&theme, assets)?;
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    writer
        .start_file("theme.json", options)
        .map_err(|error| format!("Could not create theme.json: {error}"))?;
    writer
        .write_all(theme_json.as_bytes())
        .map_err(|error| format!("Could not write theme.json: {error}"))?;
    for asset in assets {
        let path = format!("assets/{}.{}", asset.id, asset.extension);
        writer
            .start_file(&path, options)
            .map_err(|error| format!("Could not create {path}: {error}"))?;
        writer
            .write_all(&asset.bytes)
            .map_err(|error| format!("Could not write {path}: {error}"))?;
    }
    let bytes = writer
        .finish()
        .map_err(|error| format!("Could not finalize theme bundle: {error}"))?
        .into_inner();
    if bytes.len() as u64 > THEME_BUNDLE_LIMIT_BYTES {
        return Err("Exported theme bundle exceeds the 20 MB size limit.".to_string());
    }
    Ok(bytes)
}

#[tauri::command]
fn export_theme_bundle(
    theme_json: String,
    assets: Vec<ThemeBundleAsset>,
    path: String,
) -> Result<(), String> {
    let bytes = build_theme_bundle(&theme_json, &assets)?;
    let path = PathBuf::from(path);
    if path.exists() {
        return Err("The selected export file already exists; choose a new name.".to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "Choose a valid location for the theme bundle.".to_string())?;
    let temporary = parent.join(format!(".theme-{}.tmp", std::process::id()));
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| format!("Could not stage theme bundle: {error}"))?;
    output.write_all(&bytes).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Could not write theme bundle: {error}")
    })?;
    output.sync_all().map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Could not finish theme bundle: {error}")
    })?;
    drop(output);
    fs::rename(&temporary, &path)
        .map_err(|error| format!("Could not finish writing theme bundle: {error}"))
}

#[tauri::command]
fn import_custom_image(app: AppHandle, path: String) -> Result<String, String> {
    let source = Path::new(&path);
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "Choose a PNG, JPEG, WebP, or GIF image.".to_string())?;
    if !["png", "jpg", "jpeg", "webp", "gif"].contains(&extension.as_str()) {
        return Err("Use a PNG, JPEG, WebP, or GIF image; SVG is not supported.".to_string());
    }
    let file = fs::File::open(source)
        .map_err(|error| format!("Could not open selected image: {error}"))?;
    if !file
        .metadata()
        .map_err(|error| format!("Could not inspect selected image: {error}"))?
        .is_file()
    {
        return Err("Selected image is not a regular file.".to_string());
    }
    let mut bytes = Vec::new();
    file.take(CUSTOM_IMAGE_LIMIT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read selected image: {error}"))?;
    if bytes.is_empty() || bytes.len() as u64 > CUSTOM_IMAGE_LIMIT_BYTES {
        return Err("Image must be between 1 byte and 5 MB.".to_string());
    }
    let (width, height, _) = image_dimensions(&bytes, &extension)?;
    let id = format!(
        "image-{}-{}",
        now_unix_ms()?,
        CUSTOM_ASSET_COUNTER.fetch_add(1, Ordering::Relaxed)
    );
    let directory = custom_image_directory(&app)?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create custom image directory: {error}"))?;
    let destination = directory.join(format!("{id}.{extension}"));
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)
        .map_err(|error| format!("Could not store imported image: {error}"))?;
    output
        .write_all(&bytes)
        .map_err(|error| format!("Could not write imported image: {error}"))?;
    output
        .sync_all()
        .map_err(|error| format!("Could not finish writing imported image: {error}"))?;
    log::info!("Imported custom image {id} ({width}x{height})");
    Ok(id)
}

#[tauri::command]
fn get_custom_image(app: AppHandle, id: String) -> Result<CustomImage, String> {
    let path = custom_image_path(&app, &id)?;
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("Could not inspect custom image: {error}"))?;
    if !metadata.file_type().is_file() || metadata.len() > CUSTOM_IMAGE_LIMIT_BYTES {
        return Err("Stored image exceeds the 5 MB size limit.".to_string());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Stored image has no extension.".to_string())?;
    let file =
        fs::File::open(&path).map_err(|error| format!("Could not read custom image: {error}"))?;
    let mut bytes = Vec::new();
    file.take(CUSTOM_IMAGE_LIMIT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read custom image: {error}"))?;
    if bytes.len() as u64 > CUSTOM_IMAGE_LIMIT_BYTES {
        return Err("Stored image exceeds the 5 MB size limit.".to_string());
    }
    let (_, _, mime_type) = image_dimensions(&bytes, extension)?;
    Ok(CustomImage { mime_type, bytes })
}

#[tauri::command]
fn set_desk_background(
    app: AppHandle,
    state: State<'_, AppState>,
    id: Option<String>,
) -> Result<(), String> {
    if let Some(ref image_id) = id {
        custom_image_path(&app, image_id)?;
    }
    mutate_preferences(&state, |preferences| {
        preferences.desk_background = id;
        Ok(())
    })
}

#[tauri::command]
fn save_desk_stickers(
    app: AppHandle,
    state: State<'_, AppState>,
    stickers: Vec<DeskSticker>,
) -> Result<(), String> {
    validate_desk_stickers(&stickers)?;
    for sticker in &stickers {
        custom_image_path(&app, &sticker.id)?;
    }
    mutate_preferences(&state, |preferences| {
        preferences.desk_stickers = stickers;
        Ok(())
    })
}

fn validate_desk_stickers(stickers: &[DeskSticker]) -> Result<(), String> {
    if stickers.len() > 12 {
        return Err("The desk can contain no more than 12 stickers.".to_string());
    }
    let mut ids = HashSet::new();
    for sticker in stickers {
        if !is_safe_pack_id(&sticker.id)
            || !ids.insert(sticker.id.as_str())
            || !sticker.x.is_finite()
            || !sticker.y.is_finite()
            || !sticker.width.is_finite()
            || !sticker.height.is_finite()
            || sticker.x < 0.0
            || sticker.y < 0.0
            || !(5.0..=100.0).contains(&sticker.width)
            || !(5.0..=100.0).contains(&sticker.height)
            || sticker.x + sticker.width > 100.0
            || sticker.y + sticker.height > 100.0
        {
            return Err("Sticker placement or image id is invalid.".to_string());
        }
    }
    Ok(())
}

#[tauri::command]
fn remove_custom_image(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    {
        let preferences = state
            .preferences
            .lock()
            .map_err(|error| format!("Could not access local preferences: {error}"))?;
        if preferences.desk_background.as_deref() == Some(&id)
            || preferences
                .desk_stickers
                .iter()
                .any(|sticker| sticker.id == id)
        {
            return Err("Remove the image from the desk before deleting its file.".to_string());
        }
    }
    let path = custom_image_path(&app, &id)?;
    fs::remove_file(path).map_err(|error| format!("Could not delete custom image: {error}"))
}

#[tauri::command]
fn apply_layout(state: State<'_, AppState>, name: String) -> Result<usize, String> {
    #[cfg(target_os = "windows")]
    {
        let arranged = windows_platform::apply_layout(&name)?;
        mutate_preferences(&state, |preferences| {
            preferences.active_layout = name;
            Ok(())
        })?;
        return Ok(arranged);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (state, name);
        Err("Real window layouts are currently supported on Windows only.".to_string())
    }
}

#[tauri::command]
fn rename_files(
    paths: Vec<String>,
    pattern: String,
    date: String,
) -> Result<Vec<RenameOutcome>, String> {
    if paths.is_empty() {
        return Err("Choose at least one file to rename.".to_string());
    }
    if pattern.len() > 240 {
        return Err("Rename patterns must be 240 characters or fewer.".to_string());
    }
    if date.len() != 10
        || !date.bytes().enumerate().all(|(index, byte)| {
            if index == 4 || index == 7 {
                byte == b'-'
            } else {
                byte.is_ascii_digit()
            }
        })
    {
        return Err("The rename date must use YYYY-MM-DD format.".to_string());
    }

    let mut sources = Vec::with_capacity(paths.len());
    let mut planned = Vec::with_capacity(paths.len());
    let mut destinations = std::collections::HashSet::new();
    let mut source_keys = std::collections::HashSet::new();

    for (index, path) in paths.iter().enumerate() {
        let source = PathBuf::from(path);
        let metadata = fs::metadata(&source)
            .map_err(|error| format!("Could not read {}: {error}", source.display()))?;
        if !metadata.is_file() {
            return Err(format!("{} is not a file.", source.display()));
        }
        let canonical = fs::canonicalize(&source)
            .map_err(|error| format!("Could not resolve {}: {error}", source.display()))?;
        let source_key = canonical.to_string_lossy().to_lowercase();
        if !source_keys.insert(source_key) {
            return Err(format!(
                "The selected file was listed more than once: {}",
                source.display()
            ));
        }

        let file_name = source
            .file_name()
            .ok_or_else(|| format!("{} does not have a valid file name.", source.display()))?
            .to_string_lossy();
        let dot = file_name.rfind('.');
        let (stem, extension) = match dot {
            Some(position) if position > 0 => {
                (&file_name[..position], Some(&file_name[position + 1..]))
            }
            _ => (file_name.as_ref(), None),
        };
        let numbered = format!("{:02}", index + 1);
        let pattern = if pattern.is_empty() {
            "{name}"
        } else {
            &pattern
        };
        let requested = pattern
            .replace("{name}", stem)
            .replace("{n}", &numbered)
            .replace("{date}", &date);
        let safe_stem = sanitize_file_stem(&requested);
        if safe_stem.is_empty() {
            return Err(format!(
                "The rename pattern produced an empty name for {}.",
                source.display()
            ));
        }
        if is_reserved_windows_name(&safe_stem) {
            return Err(format!(
                "The rename pattern produced a reserved Windows name: {safe_stem}"
            ));
        }

        let mut new_name = safe_stem;
        if let Some(extension) = extension {
            new_name.push('.');
            new_name.push_str(&extension);
        }
        let destination = source.with_file_name(new_name);
        let destination_key = destination.to_string_lossy().to_lowercase();
        if !destinations.insert(destination_key) {
            return Err(format!(
                "The rename pattern produces duplicate destination names: {}",
                destination.display()
            ));
        }
        if destination != source && destination.exists() {
            return Err(format!(
                "{} already exists; no files were renamed.",
                destination.display()
            ));
        }
        sources.push(source);
        planned.push(destination);
    }

    let mut outcomes = Vec::with_capacity(paths.len());
    for (source, destination) in sources.iter().zip(planned.iter()) {
        if source == destination {
            outcomes.push(RenameOutcome {
                path: source.to_string_lossy().into_owned(),
                renamed: true,
                error: None,
            });
            continue;
        }
        match fs::rename(source, destination) {
            Ok(()) => outcomes.push(RenameOutcome {
                path: destination.to_string_lossy().into_owned(),
                renamed: true,
                error: None,
            }),
            Err(error) => outcomes.push(RenameOutcome {
                path: source.to_string_lossy().into_owned(),
                renamed: false,
                error: Some(format!("Could not rename {}: {error}", source.display())),
            }),
        }
    }
    Ok(outcomes)
}

fn sanitize_file_stem(value: &str) -> String {
    let mut sanitized = String::with_capacity(value.len());
    let mut replacing = false;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() || character == '_' || character == '-' {
            sanitized.push(character);
            replacing = false;
        } else if !replacing {
            sanitized.push('-');
            replacing = true;
        }
    }
    sanitized
}

fn is_reserved_windows_name(name: &str) -> bool {
    let base = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    matches!(base.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|prefix| {
            base.strip_prefix(prefix)
                .map(|suffix| {
                    suffix.len() == 1 && suffix.as_bytes()[0].is_ascii_digit() && suffix != "0"
                })
                .unwrap_or(false)
        })
}

#[cfg(test)]
mod tests {
    use super::{
        AnimationSettings, CLIPBOARD_EXPIRY_MS, CLIPBOARD_LIMIT, CUSTOM_IMAGE_LIMIT_PIXELS,
        ClipboardEntry, ClipboardKind, DESK_PACK_LIMIT_BYTES, DESK_PACK_SPRITE_LIMIT_BYTES,
        DeskSticker, FocusTimerSettings, InterfaceMotionSettings, PREFERENCES_SCHEMA_VERSION,
        Preferences, SavedLink, THEME_ASSET_LIMIT_BYTES, ThemeBundleAsset, ThemePreferences,
        build_custom_buddy_pack, build_pack_archive, build_theme_bundle, classify_clipboard_text,
        close_request_behavior, custom_buddy_id, default_buddy_sensors, default_glass_opacity,
        export_desk_pack, image_dimensions, insert_clip, inspect_pack_archive,
        inspect_theme_bundle_archive, installed_pack_assets, is_reserved_windows_name,
        is_safe_http_url, is_safe_pack_id, is_safe_sprite_path, is_valid_theme_id,
        migrate_preferences, module_enabled, perform_tidy_downloads, perform_undo_tidy_downloads,
        prune_expired_history, read_installed_pack_manifests, register_pack_archive_entry,
        remove_installed_pack, rename_files, sanitize_file_stem, save_preferences,
        saved_theme_effect, tidy_plan, validate_animation_settings, validate_buddy_rules,
        validate_desk_stickers, validate_focus_timer_settings, validate_link,
        validate_link_for_open, validate_links, validate_pack_png, validate_theme_bundle_assets,
        validate_theme_preferences, validate_window_style, version_is_older, window_state_flags,
    };
    use std::{
        fs,
        io::{Cursor, Write},
        path::{Path, PathBuf},
        time::SystemTime,
    };
    use zip::{CompressionMethod, ZipWriter, write::SimpleFileOptions};

    fn temporary_directory(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .expect("system time should be after the Unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "desk-drawer-{name}-{}-{suffix}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).expect("temporary test directory should be created");
        directory
    }

    #[test]
    fn file_stem_sanitization_matches_the_preview_rules() {
        assert_eq!(sanitize_file_stem("notes final FINAL"), "notes-final-FINAL");
        assert_eq!(sanitize_file_stem("../unsafe:name"), "-unsafe-name");
        assert_eq!(sanitize_file_stem("..."), "-");
    }

    #[test]
    fn default_buddy_pack_updates_only_when_its_version_is_older() {
        assert!(version_is_older("1.1.9", "1.2.0"));
        assert!(version_is_older("1.2", "1.2.1"));
        assert!(!version_is_older("1.2.0", "1.2.0"));
        assert!(!version_is_older("2.0.0", "1.2.0"));
        assert!(!version_is_older("custom", "1.2.0"));
    }

    #[test]
    fn custom_buddy_pack_uses_validated_sprite_and_default_behavior_rules() {
        let sprite = test_sprite_png(256, 256);
        let (id, archive) =
            build_custom_buddy_pack("My New Buddy", &sprite).expect("custom pack should build");
        assert_eq!(id, "custom-my-new-buddy");
        let (pack, extracted_sprite) =
            inspect_pack_archive(Cursor::new(archive)).expect("custom pack should validate");
        assert_eq!(pack["name"], "My New Buddy");
        assert_eq!(pack["author"], "Custom");
        assert_eq!(pack["license"], "User supplied");
        assert_eq!(pack["rules"].as_array().unwrap().len(), 8);
        assert_eq!(extracted_sprite, sprite);
        assert_eq!(custom_buddy_id("  My New Buddy "), Ok(id));
        assert!(build_custom_buddy_pack("Only One Frame", &test_sprite_png(32, 32)).is_err());
        assert!(custom_buddy_id("   ").is_err());
    }

    #[test]
    fn windows_device_names_are_rejected() {
        assert!(is_reserved_windows_name("CON"));
        assert!(is_reserved_windows_name("com1.txt"));
        assert!(is_reserved_windows_name("LPT9"));
        assert!(!is_reserved_windows_name("COM0"));
        assert!(!is_reserved_windows_name("report"));
    }

    #[test]
    fn clipboard_history_deduplicates_and_stays_within_its_limit() {
        let mut preferences = Preferences::default();
        for index in 0..(CLIPBOARD_LIMIT + 1) {
            insert_clip(&mut preferences, format!("clip-{index}"))
                .expect("new clipboard items should be saved");
        }
        insert_clip(&mut preferences, "clip-1".to_string())
            .expect("duplicate clipboard items should refresh");

        assert_eq!(preferences.clipboard_history.len(), CLIPBOARD_LIMIT);
        assert_eq!(preferences.clipboard_history[0].text, "clip-1");
        assert_eq!(
            preferences
                .clipboard_history
                .iter()
                .filter(|item| item.text == "clip-1")
                .count(),
            1
        );
    }

    #[test]
    fn existing_preferences_get_defaults_for_new_close_settings() {
        let (preferences, migrated) = migrate_preferences(serde_json::from_str(
            r#"{"clipboard_history":["saved"],"clipboard_paused":true,"theme":"night","active_layout":"writing"}"#,
        )
        .expect("existing preferences should decode"))
        .expect("existing preferences should migrate");

        assert!(migrated);
        assert_eq!(preferences.clipboard_history.len(), 1);
        assert_eq!(preferences.clipboard_history[0].text, "saved");
        assert_eq!(preferences.clipboard_history[0].kind, ClipboardKind::Text);
        assert!(preferences.close_to_tray);
        assert!(!preferences.close_confirmation_seen);
        assert!(preferences.buddy_sensors.values().all(|enabled| !enabled));
        assert!(preferences.buddy_rules.is_none());
        assert_eq!(preferences.schema_version, PREFERENCES_SCHEMA_VERSION);
        assert!(preferences.enabled_modules.values().all(|enabled| !enabled));
    }

    #[test]
    fn schema_two_preferences_migrate_to_buddy_sensor_and_rule_defaults() {
        let (preferences, migrated) =
            migrate_preferences(serde_json::json!({"schemaVersion": 2, "theme": "night"}))
                .expect("schema two preferences should migrate");
        assert!(migrated);
        assert_eq!(preferences.schema_version, PREFERENCES_SCHEMA_VERSION);
        assert_eq!(preferences.buddy_sensors, default_buddy_sensors());
        assert!(preferences.buddy_rules.is_none());
    }

    #[test]
    fn schema_three_preferences_get_customization_defaults() {
        let (preferences, migrated) =
            migrate_preferences(serde_json::json!({"schemaVersion": 3, "theme": "night"}))
                .expect("schema three preferences should migrate");
        assert!(migrated);
        assert_eq!(preferences.schema_version, PREFERENCES_SCHEMA_VERSION);
        assert_eq!(preferences.glass_opacity, default_glass_opacity());
        assert!(preferences.desk_background.is_none());
        assert!(preferences.desk_stickers.is_empty());
    }

    #[test]
    fn schema_four_preferences_get_utility_defaults() {
        let (preferences, migrated) = migrate_preferences(serde_json::json!({
            "schemaVersion": 4,
            "enabled_modules": {"clipboard": true}
        }))
        .expect("schema four settings should migrate");

        assert!(migrated);
        assert_eq!(preferences.schema_version, PREFERENCES_SCHEMA_VERSION);
        assert!(preferences.notes.is_empty());
        assert!(preferences.saved_scenes.is_empty());
        assert!(!preferences.window_pinned);
        assert!(!module_enabled(&preferences, "focus"));
    }

    #[test]
    fn schema_five_preferences_get_animation_default_without_changing_saved_choices() {
        let (preferences, migrated) = migrate_preferences(serde_json::json!({
            "schemaVersion": 5,
            "enabled_modules": {"clipboard": true},
            "buddy_sensors": {"clipboard": true}
        }))
        .expect("schema five preferences should migrate");

        assert!(migrated);
        assert_eq!(preferences.schema_version, PREFERENCES_SCHEMA_VERSION);
        assert!(preferences.animations_enabled);
        assert!(module_enabled(&preferences, "clipboard"));
        assert!(!module_enabled(&preferences, "links"));
        assert_eq!(preferences.buddy_sensors.get("clipboard"), Some(&true));
        assert_eq!(preferences.buddy_sensors.get("files"), None);
    }

    #[test]
    fn schema_six_preferences_default_developer_mode_to_off() {
        let (preferences, migrated) = migrate_preferences(serde_json::json!({
            "schemaVersion": 6,
            "theme": "night",
            "animations_enabled": false
        }))
        .expect("schema six preferences should migrate");

        assert!(migrated);
        assert_eq!(preferences.schema_version, PREFERENCES_SCHEMA_VERSION);
        assert!(!preferences.developer_mode);
        assert!(!preferences.animations_enabled);
        assert_eq!(preferences.theme, "night");
    }

    #[test]
    fn schema_seven_preferences_migrate_to_native_window_style() {
        let (preferences, migrated) = migrate_preferences(serde_json::json!({
            "schemaVersion": 7,
            "theme": "night",
            "animations_enabled": false
        }))
        .expect("schema seven preferences should migrate");

        assert!(migrated);
        assert_eq!(preferences.schema_version, PREFERENCES_SCHEMA_VERSION);
        assert_eq!(preferences.window_style, "native");
        assert!(!preferences.animations_enabled);
    }

    #[test]
    fn schema_eight_preferences_get_interface_motion_defaults() {
        let (preferences, migrated) = migrate_preferences(serde_json::json!({
            "schemaVersion": 8,
            "theme": "night",
            "interface_motion": {
                "drawer_style": "pop",
                "cursor_tilt": true
            }
        }))
        .expect("schema eight preferences should migrate");

        assert!(migrated);
        assert_eq!(preferences.schema_version, PREFERENCES_SCHEMA_VERSION);
        assert_eq!(preferences.interface_motion.drawer_style, "pop");
        assert!(preferences.interface_motion.cursor_tilt);
        assert!(preferences.interface_motion.dock_magnification);
        assert!(!preferences.interface_motion.taskbar_flash);
        assert_eq!(preferences.theme, "night");
    }

    #[test]
    fn schema_nine_preferences_get_theme_system_defaults() {
        let (preferences, migrated) = migrate_preferences(serde_json::json!({
            "schemaVersion": 9,
            "theme": "night"
        }))
        .expect("schema nine preferences should migrate");

        assert!(migrated);
        assert_eq!(preferences.schema_version, PREFERENCES_SCHEMA_VERSION);
        assert_eq!(preferences.theme_preferences.schema_version, 2);
        assert_eq!(preferences.theme_preferences.light_theme, "cozy");
        assert_eq!(preferences.theme_preferences.dark_theme, "night");
    }

    #[test]
    fn schema_ten_preferences_get_animation_system_defaults() {
        let (preferences, migrated) = migrate_preferences(serde_json::json!({
            "schemaVersion": 10,
            "theme": "night",
            "animations_enabled": true
        }))
        .expect("schema ten preferences should migrate");

        assert!(migrated);
        assert_eq!(preferences.schema_version, PREFERENCES_SCHEMA_VERSION);
        assert_eq!(preferences.animation_settings, AnimationSettings::default());
    }

    #[test]
    fn schema_twelve_preferences_get_focus_timer_and_buddy_pack_defaults() {
        let (preferences, migrated) = migrate_preferences(serde_json::json!({
            "schemaVersion": 12,
            "enabled_pack": "existing-buddy"
        }))
        .expect("schema twelve preferences should migrate");

        assert!(migrated);
        assert_eq!(preferences.schema_version, PREFERENCES_SCHEMA_VERSION);
        assert_eq!(
            preferences.focus_timer_settings,
            FocusTimerSettings::default()
        );
        assert_eq!(preferences.enabled_pack.as_deref(), Some("existing-buddy"));
        assert!(!preferences.buddy_pack_initialized);
    }

    #[test]
    fn focus_timer_settings_validate_duration_and_color() {
        let settings = FocusTimerSettings::default();
        assert!(validate_focus_timer_settings(&settings).is_ok());
        let mut custom = FocusTimerSettings {
            duration_minutes: 10_080,
            text_color: Some("#12aBcF".to_string()),
            ..settings.clone()
        };
        assert!(validate_focus_timer_settings(&custom).is_ok());
        custom.duration_minutes = 10_081;
        assert!(validate_focus_timer_settings(&custom).is_err());
        custom.duration_minutes = 25;
        custom.text_color = Some("red; background:url(x)".to_string());
        assert!(validate_focus_timer_settings(&custom).is_err());
        assert!(
            serde_json::from_value::<FocusTimerSettings>(serde_json::json!({
                "schemaVersion": 1,
                "durationMinutes": 25,
                "textColor": "#ffffff",
                "unexpected": true
            }))
            .is_err()
        );
    }

    #[test]
    fn animation_preferences_reject_unsafe_tuning_and_unknown_fields() {
        let mut settings = AnimationSettings::default();
        assert!(validate_animation_settings(&settings).is_ok());
        settings.speed_multiplier = 2.1;
        assert!(validate_animation_settings(&settings).is_err());
        settings = AnimationSettings::default();
        settings.slow_motion_multiplier = 0.09;
        assert!(validate_animation_settings(&settings).is_err());
        assert!(
            serde_json::from_value::<AnimationSettings>(serde_json::json!({
                "intensity": "calm",
                "mysteryEffect": true
            }))
            .is_err()
        );
    }

    #[test]
    fn theme_preferences_reject_invalid_times_and_oversized_custom_themes() {
        let mut settings = ThemePreferences::default();
        assert!(validate_theme_preferences(&settings).is_ok());
        settings.font_override = Some("untrusted".to_string());
        assert!(validate_theme_preferences(&settings).is_err());
        settings.font_override = Some("mono".to_string());
        assert!(validate_theme_preferences(&settings).is_ok());
        settings.light_start = "24:00".to_string();
        assert!(validate_theme_preferences(&settings).is_err());
        settings.light_start = "07:00".to_string();
        settings.custom_themes.push("not json".to_string());
        assert!(validate_theme_preferences(&settings).is_err());
        settings.custom_themes = vec![format!("\"{}\"", "x".repeat(512 * 1024))];
        assert!(validate_theme_preferences(&settings).is_err());
    }

    #[test]
    fn schema_thirteen_preferences_migrate_animation_and_font_settings() {
        let (preferences, migrated) = migrate_preferences(serde_json::json!({
            "schemaVersion": 13,
            "animation_settings": {
                "schemaVersion": 1,
                "intensity": "calm",
                "speedMultiplier": 1.0,
                "stiffness": 900.0,
                "bounciness": 0.5,
                "slowMotionMultiplier": 1.0,
                "effects": {}
            },
            "theme_preferences": {
                "schemaVersion": 1,
                "followSystem": false,
                "lightTheme": "cozy",
                "darkTheme": "night",
                "scheduleEnabled": false,
                "lightStart": "07:00",
                "darkStart": "19:00",
                "accentOverride": null,
                "opacityOverrides": {},
                "customThemes": [],
                "buddyFollowsTheme": false
            }
        }))
        .expect("schema thirteen preferences should migrate");

        assert!(migrated);
        assert_eq!(preferences.animation_settings.schema_version, 2);
        assert!(!preferences.animation_settings.eco_mode);
        assert!(preferences.animation_settings.effects.buddy_movement);
        assert!(preferences.animation_settings.effects.buddy_animation);
        assert_eq!(preferences.theme_preferences.schema_version, 2);
        assert_eq!(preferences.theme_preferences.font_override, None);
    }

    #[test]
    fn saved_theme_effects_are_resolved_from_builtin_and_user_theme_data() {
        let mut preferences = Preferences::default();
        assert_eq!(
            saved_theme_effect(&preferences, "frost"),
            Some("mica".to_string())
        );
        assert_eq!(saved_theme_effect(&preferences, "paper"), None);
        preferences.theme_preferences.custom_themes.push(
            r##"{"meta":{"id":"custom-glass"},"effects":{"windowEffect":"acrylic"}}"##.to_string(),
        );
        assert_eq!(
            saved_theme_effect(&preferences, "custom-glass"),
            Some("acrylic".to_string())
        );
        assert!(is_valid_theme_id("user-theme-1"));
        assert!(!is_valid_theme_id(""));
        assert!(!is_valid_theme_id("UPPER"));
    }

    #[test]
    fn interface_motion_rejects_unknown_drawer_styles() {
        assert!(
            serde_json::from_value::<InterfaceMotionSettings>(serde_json::json!({
                "drawer_style": "slide"
            }))
            .is_ok()
        );
        assert!(
            migrate_preferences(serde_json::json!({
                "schemaVersion": 9,
                "interface_motion": { "drawer_style": "bounce" }
            }))
            .is_err()
        );
    }

    #[test]
    fn window_style_validation_accepts_only_native_and_soft() {
        assert!(validate_window_style("native").is_ok());
        assert!(validate_window_style("soft").is_ok());
        assert!(validate_window_style("transparent").is_err());
        assert!(validate_window_style("Soft").is_err());
    }

    #[test]
    fn custom_image_validation_rejects_svg_and_oversized_dimensions() {
        let valid = test_sprite_png(32, 64);
        assert_eq!(
            image_dimensions(&valid, "png").expect("valid PNG dimensions should be read"),
            (32, 64, "image/png")
        );
        let oversized = test_sprite_png(4097, 32);
        assert!(image_dimensions(&oversized, "png").is_err());
        assert!(2048_u64 * 2048 > CUSTOM_IMAGE_LIMIT_PIXELS);
        let too_many_pixels = test_sprite_png(2048, 2048);
        assert!(image_dimensions(&too_many_pixels, "png").is_err());
        assert!(image_dimensions(b"<svg></svg>", "svg").is_err());
    }

    #[test]
    fn desk_sticker_layout_rejects_invalid_or_out_of_range_bounds() {
        let valid = DeskSticker {
            id: "image-1-0".into(),
            x: 4.0,
            y: 5.0,
            width: 20.0,
            height: 75.0,
        };
        assert!(validate_desk_stickers(std::slice::from_ref(&valid)).is_ok());
        let outside = DeskSticker {
            x: 90.0,
            ..valid.clone()
        };
        assert!(validate_desk_stickers(&[outside]).is_err());
        assert!(validate_desk_stickers(&[valid.clone(), valid]).is_err());
    }

    #[test]
    fn schema_one_clipboard_history_migrates_kinds_and_default_fields() {
        let (preferences, migrated) = migrate_preferences(serde_json::from_str(
            r##"{"schemaVersion":1,"clipboard_history":["https://example.com","#12aBcF","#x"]}"##,
        )
        .expect("schema one preferences should decode"))
        .expect("schema one preferences should migrate");

        assert!(migrated);
        assert_eq!(preferences.schema_version, PREFERENCES_SCHEMA_VERSION);
        assert_eq!(
            preferences
                .clipboard_history
                .iter()
                .map(|item| item.kind)
                .collect::<Vec<_>>(),
            vec![
                ClipboardKind::Link,
                ClipboardKind::Color,
                ClipboardKind::Text
            ]
        );
        assert!(
            preferences
                .clipboard_history
                .iter()
                .all(|item| !item.pinned && item.copied_at > 0 && !item.id.is_empty())
        );
    }

    #[test]
    fn legacy_preferences_without_history_use_an_empty_list() {
        let (preferences, migrated) = migrate_preferences(serde_json::json!({
            "theme": "night",
            "clipboard_paused": true
        }))
        .expect("legacy preferences with omitted history should migrate");

        assert!(migrated);
        assert!(preferences.clipboard_history.is_empty());
        assert!(preferences.clipboard_paused);
        assert_eq!(preferences.schema_version, PREFERENCES_SCHEMA_VERSION);
    }

    #[test]
    fn clipboard_items_expire_after_twenty_four_hours_unless_pinned() {
        let mut items = vec![
            ClipboardEntry {
                id: "old".into(),
                text: "old".into(),
                kind: ClipboardKind::Text,
                pinned: false,
                copied_at: 10,
            },
            ClipboardEntry {
                id: "pinned".into(),
                text: "saved".into(),
                kind: ClipboardKind::Text,
                pinned: true,
                copied_at: 10,
            },
            ClipboardEntry {
                id: "recent".into(),
                text: "recent".into(),
                kind: ClipboardKind::Text,
                pinned: false,
                copied_at: CLIPBOARD_EXPIRY_MS,
            },
        ];

        assert!(prune_expired_history(&mut items, CLIPBOARD_EXPIRY_MS + 10));
        assert_eq!(
            items
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["pinned", "recent"]
        );
    }

    #[test]
    fn pinned_clipboard_items_are_not_evicted_by_new_copies() {
        let mut preferences = Preferences::default();
        for index in 0..CLIPBOARD_LIMIT {
            insert_clip(&mut preferences, format!("clip-{index}"))
                .expect("clipboard item should be inserted");
        }
        for item in &mut preferences.clipboard_history {
            item.pinned = true;
        }

        assert!(insert_clip(&mut preferences, "one more".into()).is_err());
        assert_eq!(preferences.clipboard_history.len(), CLIPBOARD_LIMIT);
    }

    #[test]
    fn clipboard_kinds_are_coarse_and_color_detection_is_strict() {
        assert_eq!(
            classify_clipboard_text("https://example.com"),
            ClipboardKind::Link
        );
        assert_eq!(
            classify_clipboard_text("HTTPS://example.com"),
            ClipboardKind::Link
        );
        assert_eq!(classify_clipboard_text("#abc"), ClipboardKind::Color);
        assert_eq!(classify_clipboard_text("#12ABEF"), ClipboardKind::Color);
        assert_eq!(
            classify_clipboard_text("#12ABEF; color:red"),
            ClipboardKind::Text
        );
    }

    #[test]
    fn saved_links_accept_http_s_only_and_normalize_tags() {
        assert!(is_safe_http_url("https://example.com/path?q=1"));
        assert!(is_safe_http_url("http://localhost:3000"));
        assert!(!is_safe_http_url("javascript:alert(1)"));
        assert!(!is_safe_http_url("https://user@example.com"));
        assert!(!is_safe_http_url("https://example.com bad"));

        let links = validate_links(vec![SavedLink {
            id: "docs_1".into(),
            title: "  Rust Docs ".into(),
            kind: super::LinkKind::Url,
            target: "https://example.com".into(),
            tags: vec![" dev ".into(), "DEV".into(), "".into()],
        }])
        .expect("valid links should be saved");
        assert_eq!(links[0].title, "Rust Docs");
        assert_eq!(links[0].tags, vec!["dev"]);
        assert!(
            validate_link(SavedLink {
                id: "bad".into(),
                title: "bad scheme".into(),
                kind: super::LinkKind::Url,
                target: "file:///etc/passwd".into(),
                tags: Vec::new(),
            })
            .is_err()
        );

        let directory = temporary_directory("saved-links");
        let application = directory.join("app.exe");
        fs::write(&application, b"application").expect("application placeholder should be created");
        let local_links = validate_links(vec![
            SavedLink {
                id: "folder".into(),
                title: "Folder".into(),
                kind: super::LinkKind::Folder,
                target: directory.to_string_lossy().into_owned(),
                tags: Vec::new(),
            },
            SavedLink {
                id: "app".into(),
                title: "App".into(),
                kind: super::LinkKind::App,
                target: application.to_string_lossy().into_owned(),
                tags: Vec::new(),
            },
            SavedLink {
                id: "missing".into(),
                title: "Missing".into(),
                kind: super::LinkKind::Folder,
                target: directory.join("removed").to_string_lossy().into_owned(),
                tags: Vec::new(),
            },
        ])
        .expect("absolute local paths can be saved");
        assert_eq!(local_links.len(), 3);
        assert_eq!(
            PathBuf::from(
                validate_link_for_open(local_links[0].clone())
                    .expect("saved folder should be openable")
                    .target
            ),
            fs::canonicalize(&directory).expect("test directory should canonicalize")
        );
        assert!(validate_link_for_open(local_links[2].clone()).is_err());
        assert!(
            validate_links(vec![SavedLink {
                id: "wrong-kind".into(),
                title: "Not a folder".into(),
                kind: super::LinkKind::Folder,
                target: application.to_string_lossy().into_owned(),
                tags: Vec::new(),
            }])
            .is_ok()
        );
        assert!(
            validate_link_for_open(SavedLink {
                id: "wrong-kind".into(),
                title: "Not a folder".into(),
                kind: super::LinkKind::Folder,
                target: application.to_string_lossy().into_owned(),
                tags: Vec::new(),
            })
            .is_err()
        );
        fs::remove_dir_all(directory).expect("temporary link directory should be removed");
    }

    fn test_sprite_png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, width, height);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder
                .write_header()
                .expect("PNG header should be encoded");
            writer
                .write_image_data(&vec![0; (width * height * 4) as usize])
                .expect("PNG pixels should be encoded");
        }
        bytes
    }

    fn test_pack_archive(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for (name, contents) in entries {
            writer
                .start_file(name, options)
                .expect("test archive entry should start");
            writer
                .write_all(contents)
                .expect("test archive contents should write");
        }
        writer
            .finish()
            .expect("test archive should finish")
            .into_inner()
    }

    #[test]
    fn theme_bundles_roundtrip_assets_and_reject_unsafe_or_unreferenced_files() {
        let theme_json = r#"{"background":"desk-bg","stickers":["petal-1"]}"#;
        let image = test_sprite_png(32, 32);
        let assets = vec![
            ThemeBundleAsset {
                id: "desk-bg".into(),
                extension: "png".into(),
                bytes: image.clone(),
            },
            ThemeBundleAsset {
                id: "petal-1".into(),
                extension: "png".into(),
                bytes: image.clone(),
            },
        ];
        let archive =
            build_theme_bundle(theme_json, &assets).expect("valid theme assets should be bundled");
        let imported = inspect_theme_bundle_archive(Cursor::new(archive))
            .expect("valid theme archive should load");
        assert_eq!(imported.theme_json, theme_json);
        assert_eq!(imported.assets.len(), 2);
        assert!(imported.assets.iter().all(|asset| asset.bytes == image));

        let unreferenced = vec![ThemeBundleAsset {
            id: "unused".into(),
            extension: "png".into(),
            bytes: image.clone(),
        }];
        assert!(build_theme_bundle(theme_json, &unreferenced).is_err());
        let svg = vec![ThemeBundleAsset {
            id: "desk-bg".into(),
            extension: "svg".into(),
            bytes: image.clone(),
        }];
        assert!(build_theme_bundle(r#"{"background":"desk-bg"}"#, &svg).is_err());
        let traversal = test_pack_archive(&[
            ("theme.json", br#"{"background":"desk-bg"}"#),
            ("assets/../desk-bg.png", &image),
        ]);
        assert!(inspect_theme_bundle_archive(Cursor::new(traversal)).is_err());
        let nested = vec![ThemeBundleAsset {
            id: "desk-bg".into(),
            extension: "zip".into(),
            bytes: image,
        }];
        assert!(build_theme_bundle(r#"{"background":"desk-bg"}"#, &nested).is_err());
        assert!(
            validate_theme_bundle_assets(&serde_json::json!({"background": "missing-image"}), &[])
                .is_err()
        );

        let oversized = vec![ThemeBundleAsset {
            id: "desk-bg".into(),
            extension: "png".into(),
            bytes: vec![0; THEME_ASSET_LIMIT_BYTES as usize + 1],
        }];
        assert!(
            validate_theme_bundle_assets(&serde_json::json!({"background": "desk-bg"}), &oversized)
                .unwrap_err()
                .contains("4 MB")
        );

        let mut symlink_writer = ZipWriter::new(Cursor::new(Vec::new()));
        let symlink_options = SimpleFileOptions::default().unix_permissions(0o120777);
        symlink_writer
            .start_file("assets/desk-bg.png", symlink_options)
            .expect("symlink archive entry should start");
        symlink_writer
            .write_all(b"target")
            .expect("symlink archive entry should write");
        symlink_writer
            .start_file("theme.json", SimpleFileOptions::default())
            .expect("manifest archive entry should start");
        symlink_writer
            .write_all(br#"{"background":"desk-bg"}"#)
            .expect("manifest should write");
        let symlink_archive = symlink_writer
            .finish()
            .expect("symlink archive should finish")
            .into_inner();
        assert!(inspect_theme_bundle_archive(Cursor::new(symlink_archive)).is_err());
    }

    #[test]
    fn desk_pack_archives_roundtrip_and_reject_unsafe_paths_and_invalid_pngs() {
        let manifest = r#"{"id":"test-pack","buddy":{"sprite":"sprites/cat.png","animations":{"idle":{"frames":[0]}}}}"#;
        let sprite = test_sprite_png(32, 32);
        let archive = build_pack_archive(manifest, "sprites/cat.png", &sprite)
            .expect("valid pack should export");
        let (pack, imported_sprite) =
            inspect_pack_archive(Cursor::new(archive)).expect("valid pack should import");
        assert_eq!(pack["id"], "test-pack");
        assert_eq!(imported_sprite, sprite);
        assert!(is_safe_pack_id("test-pack"));
        assert!(!is_safe_pack_id("../test-pack"));
        assert!(is_safe_sprite_path("sprites/cat.png"));
        assert!(!is_safe_sprite_path("sprites/../cat.png"));
        assert!(validate_pack_png(&sprite, 0).is_ok());
        assert!(validate_pack_png(b"\x89PNG\r\n\x1a\n0000IHDR", 0).is_err());
        let unsafe_archive = build_pack_archive(manifest, "sprites/../cat.png", &sprite)
            .expect("archive builder accepts bytes for inspection");
        assert!(
            inspect_pack_archive(Cursor::new(unsafe_archive))
                .unwrap_err()
                .contains("unsafe path")
        );
        assert!(
            validate_pack_png(&test_sprite_png(32, 32), 1)
                .unwrap_err()
                .contains("dimensions")
        );
    }

    #[test]
    fn desk_pack_archives_reject_malformed_missing_and_extra_files() {
        let manifest = r#"{"id":"test-pack","buddy":{"sprite":"sprites/cat.png","animations":{"idle":{"frames":[0]}}}}"#;
        let sprite = test_sprite_png(32, 32);
        assert!(
            inspect_pack_archive(Cursor::new(b"not a zip"))
                .unwrap_err()
                .contains("valid ZIP")
        );

        let missing_sprite = test_pack_archive(&[("pack.json", manifest.as_bytes())]);
        assert!(
            inspect_pack_archive(Cursor::new(missing_sprite))
                .unwrap_err()
                .contains("missing sprites/cat.png")
        );

        let wrong_sprite = test_pack_archive(&[
            ("pack.json", manifest.as_bytes()),
            ("sprites/dog.png", &sprite),
        ]);
        assert!(
            inspect_pack_archive(Cursor::new(wrong_sprite))
                .unwrap_err()
                .contains("sprite path mismatch")
        );

        let extra_sprite = test_pack_archive(&[
            ("pack.json", manifest.as_bytes()),
            ("sprites/cat.png", &sprite),
            ("sprites/dog.png", &sprite),
        ]);
        assert!(
            inspect_pack_archive(Cursor::new(extra_sprite))
                .unwrap_err()
                .contains("more than one sprite")
        );
    }

    #[test]
    fn pack_archive_entries_reject_duplicate_names() {
        let mut names = std::collections::HashSet::new();
        register_pack_archive_entry(&mut names, "pack.json")
            .expect("first archive entry should be accepted");
        assert_eq!(
            register_pack_archive_entry(&mut names, "pack.json"),
            Err("Pack contains a duplicate file: pack.json".to_string())
        );
    }

    #[test]
    fn desk_pack_export_refuses_to_overwrite_an_existing_file() {
        let directory = temporary_directory("pack-export-overwrite");
        let path = directory.join("existing.deskpack");
        let original = b"keep this existing file";
        fs::write(&path, original).expect("existing file should be written");
        let manifest = r#"{"id":"test-pack","buddy":{"sprite":"sprites/cat.png","animations":{"idle":{"frames":[0]}}}}"#;

        let error = export_desk_pack(
            manifest.to_string(),
            test_sprite_png(32, 32),
            path.to_string_lossy().into_owned(),
        )
        .expect_err("export must not overwrite an existing file");

        assert!(error.contains("already exists"));
        assert_eq!(
            fs::read(&path).expect("existing file should remain"),
            original
        );
        fs::remove_dir_all(directory).expect("temporary directory should be removed");
    }

    #[test]
    fn desk_pack_archives_enforce_expanded_and_sprite_size_limits() {
        let manifest = r#"{"id":"test-pack","buddy":{"sprite":"sprites/cat.png","animations":{"idle":{"frames":[0]}}}}"#;
        let oversized_sprite = vec![0; DESK_PACK_SPRITE_LIMIT_BYTES as usize + 1];
        let sprite_archive = test_pack_archive(&[
            ("pack.json", manifest.as_bytes()),
            ("sprites/cat.png", &oversized_sprite),
        ]);
        assert!(
            inspect_pack_archive(Cursor::new(sprite_archive))
                .unwrap_err()
                .contains("uncompressed size limit")
        );

        let oversized_expansion = vec![0; DESK_PACK_LIMIT_BYTES as usize + 1];
        let expanded_archive = test_pack_archive(&[
            ("pack.json", manifest.as_bytes()),
            ("sprites/cat.png", &oversized_expansion),
        ]);
        assert!(
            inspect_pack_archive(Cursor::new(expanded_archive))
                .unwrap_err()
                .contains("expands beyond")
        );
    }

    #[test]
    fn bundled_cat_palette_packs_are_valid_offline_animated_sprite_packs() {
        for (archive, expected_id) in [
            (
                include_bytes!("../../packs/tabby-cat.deskpack").as_slice(),
                "tabby-cat",
            ),
            (
                include_bytes!("../../packs/midnight-cat.deskpack").as_slice(),
                "midnight-cat",
            ),
            (
                include_bytes!("../../packs/snow-cat.deskpack").as_slice(),
                "snow-cat",
            ),
        ] {
            let (pack, sprite) = inspect_pack_archive(Cursor::new(archive))
                .expect("bundled cat pack should validate");
            assert_eq!(pack["id"], expected_id);
            assert_eq!(pack["license"], "CC0-1.0");
            assert_eq!(pack["buddy"]["animations"].as_object().unwrap().len(), 12);
            assert_eq!(pack["buddy"]["animations"]["walk"]["fps"], 8);
            assert!(!sprite.is_empty());
        }
    }

    #[test]
    fn full_tabby_palettes_and_lime_slime_use_the_extended_animation_schema() {
        for (archive, expected_id) in [
            (
                include_bytes!("../../packs/tabby-cat-full.deskpack").as_slice(),
                "tabby-cat-full",
            ),
            (
                include_bytes!("../../packs/midnight-cat-full.deskpack").as_slice(),
                "midnight-cat-full",
            ),
            (
                include_bytes!("../../packs/snow-cat-full.deskpack").as_slice(),
                "snow-cat-full",
            ),
            (
                include_bytes!("../../packs/lime-slime.deskpack").as_slice(),
                "lime-slime",
            ),
            (
                include_bytes!("../../packs/aqua-slime.deskpack").as_slice(),
                "aqua-slime",
            ),
            (
                include_bytes!("../../packs/berry-slime.deskpack").as_slice(),
                "berry-slime",
            ),
        ] {
            let (pack, sprite) = inspect_pack_archive(Cursor::new(archive))
                .expect("new creature pack should pass archive validation");
            assert_eq!(pack["id"], expected_id);
            assert_eq!(pack["license"], "CC0-1.0");
            assert_eq!(pack["buddy"]["animations"].as_object().unwrap().len(), 27);
            assert_eq!(pack["buddy"]["anchor"]["x"], 16);
            assert_eq!(pack["buddy"]["anchor"]["y"], 29);
            if expected_id == "tabby-cat-full" {
                assert_eq!(pack["version"], "1.2.0");
            }
            assert!(!sprite.is_empty());
        }
    }

    #[test]
    fn installed_pack_listing_validates_archive_and_manifest_id() {
        let directory = temporary_directory("installed-packs");
        let sprite = test_sprite_png(32, 32);
        let manifest = r#"{"id":"z-pack","buddy":{"sprite":"sprites/cat.png","animations":{"idle":{"frames":[0]}}}}"#;
        let archive = build_pack_archive(manifest, "sprites/cat.png", &sprite)
            .expect("test pack should be built");
        fs::write(directory.join("z-pack.deskpack"), archive)
            .expect("installed pack should be written");

        let packs =
            read_installed_pack_manifests(&directory).expect("valid installed pack should load");
        assert_eq!(packs.len(), 1);
        assert_eq!(packs[0]["id"], "z-pack");

        fs::write(directory.join("a-pack.deskpack"), b"not a pack")
            .expect("corrupt pack should be written");
        assert!(
            read_installed_pack_manifests(&directory)
                .unwrap_err()
                .contains("valid ZIP")
        );
        fs::remove_file(directory.join("a-pack.deskpack"))
            .expect("corrupt test pack should be removed");

        let mismatched_manifest = r#"{"id":"other-id","buddy":{"sprite":"sprites/cat.png","animations":{"idle":{"frames":[0]}}}}"#;
        let mismatched_archive =
            build_pack_archive(mismatched_manifest, "sprites/cat.png", &sprite)
                .expect("mismatched test pack should be built");
        fs::write(directory.join("a-pack.deskpack"), mismatched_archive)
            .expect("mismatched pack should be written");
        assert!(
            read_installed_pack_manifests(&directory)
                .unwrap_err()
                .contains("does not match its manifest id")
        );
        fs::remove_dir_all(directory).expect("test pack directory should be removed");
    }

    #[test]
    fn enabled_pack_assets_are_revalidated_and_match_the_installed_id() {
        let directory = temporary_directory("enabled-pack-assets");
        let sprite = test_sprite_png(32, 32);
        let manifest = r#"{"id":"test-pack","buddy":{"sprite":"sprites/cat.png","animations":{"idle":{"frames":[0]}}}}"#;
        let archive = build_pack_archive(manifest, "sprites/cat.png", &sprite)
            .expect("valid pack should export");
        fs::write(directory.join("test-pack.deskpack"), archive)
            .expect("pack archive should be installed");

        let (pack, loaded_sprite) = installed_pack_assets(&directory, "test-pack")
            .expect("valid installed pack should load");
        assert_eq!(pack["id"], "test-pack");
        assert_eq!(loaded_sprite, sprite);
        assert!(installed_pack_assets(&directory, "../test-pack").is_err());
        assert!(installed_pack_assets(&directory, "missing-pack").is_err());
        fs::remove_dir_all(directory).expect("temporary directory should be removed");
    }

    #[test]
    fn installed_pack_delete_is_confined_to_safe_pack_ids() {
        let directory = temporary_directory("delete-installed-pack");
        let archive = directory.join("sample-pack.deskpack");
        fs::write(&archive, b"test archive").expect("pack file should be created");
        assert!(
            remove_installed_pack(&directory, "../outside")
                .unwrap_err()
                .contains("not valid")
        );
        assert!(archive.exists());

        remove_installed_pack(&directory, "sample-pack").expect("pack should be deleted");
        assert!(!archive.exists());
        assert!(
            remove_installed_pack(&directory, "sample-pack")
                .unwrap_err()
                .contains("Could not inspect installed pack")
        );
        fs::remove_dir_all(directory).expect("test pack directory should be removed");
    }

    #[test]
    fn persisted_buddy_rules_reject_unknown_fields_and_unsafe_actions() {
        let valid: serde_json::Value = serde_json::json!([{
            "id": "safe-rule",
            "name": "A safe rule",
            "enabled": true,
            "when": "user.click",
            "if": [],
            "then": [{"play": "happy"}],
            "cooldownSec": 10,
            "priority": 1,
            "weight": 1
        }]);
        assert!(validate_buddy_rules(valid.as_array().unwrap()).is_ok());

        let mut hidden_state = valid.clone();
        hidden_state[0]["then"] = serde_json::json!([{"setState": "hidden"}]);
        assert!(
            validate_buddy_rules(hidden_state.as_array().unwrap())
                .unwrap_err()
                .contains("invalid or unsupported setState")
        );

        let mut script_action = valid.clone();
        script_action[0]["then"] = serde_json::json!([{"run": "cmd.exe"}]);
        assert!(
            validate_buddy_rules(script_action.as_array().unwrap())
                .unwrap_err()
                .contains("unsupported run action")
        );

        let mut unknown = valid;
        unknown[0]["custom"] = serde_json::json!("not allowed");
        assert!(
            validate_buddy_rules(unknown.as_array().unwrap())
                .unwrap_err()
                .contains("unknown field")
        );

        let mut unknown_condition = serde_json::json!([{
            "id": "safe-rule",
            "name": "A safe rule",
            "enabled": true,
            "when": "user.click",
            "if": [{"var": "filesystem.path", "op": "==", "value": "secret"}],
            "then": [{"play": "happy"}],
            "cooldownSec": 10,
            "priority": 1,
            "weight": 1
        }]);
        assert!(
            validate_buddy_rules(unknown_condition.as_array().unwrap())
                .unwrap_err()
                .contains("invalid condition")
        );
        unknown_condition[0]["if"] = serde_json::json!([
            {"var": "mood.energy", "op": "between", "value": [10, "high"]}
        ]);
        assert!(
            validate_buddy_rules(unknown_condition.as_array().unwrap())
                .unwrap_err()
                .contains("invalid between condition")
        );
    }

    #[test]
    fn clipboard_monitor_follows_the_module_enabled_setting() {
        let mut preferences = Preferences::default();
        assert!(!module_enabled(&preferences, "clipboard"));
        preferences
            .enabled_modules
            .insert("clipboard".into(), false);
        assert!(!module_enabled(&preferences, "clipboard"));
        assert!(!module_enabled(&preferences, "future-module"));
    }

    #[test]
    fn preference_writes_keep_a_backup_of_the_last_good_file() {
        let directory = temporary_directory("preferences-backup");
        let path = directory.join("settings.json");
        fs::write(&path, b"{\"schemaVersion\":0}").expect("old preferences should be written");

        save_preferences(&path, &Preferences::default()).expect("preferences should be saved");

        assert_eq!(
            fs::read_to_string(directory.join("settings.json.bak")).expect("backup should exist"),
            "{\"schemaVersion\":0}"
        );
        let saved: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).expect("new preferences should exist"))
                .expect("saved preferences should be valid JSON");
        assert_eq!(saved["schemaVersion"], PREFERENCES_SCHEMA_VERSION);
        fs::remove_dir_all(directory).expect("temporary test directory should be removed");
    }

    #[test]
    fn saved_window_state_does_not_override_startup_visibility() {
        let flags = window_state_flags();

        assert!(flags.contains(super::StateFlags::SIZE));
        assert!(flags.contains(super::StateFlags::POSITION));
        assert!(flags.contains(super::StateFlags::MAXIMIZED));
        assert!(!flags.contains(super::StateFlags::VISIBLE));
    }

    #[test]
    fn close_requests_prompt_once_then_follow_the_saved_choice() {
        use super::CloseRequestBehavior::{Confirm, Hide, Quit};

        let mut preferences = Preferences::default();
        assert_eq!(close_request_behavior(&preferences), Confirm);

        preferences.close_confirmation_seen = true;
        assert_eq!(close_request_behavior(&preferences), Hide);

        preferences.close_to_tray = false;
        assert_eq!(close_request_behavior(&preferences), Quit);
    }

    #[test]
    fn rename_uses_pattern_and_keeps_the_original_extension() {
        let directory = temporary_directory("rename");
        let source = directory.join("notes final.txt");
        fs::write(&source, "keep this content").expect("source file should be created");

        let result = rename_files(
            vec![source.to_string_lossy().into_owned()],
            "{date}_{name}".to_string(),
            "2026-10-09".to_string(),
        )
        .expect("a valid rename should succeed");
        let destination = directory.join("2026-10-09_notes-final.txt");

        assert!(result[0].renamed);
        assert_eq!(
            fs::read_to_string(&destination).unwrap(),
            "keep this content"
        );
        fs::remove_dir_all(directory).expect("temporary test directory should be removed");
    }

    #[test]
    fn rename_collision_fails_without_changing_either_file() {
        let directory = temporary_directory("collision");
        let source = directory.join("source.txt");
        let destination = directory.join("target.txt");
        fs::write(&source, "source").expect("source file should be created");
        fs::write(&destination, "existing").expect("existing destination should be created");

        let result = rename_files(
            vec![source.to_string_lossy().into_owned()],
            "target".to_string(),
            "2026-10-09".to_string(),
        );

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(&source).unwrap(), "source");
        assert_eq!(fs::read_to_string(&destination).unwrap(), "existing");
        fs::remove_dir_all(directory).expect("temporary test directory should be removed");
    }

    #[test]
    fn tidy_downloads_preview_move_and_undo_restore_files() {
        let directory = temporary_directory("tidy-roundtrip");
        let image = directory.join("photo.png");
        let text = directory.join("notes.txt");
        fs::write(&image, b"image").expect("image fixture should be created");
        fs::write(&text, b"notes").expect("text fixture should be created");

        let preview = tidy_plan(&directory).expect("folder preview should succeed");
        assert_eq!(preview.len(), 2);
        assert!(preview.iter().any(|item| {
            Path::new(&item.destination)
                .parent()
                .and_then(Path::file_name)
                .and_then(|name| name.to_str())
                == Some("Images")
        }));
        assert!(preview.iter().any(|item| {
            Path::new(&item.destination)
                .parent()
                .and_then(Path::file_name)
                .and_then(|name| name.to_str())
                == Some("Documents")
        }));
        assert!(!directory.join("Images").exists());

        let moved =
            perform_tidy_downloads(directory.to_string_lossy().into_owned(), preview.clone())
                .expect("approved tidy operation should succeed");
        assert_eq!(moved, preview);
        assert!(!image.exists());
        assert!(directory.join("Images").join("photo.png").is_file());

        perform_undo_tidy_downloads(directory.to_string_lossy().into_owned(), moved)
            .expect("undo should restore original files");
        assert!(image.is_file());
        assert!(text.is_file());
        assert!(directory.join("Images").is_dir());
        assert!(directory.join("Documents").is_dir());
        assert_eq!(fs::read_dir(directory.join("Images")).unwrap().count(), 0);
        assert_eq!(
            fs::read_dir(directory.join("Documents")).unwrap().count(),
            0
        );
        fs::remove_dir_all(directory).expect("temporary directory should be removed");
    }

    #[test]
    fn tidy_downloads_reject_stale_previews_and_existing_destinations() {
        let directory = temporary_directory("tidy-stale");
        let source = directory.join("report.pdf");
        fs::write(&source, b"report").expect("source fixture should be created");
        let preview = tidy_plan(&directory).expect("preview should succeed");
        fs::write(&source, b"changed").expect("source should be changed");

        let result = perform_tidy_downloads(directory.to_string_lossy().into_owned(), preview);
        assert!(result.is_err());
        assert!(source.is_file());

        fs::create_dir(directory.join("Documents")).expect("category should be created");
        fs::write(directory.join("Documents").join("report.pdf"), b"existing")
            .expect("destination fixture should be created");
        assert!(tidy_plan(&directory).is_err());
        fs::remove_dir_all(directory).expect("temporary directory should be removed");
    }
}

fn save_preferences(path: &PathBuf, preferences: &Preferences) -> Result<(), String> {
    let encoded = serde_json::to_vec_pretty(preferences)
        .map_err(|error| format!("Could not encode local preferences: {error}"))?;
    let temporary = path.with_extension(format!("tmp-{}", std::process::id()));
    let backup = path.with_extension("json.bak");
    let backup_temporary = path.with_extension(format!("bak-tmp-{}", std::process::id()));

    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temporary)
        .map_err(|error| format!("Could not create temporary preferences file: {error}"))?;
    file.write_all(&encoded)
        .and_then(|()| file.sync_all())
        .map_err(|error| format!("Could not write temporary preferences file: {error}"))?;
    drop(file);

    if path.exists() {
        fs::copy(path, &backup_temporary)
            .map_err(|error| format!("Could not create preferences backup: {error}"))?;
        fs::rename(&backup_temporary, &backup)
            .map_err(|error| format!("Could not replace preferences backup: {error}"))?;
    }
    fs::rename(&temporary, path).map_err(|error| {
        format!(
            "Could not atomically save local preferences to {}: {error}",
            path.display()
        )
    })
}

fn mutate_preferences<T>(
    state: &AppState,
    update: impl FnOnce(&mut Preferences) -> Result<T, String>,
) -> Result<T, String> {
    let mut preferences = state
        .preferences
        .lock()
        .map_err(|error| format!("Could not access local preferences: {error}"))?;
    let previous = preferences.clone();
    let result = update(&mut preferences)?;
    if let Err(error) = save_preferences(&state.preferences_path, &preferences) {
        *preferences = previous;
        return Err(error);
    }
    Ok(result)
}

fn prune_expired_history(history: &mut Vec<ClipboardEntry>, now: u64) -> bool {
    let original_len = history.len();
    history.retain(|item| item.pinned || now.saturating_sub(item.copied_at) < CLIPBOARD_EXPIRY_MS);
    history.len() != original_len
}

fn insert_clip(preferences: &mut Preferences, text: String) -> Result<(), String> {
    let copied_at = now_unix_ms()?;
    prune_expired_history(&mut preferences.clipboard_history, copied_at);
    let previous = preferences
        .clipboard_history
        .iter()
        .position(|item| item.text == text)
        .map(|index| preferences.clipboard_history.remove(index));
    if preferences.clipboard_history.len() >= CLIPBOARD_LIMIT {
        if let Some(index) = preferences
            .clipboard_history
            .iter()
            .rposition(|item| !item.pinned)
        {
            preferences.clipboard_history.remove(index);
        } else {
            return Err(
                "Clipboard history is full of pinned items. Unpin one before adding another."
                    .to_string(),
            );
        }
    }
    let id = previous
        .as_ref()
        .map(|item| item.id.clone())
        .unwrap_or_else(|| {
            format!(
                "{}-{}-{}",
                copied_at,
                std::process::id(),
                CLIP_ID_COUNTER.fetch_add(1, Ordering::Relaxed)
            )
        });
    let pinned = previous.is_some_and(|item| item.pinned);
    preferences.clipboard_history.insert(
        0,
        ClipboardEntry {
            id,
            kind: classify_clipboard_text(&text),
            text,
            pinned,
            copied_at,
        },
    );
    Ok(())
}

fn notify_history_changed(app: &AppHandle, history: Vec<ClipboardEntry>) {
    if let Err(error) = app.emit("clipboard-history-changed", history) {
        log::warn!("Could not notify the UI about clipboard history: {error}");
    }
}

fn notify_clipboard_kind(app: &AppHandle, kind: ClipboardKind) {
    let kind = match kind {
        ClipboardKind::Text => "text",
        ClipboardKind::Link => "link",
        ClipboardKind::Color => "color",
    };
    if let Err(error) = app.emit("clipboard-kind-copied", kind) {
        log::warn!("Could not notify the UI about a clipboard copy: {error}");
    }
}

fn set_paused(app: &AppHandle, state: &AppState, paused: bool) -> Result<(), String> {
    mutate_preferences(state, |preferences| {
        preferences.clipboard_paused = paused;
        Ok(())
    })?;

    if let Some(item) = state
        .pause_menu_item
        .lock()
        .map_err(|error| format!("Could not update the tray pause item: {error}"))?
        .as_ref()
    {
        item.set_checked(paused)
            .map_err(|error| format!("Could not update the tray pause item: {error}"))?;
    }

    app.emit("clipboard-pause-changed", paused)
        .map_err(|error| format!("Could not notify the UI about clipboard pause: {error}"))
}

fn setup_tray(app: &mut tauri::App, paused: bool) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Desk Drawer", true, None::<&str>)?;
    let pause_item = CheckMenuItem::with_id(
        app,
        "pause",
        "Pause clipboard history",
        true,
        paused,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &pause_item, &quit])?;
    let pause_item_for_event = pause_item.clone();

    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Desk Drawer")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Err(error) = show_main_window(tray.app_handle()) {
                    log::error!("Could not show Desk Drawer from the tray icon: {error}");
                }
            }
        })
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => {
                if let Err(error) = show_main_window(app) {
                    log::error!("Could not show the main window from the tray: {error}");
                }
            }
            "pause" => {
                if let Some(state) = app.try_state::<AppState>() {
                    let checked = match pause_item_for_event.is_checked() {
                        Ok(checked) => checked,
                        Err(error) => {
                            log::error!("Could not read the tray pause state: {error}");
                            return;
                        }
                    };
                    if let Err(error) = set_paused(app, &state, checked) {
                        log::error!(
                            "Could not update clipboard pause state from the tray: {error}"
                        );
                    }
                } else {
                    log::error!("Application state is unavailable for the tray pause action");
                }
            }
            "quit" => {
                if let Err(error) = persist_window_state(app) {
                    log::error!("Could not save window state before quitting: {error}");
                }
                app.exit(0);
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    } else {
        log::error!("No default window icon is configured; the tray icon may be unavailable");
    }

    tray.build(app)?;
    if let Some(state) = app.try_state::<AppState>() {
        match state.pause_menu_item.lock() {
            Ok(mut item) => *item = Some(pause_item),
            Err(error) => {
                return Err(std::io::Error::other(format!(
                    "Could not store tray menu state: {error}"
                ))
                .into());
            }
        }
    }
    Ok(())
}

fn notify_monitor_error(app: &AppHandle, message: String) {
    log::warn!("{message}");
    if let Err(error) = app.emit("clipboard-error", message) {
        log::warn!("Could not notify the UI about a clipboard error: {error}");
    }
}

#[cfg(target_os = "windows")]
fn spawn_clipboard_monitor(app: AppHandle) -> JoinHandle<()> {
    thread::spawn(move || {
        let mut sequence = windows_platform::clipboard_sequence();
        loop {
            thread::sleep(Duration::from_millis(500));
            let Some(state) = app.try_state::<AppState>() else {
                notify_monitor_error(
                    &app,
                    "Clipboard monitor could not access app state.".to_string(),
                );
                break;
            };
            let enabled = match state.preferences.lock() {
                Ok(preferences) => module_enabled(&preferences, "clipboard"),
                Err(error) => {
                    notify_monitor_error(
                        &app,
                        format!("Could not read clipboard module state: {error}"),
                    );
                    break;
                }
            };
            if !enabled {
                break;
            }
            let current_sequence = windows_platform::clipboard_sequence();
            if current_sequence == sequence {
                continue;
            }
            sequence = current_sequence;

            let paused = match state.preferences.lock() {
                Ok(preferences) => preferences.clipboard_paused,
                Err(error) => {
                    notify_monitor_error(
                        &app,
                        format!("Could not read clipboard pause state: {error}"),
                    );
                    continue;
                }
            };
            if paused {
                continue;
            }

            match windows_platform::read_clipboard_text() {
                Ok(Some(text)) => {
                    let text = text.trim().to_string();
                    if text.is_empty() {
                        continue;
                    }
                    let kind = classify_clipboard_text(&text);
                    match mutate_preferences(&state, |preferences| {
                        insert_clip(preferences, text.clone())?;
                        Ok(preferences.clipboard_history.clone())
                    }) {
                        Ok(history) => {
                            notify_history_changed(&app, history);
                            notify_clipboard_kind(&app, kind);
                        }
                        Err(error) => notify_monitor_error(&app, error),
                    }
                }
                Ok(None) => {}
                Err(error) => notify_monitor_error(&app, error),
            }
        }
    })
}

#[cfg(target_os = "windows")]
fn reconcile_clipboard_monitor(app: &AppHandle) -> Result<(), String> {
    let state = app
        .try_state::<AppState>()
        .ok_or_else(|| "Clipboard monitor app state is unavailable.".to_string())?;
    let enabled = state
        .preferences
        .lock()
        .map_err(|error| format!("Could not read clipboard module state: {error}"))?
        .enabled_modules
        .get("clipboard")
        .copied()
        .unwrap_or(false);
    let mut monitor = state
        .clipboard_monitor
        .lock()
        .map_err(|error| format!("Could not access clipboard monitor state: {error}"))?;

    match (enabled, monitor.is_some()) {
        (true, false) => *monitor = Some(spawn_clipboard_monitor(app.clone())),
        (false, true) => {
            let handle = monitor.take().expect("monitor presence was checked");
            drop(monitor);
            handle
                .join()
                .map_err(|_| "Clipboard monitor did not stop cleanly.".to_string())?;
        }
        _ => {}
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn reconcile_clipboard_monitor(_app: &AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let launch_hidden = std::env::args().any(|argument| argument == "--hidden");
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
    let handler_shortcut = shortcut.clone();
    let registration_shortcut = shortcut.clone();
    tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _, _| {
      if let Err(error) = show_main_window(app) {
        log::error!("Could not focus the existing app instance: {error}");
      }
    }))
    .plugin(
      tauri_plugin_window_state::Builder::default()
        .with_state_flags(window_state_flags())
        .build(),
    )
    .plugin(tauri_plugin_autostart::init(
      MacosLauncher::LaunchAgent,
      Some(vec!["--hidden"]),
    ))
    .plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, pressed_shortcut, event| {
          if pressed_shortcut == &handler_shortcut && event.state() == ShortcutState::Pressed {
            let result = toggle_main_window(app);
            if let Err(error) = result {
              log::error!("Global shortcut could not toggle the main window: {error}");
            }
          }
        })
        .build(),
    )
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      set_close_to_tray,
      set_window_style,
      complete_window_hide,
      set_module_enabled,
      set_animations_enabled,
      set_animation_settings,
      set_focus_timer_settings,
      set_interface_motion,
      ensure_default_buddy_pack,
      set_developer_mode,
      developer_performance,
      open_data_directory,
      append_developer_log,
      read_developer_log,
      reset_module_data,
      save_scratch_notes,
      save_scenes,
      set_window_pinned,
      set_keep_awake,
      preview_tidy_downloads,
      tidy_downloads,
      undo_tidy_downloads,
      set_buddy_sensor_enabled,
      set_buddy_mode,
      set_glass_opacity,
      import_custom_image,
      get_custom_image,
      inspect_theme_bundle,
      install_theme_bundle_assets,
      export_theme_bundle,
      set_desk_background,
      save_desk_stickers,
      remove_custom_image,
      overlay::roam_buddy_config,
      overlay::roam_monitor_areas,
      overlay::set_roam_buddy_position,
      overlay::set_roam_buddy_visible,
      overlay::set_roam_context_menu,
      overlay::roam_cursor_target,
      overlay::roam_is_allowed,
      overlay::roam_action,
      overlay::move_roam_buddy_to_cursor,
      save_buddy_rules,
      resolve_close_request,
      hotkey_status,
      app_preferences,
      save_links,
      open_saved_link,
      inspect_desk_pack,
      install_desk_pack,
      install_builtin_desk_pack,
      create_custom_buddy_pack,
      list_installed_desk_packs,
      set_enabled_desk_pack,
      get_installed_desk_pack_assets,
      delete_installed_desk_pack,
      export_desk_pack,
      add_clipboard_item,
      set_clipboard_pinned,
      prune_clipboard_history,
      clear_clipboard_history,
      set_clipboard_paused,
      read_clipboard_for_user,
      set_theme,
      set_theme_preferences,
      apply_layout,
      rename_files
    ])
    .setup(move |app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let app_data = app.path().app_data_dir()?;
      fs::create_dir_all(&app_data)?;
      let preferences_path = app_data.join("settings.json");
      let legacy_preferences_path = app_data.join("desk-drawer.json");
      let (stored_preferences, loaded_from_legacy) = match fs::read(&preferences_path) {
        Ok(bytes) => (Some(bytes), false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
          match fs::read(&legacy_preferences_path) {
            Ok(bytes) => (Some(bytes), true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (None, false),
            Err(error) => return Err(error.into()),
          }
        }
        Err(error) => return Err(error.into()),
      };
      let preferences = match stored_preferences {
        Some(bytes) => {
          let (preferences, migrated) = migrate_preferences(serde_json::from_slice(&bytes)?)
            .map_err(std::io::Error::other)?;
          let needs_migration = loaded_from_legacy || migrated;
          if needs_migration {
            if loaded_from_legacy {
              let backup_path = preferences_path.with_extension("json.bak");
              fs::copy(&legacy_preferences_path, &backup_path)?;
            }
            save_preferences(&preferences_path, &preferences).map_err(std::io::Error::other)?;
          }
          preferences
        }
        None => Preferences::default(),
      };
      let paused = preferences.clipboard_paused;
      let clipboard_enabled = module_enabled(&preferences, "clipboard");
      let buddy_mode = preferences.buddy_mode.clone();
      let theme = preferences.theme.clone();
      let theme_effect = saved_theme_effect(&preferences, &theme);
      let window_style = preferences.window_style.clone();
      let window_pinned = preferences.window_pinned;
      app.manage(AppState {
        preferences: Mutex::new(preferences),
        preferences_path,
        hotkey_error: Mutex::new(None),
        pause_menu_item: Mutex::new(None),
        clipboard_monitor: Mutex::new(None),
        keep_awake_worker: Mutex::new(None),
      });
      match apply_native_theme(app.handle(), &theme, theme_effect.as_deref()) {
        Ok(false) if theme_effect.is_some() => {
          log::warn!("Native {theme} effect is unavailable; the frontend will use the solid fallback.");
        }
        Ok(_) => {}
        Err(error) => {
          log::warn!("Could not apply {theme} window effects; using the CSS fallback: {error}");
        }
      }
      app.get_webview_window("main")
        .ok_or_else(|| tauri::Error::WindowNotFound)?
        .set_decorations(window_style == "native")?;
      if window_pinned {
        app.get_webview_window("main")
          .ok_or_else(|| tauri::Error::WindowNotFound)?
          .set_always_on_top(true)?;
      }
      app.manage(overlay::RoamState::default());
      overlay::reconcile_roam_window(app.handle(), &buddy_mode).map_err(std::io::Error::other)?;

      setup_tray(app, paused)?;
      if clipboard_enabled {
        reconcile_clipboard_monitor(app.handle()).map_err(std::io::Error::other)?;
      }

      if launch_hidden {
        app.get_webview_window("main")
          .ok_or_else(|| tauri::Error::WindowNotFound)?
          .hide()?;
      }

      if let Err(error) = app.global_shortcut().register(registration_shortcut) {
        log::error!("Could not register Ctrl+Shift+Space: {error}");
        if let Some(state) = app.try_state::<AppState>() {
          match state.hotkey_error.lock() {
            Ok(mut message) => {
              *message = Some(format!(
                "Ctrl+Shift+Space could not be registered ({error}). Another app may already use it."
              ));
            }
            Err(lock_error) => {
              log::error!("Could not save the global shortcut error status: {lock_error}");
            }
          }
        }
      }
      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let app = window.app_handle();
        let Some(state) = app.try_state::<AppState>() else {
          log::error!("Could not handle the close request because app state is unavailable");
          return;
        };
        match state.preferences.lock() {
          Ok(preferences) => match close_request_behavior(&preferences) {
            CloseRequestBehavior::Confirm => {
              if let Err(error) = app.emit("close-confirmation-required", ()) {
                log::error!("Could not request close confirmation from the UI: {error}");
              }
            }
            CloseRequestBehavior::Hide => {
              if let Err(error) = persist_window_state(app) {
                log::error!("Could not save window state before hiding: {error}");
              }
              if preferences.window_style == "soft" && preferences.animations_enabled {
                if let Err(error) = app.emit("window-hide-animation-requested", ()) {
                  log::error!("Could not request a window hide animation: {error}");
                }
              } else if let Err(error) = window.hide() {
                log::error!("Could not hide the window when closing it: {error}");
              }
            }
            CloseRequestBehavior::Quit => app.exit(0),
          },
          Err(error) => {
            log::error!("Could not read close behavior from app settings: {error}");
          }
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
