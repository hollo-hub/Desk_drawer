# Desk Drawer Study v2

Desk Drawer Study is a local-first study workspace for Windows. It reduces the
start-of-session friction of opening a course folder, finding resources,
remembering the next task, opening notes, and starting a timer across several
applications.

The v2 direction is a **cozy 16-bit study console**: a practical workspace
with a recognizable retro identity, a pixel Desk Buddy, a calm timer, and
short paths to useful study actions. It should feel deliberately designed,
not like a generic AI productivity dashboard.

## What changed in v2

### New-user experience

- The first launch is empty. There are no demo courses, notes, tasks, files,
  links, or fake study history.
- A named course is the only required starting point. Folders, links, files,
  videos, notes, tasks, and resource groups are all optional.
- A one-time interactive guide highlights the actual controls in the app.
  Spotlighted controls remain usable while the guide is open.
- The guide can be skipped or finished and does not repeatedly interrupt the
  user.
- Clicking the Desk Drawer brand returns to the Desk page.
- The primary ten-second action is: choose a course, start the session, and
  open the course study kit.

### Desk Buddy

- Replaced the previous cat placeholder with an original pixel ghost buddy.
- The buddy uses crisp nearest-neighbor rendering and a generated 16x16 SVG
  sprite in [`src/buddy/ghost-sprite.js`](./src/buddy/ghost-sprite.js).
- Supported states:
  - `idle`: open eyes, gentle bob, alternating hem frame, and occasional blink
  - `blink`: brief closed-eye frame
  - `focus`: focused expression and calm breathing during a session
  - `done`: happy expression and completion hops
  - `nudge`: concerned expression for an untouched course
  - `paused`: still, faded presentation
- The buddy has ten short idle messages. They are shuffled into a bag so lines
  do not repeat until the set is exhausted.
- Idle messages never overwrite focus, paused, done, or nudge messages.
- The speech bubble bounces briefly when its message changes.
- The bubble is a polite live region; the sprite itself is decorative and
  `aria-hidden`.
- The buddy uses lavender by default, with mint, coral, and sunny coat
  variants where a course color maps to them.
- Reduced-motion preferences disable bobbing, blinking, hem-frame movement,
  hops, and bubble motion while preserving the state and message.
- The decorative cube platform was removed. The buddy now stands alone with a
  small shadow and the timer halo.

### Focus timer

- Stopwatch mode starts at `00:00` and counts upward from timestamp data.
- Countdown presets include 25 minutes and 50 minutes.
- Custom countdowns accept whole minutes from 1 through 180.
- Timer accuracy is based on timestamps rather than animation frames, so it
  remains correct when the window is minimized.
- Pause freezes elapsed stopwatch time or remaining countdown time.
- Resume continues from the frozen value.
- Sessions shorter than the minimum recording threshold are not saved.
- Completed and ended-early sessions are saved to History.
- The native window title reflects the running, paused, or completed state.
- The course-colored halo starts full when a session begins.
  - Countdown mode shortens the ring with remaining time.
  - Stopwatch mode fades the ring over the selected focus length.
  - Pause freezes the ring.
  - Ending a session hides and resets the ring.

### Course workspace

- Courses can be created, renamed, selected, and deleted.
- The last remaining course cannot be deleted accidentally.
- Course resources are optional and remain at their original paths.
- A course can contain:
  - One primary folder
  - Additional folders
  - HTTP(S) links
  - Files and applications
  - Video files
  - Resource groups
  - Resource assignments
- Resources open through validated native commands and registered desktop
  applications.
- Invalid links, missing paths, and failed launches show explicit errors.
- Resource groups organize folders, files, and links without copying them.
- Older resources migrate into an Unsorted group.

### Notes

- Notes are a dedicated page rather than a single course text field.
- Each course can contain multiple titled Markdown notes.
- Notes can be searched by title or body.
- The editor includes formatting insertion helpers.
- Notes show character counts and edit dates.
- Existing legacy course notes migrate into the notebook without losing text.
- Autosave is local and quiet during successful writes.
- Save failures remain visible and explain what went wrong.

### Tasks

