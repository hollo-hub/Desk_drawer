use crate::data::Course;
use serde::Serialize;
use std::path::{Path, PathBuf};
use url::Url;

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchReport {
    pub folder_opened: bool,
    pub links_opened: usize,
    pub apps_opened: usize,
    pub failures: Vec<LaunchFailure>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchFailure {
    pub kind: String,
    pub target: String,
    pub reason: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum OpenTarget {
    Path(PathBuf),
    Url(Url),
}

pub fn open_course(course: &Course) -> LaunchReport {
    open_course_with(course, |target| match target {
        OpenTarget::Path(path) => {
            tauri_plugin_opener::open_path(path, None::<&str>).map_err(|error| error.to_string())
        }
        OpenTarget::Url(url) => tauri_plugin_opener::open_url(url.as_str(), None::<&str>)
            .map_err(|error| error.to_string()),
    })
}

pub fn open_resource(kind: &str, target: &str) -> Result<(), String> {
    let target = resolve_resource(kind, target)?;
    match target {
        OpenTarget::Path(path) => {
            tauri_plugin_opener::open_path(path, None::<&str>).map_err(|error| error.to_string())
        }
        OpenTarget::Url(url) => tauri_plugin_opener::open_url(url.as_str(), None::<&str>)
            .map_err(|error| error.to_string()),
    }
}

fn resolve_resource(kind: &str, target: &str) -> Result<OpenTarget, String> {
    match kind {
        "folder" => {
            let path = Path::new(target);
            if !path.is_absolute() || !path.is_dir() {
                return Err("The folder does not exist or is not an absolute path.".to_string());
            }
            Ok(OpenTarget::Path(path.to_path_buf()))
        }
        "file" => {
            let path = Path::new(target);
            if !path.is_absolute() || !path.is_file() {
                return Err("The file does not exist or is not an absolute path.".to_string());
            }
            Ok(OpenTarget::Path(path.to_path_buf()))
        }
        "link" => validate_web_url(target).map(OpenTarget::Url),
        _ => Err("The resource type is not supported.".to_string()),
    }
}

fn open_course_with(
    course: &Course,
    mut open_target: impl FnMut(&OpenTarget) -> Result<(), String>,
) -> LaunchReport {
    let mut report = LaunchReport::default();

    let mut seen_folders = std::collections::HashSet::new();
    for folder_path in std::iter::once(course.folder.as_str())
        .chain(course.additional_folders.iter().map(String::as_str))
        .filter(|folder| !folder.trim().is_empty())
        .filter(|folder| seen_folders.insert(*folder))
    {
        let folder = Path::new(folder_path);
        if !folder.is_absolute() || !folder.is_dir() {
            report.failures.push(LaunchFailure {
                kind: "folderMissing".to_string(),
                target: folder_path.to_string(),
                reason: "The folder does not exist or is not an absolute path.".to_string(),
            });
        } else if let Err(reason) = open_target(&OpenTarget::Path(folder.to_path_buf())) {
            report.failures.push(LaunchFailure {
                kind: "folderOpen".to_string(),
                target: folder_path.to_string(),
                reason,
            });
        } else {
            report.folder_opened = true;
        }
    }

    for link in &course.links {
        let url = match validate_web_url(&link.url) {
            Ok(url) => url,
            Err(reason) => {
                report.failures.push(LaunchFailure {
                    kind: "linkInvalid".to_string(),
                    target: link.url.clone(),
                    reason,
                });
                continue;
            }
        };

        if let Err(reason) = open_target(&OpenTarget::Url(url)) {
            report.failures.push(LaunchFailure {
                kind: "linkOpen".to_string(),
                target: link.url.clone(),
                reason,
            });
        } else {
            report.links_opened += 1;
        }
    }

    for app in &course.apps {
        let path = Path::new(app);
        if !path.is_absolute() || !path.is_file() {
            report.failures.push(LaunchFailure {
                kind: "appMissing".to_string(),
                target: app.clone(),
                reason: "The app path does not exist or is not an absolute file path.".to_string(),
            });
        } else if let Err(reason) = open_target(&OpenTarget::Path(path.to_path_buf())) {
            report.failures.push(LaunchFailure {
                kind: "appOpen".to_string(),
                target: app.clone(),
                reason,
            });
        } else {
            report.apps_opened += 1;
        }
    }

    report
}

fn validate_web_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "The link is not a valid web URL.".to_string())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(
            "Only http:// and https:// links without embedded credentials are allowed.".to_string(),
        );
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::{open_course_with, resolve_resource, validate_web_url, LaunchReport, OpenTarget};
    use crate::data::{Course, CourseLink};
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "desk-drawer-launch-test-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn course(folder: String, links: Vec<&str>, apps: Vec<String>) -> Course {
        Course {
            id: "test-course".to_string(),
            name: "Test course".to_string(),
            color: "#e58a9b".to_string(),
            folder,
            additional_folders: Vec::new(),
            links: links
                .into_iter()
                .map(|url| CourseLink {
                    title: url.to_string(),
                    url: url.to_string(),
                })
                .collect(),
            apps,
            resource_groups: Vec::new(),
            resource_assignments: Vec::new(),
            filing_keywords: Vec::new(),
            notes: String::new(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn allows_only_public_http_and_https_urls() {
        assert!(validate_web_url("https://example.com/course").is_ok());
        assert!(validate_web_url("http://example.com").is_ok());
        assert!(validate_web_url("javascript:alert(1)").is_err());
        assert!(validate_web_url("file:///etc/passwd").is_err());
        assert!(validate_web_url("https://user:secret@example.com").is_err());
    }

    #[test]
    fn resolves_only_existing_resource_paths_and_public_web_links() {
        let directory = TestDirectory::new();
        let file = directory.0.join("notes.pdf");
        fs::write(&file, "notes").unwrap();

        assert!(matches!(
            resolve_resource("folder", directory.0.to_str().unwrap()),
            Ok(OpenTarget::Path(path)) if path == directory.0
        ));
        assert!(matches!(
            resolve_resource("file", file.to_str().unwrap()),
            Ok(OpenTarget::Path(path)) if path == file
        ));
        assert!(matches!(
            resolve_resource("link", "https://example.com"),
            Ok(OpenTarget::Url(_))
        ));
        assert!(resolve_resource("folder", file.to_str().unwrap()).is_err());
        assert!(resolve_resource("file", directory.0.to_str().unwrap()).is_err());
        assert!(resolve_resource("link", "javascript:alert(1)").is_err());
        assert!(resolve_resource("app", file.to_str().unwrap()).is_err());
    }

    #[test]
    fn opens_each_valid_resource_and_continues_after_individual_failures() {
        let directory = TestDirectory::new();
        let folder = directory.0.join("course");
        fs::create_dir(&folder).unwrap();
        let resource_folder = directory.0.join("lectures");
        fs::create_dir(&resource_folder).unwrap();
        let app_path = directory.0.join("editor.txt");
        fs::write(&app_path, "file").unwrap();
        let video_path = directory.0.join("lecture.mp4");
        fs::write(&video_path, "video").unwrap();
        let mut course = course(
            folder.to_string_lossy().into_owned(),
            vec![
                "https://example.com",
                "javascript:alert(1)",
                "http://example.org",
            ],
            vec![
                app_path.to_string_lossy().into_owned(),
                video_path.to_string_lossy().into_owned(),
                directory
                    .0
                    .join("missing-app")
                    .to_string_lossy()
                    .into_owned(),
            ],
        );
        course.additional_folders = vec![
            folder.to_string_lossy().into_owned(),
            resource_folder.to_string_lossy().into_owned(),
        ];
        let mut opened = Vec::new();
        let report = open_course_with(&course, |target| {
            opened.push(target.clone());
            Ok(())
        });

        assert!(report.folder_opened);
        assert_eq!(report.links_opened, 2);
        assert_eq!(report.apps_opened, 2);
        assert_eq!(report.failures.len(), 2);
        assert_eq!(report.failures[0].kind, "linkInvalid");
        assert_eq!(report.failures[1].kind, "appMissing");
        assert_eq!(opened.len(), 6);
        assert!(matches!(opened.first(), Some(OpenTarget::Path(path)) if path == &folder));
        assert!(matches!(opened.get(1), Some(OpenTarget::Path(path)) if path == &resource_folder));
        assert!(opened.iter().any(|target| matches!(
            target,
            OpenTarget::Path(path)
                if path.extension().and_then(|extension| extension.to_str()) == Some("mp4")
        )));
    }

    #[test]
    fn reports_a_missing_folder_without_blocking_valid_links() {
        let course = course(
            "/folder/that/does/not/exist".to_string(),
            vec!["https://example.com"],
            Vec::new(),
        );
        let mut opened = Vec::new();
        let report = open_course_with(&course, |target| {
            opened.push(target.clone());
            Ok(())
        });

        assert_eq!(report.failures.len(), 1);
        assert_eq!(report.failures[0].kind, "folderMissing");
        assert_eq!(report.links_opened, 1);
        assert_eq!(opened.len(), 1);
        assert!(matches!(opened.first(), Some(OpenTarget::Url(_))));
    }

    #[test]
    fn records_opener_errors_and_continues_opening_remaining_links() {
        let course = course(
            String::new(),
            vec!["https://example.com", "https://example.org"],
            Vec::new(),
        );
        let mut attempts = 0;
        let report: LaunchReport = open_course_with(&course, |_| {
            attempts += 1;
            if attempts == 1 {
                Err("No default browser is configured.".to_string())
            } else {
                Ok(())
            }
        });

        assert_eq!(attempts, 2);
        assert_eq!(report.links_opened, 1);
        assert_eq!(report.failures.len(), 1);
        assert_eq!(report.failures[0].kind, "linkOpen");
        assert!(report.failures[0]
            .reason
            .contains("No default browser is configured"));
    }
}
