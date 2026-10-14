Desk Drawer

Desk Drawer is a Windows desktop utility built with Tauri v2, HTML, CSS, and JavaScript.


# Desk Drawer

Desk Drawer is a small Windows desktop utility built with Tauri v2 and plain
HTML, CSS, and JavaScript. Its interface is based on the supplied browser
prototype and includes Clipboard, Layouts, Rename, Break Buddy, and utility
drawers, plus a Modules page and ten validated built-in themes. Pixelify Sans
is bundled locally under its SIL Open Font License so the UI works offline.

Desk Drawer is proprietary software © 2026 hollo-hub. All rights reserved.
The source repository is private; downloadable Windows releases are published
at [Desk_drawer-downloads](https://github.com/hollo-hub/Desk_drawer-downloads).
Third-party components and assets retain their own licenses and required
notices.

## Development

Install Node.js, Rust, Visual Studio C++ Build Tools, and a Windows SDK. Run
from a Visual Studio Developer Command Prompt:

```powershell
npm install
npm run tauri dev
```

Tauri development uses the configured Vite URL (`http://localhost:5173`) so
the native webview loads the live source, rather than a stale production build.

Run Rust unit tests from `src-tauri` with `cargo test --lib`.
Run core event-bus and module lifecycle tests with `npm test`.

Build the frontend with `npm run build`, or build the Windows app and installers
with `npm run tauri build`. Tauri outputs are written under
`src-tauri/target/release/`.

## Features

- Opens as a normal resizable desktop window (about 800×680 by default) with a
  native title bar, taskbar entry, and a minimum size of 520×560. Its size,
  position, and maximized state are restored on the next launch.
- The first window close asks whether to keep Desk Drawer in the tray or quit;
  that choice is remembered and can be changed in Settings. The tray menu
  provides Show, Pause clipboard history, and Quit, and left-clicking the tray
  icon shows and focuses the window. `Ctrl+Shift+Space` hides the focused
  window or restores and focuses it when hidden or minimized.
- Optional Launch at login is off by default. When enabled, Desk Drawer starts
  hidden in the tray. A second launch restores and focuses the existing
  instance.
- The app reports a clear warning in its window if another application owns
  the global shortcut.
- Clipboard history keeps up to 50 local text, link, and color entries with
  search and pinning. Unpinned items expire after 24 hours; pinned items are
  retained. The Windows clipboard exclusion marker is checked before reading
  text.
- Links saves, edits, tags, searches, and opens websites, folders, and apps.
  Website targets are restricted to HTTP(S); local targets must be absolute
  paths and are checked again when opened.
- Coding, Writing, and Video call presets arrange up to three other visible,
  titled windows on the primary display.
- Rename previews support `{name}`, `{n}`, and `{date}`. The Windows rename
  action sanitizes generated names and rejects collisions before changing any
  files; it never replaces an existing destination.
- Break Buddy reminds every 20 minutes and runs a 20-second look-away timer.
  It supports supplied Tabby and Slime packs, mouse pet/pick-up/drag/drop, and
  personality-driven wandering. Settings → Buddy switches installed sprites,
  installs the bundled Slimes, and creates custom buddies from validated PNG
  sprite sheets. Movement and sprite-frame playback have separate switches;
  disabling either never hides the buddy.
- Theme, clipboard history and pause state, and the active layout are saved as
  versioned `settings.json` in the app's local data folder. Preference updates
  use temporary-file replacement and keep the last good file as
  `settings.json.bak`. Existing `desk-drawer.json` preferences are migrated.
  Window geometry is saved by Tauri's window-state plugin; the OS autostart
  registration is managed by Tauri's autostart plugin.
- Settings are grouped into sections and can be searched by setting name or
  description. `Ctrl+K` opens a command palette for settings and common
  destinations. Appearance supports a theme font override (pixel, readable, or
  monospace). General, Appearance, Buddy, and Animations settings apply
  immediately; applicable sections include a reset-to-default action.
- Stage 12.1 adds the shared, on-demand motion scheduler and fixed-substep
  spring solver. The loop has no scheduled frame or timer while idle, pauses
  while the document is hidden, observes Windows/browser reduced-motion
  preference, and supports an Eco frame-rate policy with a Settings toggle.
  Stage 12.3–12.5 add the optional effects and controls; native CPU/RAM and
  frame-time measurements remain manual and are not claimed as passed.
- Window style now defaults to Native and can be switched live to Soft in
  Settings → Appearance. Soft removes the native frame, adds a 24 px transparent
  margin, and supplies title-bar drag, minimize/maximize/close buttons, and
  resize handles. Its desk sway, resize settle, entrance, and hide-to-tray
  effects use the shared spring engine; Native style retains native window
  decorations and does not run Soft physics.
- Stage 12.3 adds persisted drawer transitions and optional interface effects
  in Settings → Animations: Dock-style tab scaling, edge-scroll spring return,
  Soft-only cursor tilt, reminder bounce and opt-in Windows taskbar attention,
  list exits, loading/empty states, and theme crossfade when supported. Effects
  pause or clear when the window is hidden and follow reduced-motion/Eco policy;
  Glass suppresses decorative motion to avoid extra backdrop repaints.
- Stage 12.4 adds blended buddy state changes, short anticipation/settle and
  pickup/drop/pet reactions, sticker lift/drop/removal/unlock feedback, and a
  shared particle canvas capped at 30 particles. Pinning a clipboard item,
  petting or dropping the buddy trigger small effects. Desk-pack manifests may
  validate their supported transitions and bounded motion timings. These
  effects use the shared motion scheduler and are suppressed with optional
  motion and over Glass; native visual and resource measurements remain manual.
- Stage 12.5 adds persisted Calm/Off/Lively intensity, speed and spring tuning,
  per-effect switches, and an Animation Lab in Settings → Animations. Developer
  mode adds 0.1× slow motion, a displacement/velocity graph, active-animation
  list, frame timing, dropped-frame count, and an opt-in local CPU/RAM overlay.
  Preferences migrate to schema v14. Eco mode has a Settings toggle and
  lowers optional motion; separate Buddy movement and sprite-animation switches
  preserve direct mouse interaction and visibility. Automated tests cover clamps, graph
  sampling, diagnostics, and the buddy state machine; native performance and
  scaling readings have not been collected.
- The buddy state machine uses idle, walking, sitting, sleeping, reacting,
  carried, falling, and hidden states. Developer mode can force each state.
  Appearance now offers ten built-in themes (Cozy, Night, Transparent, Frost,
  Paper, Arcade, Forest, Savanna dusk, Terminal, High contrast) plus user themes;
  Settings → Appearance shows the built-in/user theme count.
- Developer mode is off by default and adds a hidden-until-enabled Settings
  area with a filtered event inspector, behavior-rule decision traces, safe
  test events, buddy snapshots, pack validation/reload, local logs, diagnostics
  copy, data-folder access, and per-module data reset. Inspector payloads keep
  only coarse allowlisted fields; clipboard text and file paths are excluded.
  Nothing in Developer mode sends data over the network. Performance snapshots
  sample the Desk Drawer process only (not WebView2 child processes) and briefly
  consume CPU. WebView DevTools are not exposed in release builds.
- Clipboard, Links, Layouts, Rename, Break Buddy, Color Picker, Keep Awake, Pin
  Window, Scratch Notes, Focus Timer, Tidy Downloads, and Scenes are
  registry-managed modules. The Modules page controls each drawer; a disabled
  module is not imported and does not run its handlers or timers. Fresh
  installs leave modules and buddy sensors off and ask before enabling them;
  saved choices from existing installs are preserved during migration.
  App-wide settings remain available.
- Color Picker reports hex, RGB, and HSL values and copies hex on request.
  Keep Awake temporarily holds Windows system/display sleep requests; Pin
  Window can be toggled and persists across launches. Scratch Notes are saved
  locally in versioned settings.
- Focus Timer accepts a custom 1-minute to 7-day duration, shows hours for
  long sessions, and lets you choose the countdown text color or follow the
  active theme. These preferences persist locally; the buddy naps while it
  runs. Scenes support the same custom duration range.
- Tidy Downloads lists every top-level file and its destination before moving
  anything. It rejects stale previews and collisions, moves only regular files
  into type folders, and provides a one-click undo while the original paths
  remain available. Empty type folders are left in place on undo.

Window arrangement currently targets the first three eligible windows returned
by Windows and uses the primary display. Renames preserve each original file
extension. Clipboard monitoring captures Unicode text only.

## Testing the desktop window and tray behavior

Run `npm run tauri dev` and verify the following manually:

1. On a normal launch the window appears with a native title bar, minimize,
   maximize, and close buttons; it is resizable, appears in the taskbar, and is
   not topmost. Resize it to 520×560 and maximize it; each panel should scroll
   rather than clipping or overflowing.
2. Move and resize the window, close with **Quit**, and launch again. Confirm
   the position, size, and maximized state are restored.
3. Close the window for the first time. Choose **Keep in tray**, then confirm
   the window hides and clipboard history/reminders remain available. Reopen
   it from the tray menu or a left-click on the tray icon. Close again and
   confirm it now follows the **Close to tray** setting. Toggle that setting
   off and confirm closing quits the process.
4. Use `Ctrl+Shift+Space` while the window is focused; it should hide. Press
   it again; it should show and focus. Repeat while minimized and confirm it
   restores. Press `Esc` and click outside the window; neither should hide it.
5. In Settings, enable **Launch at login** and sign out/in or restart Windows.
   Confirm the app starts hidden in the tray. Disable the setting and confirm
   it no longer starts at login.
6. Launch Desk Drawer a second time while it is already running. Confirm the
   existing window is restored and focused and only one tray icon/process
   remains. Choose **Quit** from the tray menu and confirm the process exits.

The login test requires a sign-out/sign-in cycle (or restart). Avoid running
two copies from separate development environments when testing single-instance
behavior; they share the same application identifier.

## Stage 1 module checks

Run `npm test`, `npm run build`, and `cargo test --lib`. In the app, open
**Modules**, turn off Break Buddy, and confirm its animation and reminder stop;
turn it back on and confirm both resume. Repeat with Clipboard, Layouts, and
Rename, then restart and confirm enabled states persist. Older preferences
without `schemaVersion` migrate automatically; after changing a setting, check
the app data folder for `settings.json` and `settings.json.bak`. If a module
cannot start, the Modules page keeps a visible startup error instead of leaving
an empty window.

## Stage 2 links and clipboard checks

Run `npm test`, `npm run build`, and `cargo test --lib` from `src-tauri`. In the
app, confirm the Links drawer is listed in Modules and try these checks:

1. Save a website URL with a title and comma-separated tags. Search for the
   title and a tag, open it, edit its title/tags, then delete it.
2. Use **Browse** to save a folder and an application, then open both. Try an
   invalid URL such as `javascript:alert(1)`; it must be rejected with an
   error.
3. Save and search clipboard text, click it to copy it again, and pin it.
   Confirm a pinned item remains after the 24-hour expiry window; use
   `cargo test --lib clipboard_items_expire_after_twenty_four_hours_unless_pinned`
   to verify expiration deterministically without waiting.
4. Copy a URL and a hex color such as `#12ABEF`; confirm the history labels the
   URL and shows a color swatch. Search the history and verify clear removes
   both pinned and unpinned entries.
5. Existing string-based clipboard history is migrated automatically to typed
   entries. After launch, inspect `settings.json` for `schemaVersion: 2`; the
   last-good settings backup is retained as `settings.json.bak`.

The Windows clipboard exclusion marker check remains ahead of text retrieval.
Do not test it by copying real password-manager contents; its skip behavior is
covered by the backend's marker-guard test.

## Stage 3 buddy engine checks

Run `npm test` and `npm run build`. Tests cover the 32×32 placeholder sprite
sheet, animation frame coordinates, rule conditions and cooldowns, priority,
speech limits, safe actions, and bounded mood drift. Enable Break Buddy and
wait a few seconds for the idle blink, then click **Send buddy out** to see it
cross the desk. Copy a link and rename a file to see its rule reactions. The
personality sliders are a temporary preview and reset on restart.

## Stage 4 Behavior Lab, packs, and desktop look

Open **Behavior Lab** to preview personality settings, inspect readable rules,
enable or disable rules, build a simple rule, and test its conditions against a
safe sample event. Rule tests show action previews and do not execute actions.
Save rules to apply them to the in-app buddy. The Sensors tab controls coarse
clipboard-kind, file-change, break-activity and cursor signals; raw clipboard
content is never sent to the behavior engine. Cursor coordinates are read
locally only, are not stored or shared, and are used by the roaming buddy only
when that sensor is enabled.

Choose **Roam desktop** in Settings to place the buddy in a non-focusable,
click-through overlay. It stays within a monitor's work area, supports
dragging, and hides while Windows reports a locked desktop, full-screen app,
or presentation/quiet state. Left-click to pet, double-click to open Desk
Drawer, and right-click for sleep, wake, hide, open, and quit actions. Reduced
motion and sleep lower animation updates. Roaming is Windows-only.

The header theme button cycles Cozy, Night, and Glass. Glass requests the
Windows Mica material and keeps a translucent frosted-color fallback when
the effect is unavailable; adjust its opacity in Settings. Add a desk
background from Settings, or drag an image file onto the desk to add a
movable/resizable sticker. Images are validated and stored locally (PNG, JPEG,
WebP or GIF; up to 5 MB, 4096 pixels per side and 4 megapixels total; SVG is
rejected). New installs automatically use the full 57-frame Tabby sprite pack.
Behavior Lab includes CC0 Tabby/Midnight/Snow and Lime/Aqua/Berry Slime variants.
The Buddy settings page switches active packs immediately, installs the Slimes,
and creates custom buddies from validated 32×32-grid PNG sheets with at least
57 frames in the bundled animation order. Custom buddies use the saved Behavior
Lab rules, so future rule edits apply without rebuilding the sprite pack. An
active desk buddy can nap or react but behavior rules cannot hide it; the
explicit Buddy mode Off setting and operating-system safety hiding for the
roaming buddy remain available. Break Buddy is still controlled by its saved
module toggle; enable it on the Modules page to show the in-desk creature.
Developer mode includes a frame grid and animation viewer with playback speed,
facing direction, anchor/feet overlay, and frame validation status. Other buddy
skins still use validated `.deskpack` imports.

The Packs tab loads either included sample manifest, validates JSON as it is
edited, and offers Undo/Reset plus buttons demonstrating rejection of an
unknown field, sprite path traversal and script-like rule action. `.deskpack`
ZIP import shows a validated preview and requires confirmation before
installation. Installed packs start disabled; enable one to apply its
validated sprite, personality and whitelisted behavior rules to the in-app
buddy. Disabling the pack restores the default buddy. Archives reject
unexpected paths, duplicate entries, oversized expansion, and invalid or
oversized sprite images.

To test archive handling:

1. From the project root, run `npm test` and `npm run build`. From `src-tauri`,
   run `cargo fmt -- --check` and `cargo test --lib`.
2. In Behavior Lab, toggle a rule, save, restart, and confirm it persists.
   Use the rule builder to add a rule, test it, save it, and confirm the buddy
   reacts only to the selected event. Turn each sensor off and on, then restart
   to check its saved state. Test Undo and Reset in both rules and Pack JSON.
3. In **Packs**, load Sleepy Cat and choose **Export .deskpack**.
   Save the file, then import it. Confirm the manifest preview appears before
   installation; cancel once, import again, and confirm installation. The UI
   reports that the pack is installed disabled. Enable the pack and confirm
   the in-app buddy uses its sprite/personality/rules; disable it and confirm
   the default buddy returns. Restart while enabled and confirm the pack is
   restored. Try exporting again to the same path; the existing file must
   remain unchanged and the export must fail with a clear message.
4. In **Settings > Buddy**, switch packs and confirm the sprite changes without
   restarting. Install a Slime and verify that it uses Behavior Lab reactions.
   Import a 57-frame custom PNG, confirm it becomes active, edit a rule in
   Behavior Lab, and trigger that rule. Confirm a rule cannot set the buddy to
   hidden; switching Buddy mode to Off remains an explicit user choice.
5. Attempt to import a malformed ZIP, one with an unexpected/traversal entry,
   duplicate entry name, or invalid/oversized PNG; each must show an error and
   must not install the pack. Export the same manifest again under a different
   name and re-import it to verify the round trip. Refresh the installed list,
   confirm both packs appear as disabled, then delete the test packs and confirm
   they disappear. Packs cannot yet be enabled or applied as buddy skins/rules.
