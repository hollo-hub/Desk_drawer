# Desk Drawer project handoff

Use this note with the root `AGENT_BRIEF.md`, `README.md`, and the supplied
master prompt at `C:\Users\pc\Desktop\gh\Desk Drawer v2 Master Prompt for the Coding Agent.docx`.

## Current baseline

- Repository: `C:\Users\pc\Desktop\gh\desk-drawer`
- Branch: `main`; baseline commit `9437df1` (`Add Behavior Lab editor and preferences`).
- Worktree changes are uncommitted. The handoff file
  `project-handoff/WHAT_REMAINS.md` is intentionally local-only.
- Preserve existing work; continue from this foundation. Do not commit or push
  without the user's request.

## Foundation and implemented stages

- **Stage 1 — modular desktop utility:** Tauri v2, module registry, clipboard,
  links, layouts, rename, break reminders, themes, tray, hotkey, autostart and
  single-instance behavior.
- **Stage 2 — Links and Clipboard:** typed/searchable clipboard history,
  pinning/expiry, safe link management and Windows-specific protections.
- **Stage 3 — Buddy engine:** code-drawn sprite sheet, animations, behavior
  rules, reactions, mood/personality foundation and tests.
- **Stage 4 — Behavior Lab and pack handling:** sample manifests, strict
  validation, `.deskpack` ZIP import/export, PNG/path/size checks, preview and
  install confirmation, plus persistent rules/sensor controls. Uncommitted
  activation changes now revalidate installed archives and apply validated
  pack sprite/personality/rules to the buddy. Native manual pack/settings
  verification remains outstanding.
- **Stage 5 — Desktop Roam:** the worktree adds a shared
  label-routed Tauri page, transparent non-focusable art and hitbox windows,
  work-area positioning, monitor/DPI sizing, drag/click/context-menu actions,
  optional local cursor-follow behavior, and visibility suppression for
  Windows lock, full-screen, presentation and quiet states. Roam is selectable
  and the user reports its native gate passed: focused-app typing and the
  other interaction checks were good; peak RAM 7.1 MB, CPU 0%, and 20 FPS
  awake / 2 FPS asleep. These figures are user-reported, not independently
  captured.
- **Stage 6 — Glass and customization:** the worktree cycles
  Cozy/Night/Glass, requests Windows Mica with a translucent CSS fallback and
  saved opacity, imports desk backgrounds and PNG/JPEG/WebP/GIF stickers,
  supports drop-to-add, drag/resize/delete, and persists bounded placements.
  Buddy skins use validated `.deskpack` imports. The user reports Stage 6 is
  all well; the Windows version and specific material/fallback checks were not
  recorded.
- **Stage 7 — Utilities implementation:** added toggleable Color Picker, Keep
  Awake, Pin Window, Scratch Notes, Focus Timer, Tidy Downloads and Scenes.
  The tools emit coarse events for buddy reactions; notes and scenes persist
  locally; scenes can open saved links/apps/folders, arrange a layout and start
  a focus timer. Tidy Downloads validates a full preview, refuses stale
  previews/collisions, and supports rollback and undo.
- **Stage 7 acceptance:** the user now reports it is all well. Earlier, the
  user noted an issue with Tidy Downloads and asked to defer adjustments until
  phase work is complete; no reproduction details or requested adjustment have
  been recorded, so keep that follow-up queued rather than guessing at a fix.
- **Stage 8 — Release preparation:** added MIT project license, pack author
  guide, contributor guide, README performance/status table with unmeasured
  values explicitly identified, GIF placeholders, and a GitHub Actions
  `v*`-tag Windows build/release workflow that runs frontend/Rust tests and
  verifies non-empty NSIS/MSI artifacts. Existing configured icon assets and
  the bundled Pixelify Sans OFL are retained.