- Tasks are lightweight, course-scoped checklist items.
- Tasks can be added, completed, and removed.
- The next unfinished task can appear as a Desk shortcut.
- Completion state is persisted locally.

### History and statistics

- Session History records course, start time, planned length, actual duration,
  completion state, stopwatch/countdown mode, and optional reflection.
- The session is recorded before the optional reflection prompt appears.
- Weekly statistics show this week and last week.
- Week boundaries use local Monday midnight.
- Study streaks count distinct consecutive local calendar days.

### Personalization and settings

- Appearance supports system, light, and dark modes.
- The settings control is a gear with a rotation interaction.
- Notifications can be enabled or disabled.
- Interface sounds can be enabled or disabled.
- Dashboard components can be shown or hidden.
- Downloads filing is optional and disabled by default.
- The first-run guide is stored as completed after Skip or Finish.
- Reduced motion follows the operating system preference and is not exposed as
  a redundant user-facing setting.
- The interface prevents accidental selection and dragging of non-editable UI
  text while preserving selection in inputs, textareas, and note content.

## Retro visual direction

### Core idea

Desk Drawer Study should look like a **cozy 16-bit study console**: part
retro desktop utility, part personal notebook, and part calm study game.
Retro styling should clarify the product identity without making core actions
slower or turning Notes into a toy.

### Avoid

- Glassmorphism and frosted-card-heavy layouts
- Generic AI dashboard styling
- Large decorative gradients
- Excessive floating cards and pill controls
- Constant background motion
- Pixel fonts for long-form reading
- Game mechanics that make starting a session slower

### Proposed visual tokens

These are starting values for creative review, not final approvals:

```text
Ink / border       #25233A
Warm paper         #F5EBDD
Lavender panel     #C9C4E8
Coral accent       #E58A9B
Teal accent        #5FB3A8
Amber highlight    #E2B25C
Muted text         #62657F
Error              #A52F49
```

The final palette should stay compact. Every color needs a role, a contrast
check, and a light/dark equivalent. Color must not be the only indication of
selection, completion, warning, or error.

### Typography

- A bitmap or pixel font may be used for the timer, small labels, and
  decorative headings.
- A readable system or humanist sans-serif should remain available for Notes,
  settings, errors, and long descriptions.
- The creative team must provide the final font files and licenses.

### Shape and component direction

- Prefer square or minimally rounded panels.
- Use deliberate borders and restrained hard shadows.
- Make the Start action the strongest visual control.
- Keep the course dock compact and scannable.
- Use retro styling for the Notes toolbar and surrounding chrome, not at the
  expense of editor readability.
- Resources may use a file-manager, shortcut, or inventory metaphor.
- Tasks may use a checklist or quest-list metaphor without requiring game rules.
- The first-run guide should feel like built-in software help, not an AI
  assistant.

The full creative handoff is in
[`docs/06-retro-style-brief.md`](./docs/06-retro-style-brief.md).

## Accessibility and behavior requirements

- Keyboard-reachable controls with visible focus states
- Timer exposed with a timer role and accessible labels
- Buddy messages announced through a polite live region
- Editable text remains selectable
- Reduced-motion behavior removes non-essential motion
- Minimum readable text size of 12px for interface copy
- Contrast checks for light and dark themes
- Color is never the only status signal
- Errors explain what happened and what the user can do next
- Sound is optional and never required to understand an action

## Local-first and privacy model

- No account is required.
- No telemetry is collected.
- No cloud service is required for core use.
- Courses, notes, tasks, settings, and sessions are stored in the local app
  data directory.
- Writes use a temporary file and replacement strategy to reduce corruption
  risk, with a backup copy.
- URLs are restricted to `http` and `https`.
- Native resource paths are validated before opening.
- Desk Drawer Study stores file references, not copies of user files.
- Downloads filing never deletes or overwrites files; it requires explicit
  confirmation and supports undo.
- Future Google Drive or Google Calendar integration must be opt-in and must
  preserve offline local use.

## Technical structure

