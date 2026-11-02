# Desk Drawer

Desk Drawer is a Windows desktop companion that brings everyday utilities and
a customizable animated buddy together in one focused workspace. It is built
with Tauri 2, Rust, and a modular HTML, CSS, and JavaScript interface.

The application is designed to work locally: settings, notes, themes, and
clipboard history are stored on the device. Desk Drawer does not require an
account or cloud service.

> **Desk Drawer 0.1.0** | Windows | Published by hollo-hub

## Development status

Desk Drawer is currently an early prototype, and version 0.1.0 is an initial
release rather than a finished product. The app and its version number will
continue to evolve as features are refined, issues are addressed, and new
releases are made. Users can expect the experience to improve over time, but
features and behavior may change between versions.

## What it includes

### Productivity tools

- **Clipboard** — search, pin, pause, and manage recent text, links, and color
  entries.
- **Links** — save and organize websites, folders, and applications.
- **Layouts** — arrange eligible desktop windows with Coding, Writing, and
  Video Call presets.
- **Rename** — preview file-name patterns before applying them.
- **Focus Timer** and **Break Buddy** — run configurable focus sessions and
  break reminders.
- **Scratch Notes**, **Color Picker**, **Keep Awake**, and **Pin Window**.
- **Tidy Downloads** — preview file organization before moving files, with an
  undo option.
- **Scenes** — save and run timed desktop workflows.

Tools are managed as independent modules, so you can enable only the features
you use.

### Buddy and personalization

Break Buddy supports animated sprites, mouse interaction, personality-driven
behavior, and validated desk packs. Switch among bundled buddies, install the
included Slime variants, or create a buddy from a validated sprite sheet.
Animation and movement can be controlled separately.

Personalize the workspace with ten built-in themes, custom themes, background
images, stickers, and appearance settings. Eco and reduced-motion options
provide additional control over visual effects.

### Desk Drawer Study (separate app)

The private source repository also contains [`study-workspace/`](./study-workspace/),
a separate local-first study dashboard. It has its own product name, data
identifier, source, tests, and Windows release workflow; it does not replace or
share the main app's settings or data. See its
[2.0.0 release notes and setup](./study-workspace/README.md).

## Download

Windows installers are published in the
[Desk Drawer releases](https://github.com/hollo-hub/Desk_drawer-downloads/releases).
The public download repository contains release materials, not the application
source code.

## Build from source

### Prerequisites

- Windows 10 or later
- Node.js compatible with Vite 8
- Rust 1.90 or later
- Visual Studio C++ Build Tools and the Windows SDK

### Development

From the project root, install the locked JavaScript dependencies and start
the Tauri development application:

```powershell
npm ci
npm run tauri -- dev
```

The development build uses the configured Vite server and loads the current
frontend source.

### Checks and release build

Run the frontend tests and production build:

```powershell
npm test
npm run build
```

Run Rust formatting and unit tests:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Build Windows installers with:

```powershell
npm run tauri -- build --bundles nsis,msi
```

Tauri writes the application and installer bundles to
`src-tauri/target/release/`.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/` | Frontend, shared application services, and utility modules |
| `src-tauri/` | Native Windows integration and Rust application code |
| `packs/` | Bundled buddy packs and their manifests |
| `src/themes/` | Built-in theme definitions |
| `tests/` | Frontend and application tests |
| `docs/` | Product and technical reference documents |

## Documentation

- [Contributing](./CONTRIBUTING.md) — development conventions and implementation
  expectations.
- [Buddy pack guide](./PACK_GUIDE.md) — pack structure, manifests, and
  validation.
- [Theme format](./docs/THEME_FORMAT.md) — custom theme schema and asset rules.

## License

Desk Drawer is proprietary software, copyright © 2026 hollo-hub. All rights
reserved. See [LICENSE](./LICENSE) for the application terms. Bundled
third-party software, fonts, and assets remain under their respective licenses
and notices.
