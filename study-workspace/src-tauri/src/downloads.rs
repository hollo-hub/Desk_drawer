use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

const UNDO_WINDOW: Duration = Duration::from_secs(10 * 60);
static MOVE_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
pub struct DownloadState(Mutex<DownloadStateInner>);

#[derive(Default)]
struct DownloadStateInner {
    watcher: Option<RecommendedWatcher>,
    moves: HashMap<String, PendingMove>,
}

struct PendingMove {
    from: PathBuf,
    to: PathBuf,
    expires: Instant,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveReceipt {
    pub id: String,
    pub from: String,
    pub to: String,
    pub undo_until: u64,
}

pub fn set_watching(app: &AppHandle, state: &DownloadState, enabled: bool) -> Result<(), String> {
    let mut inner = state
        .0
        .lock()
        .map_err(|_| "Download filing state is unavailable.".to_string())?;
    if !enabled {
        inner.watcher = None;
        return Ok(());
    }
    if inner.watcher.is_some() {
        return Ok(());
    }

    let directory = app
        .path()
        .download_dir()
        .map_err(|error| format!("Could not locate the Downloads folder: {error}"))?;
    if !directory.is_dir() {
        return Err(format!(
            "Downloads folder does not exist: {}",
            directory.display()
        ));
    }

    let event_app = app.clone();
    let mut watcher =
        notify::recommended_watcher(move |result: notify::Result<notify::Event>| match result {
            Ok(event) if matches!(event.kind, EventKind::Create(_)) => {
                for path in event.paths {
                    if let Err(error) = emit_candidate(&event_app, &path) {
                        eprintln!("Could not process a Downloads filing candidate: {error}");
                    }
                }
            }
            Ok(_) => {}
            Err(error) => eprintln!("Downloads watcher error: {error}"),
        })
        .map_err(|error| format!("Could not start Downloads watcher: {error}"))?;
    watcher
        .watch(&directory, RecursiveMode::NonRecursive)
        .map_err(|error| format!("Could not watch {}: {error}", directory.display()))?;
    inner.watcher = Some(watcher);
    Ok(())
}

fn emit_candidate(app: &AppHandle, path: &Path) -> Result<(), String> {
    if !path.is_file() || is_partial_download(path) {
        return Ok(());
    }
    let data = crate::data::load(app)?;
    if !data.settings.download_filing_enabled {
        return Ok(());
    }
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "The downloaded filename is not valid text.".to_string())?;
    let normalized = filename.to_lowercase();
    let matches = data
        .courses
        .iter()
        .filter(|course| {
            !course.folder.trim().is_empty()
                && course
                    .filing_keywords
                    .iter()
                    .any(|keyword| normalized.contains(&keyword.to_lowercase()))
        })
        .map(|course| {
            serde_json::json!({
                "courseId": course.id,
                "courseName": course.name,
                "folder": course.folder,
            })
        })
        .collect::<Vec<_>>();
    if matches.is_empty() {
        return Ok(());
    }
    app.emit(
        "download-filing-candidate",
        serde_json::json!({
            "path": path.to_string_lossy(),
            "filename": filename,
            "matches": matches,
        }),
    )
    .map_err(|error| format!("Could not notify the workspace about a download: {error}"))
}

fn is_partial_download(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_lowercase();
    [".crdownload", ".tmp", ".part", ".download"]
        .iter()
        .any(|suffix| name.ends_with(suffix))
}

