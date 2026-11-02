use std::{mem::size_of, slice, thread, time::Duration};
use windows::{
    Win32::{
        Foundation::{GetLastError, HGLOBAL, HWND, LPARAM, RECT, SetLastError, WIN32_ERROR},
        System::{
            DataExchange::{
                CloseClipboard, GetClipboardData, GetClipboardSequenceNumber,
                IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW,
            },
            Memory::{GlobalLock, GlobalSize, GlobalUnlock},
            Ole::CF_UNICODETEXT,
            Power::{
                ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED, SetThreadExecutionState,
            },
            Threading::GetCurrentProcessId,
        },
        UI::WindowsAndMessaging::{
            EnumWindows, GetSystemMetrics, GetWindowRect, GetWindowTextLengthW,
            GetWindowThreadProcessId, IsIconic, IsWindowVisible, SM_CXSCREEN, SM_CYSCREEN,
            SWP_NOACTIVATE, SWP_NOZORDER, SetWindowPos,
        },
    },
    core::{BOOL, w},
};

struct ClipboardGuard;

impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        // The clipboard must be closed even when reading or decoding fails.
        if let Err(error) = unsafe { CloseClipboard() } {
            log::warn!("Could not close the Windows clipboard: {error}");
        }
    }
}

pub fn clipboard_sequence() -> u32 {
    unsafe { GetClipboardSequenceNumber() }
}

fn open_clipboard() -> Result<(), String> {
    let mut last_error = None;
    for _ in 0..5 {
        match unsafe { OpenClipboard(None) } {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = Some(error);
                thread::sleep(Duration::from_millis(20));
            }
        }
    }
    Err(format!(
        "Could not open the Windows clipboard: {}",
        last_error.expect("at least one clipboard attempt is made")
    ))
}

fn clipboard_format_available(format: u32) -> Result<bool, String> {
    unsafe {
        SetLastError(WIN32_ERROR(0));
        match IsClipboardFormatAvailable(format) {
            Ok(()) => Ok(true),
            Err(error) => {
                let code = GetLastError().0;
                if code == 0 {
                    Ok(false)
                } else {
                    Err(format!(
                        "Could not check Windows clipboard format {format}: {error}"
                    ))
                }
            }
        }
    }
}

fn skip_excluded_clipboard_text<T>(
    excluded: bool,
    read: impl FnOnce() -> Result<Option<T>, String>,
) -> Result<Option<T>, String> {
    if excluded { Ok(None) } else { read() }
}

pub fn read_clipboard_text() -> Result<Option<String>, String> {
    unsafe {
        open_clipboard()?;
        let _guard = ClipboardGuard;

        SetLastError(WIN32_ERROR(0));
        let excluded_format =
            RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
        if excluded_format == 0 {
            let error = GetLastError().0;
            return Err(format!(
                "Windows could not register the private clipboard marker format (error {error}); skipped reading."
            ));
        }
        skip_excluded_clipboard_text(
            clipboard_format_available(excluded_format)?,
            read_clipboard_text_data,
        )
    }
}

fn read_clipboard_text_data() -> Result<Option<String>, String> {
    unsafe {
        if !clipboard_format_available(CF_UNICODETEXT.0.into())? {
            return Ok(None);
        }

        let handle = GetClipboardData(CF_UNICODETEXT.0.into()).map_err(|error| {
            format!("Could not read Unicode text from the Windows clipboard: {error}")
        })?;
        let memory = HGLOBAL(handle.0);
        let byte_len = GlobalSize(memory);
        if byte_len < size_of::<u16>() {
            return Ok(None);
        }

        SetLastError(WIN32_ERROR(0));
        let pointer = GlobalLock(memory) as *const u16;
        if pointer.is_null() {
            return Err(format!(
                "Windows could not lock clipboard text memory (error {})",
                GetLastError().0
            ));
        }

        let units = slice::from_raw_parts(pointer, byte_len / size_of::<u16>());
        let end = units
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(units.len());
        let decoded = String::from_utf16(&units[..end])
            .map_err(|error| format!("Clipboard text is not valid UTF-16: {error}"));
        SetLastError(WIN32_ERROR(0));
        if GlobalUnlock(memory).is_err() {
            let error = GetLastError().0;
            if error != 0 {
                log::warn!("Could not unlock Windows clipboard text memory (error {error})");
            }
        }
        decoded.map(Some)
    }
}

