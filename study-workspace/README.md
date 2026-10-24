# Desk Drawer Study 2.0.0

A local-first study workspace, released as a separate Windows app alongside the
main Desk Drawer desktop companion. Choose a course, open its study kit, take
Markdown notes, track tasks, and run a stopwatch or countdown without switching
between multiple applications.

## What's new in 2.0.0

- **A clean, new-user Desk:** courses start empty; no sample courses or
  pre-filled study content.
- **Interactive one-time guide:** spotlights the real controls while keeping
  them usable.
- **Desk Buddy ghost:** pixel-art states, idle animation, shuffled
  non-repeating encouragement, and a bouncing speech bubble.
- **Focus timer polish:** stopwatch starts at zero, custom countdowns accept
  1-180 whole minutes, and the halo fades during both countdown and stopwatch
  sessions.
- **A real study workspace:** searchable Markdown notes, lightweight tasks,
  grouped folders/links/files (including videos), session history, and weekly
  stats.
- **Personalization:** light/dark appearance, notification and sound toggles,
  optional Downloads filing, and configurable Desk components.
- **Quiet autosave:** routine success notices are gone; save failures remain
  visible.

See [docs/02-design-and-layout.md](./docs/02-design-and-layout.md) and
[docs/05-buddy-ghost.md](./docs/05-buddy-ghost.md) for design details.

## Download

Get the Windows installer from the
[Desk Drawer Downloads releases](https://github.com/hollo-hub/Desk_drawer-downloads/releases/latest).
The installer is named `Desk Drawer Study_2.0.0_x64-setup.exe`.

This is a separate app from the main Desk Drawer utility workspace. It uses its
own app identifier and keeps its local study data separate.

## Run or test from source

Requires Node.js 22, Rust, and the platform dependencies for Tauri 2.

```sh
npm ci
npm test
npm run build
npm run tauri -- dev
```

Build Windows NSIS installers on Windows with:

```sh
npm run tauri -- build --bundles nsis
```

The private repository's `Desk Drawer Study Windows release` workflow builds
and retains the installer as an Actions artifact when a `study-vX.Y.Z` tag is
pushed. To publish releases automatically to the public Downloads repository,
an administrator can add a fine-grained `DESK_DRAWER_DOWNLOADS_TOKEN` Actions
secret with Contents write access to `hollo-hub/Desk_drawer-downloads`. Without
that secret the build still completes and the installer remains downloadable
from the workflow artifact for manual promotion.

Study data is stored locally. Resource paths are validated before opening;
files are never copied or moved unless the user explicitly enables and confirms
optional Downloads filing. Links are limited to credential-free HTTP(S).

## License

Desk Drawer Study is proprietary software. See the repository
[LICENSE](../LICENSE). Bundled third-party assets retain their own licenses;
the included CC0 sound license is in `public/sounds/LICENSE.txt`.