- **Phase A / B1 — Settings foundation:** completed the UX audit in
  `docs/UX_AUDIT.md`, then added categorized Settings, name/description search,
  a Ctrl+K command palette, section resets for sections with saved preferences,
  a persisted animation master switch, and migration to preferences schema v6.
  Fresh installs now have modules and buddy sensors disabled; enabling either
  asks first in plain language. Existing saved module/sensor choices are
  preserved. Settings search and command-palette navigation were exercised in
  the shared browser preview. The updated native release app launched and was
  responsive, but native preference writes and consent-dialog actions still
  need interactive acceptance.
- **B2 — Developer mode:** added a schema v7 preference (off by default) and a
  Developer Settings page that is hidden unless enabled. It includes a coarse,
  allowlisted event inspector; behavior-rule decision traces and buddy
  snapshots; test events/state/clock controls; pack validation/reload; a
  bounded local developer log; Copy diagnostics; opening the data folder;
  module-specific reset actions; and an opt-in native process performance
  snapshot. No new package was added. WebView DevTools remain unavailable in
  release UI, and no Developer feature sends data over the network.
- **Stage 12.1 — Animation engine:** added a shared on-demand motion scheduler,
  fixed 1/120-second spring stepping with clamped frame deltas and state,
  centralized CSS motion tokens, and wired the desk/roaming buddy update loops
  through the registry. Reduced-motion/Eco policies cap buddy idle to 2 FPS and
  stop other registered effects; hidden documents pause and resume without
  catch-up. No dependency was added. Effect controls and persisted tuning were
  completed in the later 12.3–12.5 sections.
- **Stage 12.2 — Soft window physics:** Native remains the default and keeps
  Windows decorations. Added schema v8 `window_style` migration and a live
  Native/Soft choice. Soft removes decorations, uses a 24 px transparent margin,
  and provides app-controlled drag, resize edges, maximize, minimize, and close
  controls. Bounded spring transforms implement move-driven desk sway, scale
  recovery after resize, entrance, and hide-to-tray/restore. Reduced motion and
  the existing animation master switch bypass window motion. No package was
  added. Snap Layout hover affordance and multi-monitor/scaling interaction
  checks have not been verified.
- **Stage 12.3 — Interface animations:** Added schema v9 interface-motion
  settings and controls for slide/pop/instant drawer panels, Dock tab
  magnification, spring edge-scroll, Soft-only cursor tilt, reminder bounce,
  optional Windows taskbar attention, list exits, loading/empty states, and
  theme crossfade. Effects honor the master/reduced-motion/Eco policy, are
  cleared while hidden, and decorative transforms/fades are suppressed for
  Glass. List exit overlays are bounded to eight rows and transform/opacity
  only. Native visual interaction and performance were not measured.
- **Stage 12.4 — Buddy and desk animation:** Buddy state changes now blend
  through the prior sprite frame, with short idle-to-walk anticipation,
  walk-stop settle, and spring squash/stretch for pickup, drop, and pet. Stickers
  lift while dragged, wobble on drop, animate removal, and pop into place when
  newly added. A shared canvas particle pool emits sparkle on clipboard pin,
  hearts on pet, and dust on buddy landing, with a hard 30-particle cap and one
  scheduler registration while active. Desk packs can declare supported
  transitions and bounded anticipation/settle/impact/unlock timings; validation
  rejects unknown, duplicate, or out-of-range values. Optional effects stop
  with reduced motion, Eco policy, or Glass. No dependencies added.
- **Buddy state machine:** added the canonical idle, walking, sitting, sleeping,
  reacting, carried, falling, and hidden lifecycle states with checked
  transitions. User-authored behavior rules cannot hide the active desk buddy;
  hiding remains limited to module shutdown and OS safety for desktop roaming.
- **Updated creature resources:** the supplied `stuff 2` 57-frame Tabby,
  Midnight, and Snow sheets replace the placeholder art on first launch and
  are available as standalone validated packs. The `stuff 2.1` Lime, Aqua, and
  Berry Slime variants use the same frame/animation schema. Pack animation
  validation and rule playback now support all 27 supplied animations and
  canonical `setState` actions except hidden. Developer mode includes the
  sprite grid, animation playback, speed, flip, anchor/feet overlay, and missing/empty/
  feet-line checks. The world blocks were intentionally not imported because
  the Stage 14 world schema does not exist.
