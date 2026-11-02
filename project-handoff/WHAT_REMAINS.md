# What remains

Continue from the existing Desk Drawer foundation; do not replace completed
stages or remove established features.

1. **Phase A / B1 Settings:** UX audit is in `docs/UX_AUDIT.md`. Categorized
   Settings, description search, Ctrl+K command palette, preference resets,
   animation master switch, schema v6 migration, and first-run module/sensor
   consent defaults are implemented. Frontend search/navigation was exercised
   in the Vite preview, and the rebuilt native app launched/responded. Still
   verify in the native app: persistence and reset effects, enabling/canceling
   module and sensor prompts, and the actual fresh-install all-off state.
   Existing saved module/sensor choices are preserved by migration.
2. **B2 Developer mode:** implemented with an off-by-default setting and a
   hidden-until-enabled Developer page. It has allowlisted event summaries,
   behavior-rule traces, test events/state/clock controls, pack
   validation/reload, local logs, Copy diagnostics, performance snapshots,
   data-folder access, and per-module reset controls. Release DevTools are not
   exposed. Tests and a Windows release build are being verified; native
   interactive acceptance (off/on visibility, a fired event matching a rule,
   log/data-folder actions, reset actions, and performance sampling) remains
   for the user to check. CPU/memory snapshots measure only the Desk Drawer
   process and do not include WebView2 children.
3. **Stage 12.1 — Animation engine:** implemented the shared on-demand frame
   scheduler and bounded fixed-substep spring solver. Desk and roaming buddy
   update loops now register with it; direct `requestAnimationFrame` ownership
   is centralized. Reduced-motion/Eco policies allow only the low-rate buddy
   idle sprite, and hidden documents pause the scheduler. Automated tests cover
   tiny/large time steps, settling, clamps, idle scheduling, hidden visibility,
   and the 2 FPS reduced-motion cadence. Native visual checks and real CPU/RAM
   measurements have not been performed.
4. **Stage 12.2 — Soft window physics:** Native/Soft selection, schema v8
   migration, 24 px Soft transparent margin, custom drag/resize/window controls,
   bounded jelly/resize springs, and spring entrance/hide-to-tray transitions
   are implemented. Rust/native and frontend builds pass. Still verify by hand:
   style persistence and rollback, Soft drag/resize/maximize/close, close-to-tray
   and restore, and reduced-motion interruption. Snap Layout affordance,
   100/125/150% scaling, mixed-DPI monitors, visible smoothness, and CPU/RAM
   have not been tested.
5. **Stage 12.3 — Interface animations:** Added persisted drawer/effect
   settings, slide/pop/instant transitions, Dock magnification, edge scroll
   spring, Soft-only tilt, reminder bounce and opt-in taskbar attention,
   list-item exit, loading/empty-state effects, and theme crossfade. 30 frontend
   and 40 Rust tests pass; production frontend and Windows release builds
   succeed. Still perform native visual checks for every effect, reduced
   motion/Eco, interruption and settings persistence. No CPU/frame-time
   measurements were made.
6. **Stage 12.4 — Buddy and desk animation:** Implemented blended buddy poses,
   anticipation/settle, spring pickup/drop/pet squash, sticker lift/drop/delete
   and new-sticker pop, plus pooled sparkle/heart/dust canvas particles capped
   at 30. Desk-pack optional transition support/timing is validated and bounded.
   32 frontend tests, 40 Rust tests, builds and native release smoke launch pass.
   Native visual interaction, CPU/RAM, and reduced-motion/Eco interruption
   were not measured.
7. **Stage 12.5–12.6:** animation preferences, effect switches, Animation Lab,
   developer slow motion/graph/active list/frame diagnostics, automated
   stability/settings/state tests, and schema v11 migration are implemented.
   Still collect native CPU/RAM and frame-time readings for idle, drag, tab
   hover, buddy roam, and Eco; verify 100/125/150% scaling, mixed-DPI monitors,
   and interrupted visual transitions by hand.
8. **B3/B4 and remaining Stage 10:** Eco mode with measured Off/On cases and
   battery-saver Auto behavior; audit P1 polish; Transparent and safe Lock
   modes, onboarding, localization, diagnostics/safe mode, portable ZIP, and
   credits. Compare Native/Soft and report CPU while jelly animation is active
   and idle.
9. **Stage 4 manual verification:** Test Behavior Lab rules and sensor
   persistence, plus `.deskpack` export, preview, cancel, install, re-import,
   and malformed-file rejection in the native Windows app. The current
   uncommitted activation code revalidates installed archives and applies
   validated pack assets/rules; automated coverage is not a substitute for
   those GUI checks. Never execute pack code.
10. **Stage 5 native acceptance:** The user reports all interaction checks
   passed, including typing in a focused editor and the multi-monitor/system
   state checks. Reported peak RAM was 7.1 MB, CPU 0%, and animation cadence
   20 FPS awake / 2 FPS asleep; these are user-reported values.
11. **Stage 6 Glass/customization:** Implemented and user-reported as all well.
   Cozy/Night/Glass theme cycling, Windows Mica request with translucent
   fallback, saved opacity, image backgrounds, drop-to-add stickers, and
   movable/resizable/deletable stickers with persisted placement. Existing
   validated `.deskpack` import supplies buddy skins. The OS version and
   precise effect/fallback checks were not recorded.
