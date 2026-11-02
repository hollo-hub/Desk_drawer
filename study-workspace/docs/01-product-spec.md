# Product spec

**One sentence:** a personalized study dashboard that gets a course’s study kit—files, folders, links, next tasks, notes, and timer—ready in one action, with a pixel character that makes the space feel yours.

**User:** university students, first user is the builder. **Platform:** Windows, Tauri 2 (Rust backend, web frontend), local-only, no accounts, no network.

**Defining 10-second outcome:** open Desk Drawer, choose a course, and start; the course’s folder, pinned files (including videos), links, and apps open while the timer starts. Capture a next step or a note without leaving the study workspace.

**Problem:** every study session starts with several clicks across folders, tabs, and files, then drifting. Desk Drawer removes that setup, keeps course tasks and notes close, and adds a light reason to stay.

## Non-goals
Password or secret storage. Clipboard history. Window layouts. Colour picker, keep-awake, pin window (PowerToys does these). Cloud sync. Mobile app. Accounts.

## Data model (schema version 1)
- **Course:** id, name, color, folder (path), additionalFolders [path], links [{title, url}], apps/files [path], resourceGroups [{id, name}], resourceAssignments [{kind, target, groupId}], legacy notes (text), createdAt
- **Note:** id, courseId, title, content (Markdown text), createdAt, updatedAt
- **Session:** id, courseId, startedAt, plannedSec (zero for count-up), actualSec, completed (bool), countUp (bool, defaults false for old data), summary (optional text)
- **Task:** id, courseId, title, createdAt, completed (bool)
- **Settings:** defaultLengthSec, theme (system/light/dark), tourDone (bool), notifications (bool), soundEffects (bool)
- Stored as one JSON file in the app data directory with a `schemaVersion` field. Write to a temp file, then rename, so a crash cannot corrupt it. Keep one backup copy.

## Phase 1 (the thin slice)
| ID | Feature | Done when |
|---|---|---|
| P1-1 | Course add, edit, delete | Can create 3 courses, rename, delete; deleting the last course is blocked; data survives restart |
| P1-2 | Launch | Choose a course folder and files/apps with native pickers. Start opens the folder, links, and selected files in their registered apps (including video players); a missing resource shows a clear message and the session still starts |
| P1-3 | Timer | Starts with a 0-minute stopwatch; also supports 25, 50 and custom countdown lengths. Uses timestamps, stays correct when minimized, and supports pause/resume. |
| P1-4 | Halo | Constant-opacity ring around the cat shortens with time left and is gone at zero |
| P1-5 | Cat states | idle (bob, blink), focus (calm, eyes closed), done (hop, sparkles), nudge (course untouched 4+ days) |
| P1-6 | Session log | Completed and ended-early sessions saved; last 6 shown; weekly minutes per course |
| P1-7 | First-run guide | One-time interactive spotlight tour from `03-onboarding-tutorial.md`; highlighted controls remain usable; Skip ends the tour |
| P1-8 | Window | Normal window with minimise, maximise, close, resizable, remembers size and position; closing asks nothing |

## Phase 2
| ID | Feature | Done when |
|---|---|---|
| P2-1 | Notes and session summary | Dedicated course notebook with multiple titled, searchable Markdown notes, formatting insertion tools, and autosave. Existing course notes migrate without data loss. Offer an optional one-line reflection after a session, save it with that session, and show it in History. Ending the session is recorded before the optional prompt appears. Courses need a name but may have no folder, links, files, tasks, or notes. |
| P2-2 | Tasks | Lightweight per-course task capture, completion, and next-step visibility from the desk |
| P2-3 | Resource library | Add, open, remove, and organize course folders, links, and files (including videos) into groups; legacy resources appear in Unsorted; resources remain in place |
| P2-4 | Workspace personalization | Choose appearance and organize dashboard components; pixel character states and interactions respond to real study activity |
| P2-5 | Weekly stats | Hours per course this week and last week; week resets Monday 00:00 local |
| P2-6 | Download filing | Watches Downloads; suggests a course by filename rule; user confirms; move is undoable for 10 minutes |
| P2-7 | Notifications and tray | Session end notification; tray icon with start, pause and quit; app keeps timing when the window is closed to tray |

## Phase 3 (only if used daily)
Opt-in Notion/ChatGPT integrations with clear permissions and no stored passwords, Pomodoro breaks with the cat, exam countdown per course, exportable study log, cat cosmetics from total study time.

## Security and privacy rules
- Validate every URL: only `http` and `https`. Never run a path as a command; open only user-defined folders, files and apps via the Tauri opener.
- Scope Tauri capabilities to exactly what is used. No broad filesystem access.
- Download filing moves files only after confirmation, never deletes, never overwrites (rename on conflict).
- No telemetry. Say so in the README.
- External integrations must be explicit and opt-in; keep the core workspace useful offline and local-first.

## Success and kill rule
Use it yourself for two weeks. Opened on most study days: continue to Phase 2 and Phase 3. Not opened: stop, keep it as a finished portfolio project.