- **Buddy customization panel:** Settings > Buddy now switches installed packs,
  installs and activates all three Slime variants, and creates custom buddies
  from validated 32×32-grid PNG atlases with at least 57 frames. Custom packs
  consume the saved Behavior Lab rules, so rule edits apply to the selected
  custom buddy. Tabby pack v1.2 refreshes older installed Tabby art on startup
  without changing another selected pack.
- **Focus timer customization:** duration and text color are user-editable and
  saved in preferences schema v12+ (current v14); durations support 1 minute
  through 7 days, including hour-formatted long countdowns. Saved Scenes accept
  the same duration range.
- **Stage 12.5 — Animation settings and lab:** added schema-versioned animation
  settings, intensity, speed, stiffness, bounciness, and switches for Soft
  window, buddy, sticker, and particle effects. Settings persist through Rust
  schema v11 migration. Animation Lab previews use the shared spring engine;
  Developer mode has 0.1× slow motion, spring displacement/velocity graph,
  active-animation list, frame timing, dropped-frame count, and opt-in CPU/RAM
  overlay. No dependency was added.
- **Stage 12.6 — automated quality checks:** spring stability, settings clamps,
  motion-policy behavior, diagnostics, and state transitions have automated
  coverage. Native drag/hover/roam CPU and memory, display scaling, mixed-DPI,
  multi-monitor, and visual interruption testing still need to be measured on
  the target Windows machine; these measurements are not claimed as passed.
- **Stage 13.1 — Theme format:** Added a versioned `.desktheme` JSON validator,
  canonical color parser/serializer, strict field/effect/meta validation,
  external URL and CSS injection rejection, and a 50 KiB size limit. Format
  details and hostile-input tests are in `docs/THEME_FORMAT.md` and
  `tests/theme.test.js`.
- **Stage 13.2 — Built-in themes:** Added Cozy, Night, Transparent, Frost,
  Paper, Arcade, Forest, Savanna dusk, Terminal, and High contrast JSON files.
  `src/themes/index.js` validates them with the same validator used for user
  theme files. Transparent data has unfilled surfaces and text outline; Frost
  requests Mica; Terminal scanlines default off; High contrast uses 3 px
  borders. All ten themes are validated at startup and appear in the Appearance
  gallery/selectors; a built-in/user count is displayed above the gallery.
- **Stage 13.3–13.8 — Theme system:** implemented root token mapping, WCAG
  contrast checks and correction, live Appearance picker/editor, preference
  migrations and fixed-time scheduling, safe Frost/Transparent fallbacks, and
  ZIP `.desktheme` asset bundles. Bundle stickers can be added manually without
  automatically placing them. Theme switching no longer rebuilds the desk
  sticker layer. Developer mode's theme inspector lists resolved tokens,
  contrast outcomes, and synchronous apply duration. Current source passes
  48 frontend and 53 Rust tests; formatting and production frontend build pass,
  and the refreshed release executable is at `src-tauri/target/release/app.exe`.
  Native import/export,
  material/scaling fallback, layout-stability, and under-100 ms switching
  acceptance remain; no native performance result is claimed.
- **Buddy/Eco/font follow-up:** added schema v14 persistence/migration for Eco
  mode, independent Buddy movement/sprite-animation controls, and a
  theme-independent pixel/readable/monospace font override. Buddy can now be
  dragged both horizontally and vertically on the desk; autonomous movement
  respects its switch, while direct mouse interaction and visibility remain
  available. Latest source passes 48 frontend and 53 Rust tests; refreshed
  Windows app/installers were built and the app window smoke-launched. Native
  settings round-trips, drag feel, performance, and scaling remain unverified.
- **Supplied `gh/stuff` buddy resources:** Inspected the CC0 Tabby sprite pack,
  its three palettes, 12 animation definitions, preview art, and Python
  generator. Bundled Tabby, Midnight Cat, and Snow Cat as separate validated
  packs available from Behavior Lab; installed packs remain disabled until
  enabled by the user. Sprite playback honors manifest FPS and loop settings.
  The source author placeholder is not treated as attribution. The generator
  is not shipped or run, and the app executes no pack code.