12. **Stage 7 implementation:** Added Color Picker, Keep Awake, Pin Window,
   Scratch Notes, Focus Timer, Tidy Downloads, and Scenes as independently
   toggleable modules. Notes/scenes persist locally; Scenes can open selected
   saved links/apps/folders, arrange a built-in layout, and start focus with an
   optional break prompt. Tidy Downloads has a fresh-preview check, collision
   protection, move rollback, and one-click undo; Rust tests cover schema v4
   migration, preview/move/undo, and stale-preview/collision behavior.
13. **Stage 7 follow-up:** the user now reports all is well. Earlier they noted
   a Tidy Downloads issue and requested an adjustment after phase work; the
   exact reproduction or desired adjustment was not recorded. Keep it queued
   and do not speculate about file-operation changes.
14. **Stage 8 implementation:** added `PACK_GUIDE.md`, `CONTRIBUTING.md`, MIT
   `LICENSE`, README GIF placeholders and honest performance status, and a
   Windows tagged-release workflow. Existing Tauri icon files and font OFL
   license credit are retained.
15. **Stage 8 gate:** release workflow now tests frontend/native code and
   checks for non-empty NSIS/MSI artifacts before upload. It still needs a
   `v*` tag run to verify the remote GitHub release. A short visible-app idle
   sample on Windows 11 Pro build
   26200 measured 196.3 MB private bytes / 478.1 MB working set across the
   release app plus seven WebView2 children, and 0.08% system CPU over 20
   seconds on 8 logical processors. The user updated the idle memory target to
   300 MB; private bytes fit, with working set reported separately. Startup
   time was not measured because the app was already running. Capture a fresh
   timed startup, replace GIF placeholders, and run the workflow on a `v*` tag
   to verify installer uploads. Performance optimization is deferred for later.
16. Commit and push only when explicitly asked.

## Latest continuation

- **Stage 12.5 implemented:** intensity, speed/spring tuning, optional-effect
  switches, replayable spring previews, persisted settings, and developer
  diagnostics/slow motion are available in source. Schema v10 preferences
  migrate to v11 defaults.
- **Buddy state machine implemented:** the desk buddy uses canonical
  idle/walking/sitting/sleeping/reacting/carried/falling/hidden states; roam
  tracks idle/walking/sleeping/hidden. Automated transition tests pass.
- **New supplied creature artwork integrated:** full 57-frame Tabby, Midnight,
  Snow, Lime Slime, Aqua Slime, and Berry Slime packs use all 27 shared
  animations. New installs select the full Tabby pack by default. Developers
  can inspect frames, animations, speed, flip, anchors and sprite checks in
  Developer mode. Supplied world data remains unused until a world schema
  exists.
- **Buddy presence and customization:** the active desk buddy cannot be hidden
  by behavior rules. Settings > Buddy switches installed sprites, adds the
  three Slime variants, and creates custom buddies from validated 57-frame
  sprite atlases using saved Behavior Lab rules. Existing default Tabby packs
  upgrade to v1.2 without changing a user's different active pack.
- **Focus timer customization added:** choose 1 minute through 7 days, change
  countdown text color or reset it to the theme color, and use the same custom
  duration in Scenes. Preferences migrate through schema v13.
- **Stage 13.1–13.8 source work:** all ten built-in themes, strict JSON/ZIP
  validation, theme asset import/export, appearance editing and preview,
  token/contrast logic, preference migrations, safe material fallbacks, and a
  developer inspector are implemented. Theme switching no longer rebuilds
  desk stickers and exposes synchronous apply timing. Native visual and
  performance acceptance is still outstanding.
- **Supplied sprite tools were inspected but not executed or shipped.** Packs
  are data only; app code from those folders is never executed.
- **Current-source verification:** 48 frontend tests, 51 Rust tests,
  `cargo fmt --check`, `cargo check --offline`, Vite production build, and
  `git diff --check` pass. The new native app opened responsively; its app-data
  Tabby pack is v1.2.0. Break Buddy remains off in this user's saved module
  settings, so enable it on the Modules page to see the creature.
- **Latest requested polish implemented:** Settings now expose an Eco toggle,
  independent Buddy movement and sprite-animation switches, and an interface
  font override. The buddy remains visible when movement/animation are disabled
  and can be placed with both horizontal and vertical mouse dragging. Settings
  migrate to preference schema v14. Automated tests pass; native UI behavior,
  saved-setting round trips, and drag feel still need hands-on verification.

## Current build

Rebuild the release executable at
`C:\Users\pc\Desktop\gh\desk-drawer\src-tauri\target\release\app.exe` after
the latest source changes. Automated checks do not establish native theme
import/export, Windows visual effects, display scaling, under-100 ms switching,
or CPU/RAM measurements. Do not claim those manual gates as passed until tested
in the Windows app.

## User-reported follow-ups after phase work

- Buddy idle animation appears nearly still while standing; the current
  bundled Tabby idle has two frames at 2 FPS. Reproduce in the native app and
  improve the idle presentation.
- Closing the app was confusing because the saved close-to-tray behavior hides
  the window. Reproduce and make tray/quit behavior explicit without silently
  discarding the user's saved choice.
