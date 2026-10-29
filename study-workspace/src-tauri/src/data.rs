use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};
use tauri::Manager;

const SCHEMA_VERSION: u32 = 1;
const DATA_FILE: &str = "desk-drawer.json";
const BACKUP_FILE: &str = "desk-drawer.json.bak";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    pub schema_version: u32,
    pub courses: Vec<Course>,
    pub sessions: Vec<StudySession>,
    #[serde(default)]
    pub tasks: Vec<StudyTask>,
    #[serde(default)]
    pub notes: Vec<NoteDocument>,
    pub settings: Settings,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDocument {
    pub id: String,
    pub course_id: String,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    pub id: String,
    pub name: String,
    pub color: String,
    pub folder: String,
    #[serde(default)]
    pub additional_folders: Vec<String>,
    pub links: Vec<CourseLink>,
    pub apps: Vec<String>,
    #[serde(default)]
    pub resource_groups: Vec<ResourceGroup>,
    #[serde(default)]
    pub resource_assignments: Vec<ResourceAssignment>,
    #[serde(default)]
    pub filing_keywords: Vec<String>,
    pub notes: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceGroup {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceAssignment {
    pub kind: String,
    pub target: String,
    pub group_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseLink {
    pub title: String,
    pub url: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudySession {
    pub id: String,
    pub course_id: String,
    pub started_at: String,
    pub planned_sec: u64,
    pub actual_sec: u64,
    pub completed: bool,
    #[serde(default)]
    pub count_up: bool,
    pub summary: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyTask {
    pub id: String,
    pub course_id: String,
    pub title: String,
    pub created_at: String,
    pub completed: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub default_length_sec: u64,
    #[serde(default = "default_theme")]
    pub theme: String,
    pub tour_done: bool,
    pub notifications: bool,
    #[serde(default = "default_sound_effects")]
    pub sound_effects: bool,
    #[serde(default)]
    pub download_filing_enabled: bool,
    #[serde(default = "default_dashboard_components")]
    pub dashboard_components: Vec<String>,
}

fn default_theme() -> String {
    "system".to_string()
}

fn default_sound_effects() -> bool {
    true
}

fn default_dashboard_components() -> Vec<String> {
    vec![
        "character".to_string(),
        "course-dock".to_string(),
        "next-task".to_string(),
    ]
}

impl Default for AppData {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            courses: Vec::new(),
            sessions: Vec::new(),
            tasks: Vec::new(),
            notes: Vec::new(),
            settings: Settings {
                default_length_sec: 25 * 60,
                theme: "system".to_string(),
                tour_done: false,
                notifications: true,
                sound_effects: true,
                download_filing_enabled: false,
                dashboard_components: default_dashboard_components(),
            },
        }
    }
}

impl AppData {
    fn validate(&self) -> Result<(), String> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(format!(
                "Unsupported data schema version: {}",
                self.schema_version
            ));
        }
        if !matches!(self.settings.theme.as_str(), "system" | "light" | "dark") {
            return Err("Theme must be system, light, or dark.".to_string());
        }
        let mut dashboard_components = HashSet::new();
        if self.settings.dashboard_components.iter().any(|component| {
            !matches!(
                component.as_str(),
                "character" | "course-dock" | "next-task"
            ) || !dashboard_components.insert(component)
        }) {
            return Err("Dashboard components must be valid and unique.".to_string());
        }
        let mut ids = HashSet::with_capacity(self.courses.len());
        for course in &self.courses {
            if course.id.trim().is_empty() || !ids.insert(&course.id) {
                return Err("Course IDs must be unique and non-empty.".to_string());
            }
            if course.name.trim().is_empty() || course.name.chars().count() > 60 {
                return Err("Course names must contain 1 to 60 characters.".to_string());
            }
            if ![
                "#e58a9b", "#5fb3a8", "#e2b25c", "#9a91cf", "#d3ad91", "#626781",
            ]
            .contains(&course.color.as_str())
            {
                return Err("Choose one of the available course colors.".to_string());
            }
            if course.folder.len() > 4096
                || course
                    .additional_folders
                    .iter()
                    .any(|path| path.len() > 4096)
                || course.apps.iter().any(|path| path.len() > 4096)
                || course.notes.chars().count() > 10000
            {
                return Err("A course field exceeds its maximum length.".to_string());
            }
            let mut group_ids = HashSet::with_capacity(course.resource_groups.len());
            let mut group_names = HashSet::with_capacity(course.resource_groups.len());
            for group in &course.resource_groups {
                if group.id.trim().is_empty() || !group_ids.insert(&group.id) {
                    return Err("Resource group IDs must be unique and non-empty.".to_string());
                }
                if group.name.trim().is_empty()
                    || group.name.chars().count() > 60
                    || !group_names.insert(group.name.to_lowercase())
                {
                    return Err(
                        "Resource group names must be unique and contain 1 to 60 characters."
                            .to_string(),
                    );
                }
            }
            let mut filing_keywords = HashSet::new();
            if course.filing_keywords.len() > 50
                || course.filing_keywords.iter().any(|keyword| {
                    keyword.trim().is_empty()
                        || keyword.chars().count() > 80
                        || !filing_keywords.insert(keyword.trim().to_lowercase())
                })
            {
                return Err(
                    "Course filing keywords must be unique and contain 1 to 80 characters."
                        .to_string(),
                );
            }
            let mut assigned_resources = HashSet::with_capacity(course.resource_assignments.len());
            for assignment in &course.resource_assignments {
                if !matches!(assignment.kind.as_str(), "folder" | "file" | "link")
                    || assignment.target.trim().is_empty()
                    || assignment.target.len() > 4096
                    || !group_ids.contains(&assignment.group_id)
                    || !assigned_resources
                        .insert((assignment.kind.as_str(), assignment.target.as_str()))
                {
                    return Err("A resource assignment has an invalid target or group.".to_string());
                }
                let target_exists = match assignment.kind.as_str() {
                    "folder" => {
                        course.folder == assignment.target
                            || course.additional_folders.contains(&assignment.target)
                    }
                    "file" => course.apps.contains(&assignment.target),
                    "link" => course
                        .links
                        .iter()
                        .any(|link| link.url == assignment.target),
                    _ => false,
                };
                if !target_exists {
                    return Err(
                        "A resource assignment refers to a resource that does not exist."
                            .to_string(),
                    );
                }
            }
            for link in &course.links {
                let url = url::Url::parse(&link.url)
                    .map_err(|_| "Course links must be valid web URLs.".to_string())?;
                if !matches!(url.scheme(), "http" | "https")
                    || url.host_str().is_none()
                    || !url.username().is_empty()
                    || url.password().is_some()
                {
                    return Err("Course links must use http:// or https://.".to_string());
                }
            }
        }

        let mut session_ids = HashSet::with_capacity(self.sessions.len());
        for session in &self.sessions {
            if session.id.trim().is_empty() || !session_ids.insert(&session.id) {
                return Err("Session IDs must be unique and non-empty.".to_string());
            }
            if session.started_at.trim().is_empty() || session.started_at.len() > 64 {
                return Err(
                    "Session start times must be present and within the length limit.".to_string(),
                );
            }
            if session.count_up {
                if session.planned_sec != 0 || session.actual_sec == 0 || session.completed {
                    return Err("Count-up sessions must have no plan and end with a positive elapsed duration.".to_string());
                }
            } else {
                if session.planned_sec == 0
                    || session.actual_sec == 0
                    || session.actual_sec > session.planned_sec
                {
                    return Err(
                        "Session durations must be greater than zero and within the plan."
                            .to_string(),
                    );
                }
                if session.planned_sec != 15 && !(60..=10_800).contains(&session.planned_sec) {
                    return Err("Session plans must be 15 seconds or 1 to 180 minutes.".to_string());
                }
                if session.completed && session.actual_sec != session.planned_sec {
                    return Err(
                        "Completed sessions must record their planned duration.".to_string()
                    );
                }
            }
            if session
                .summary
                .as_ref()
                .is_some_and(|summary| summary.chars().count() > 10000)
            {
                return Err("Session summaries must be 10,000 characters or fewer.".to_string());
            }
        }

        let course_ids = self
            .courses
            .iter()
            .map(|course| course.id.as_str())
            .collect::<HashSet<_>>();
        let mut task_ids = HashSet::with_capacity(self.tasks.len());
        for task in &self.tasks {
            if task.id.trim().is_empty() || !task_ids.insert(&task.id) {
                return Err("Task IDs must be unique and non-empty.".to_string());
            }
            if !course_ids.contains(task.course_id.as_str()) {
                return Err("A task refers to a course that does not exist.".to_string());
            }
            if task.title.trim().is_empty() || task.title.chars().count() > 160 {
                return Err("Task titles must contain 1 to 160 characters.".to_string());
            }
            if task.created_at.trim().is_empty() || task.created_at.len() > 64 {
                return Err(
                    "Task creation times must be present and within the length limit.".to_string(),
                );
            }
        }

        let mut note_ids = HashSet::with_capacity(self.notes.len());
        for note in &self.notes {
            if note.id.trim().is_empty() || !note_ids.insert(&note.id) {
                return Err("Note IDs must be unique and non-empty.".to_string());
            }
            if !course_ids.contains(note.course_id.as_str()) {
                return Err("A note refers to a course that does not exist.".to_string());
            }
            if note.title.trim().is_empty() || note.title.chars().count() > 120 {
                return Err("Note titles must contain 1 to 120 characters.".to_string());
            }
            if note.content.chars().count() > 50000 {
                return Err("Note content must be 50,000 characters or fewer.".to_string());
            }
            if note.created_at.trim().is_empty()
                || note.created_at.len() > 64
                || note.updated_at.trim().is_empty()
                || note.updated_at.len() > 64
            {
                return Err(
                    "Note timestamps must be present and within the length limit.".to_string(),
                );
            }
        }

        Ok(())
    }
}

pub fn load(app: &tauri::AppHandle) -> Result<AppData, String> {
    let path = data_path(app)?;
    match fs::read(&path) {
        Ok(contents) => parse_data(&contents, &path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(AppData::default()),
        Err(error) => Err(format!("Could not read {}: {error}", path.display())),
    }
}

pub fn save(app: &tauri::AppHandle, value: &AppData) -> Result<(), String> {
    value.validate()?;

    let path = data_path(app)?;
    let backup = path.with_file_name(BACKUP_FILE);
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Could not serialize local data: {error}"))?;

    if path.exists() {
        let backup_temp = temp_path(&backup);
        copy_to_temp(&path, &backup_temp)
            .map_err(|error| format!("Could not prepare data backup: {error}"))?;
        replace_file(&backup_temp, &backup)
            .map_err(|error| format!("Could not update data backup: {error}"))?;
    }

    let temp = temp_path(&path);
    write_to_temp(&temp, &bytes).map_err(|error| format!("Could not write local data: {error}"))?;
    replace_file(&temp, &path).map_err(|error| format!("Could not replace local data: {error}"))?;

    Ok(())
}

fn data_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate the app data directory: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create {}: {error}", directory.display()))?;
    Ok(directory.join(DATA_FILE))
}

fn parse_data(contents: &[u8], path: &Path) -> Result<AppData, String> {
    let value: AppData = serde_json::from_slice(contents)
        .map_err(|error| format!("Could not parse {}: {error}", path.display()))?;
    if value.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "Unsupported data schema version {} in {}",
            value.schema_version,
            path.display()
        ));
    }
    Ok(value)
}