## Verification on the current worktree

- `npm test`: 17 passed, including name/description search and opt-in module
  defaults.
- B2 `npm test`: 19 passed, including coarse event filtering, event-bus
  subscription, and behavior-rule trace coverage.
- Stage 12.1 `npm test`: 27 passed, including spring stability/settling,
  settings clamps, shared-loop idle/visibility behavior, and reduced-motion
  cadence.
- Stage 12.2 `npm test`: 27 passed; includes searching the new Window style
  setting by description.
- Stage 12.2 `cargo test --lib -j 1`: 38 passed, including schema v7 to v8
  migration and strict Native/Soft style validation.
- Stage 12.2 `cargo check --lib -j 1` and `cargo fmt -- --check`: passed.
- Stage 12.3 `npm test`: 30 passed, including drawer settings validation,
  Dock falloff and tilt bounds, and optional-motion policy.
- Stage 12.3 `cargo test --lib -j 1`: 40 passed, including schema v8→v9
  interface-motion defaults and drawer-style validation.
- Stage 12.3 `cargo check --lib -j 1`, `cargo fmt -- --check`, and frontend
  production build: passed.
- Stage 12.4 `npm test`: 32 passed, including particle pool cap/registration and
  pack transition/timing validation; `npm run build`: passed.
- Stage 12.4 `cargo test --lib -j 1`: 40 passed; Rust check and format passed.
- Latest Buddy customization update: 48 frontend tests and 51 Rust tests pass;
  `cargo fmt --check`, `cargo check --offline`, `git diff --check`, and the
  production Vite build pass. The app opened responsively, and the installed
  Tabby archive is confirmed at v1.2.0.
- Latest Windows release build: Tauri produced the executable, NSIS, and MSI
  artifacts in `src-tauri/target/stuff-build`. This smoke test does not
  establish visual motion acceptance or CPU/RAM performance.
- `npm run build`: passed.
- B2 `cargo fmt -- --check`: passed after formatting.
- B2 `cargo test --lib -j 1`: 36 passed, including schema v6 to v7 migration,
  safe first-run defaults, saved-choice preservation, and Tidy Downloads tests.
- B2 `cargo check --lib -j 1`: passed for the Windows process performance API.
- `npm run tauri build`: passed, including NSIS and MSI installers, to the
  normal project release directory.
- Stage 12.1 `npm run tauri build`: passed; NSIS (2.61 MiB) and MSI (3.85 MiB)
  installers were regenerated. The native app was started as PID 13952 and
  reported `Desk Drawer` / `Responding = True`; no motion interaction was
  exercised in that smoke test.
- The deterministic default spring settles in 316.7 ms at 60 Hz for a 65-unit
  displacement. The idle-loop test records zero scheduled frame callbacks and
  timers when the engine has no registered work. Native CPU/RAM values have not
  been measured for this stage.
- The rebuilt `app.exe` was launched as PID 24080; Windows reported window
  title `Desk Drawer` and `Responding = True`. This smoke check did not exercise
  settings persistence or native consent prompts.
- Release outputs:
  - `C:\Users\pc\Desktop\gh\desk-drawer\src-tauri\target\release\app.exe`
  - `C:\Users\pc\Desktop\gh\desk-drawer\src-tauri\target\release\bundle\nsis\desk-drawer_0.1.0_x64-setup.exe`
  - `C:\Users\pc\Desktop\gh\desk-drawer\src-tauri\target\release\bundle\msi\desk-drawer_0.1.0_x64_en-US.msi`
- Automated checks establish compilation and tested file-operation behavior,
  not native Keep Awake, pinning, color picker, timer, or scene UI acceptance.
