# v3 foundation

Phase 0 of the v3 plan: make the app safe to build on. Nothing here changes what users see.

## What changed

1. **`src/main.js` is now an entry point.** The 2,259-line file was split with a scope-aware codemod
   into feature modules under `src/app/`. Behaviour is unchanged: the 24 screenshots and every backend
   call match the pre-split build (see `tools/visual-check`).
2. **Shared state lives in one object**, `appState` (`src/app/state.js`). Modules read and write
   `appState.selectedCourseId`, `appState.activeSession`, and so on instead of module-level variables.
3. **Rust keeps new data.** `AppData` gained a pass-through `study` field and `StudyTask` gained an
   optional `dueAt`. Both are optional, so existing files load unchanged, and files without v3 data
   are written exactly as before. Before this, any new field the frontend saved would have been dropped.
4. **A tested study engine** (`src/study/study-model.js`): Leitner boxes with three-level recall ratings,
   the doubling revision timetable, the recall grid, interleaving, and deadline-aware task grouping.

## Module map

| Module | Responsibility |
|---|---|
| `app/dom.js` | Element lookups and sounds (no logic) |
| `app/state.js` | The shared mutable state object |
| `app/workspace.js` | Loading data, rendering courses, page switching |
| `app/session.js` | Timer, sessions, pause, end, summary |
| `app/notes.js`, `tasks.js`, `history.js`, `stats.js` | One page each |
| `app/resources.js` | Folders, files, links, resource groups |
| `app/course-sheet.js` | The add/edit course drawer |
| `app/settings.js`, `guide.js`, `downloads.js` | Settings, onboarding tour, Downloads filing |
| `app/buddy.js` | The ghost's states and messages |
| `app/persistence.js` | Debounced saving and save status |
| `study/` | The v3 study engine |

## Rules for new code

- New features get a module in `src/app/` and pure logic in a model file with tests.
- Do not add module-level `let` variables; put shared state in `appState`.
- Rust changes must keep fields optional (`#[serde(default)]`) so old files keep loading.

## Not done yet

- Colors in `style.css` are still hardcoded; the skin layer overrides them.
- The new Rust code has tests (`study_data_and_task_due_dates_survive_a_round_trip` and
  `files_without_study_data_stay_unchanged`) but was written without a Rust toolchain. Run
  `cargo test` once before releasing.
- No v3 screens yet. Next: the course hub, sources, review sessions, and the lean tasks list.