| Area | Responsibility |
|---|---|
| `index.html` | Semantic application shell and page structure |
| `src/main.js` | UI state, navigation, rendering, timer, persistence calls, guide, buddy behavior |
| `src/style.css` | Layout, themes, retro-ready tokens, motion, responsive states, accessibility |
| `src/buddy/ghost-sprite.js` | Pure pixel ghost SVG generator |
| `src/course-model.js` | Course validation and course operations |
| `src/note-model.js` | Note creation, migration, update, and search |
| `src/resource-model.js` | Resource groups and assignments |
| `src/task-model.js` | Course task operations |
| `src/stats-model.js` | Weekly totals and streak calculations |
| `src/timer-model.js` | Timestamp-based elapsed, remaining, and halo calculations |
| `src-tauri/src/data.rs` | Persisted data model and local storage |
| `src-tauri/src/launch.rs` | Validated folder, file, app, and link launching |
| `src-tauri/src/downloads.rs` | Optional Downloads filing and undo support |
| `tests/` | Frontend model, timer, buddy, notes, and statistics tests |
| `docs/` | Product, UX, testing, buddy, and creative direction documents |

## Validation completed

The v2 app has been checked with:

- Frontend tests: 25 passing
- Vite production build
- Rust formatting check
- Rust unit tests
- Cargo check
- `git diff --check`
- Windows GitHub Actions build
- Windows NSIS installer artifact verification
- Published installer checksum comparison against the build artifact

## Release and source layout

- The private source repository is [`hollo-hub/Desk_drawer`](https://github.com/hollo-hub/Desk_drawer).
- The study workspace lives separately at `study-workspace/` so it does not
  replace the main Desk Drawer utility app.
- The public repository is [`hollo-hub/Desk_drawer-downloads`](https://github.com/hollo-hub/Desk_drawer-downloads).
- The public repository contains release notes and installers, not source code.
- The v2.0.0 Windows installer is available from the
  [Desk Drawer Study release](https://github.com/hollo-hub/Desk_drawer-downloads/releases/tag/v2.0.0).
- The source branch is `desk-drawer-study-v2`.
- The Windows release workflow is
  `.github/workflows/study-workspace-release.yml`.
- A `study-vX.Y.Z` tag runs frontend tests, Rust checks, the Windows build, and
  uploads the installer as an Actions artifact.

## Future v2.1 direction

Google account integration is possible, but it should be optional and
permission-scoped:

- Google OAuth sign-in should be explicit and cancellable.
- Core use must continue to work offline without an account.
- The first integration should likely be Google Drive backup/sync for selected
  courses, notes, and tasks.
- Google Calendar should be a separate opt-in feature with clear rules for
  creating, updating, and deleting events.
- Tokens must be stored using the platform credential system, never in the
  study JSON file.
- Sync conflicts, offline edits, disconnect, account deletion, and data export
  need product decisions before implementation.

## Mobile direction

A mobile version is feasible as a later phase, but it should be a focused
companion rather than a feature-for-feature desktop port.

Good first mobile features:

- Courses
- Notes
- Tasks
- Stopwatch and countdown
- Buddy
- Basic history and stats

Desktop-only features require mobile alternatives:

- Folder and file pickers
- Opening desktop applications
- Tray controls
- Downloads filing
- Local absolute file paths

Android is the easiest first target for validation. iOS is possible but
requires Apple signing and a macOS build environment. Cross-device sync should
be designed with the optional account integration rather than assumed.

## Creative handoff required before a visual rewrite

The creative team should return:

1. One approved visual direction sentence
2. Five to ten reference images with notes on what each contributes
3. Light and dark palettes with contrast checks
4. Display and body fonts with licenses
5. Button, panel, border, shadow, and focus examples
6. Final buddy dimensions, states, frames, and palette
7. A Desk sketch showing the primary Start action
8. A Notes sketch showing a real writing session
9. A mobile layout sketch
10. Motion and sound timing rules
11. A list of visual elements explicitly rejected

The most important outcome is a style contract: palette, type, shapes, buddy
direction, motion rules, sound rules, and examples of what the team considers
“too AI-looking.”

## License

Desk Drawer Study is proprietary software by hollo-hub. Third-party assets
retain their own licenses. The included interface sound license is in
[`public/sounds/LICENSE.txt`](./public/sounds/LICENSE.txt).
