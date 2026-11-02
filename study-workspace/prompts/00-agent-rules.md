# Agent rules (paste at the start of every session)

You are building **Desk Drawer**, a Windows desktop study companion, with Tauri 2 (Rust backend, plain web frontend: HTML, CSS and TypeScript or JavaScript, no heavy framework). Read `docs/01-product-spec.md` and `docs/02-design-and-layout.md` first and treat them as the source of truth.

Rules:
1. Work on **one feature per prompt**, on its own git branch named after the feature ID (for example `p1-3-timer`). Never touch features outside the prompt.
2. Before coding, state your plan in 5 lines or fewer. After coding, list the files you changed and how to run and test the change.
3. Keep functions small. Add comments only where the reason is not obvious. No dead code, no placeholder features.
4. Use timestamps for timers, never decrement counters.
5. Validate all external input (paths, URLs). Only `http` and `https` links. Scope Tauri capabilities to exactly what is used.
6. No network calls, no telemetry, no passwords, no clipboard monitoring.
7. If a requirement is unclear, make the smallest reasonable choice, say what you chose, and continue.
8. Finish by running the app and the checks listed in the prompt, then stop and wait. Do not start the next feature.
9. Commit with a clear message. The user pushes to GitHub after every session.

Reference visuals: `prototype/index.html` and `screenshots/` show the target layout and behaviour. Match the layout; improve the cat art later.
