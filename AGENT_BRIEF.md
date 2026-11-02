ROLE
You are the lead engineer on Desk Drawer, an open-source Windows desktop app. I am the creative lead and product owner. Build exactly what this brief says, one stage at a time, and stop at each gate. If something is ambiguous or risky, ask me before building it.

PRODUCT
Desk Drawer is a tiny desk for your PC with three parts:
1. THE BUDDY: a pixel-art creature that lives in the app and can also roam your desktop. It has moods and reacts to what you do.
2. THE TOOLBOX: small utilities (clipboard, links, rename, layouts, break reminders and more) that the user can switch on and off one by one.
3. THE BEHAVIOR LAB: a friendly editor where anyone can reshape how the buddy acts, using sliders, readable rules, and shareable packs. No coding needed.
Audience: students and developers on modest laptops. Free, MIT licensed, fully offline, no account, no telemetry. Windows 10 and 11 first.

CREATIVE DIRECTION
- Tone: warm, short, plain. The buddy is curious and a bit lazy, and never guilt-trips. Nothing wilts and there is no streak shaming. Rewards are gentle (desk items unlock when the user takes breaks).
- Look: pixel art with hard 3px borders and hard offset shadows. Three themes: Cozy (daylight), Night (amber lamp glow), Glass (see Look and Customization). Font: Pixelify Sans, bundled locally.
- Motion only answers a user action, except the buddy, who may nap and wander. Respect the system reduced-motion setting by keeping the buddy still.
- The existing prototype (desk-drawer.html) is the visual reference for the main window.

NON-NEGOTIABLES
Stack: Tauri v2, plain HTML, CSS and JavaScript with ES modules, no UI framework. Rust only for system features. Check the current Tauri v2 docs before using any API, plugin or permission. Explain any new dependency in one sentence before adding it, and prefer none.
Performance: report real measurements and never guess. Targets: main window visible in under 2 seconds; total idle memory under 300 MB with the buddy in the app (tell me the number for roam mode); idle CPU under 1 percent; buddy draws at most 30 fps in the app, at most 20 fps while roaming, and 2 fps when asleep or hidden. A disabled module must load no code and run no timers, listeners or threads.
Privacy: everything stays on the machine. No network calls at all. Events given to the behavior engine carry only coarse metadata (for example clipboard kind: text, link, color or image; app category), never the actual content. The user must be able to see and switch off every sensor the buddy uses.
Security: user-supplied packs and images are untrusted input. Validate against a schema, cap sizes, and never execute code from a pack. Rules may only use the whitelisted actions below: no shell, file or network access. No SVG imports. Imported images are copied into the app data folder and served only from there.
Accessibility: full keyboard use, visible focus outlines, contrast that passes in all themes, reduced-motion support, and no information carried by color alone.
Quality: unit tests for the behavior engine, schema validation, settings migration and rename logic. Use the built-in node test runner and cargo test. All saved files use atomic writes (write to a temp file, then rename), keep a backup of the last good copy, and include a schemaVersion with migrations.

ARCHITECTURE
Frontend folders: core/ (event-bus, settings, module-registry, assets), modules/<id>/ (module.json plus index.js), buddy/ (engine, renderer, sprites, schema, defaults), themes/, ui/.
Rust folders: sensors/ (clipboard, focus, idle, fullscreen), overlay/, modules/ (snap, rename, awake, pin, colorpick), storage, packs.
Event bus: namespaced events such as clipboard.copied, file.renamed, layout.applied, break.due, break.taken, app.focus, user.idle, user.click, user.drop, time.tick. Payloads are small and contain no raw content.
Module contract: id, name, description, icon, version, defaultEnabled, start(ctx), stop(), mount(el), unmount(). The registry stores enabled flags and generates both the drawers and the Modules page from the list. The existing drawers become modules without changing their behavior.
Data: the app data folder holds settings.json, modules/<id>.json, buddy/state.json, packs/<id>/ (pack.json plus assets), assets/ (stickers, backgrounds), and backups/.

THE BUDDY
- Rendering: canvas, pixelated, integer scaling, driven by a sprite sheet and a manifest. Default art may be simple placeholder shapes generated in code, but everything must load through the sprite sheet system so I can drop in final art later.
- Animations the default buddy needs: idle, blink, walk, sit, sleep, yawn, perk, happy, curious, eat, carried, fall.
- State machine: idle, walking, sitting, sleeping, reacting, carried, falling, hidden.
- Mood variables from 0 to 100: energy, mood, curiosity. They drift over time (energy drops after long activity and rises while the buddy sleeps), shift with time of day, and change through rule actions.
- Personality sliders from 0 to 100: Energy, Curiosity, Chattiness, Clinginess (follows the cursor), Sleepiness. They scale probabilities, thresholds and speeds.
- The user can give the buddy a name.