#[cfg(test)]
mod tests {
    use super::skip_excluded_clipboard_text;

    #[test]
    fn password_manager_marker_skips_clipboard_text_retrieval() {
        let result: Result<Option<String>, String> = skip_excluded_clipboard_text(true, || {
            panic!("clipboard text must not be read when the exclusion marker is present");
        });

        assert_eq!(result.expect("marker skip should succeed"), None);
    }

    #[test]
    fn clipboard_text_is_read_when_the_exclusion_marker_is_absent() {
        let result = skip_excluded_clipboard_text(false, || Ok(Some("ordinary text".to_string())));

        assert_eq!(
            result.expect("ordinary clipboard read should succeed"),
            Some("ordinary text".to_string())
        );
    }
}

unsafe extern "system" fn collect_windows(window: HWND, parameter: LPARAM) -> BOOL {
    let windows = unsafe { &mut *(parameter.0 as *mut Vec<HWND>) };
    if !unsafe { IsWindowVisible(window).as_bool() } || unsafe { IsIconic(window).as_bool() } {
        return BOOL(1);
    }

    let title_length = unsafe { GetWindowTextLengthW(window) };
    if title_length <= 0 {
        return BOOL(1);
    }
    let mut bounds = RECT::default();
    if unsafe { GetWindowRect(window, &mut bounds) }.is_err()
        || bounds.right <= bounds.left
        || bounds.bottom <= bounds.top
    {
        return BOOL(1);
    }

    let mut process_id = 0;
    unsafe { GetWindowThreadProcessId(window, Some(&mut process_id)) };
    if process_id == unsafe { GetCurrentProcessId() } {
        return BOOL(1);
    }
    windows.push(window);
    BOOL(1)
}

pub fn set_execution_state(active: bool) -> Result<(), String> {
    let flags = if active {
        ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
    } else {
        ES_CONTINUOUS
    };
    let result = unsafe { SetThreadExecutionState(flags) };
    if result.0 == 0 {
        return Err("Windows could not change the system sleep state.".to_string());
    }
    Ok(())
}

pub fn apply_layout(name: &str) -> Result<usize, String> {
    let presets: [[(f64, f64, f64, f64); 3]; 3] = [
        [
            (0.0, 0.0, 0.6, 1.0),
            (0.6, 0.0, 0.4, 0.5),
            (0.6, 0.5, 0.4, 0.5),
        ],
        [
            (0.2, 0.0, 0.6, 1.0),
            (0.82, 0.0, 0.18, 1.0),
            (0.0, 0.0, 0.18, 1.0),
        ],
        [
            (0.0, 0.0, 0.7, 1.0),
            (0.7, 0.0, 0.3, 0.5),
            (0.7, 0.5, 0.3, 0.5),
        ],
    ];
    let preset = match name {
        "coding" => &presets[0],
        "writing" => &presets[1],
        "call" => &presets[2],
        _ => return Err(format!("Unknown window layout: {name}")),
    };

    let mut windows = Vec::new();
    unsafe {
        EnumWindows(
            Some(collect_windows),
            LPARAM(&mut windows as *mut Vec<HWND> as isize),
        )
        .map_err(|error| format!("Could not enumerate open windows: {error}"))?;
    }

    if windows.is_empty() {
        return Err("No other visible, titled windows are available to arrange.".to_string());
    }

    let screen_width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let screen_height = unsafe { GetSystemMetrics(SM_CYSCREEN) };
    if screen_width <= 0 || screen_height <= 0 {
        return Err("Windows did not report a usable screen size.".to_string());
    }

    let count = windows.len().min(preset.len());
    for (window, (left, top, width, height)) in windows.iter().zip(preset.iter()).take(count) {
        let x = (screen_width as f64 * left).round() as i32;
        let y = (screen_height as f64 * top).round() as i32;
        let width = (screen_width as f64 * width).round() as i32;
        let height = (screen_height as f64 * height).round() as i32;
        unsafe {
            SetWindowPos(
                *window,
                None,
                x,
                y,
                width,
                height,
                SWP_NOZORDER | SWP_NOACTIVATE,
            )
            .map_err(|error| format!("Could not position an open window: {error}"))?;
        }
    }

    Ok(count)
}
