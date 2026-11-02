# V3 implementation decisions

## Starting point and version control

The supplied project is a GitHub archive, not a clone: it has no `.git` directory or recoverable commit history. A local baseline commit records that exact starting snapshot; it does not claim to reconstruct or replace upstream history. Feature commits are made separately, and nothing is pushed.

## Data safety and ownership

- Keep all new study-only records under `appData.study.courses[courseId]`: sources and chapters, exam date, weekly goal, review questions, and recall history.
- Keep existing notes and tasks in their V2 stores, keyed by their existing `courseId`. They remain the canonical records; duplicating them into `study` would introduce competing copies and risk losing edits. The optional V2 task `dueAt` field remains additive.
- Treat study data as optional and preserve unknown fields. Do not remove or rewrite existing course, note, task, or session data during load. Continue using the Rust save path's backup-before-replacement behavior, and test a saved V2 fixture through a load/serialize round trip.
- Save picked calendar dates as ISO timestamps at the end of that date in the user's local time. Use local calendar days for task groups and exam scheduling; do not reinterpret a date-only value as UTC midnight.
- Task groups are Overdue, Today, This week, Later, and No date. "This week" means the next seven local calendar days, including today. Completed tasks stay out of these groups.
- Keep task nudges inside the app. The existing notifications preference controls reminder nudges; it does not hide due dates or groups.

## Sources and recall

- Sources and chapters are course-scoped. A source may be a web link or an absolute local file/folder path; a chapter may optionally point to a different target.
- Opening a V3 source must require an exact match against the selected course's saved source/chapter record, then use the existing Rust path/URL validation and launcher. Do not allow arbitrary targets supplied by the webview.
- Recall is user-authored: no generated prompts. A session hides the source information in the app while the learner writes, then reveals it for comparison. An externally opened file or browser window cannot be hidden by the app; the UI asks the learner to close or minimize it before starting.
- Save each recall rating in history. A chapter counts toward progress only after a Yellow or Green recall; Red remains visible as an attempt but is not progress.
- A review question is optional, tied to its source/chapter, and uses the existing Leitner model and `dueReviews` ordering. An exam date caps the schedule at the day before the exam.

## Course hub, appearance, and shortcuts

- Course selection opens a focused course hub with one prominent action to begin the existing focus session. Keep the existing Desk, Resources, Notes, Tasks, Stats, and History experiences available and avoid redesigning them.
- The archive does not actually implement the Classic/Arc skin selector or command palette mentioned in the V3 acceptance criteria. The foundation patch's skin import pointed at a missing module. Add these as V3-only, opt-in surfaces instead of changing legacy page styling or inventing a dependency on the missing module.
- Support Classic, Arc, Mono, and Paper for the new V3 surfaces in light and dark mode. Default to Arc to match the supplied visual-check scenario, and honor its existing `dd-skin` localStorage test format if present.
- The palette opens with Ctrl/Cmd+K, provides a small set of direct, keyboard-accessible actions, and never starts a session or opens a source without an explicit user action.
- Respect keyboard focus, readable contrast, and reduced-motion preferences. Do not add a tutorial, accounts/sync, AI-generated questions, telemetry, icon redesign, statistics redesign, history search, or course-drawer theming.

## Course hub implementation

- Migrate older optional `study` values losslessly by keeping unrecognized root fields intact; persist the first additive study-data migration immediately through the existing backup-before-replacement save path.
- Save source records in each course's study record. Removal requires confirmation and also removes that source's chapters, recall history, and linked review questions. Chapter removal likewise confirms before deleting its review questions.
- Store the study-surface skin choice in `dd-study-skin`. Read the existing visual-check `{ "skin": "..." }` value in `dd-skin` as a compatibility fallback; the V2 appearance setting continues to control light/dark mode.
- Never save a learner's freeform recall answer. Save only its timestamp/rating and, when explicitly entered, the learner-authored optional review question.
- Start the recall timer when the source is hidden. Aim for about 15 minutes without imposing a timer lockout; learners may reveal and rate when they are ready.
- Keep review questions visible course by course and schedule every question with the existing Leitner model; do not generate prompts.
- Offer an explicit interleaved review action across courses with due questions. Reuse the existing next-course ordering, then open a selected saved question; never switch courses or start recall without the user's action.

## Acceptance evidence

Use the checked-in V2 screenshots and saved V2 data fixture as the comparison baseline. Extend the visual scenarios to cover the four skins and light/dark modes, and compare legacy pages as well as the new V3 surfaces. Record the exact test/build/screenshot results at release time; do not treat a successful V2-only build as V3 completion.