BEHAVIOR ENGINE (declarative and data-driven, no scripts)
A rule has: id, name, enabled, when (an event name or time.tick), if (a list of conditions, all must pass), then (a list of actions run in order), cooldownSec, priority, weight. When several rules match, the highest priority wins and ties are picked by weight. Cooldowns prevent spam, and a global chattiness limit stops the buddy talking too often.
Conditions use the shape: var, op (==, !=, >, <, >=, <=, between), value. Available vars include event.kind, mood.energy, mood.mood, mood.curiosity, state, time.hour, time.weekday, app.category, idle.seconds, module.<id>.enabled, and random (a chance from 0 to 1).
Whitelisted actions only: play(animation, count or loop), say(line or line group, durationMs), moveTo(left, right, center, cursor, randomX, or a sticker id), setState(state), adjust(variable, delta), emote(emoji or sprite), spawnSticker(id), playSound(id; off by default), wait(ms), openDrawer(id), toast(text). Nothing else.
Default rules to ship (readable and editable): curious about a copied link; happy dance when a break is taken; yawns when there has been no break for 25 minutes; sleeps after 5 idle minutes; sorts a pile of files when a rename batch finishes; sits quietly while a game or presentation app is focused; peeks at the cursor when Clinginess is high; reacts to a click (a pet); inspects a file dropped on it.

BEHAVIOR LAB (the UI)
Tabs: Personality (sliders with a live preview); Rules (each rule shown as a plain sentence, for example: When I copy a link, if curiosity is above 40, play perk and say Ooh, a link. Each has an on/off switch); Rule editor (a dropdown builder with a Test this rule now button); Sensors (everything the buddy can sense, each with a switch and a plain description); Packs (import, export, create, disable, delete). Also include a raw JSON view with live validation that points at the exact problem, plus Undo and Reset to default. Importing a pack shows a preview of what it changes and needs my confirmation before it is enabled.

PACK FORMAT (.deskpack is a zip of a folder)
A pack folder contains pack.json, sprites/, and optional stickers/ and sounds/. Example pack.json:

{
  "schemaVersion": 1,
  "id": "sleepy-cat",
  "name": "Sleepy Cat",
  "author": "your name",
  "version": "1.0.0",
  "license": "CC-BY-4.0",
  "buddy": {
    "sprite": "sprites/cat.png",
    "frame": { "w": 32, "h": 32 },
    "anchor": { "x": 16, "y": 31 },
    "animations": {
      "idle": { "frames": [0, 1], "fps": 2, "loop": true },
      "walk": { "frames": [2, 3, 4, 5], "fps": 8, "loop": true },
      "sleep": { "frames": [6, 7], "fps": 1, "loop": true },
      "perk": { "frames": [8, 9], "fps": 6, "loop": false }
    }
  },
  "personality": { "energy": 30, "curiosity": 60, "chattiness": 40, "clinginess": 20, "sleepiness": 70 },
  "lines": { "linkCopied": ["Ooh, a link!", "Shiny."] },
  "rules": [
    {
      "id": "link-curious",
      "name": "Curious about links",
      "enabled": true,
      "when": "clipboard.copied",
      "if": [
        { "var": "event.kind", "op": "==", "value": "link" },
        { "var": "mood.curiosity", "op": ">", "value": 40 }
      ],
      "then": [
        { "play": "perk" },
        { "say": "linkCopied" },
        { "adjust": { "curiosity": -5 } }
      ],
      "cooldownSec": 20,
      "priority": 1,
      "weight": 1
    }
  ]
}

Limits: a pack is at most 20 MB, each image at most 4 MB and 4096 px, at most 200 rules, at most 100 lines per group. Unknown fields are rejected with a clear error message.

DESKTOP ROAM MODE
Buddy mode setting: Off, In desk only, Roam desktop. Roam uses a second window that is transparent, borderless, always on top, hidden from the taskbar, and click-through except exactly over the buddy. The buddy walks along the bottom of the screen work area, above the taskbar. The user can pick it up and drop it (simple gravity), click to pet it, double-click to open the Desk, and right-click for a menu (Sleep, Hide, Open Desk, Quit). It never takes focus, never covers the taskbar, and handles 100 and 150 percent display scaling and more than one monitor. Hide it automatically when a full-screen app, game or presentation is running, when the screen is locked, and during a Do not disturb setting. Stretch goal for later: walking on top of other windows using window rectangles.