fn temp_path(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    path.with_file_name(format!("{name}.tmp"))
}

fn write_to_temp(path: &Path, contents: &[u8]) -> io::Result<()> {
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(path)?;
    file.write_all(contents)?;
    file.sync_all()
}

fn copy_to_temp(source: &Path, destination: &Path) -> io::Result<()> {
    let mut input = File::open(source)?;
    let mut output = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(destination)?;
    io::copy(&mut input, &mut output)?;
    output.sync_all()
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let result = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_data, AppData};
    use std::path::Path;

    #[test]
    fn default_data_round_trips_with_the_public_schema() {
        let value = AppData::default();
        let encoded = serde_json::to_vec(&value).unwrap();
        let json: serde_json::Value = serde_json::from_slice(&encoded).unwrap();
        let decoded = parse_data(&encoded, Path::new("test.json")).unwrap();

        assert_eq!(json["schemaVersion"], 1);
        assert!(json["tasks"]
            .as_array()
            .is_some_and(|tasks| tasks.is_empty()));
        assert!(json["notes"]
            .as_array()
            .is_some_and(|notes| notes.is_empty()));
        assert_eq!(json["settings"]["defaultLengthSec"], 25 * 60);
        assert_eq!(decoded.schema_version, 1);
        assert_eq!(decoded.settings.default_length_sec, 25 * 60);
        assert_eq!(decoded.settings.theme, "system");
        assert!(decoded.courses.is_empty());
        assert!(decoded.sessions.is_empty());
        assert!(decoded.tasks.is_empty());
        assert!(decoded.notes.is_empty());
    }

    #[test]
    fn a_clean_empty_workspace_is_valid() {
        assert!(AppData::default().validate().is_ok());
    }

    #[test]
    fn a_named_course_without_resources_or_notes_is_valid() {
        let mut value = AppData::default();
        value.courses.push(super::Course {
            id: "course-empty".to_string(),
            name: "Biology".to_string(),
            color: "#e58a9b".to_string(),
            folder: String::new(),
            additional_folders: Vec::new(),
            links: Vec::new(),
            apps: Vec::new(),
            resource_groups: Vec::new(),
            resource_assignments: Vec::new(),
            filing_keywords: Vec::new(),
            notes: String::new(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        });

        assert!(value.validate().is_ok());
    }

    #[test]
    fn course_notes_are_persisted_and_validated() {
        let mut value = AppData::default();
        value.courses.push(super::Course {
            id: "course-notes".to_string(),
            name: "Biology".to_string(),
            color: "#e58a9b".to_string(),
            folder: String::new(),
            additional_folders: Vec::new(),
            links: Vec::new(),
            apps: Vec::new(),
            resource_groups: Vec::new(),
            resource_assignments: Vec::new(),
            filing_keywords: Vec::new(),
            notes: String::new(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        });
        value.notes.push(super::NoteDocument {
            id: "note-1".to_string(),
            course_id: "course-notes".to_string(),
            title: "Cell structure".to_string(),
            content: "## Mitochondria\n- Produce energy".to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-02T00:00:00.000Z".to_string(),
        });

        assert!(value.validate().is_ok());
        let encoded = serde_json::to_vec(&value).unwrap();
        let decoded = parse_data(&encoded, Path::new("notes.json")).unwrap();
        assert_eq!(decoded.notes[0].title, "Cell structure");
        assert_eq!(
            decoded.notes[0].content,
            "## Mitochondria\n- Produce energy"
        );

        value.notes[0].course_id = "missing-course".to_string();
        assert!(value.validate().is_err());
    }

    #[test]
    fn course_data_rejects_non_web_links() {
        let mut value = AppData::default();
        value.courses.push(super::Course {
            id: "course-1".to_string(),
            name: "Algorithms".to_string(),
            color: "#e58a9b".to_string(),
            folder: String::new(),
            additional_folders: Vec::new(),
            links: vec![super::CourseLink {
                title: "Unsafe".to_string(),
                url: "javascript:alert(1)".to_string(),
            }],
            apps: Vec::new(),
            resource_groups: Vec::new(),
            resource_assignments: Vec::new(),
            filing_keywords: Vec::new(),
            notes: String::new(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        });

        assert!(value.validate().is_err());
    }

    #[test]
    fn session_data_accepts_completed_and_early_session_records() {
        let mut value = AppData::default();
        value.courses.push(super::Course {
            id: "course-1".to_string(),
            name: "Algorithms".to_string(),
            color: "#e58a9b".to_string(),
            folder: String::new(),
            additional_folders: Vec::new(),
            links: Vec::new(),
            apps: Vec::new(),
            resource_groups: Vec::new(),
            resource_assignments: Vec::new(),
            filing_keywords: Vec::new(),
            notes: String::new(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        });
        value.sessions.push(super::StudySession {
            id: "session-1".to_string(),
            course_id: "course-1".to_string(),
            started_at: "2026-01-01T00:00:00.000Z".to_string(),
            planned_sec: 1500,
            actual_sec: 1500,
            completed: true,
            count_up: false,
            summary: Some("Finished the practice problems.".to_string()),
        });
        value.sessions.push(super::StudySession {
            id: "session-2".to_string(),
            course_id: "deleted-course".to_string(),
            started_at: "2026-01-02T00:00:00.000Z".to_string(),
            planned_sec: 3000,
            actual_sec: 45,
            completed: false,
            count_up: false,
            summary: None,
        });

        assert!(value.validate().is_ok());
        let encoded = serde_json::to_vec(&value).unwrap();
        let decoded = parse_data(&encoded, Path::new("session-summaries.json")).unwrap();
        assert_eq!(
            decoded.sessions[0].summary.as_deref(),
            Some("Finished the practice problems.")
        );
    }

    #[test]
    fn session_data_rejects_invalid_duration_records() {
        let mut value = AppData::default();
        value.courses.push(super::Course {
            id: "course-1".to_string(),
            name: "Algorithms".to_string(),
            color: "#e58a9b".to_string(),
            folder: String::new(),
            additional_folders: Vec::new(),
            links: Vec::new(),
            apps: Vec::new(),
            resource_groups: Vec::new(),
            resource_assignments: Vec::new(),
            filing_keywords: Vec::new(),
            notes: String::new(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        });
        value.sessions.push(super::StudySession {
            id: "session-1".to_string(),
            course_id: "course-1".to_string(),
            started_at: "2026-01-01T00:00:00.000Z".to_string(),
            planned_sec: 1500,
            actual_sec: 1501,
            completed: false,
            count_up: false,
            summary: None,
        });

        assert!(value.validate().is_err());
    }

    #[test]
    fn stopwatch_sessions_store_elapsed_time_without_a_countdown_plan() {
        let mut value = AppData::default();
        value.courses.push(super::Course {
            id: "course-1".to_string(),
            name: "Algorithms".to_string(),
            color: "#e58a9b".to_string(),
            folder: String::new(),
            additional_folders: Vec::new(),
            links: Vec::new(),
            apps: Vec::new(),
            resource_groups: Vec::new(),
            resource_assignments: Vec::new(),
            filing_keywords: Vec::new(),
            notes: String::new(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        });
        value.sessions.push(super::StudySession {
            id: "session-stopwatch".to_string(),
            course_id: "course-1".to_string(),
            started_at: "2026-01-01T00:00:00.000Z".to_string(),
            planned_sec: 0,
            actual_sec: 61,
            completed: false,
            count_up: true,
            summary: None,
        });

        assert!(value.validate().is_ok());
        let encoded = serde_json::to_vec(&value).unwrap();
        let decoded = parse_data(&encoded, Path::new("stopwatch.json")).unwrap();
        assert!(decoded.sessions[0].count_up);
        assert_eq!(decoded.sessions[0].actual_sec, 61);
    }

    #[test]
    fn tasks_are_persisted_and_validated_with_their_course() {
        let mut value = AppData::default();
        value.courses.push(super::Course {
            id: "course-1".to_string(),
            name: "Biology".to_string(),
            color: "#e58a9b".to_string(),
            folder: String::new(),
            additional_folders: Vec::new(),
            links: Vec::new(),
            apps: Vec::new(),
            resource_groups: Vec::new(),
            resource_assignments: Vec::new(),
            filing_keywords: Vec::new(),
            notes: String::new(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        });
        value.tasks.push(super::StudyTask {
            id: "task-1".to_string(),
            course_id: "course-1".to_string(),
            title: "Review lecture notes".to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            completed: false,
        });

        assert!(value.validate().is_ok());
        let encoded = serde_json::to_vec(&value).unwrap();
        let decoded = parse_data(&encoded, Path::new("test.json")).unwrap();
        assert_eq!(decoded.tasks.len(), 1);
        assert_eq!(decoded.tasks[0].title, "Review lecture notes");
    }

    #[test]
    fn resource_groups_and_assignments_are_validated_and_persisted() {
        let mut value = AppData::default();
        value.courses.push(super::Course {
            id: "course-1".to_string(),
            name: "Biology".to_string(),
            color: "#e58a9b".to_string(),
            folder: "/study/biology".to_string(),
            additional_folders: vec!["/study/labs".to_string()],
            links: vec![super::CourseLink {
                title: "Portal".to_string(),
                url: "https://school.example/biology".to_string(),
            }],
            apps: vec!["/study/lecture.mp4".to_string()],
            resource_groups: vec![
                super::ResourceGroup {
                    id: "group-default".to_string(),
                    name: "Unsorted".to_string(),
                },
                super::ResourceGroup {
                    id: "group-lectures".to_string(),
                    name: "Lectures".to_string(),
                },
            ],
            resource_assignments: vec![super::ResourceAssignment {
                kind: "file".to_string(),
                target: "/study/lecture.mp4".to_string(),
                group_id: "group-lectures".to_string(),
            }],
            filing_keywords: Vec::new(),
            notes: String::new(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        });

        assert!(value.validate().is_ok());
        let encoded = serde_json::to_vec(&value).unwrap();
        let decoded = parse_data(&encoded, Path::new("resource-groups.json")).unwrap();
        assert_eq!(decoded.courses[0].additional_folders.len(), 1);
        assert_eq!(decoded.courses[0].resource_groups.len(), 2);
        assert_eq!(
            decoded.courses[0].resource_assignments[0].group_id,
            "group-lectures"
        );

        value.courses[0].resource_assignments[0].target = "/missing/file".to_string();
        assert!(value.validate().is_err());
    }

    #[test]
    fn course_notes_accept_unicode_within_the_character_limit() {
        let mut value = AppData::default();
        value.courses.push(super::Course {
            id: "course-1".to_string(),
            name: "Languages".to_string(),
            color: "#e58a9b".to_string(),
            folder: String::new(),
            additional_folders: Vec::new(),
            links: Vec::new(),
            apps: Vec::new(),
            resource_groups: Vec::new(),
            resource_assignments: Vec::new(),
            filing_keywords: Vec::new(),
            notes: "学".repeat(10_000),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        });

        assert!(value.validate().is_ok());
    }

    #[test]
    fn old_data_without_tasks_remains_loadable() {
        let contents = br#"{"schemaVersion":1,"courses":[],"sessions":[],"settings":{"defaultLengthSec":1500,"theme":"system","tourDone":false,"reducedMotion":false,"notifications":true}}"#;
        let decoded = parse_data(contents, Path::new("legacy.json")).unwrap();

        assert!(decoded.tasks.is_empty());
        assert!(decoded.settings.sound_effects);
    }

    #[test]
    fn older_countdown_sessions_without_count_up_flag_remain_loadable() {
        let contents = br#"{"schemaVersion":1,"courses":[],"sessions":[{"id":"session-1","courseId":"course-1","startedAt":"2026-01-01T00:00:00.000Z","plannedSec":1500,"actualSec":600,"completed":false,"summary":null}],"settings":{"defaultLengthSec":1500,"theme":"system","tourDone":false,"reducedMotion":false,"notifications":true}}"#;
        let decoded = parse_data(contents, Path::new("legacy-session.json")).unwrap();

        assert!(!decoded.sessions[0].count_up);
    }

    #[test]
    fn older_courses_without_resource_library_fields_remain_loadable() {
        let contents = br##"{"schemaVersion":1,"courses":[{"id":"course-1","name":"Biology","color":"#e58a9b","folder":"/study/biology","links":[],"apps":[],"notes":"","createdAt":"2026-01-01T00:00:00.000Z"}],"sessions":[],"settings":{"defaultLengthSec":1500,"theme":"system","tourDone":false,"reducedMotion":false,"notifications":true}}"##;
        let decoded = parse_data(contents, Path::new("legacy-course.json")).unwrap();

        assert!(decoded.courses[0].additional_folders.is_empty());
        assert!(decoded.courses[0].resource_groups.is_empty());
        assert!(decoded.courses[0].resource_assignments.is_empty());
    }

    #[test]
    fn rejects_unknown_schema_versions() {
        let contents = br#"{"schemaVersion":2,"courses":[],"sessions":[],"settings":{"defaultLengthSec":1500,"theme":"system","tourDone":false,"reducedMotion":false,"notifications":true}}"#;

        assert!(parse_data(contents, Path::new("test.json")).is_err());
    }
}
