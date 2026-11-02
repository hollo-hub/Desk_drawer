# Phase 1 prompts (run in order, one at a time)

## P1-0 Scaffold
Create a Tauri 2 project for Windows named `desk-drawer`. Single window 900x720, resizable, with normal minimise, maximise and close buttons, default title bar. Remember window size and position between launches. Add a `data.rs` module that loads and saves one JSON file in the app data directory with a `schemaVersion` field, atomic write (temp file then rename) and one backup copy. Expose `load_data` and `save_data` commands. Show an empty page that confirms the data file loads. Done when the app launches, the window behaves like a normal app and data round-trips across restarts.

## P1-1 Courses
Implement course add, edit and delete using the data model in the spec (name, color, folder, links, files, notes). UI: a bottom dock of course cards (name, minutes this week, small bar, “N days” tag when untouched 4+ days), a + button, and an Edit button that opens a slide-over sheet on the right (bottom sheet under 700px). Block deleting the last course. A first launch starts with a clean empty state and a clear Add course action; do not seed sample courses. Notes and lightweight tasks have their own course-linked workspace pages. Match `screenshots/03-home-idle.png` and `06-edit-course-sheet.png`. Done when courses persist across restarts and the edit form saves as you type.

## P1-2 Launch
When a session starts, open the selected course’s folder in Explorer, each link in the default browser and each selected file/app path with its registered application. Provide native pickers for folders and files; do not silently copy or move user files. Support arbitrary file extensions, including video formats. Use the Tauri opener plugin with scoped permissions. Accept only `http` and `https` URLs. If something fails, show the matching message from `docs/03-onboarding-tutorial.md` in the cat bubble and still start the session. Done when a real folder, document/video, and links open, and a missing folder shows the message without blocking.

## P1-3 Timer
Build the session timer with timestamps. Start in a 0-minute stopwatch mode that counts up; keep 25-minute, 50-minute and custom countdowns as optional modes. Support start, pause, resume and end. Show mm:ss large under the cat and update the window title. Ending under 5 seconds logs nothing; otherwise log elapsed time. Done when minimising for 10 minutes and restoring shows the correct time, and pause then resume preserves elapsed or remaining time.

## P1-4 Halo
Draw a ring around the cat in the course colour. At start it is a full ring; the arc shortens as time runs out; it disappears at zero. Use arc length only to show time left, no fading. Respect reduced motion. Done when the ring matches `screenshots/04-focus-halo.png` behaviour and is correct after pause and resume.

## P1-5 Cat and stage
Build the stage: isometric platform, front-facing pixel cat (16x16 grid, scale 8, crisp edges), bubble above. States: idle (bob, blink about every 3.6s), focus (eyes closed, slow breathing), done (three hops and sparkles in the course colour, back to idle after 4s), nudge (idle with the “N days” line, once per launch). Pick lines from `docs/03-onboarding-tutorial.md`. Done when all four states trigger from real events.

## P1-6 Session log
Save each completed or ended session (course, start, planned, actual, completed). Show the last 6 in the sheet under the course form and compute minutes this week per course for the dock cards. Done when totals survive restarts and update immediately after a session.

## P1-7 First-run guide
Implement the one-time interactive first-run guide from `docs/03-onboarding-tutorial.md` with a dimmed overlay and live spotlight. Keep highlighted controls clickable, and position the guide beside its current target. Store `tourDone`; Skip or Finish permanently ends the guide. Do not add a reopen button.

## P1-8 Polish and release
Add the appearance toggle (system, light, dark), honor the operating system reduced-motion preference, and provide visible focus styles, a timer role and a live region for the bubble. Build an installer. Write a README with a one-sentence description, a GIF of the session loop, install steps, the SmartScreen note for unsigned builds and “no telemetry”. Done when every item in `docs/04-testing-and-review.md` passes and a release is tagged `v0.1.0`.