TOOLBOX MODULES
- Clipboard: last 50 items with kinds (text, link, color, image path), pin, search, hex colors shown as swatches, and unpinned items fade out after 24 hours. Pause and clear. Skip items flagged by password managers.
- Links: saved links, folders and apps with title, tags and one-click open. Each tile uses the first letter of the title. No favicon downloads.
- Rename: patterns, preview, collision-safe, undo. Add Tidy Downloads: sort a chosen folder by file type with a full preview and one-click undo.
- Layouts: save and apply window arrangements as Scenes, which can also open apps and start a focus or break timer.
- Break: eye rest, stretch and water reminders; never interrupts full-screen apps; snooze and dismiss.
- Color picker, Keep awake, Pin window on top, Scratch notes, Focus timer (the buddy naps while you focus).
Rule for adding any module: it must be small, work offline, and give the buddy something to react to.

LOOK AND CUSTOMIZATION
- Themes: Cozy, Night, Glass. Glass uses a transparent window with the Windows 11 Mica or acrylic effect, and falls back to a frosted solid color on Windows 10 or if the effect fails. Test drag and resize smoothness. Include an opacity slider. Keep the pixel art crisp on top of the glass.
- Stickers: drag any png, jpg, webp or gif onto the desk; move, resize and delete them; positions persist.
- Desk background image.
- Buddy skins: import a sprite sheet and manifest.

STAGES (do one at a time and stop at each gate)
Stage 0, Shell and baseline: confirm the normal window (native title bar with minimize, maximize and close, resizable, visible at launch, in the taskbar, tray icon, close to tray with a one-time notice and a setting). Set up the test runners. Save this brief in the repo. GATE: app launches visibly; baseline startup time, idle memory and idle CPU reported.
Stage 1, Core: event bus, settings store with migrations and atomic writes, module registry, Modules page. Port the four existing drawers into modules unchanged. GATE: turning a module off provably stops its code (show a log or counter); tests pass.
Stage 2, Links and Clipboard upgrades: Links module; clipboard kinds, pin, search, 24 hour fade, color swatches. GATE: links can be added, edited, tagged and opened; the password-manager skip still works.
Stage 3, Buddy engine in the app: sprite and manifest loader, renderer, state machine, mood variables, personality sliders (a simple temporary panel is fine), default rules, events wired from the modules. GATE: unit tests for rule evaluation, conditions and cooldowns pass; the buddy visibly reacts to a copy, a rename and a break; fps and CPU numbers reported.
Stage 4, Behavior Lab: all tabs, rule editor with the test button, raw JSON with validation, Sensors tab, pack import and export with validation and preview. GATE: a pack exports and re-imports identically; malformed and oversized packs are rejected with clear errors; two example packs are included.
Stage 5, Roam mode: overlay window, click-through hit testing, pick up and drop, right-click menu, full-screen and lock detection, DPI and multi-monitor. GATE: memory and CPU measured in roam mode; it never steals focus (typing in another app keeps working while the buddy walks); it hides during a full-screen video.
Stage 6, Look: Glass theme with fallback and opacity slider, stickers, desk background, skin import. GATE: tested on Windows 11 if available (otherwise say exactly what could not be tested); SVG and oversized images are rejected.
Stage 7, Utilities: color picker, keep awake, pin window, notes, focus timer, Tidy Downloads, scenes. GATE: each is a toggleable module with at least one buddy reaction; Tidy Downloads preview and undo verified on a test folder.
Stage 8, Release: performance report, README with GIF placeholders, PACK_GUIDE.md for pack creators, CONTRIBUTING.md, app icon, MIT license plus font license credit, GitHub Actions release workflow. GATE: a tagged release builds the installer.

OUT OF SCOPE
Passwords or any vault, cloud sync, accounts, analytics, auto-update, arbitrary user scripting, macOS and Linux support.

HOW TO WORK
- At the start of each stage, restate your plan in at most 10 bullets. If something is unclear or risky, ask me before building it.
- Make small commits with clear messages, one per feature.
- Stay inside the current stage. Do not refactor unrelated code or add features I did not ask for.
- Never claim something works unless you ran it. Separate "verified by running" from "written but not run".
- If you cannot test something (for example Windows 11 effects), say so plainly.
- If a Tauri API differs from what you expected, quote the doc you checked.
- End every stage with a report: what changed, exact steps for me to test it, what is not done, measurements, risks, and one suggestion.