- **Stage 8 performance sample:** on Windows 11 Pro build 26200, the visible
  release app in Desk mode/Glass theme used 196.3 MB private bytes and 478.1 MB
  working set across its process tree (app plus seven WebView2 child processes).
  The 20-second idle CPU sample was 0.08% of total system CPU across 8 logical
  processors. The user updated the total idle memory target to 300 MB; the
  private-bytes measure is within that target, while working set is shown
  separately. Startup was not timed because the already-running instance could
  not be relaunched safely.
- Current source verification: `node --test` passes 46 tests, `cargo test
  --offline` passes 46 Rust tests, `cargo fmt --check`, `cargo check --offline`,
  and the Vite production build pass. Native rendering, display scaling,
  mixed-DPI behavior, animation frame-time, CPU, and memory readings remain
  unmeasured.

## Remaining work and stage gate

1. **B1 native acceptance:** In the updated app, test settings search by
   name and description, each category/reset, theme and opacity live changes,
   animation master persistence, module/sensor enable Cancel and Enable flows,
   and the first-run all-off state. Confirm the schema v5 migration behavior
   against an existing profile. The Vite preview does not provide native
   persistence, so those interactions are not yet verified.
2. **B2 native acceptance:** Confirm Developer mode starts off and its page is
   absent, then enable it and verify the event inspector and rule trace using
   a test event and an enabled Break Buddy rule. Check local log refresh,
   diagnostics copy, data-folder access, reset behavior, and the process-only
   performance sample. No native interactive actions or resource measurements
   have been claimed yet.
3. **Stage 13.8 source work:** theme schema/contrast tests, schedule and
   preference migrations, theme inspector, and switching without rebuilding
   the desk sticker layer are implemented. Run the current release build and
   manually verify import/export (including hostile bundle rejection), preview
   revert/apply, saved theme pairings/schedule/overrides, Windows 10/11 Frost
   fallbacks, Transparent in Soft/Native modes, reduced-motion transitions,
   and 100/125/150% scaling. Record actual switch times from the Developer
   theme inspector; under-100 ms and no-layout-shift behavior are not yet
   measured in the native app.
4. **B3/B4 and remaining Stage 10:** Eco mode and its measurements; close the
   audit P1s; then window styles, Transparent theme, safe Lock mode, physics,
   onboarding, localization, logs/safe mode, portable ZIP, and credits.
   Measure jelly animation CPU and compare Native/Soft; not tested yet.
5. **Stage 4 manual gate:** In the native Windows app, verify Behavior Lab rule
   and sensor persistence, pack export/preview/cancel/install/re-import, and
   malformed-file rejection. Never execute pack-provided code.
6. **Stage 5 record:** The user reports the focus, multi-monitor, system-state
   and interaction checks passed, with 7.1 MB peak RAM, 0% CPU, and 20/2 FPS
   awake/asleep. Preserve the user-reported attribution.
7. **Stage 6 record:** The user reports it is all well. If documenting exact
   compatibility data later, record Windows version and whether Glass used
   Mica or the fallback.
8. **Stage 7 follow-up:** the user reports all is well, but the earlier Tidy
   Downloads issue remains queued for a specific adjustment after phase work.
   Ask for or observe the reproduction before changing file-operation behavior.
9. **Stage 8 publication gate:** measure startup in a fresh, timed launch. The
    updated workflow must complete on a `v*` tag and attach verified NSIS/MSI
    installers. Replace README GIF placeholders and resolve remaining native
    manual gates, especially Stage 4 and the deferred Tidy Downloads issue,
    before calling the overall release accepted. Investigate working-set usage
    later if it remains a concern; private bytes currently fit the user's
    300 MB target.
10. **Release hygiene:** Save progress in small commits only when authorized;
   push only when asked.
11. **User-reported follow-ups after phase work:** buddy idle animation appears
   nearly still when standing (the bundled Tabby idle is two frames at 2 FPS);
   closing the app was confusing because the saved close-to-tray behavior hides
   the window. Reproduce both in the native build, then improve the idle
   presentation and make the tray/quit behavior explicit without losing the
   user's saved choice.

The shared browser preview is not the native Tauri app and cannot verify native
commands, focus behavior, settings persistence, or system-state suppression.