pub fn move_download(
    app: &AppHandle,
    state: &DownloadState,
    course_id: &str,
    source: &Path,
) -> Result<MoveReceipt, String> {
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| format!("Could not locate the Downloads folder: {error}"))?
        .canonicalize()
        .map_err(|error| format!("Could not access Downloads: {error}"))?;
    let source = source
        .canonicalize()
        .map_err(|error| format!("Could not access downloaded file: {error}"))?;
    if source.parent() != Some(downloads.as_path()) || !source.is_file() {
        return Err("Only files directly inside Downloads can be filed.".to_string());
    }

    let data = crate::data::load(app)?;
    let course = data
        .courses
        .iter()
        .find(|course| course.id == course_id)
        .ok_or_else(|| "The selected course could not be found.".to_string())?;
    if !course.filing_keywords.iter().any(|keyword| {
        source
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.to_lowercase().contains(&keyword.to_lowercase()))
    }) {
        return Err("This file does not match the selected course's filing rules.".to_string());
    }
    let folder = Path::new(&course.folder)
        .canonicalize()
        .map_err(|error| format!("Could not access the course folder: {error}"))?;
    if !folder.is_dir() {
        return Err("The course folder is not a directory.".to_string());
    }

    let filename = source
        .file_name()
        .ok_or_else(|| "The downloaded file has no filename.".to_string())?;
    let destination = unique_destination(&folder, filename)?;
    let mut inner = state
        .0
        .lock()
        .map_err(|_| "Download filing state is unavailable.".to_string())?;
    fs::rename(&source, &destination)
        .map_err(|error| format!("Could not move the file. It remains in Downloads: {error}"))?;

    let id = format!(
        "{}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        MOVE_ID.fetch_add(1, Ordering::Relaxed)
    );
    let expires = Instant::now() + UNDO_WINDOW;
    inner.moves.insert(
        id.clone(),
        PendingMove {
            from: source.clone(),
            to: destination.clone(),
            expires,
        },
    );
    Ok(MoveReceipt {
        id,
        from: source.to_string_lossy().into_owned(),
        to: destination.to_string_lossy().into_owned(),
        undo_until: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            + UNDO_WINDOW.as_secs(),
    })
}

fn unique_destination(directory: &Path, filename: &std::ffi::OsStr) -> Result<PathBuf, String> {
    let original = directory.join(filename);
    if !original.exists() {
        return Ok(original);
    }
    let file = Path::new(filename);
    let stem = file.file_stem().unwrap_or(filename).to_string_lossy();
    let extension = file.extension().map(|value| value.to_string_lossy());
    let mut number = 2u64;
    loop {
        let name = match extension.as_deref() {
            Some(extension) => format!("{stem} ({number}).{extension}"),
            None => format!("{stem} ({number})"),
        };
        let candidate = directory.join(name);
        if !candidate.exists() {
            return Ok(candidate);
        }
        if number == u64::MAX {
            return Err("Could not find a safe non-conflicting filename.".to_string());
        }
        number += 1;
    }
}

pub fn undo_move(state: &DownloadState, id: &str) -> Result<(), String> {
    let mut inner = state
        .0
        .lock()
        .map_err(|_| "Download filing state is unavailable.".to_string())?;
    let movement = inner
        .moves
        .get(id)
        .ok_or_else(|| "This move can no longer be undone.".to_string())?;
    if Instant::now() > movement.expires {
        inner.moves.remove(id);
        return Err("The 10-minute undo period has expired.".to_string());
    }
    if movement.from.exists() {
        return Err("A file with the original name already exists in Downloads.".to_string());
    }
    fs::rename(&movement.to, &movement.from)
        .map_err(|error| format!("Could not undo the move: {error}"))?;
    inner.moves.remove(id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{is_partial_download, unique_destination};
    use std::{ffi::OsStr, path::Path};

    #[test]
    fn ignores_partial_download_names_case_insensitively() {
        for name in [
            "lecture.crdownload",
            "lecture.TMP",
            "lecture.part",
            "lecture.download",
        ] {
            assert!(is_partial_download(Path::new(name)));
        }
        assert!(!is_partial_download(Path::new("lecture.pdf")));
    }

    #[test]
    fn picks_a_non_overwriting_filename() {
        let path =
            std::env::temp_dir().join(format!("desk-drawer-filing-test-{}", std::process::id()));
        std::fs::create_dir_all(&path).unwrap();
        std::fs::write(path.join("lecture.pdf"), b"original").unwrap();
        assert_eq!(
            unique_destination(&path, OsStr::new("lecture.pdf")).unwrap(),
            path.join("lecture (2).pdf")
        );
        std::fs::remove_dir_all(path).unwrap();
    }
}
