# Contributing

Desk Drawer is an offline-first Windows desktop app built with Tauri v2,
vanilla HTML/CSS/JavaScript, and Rust for native features. Keep changes small,
preserve the existing app foundation, and do not add network calls, accounts,
telemetry, arbitrary pack scripting, or unnecessary dependencies.

## Development setup

Install Node.js, Rust, Visual Studio C++ Build Tools, and the Windows SDK. From
the project root:

```powershell
npm ci
npm run tauri dev
```

Run the frontend tests and build with:

```powershell
npm test
npm run build
```

Run native checks from `src-tauri`:

```powershell
cargo fmt -- --check
cargo check --lib -j 1
cargo test --lib -j 1
```

Build Windows installers with `npm run tauri build`.

## Implementation expectations

- Toolbox features are independently toggleable modules. Keep module imports
  lazy, and release event listeners, timers, native workers, and other owned
  resources from `stop()`.
- Use the existing event bus for small, coarse buddy reaction events. Never
  send clipboard contents, filenames, or note contents to behavior rules.
- Persist preferences through the Rust settings helpers so writes remain
  atomic, backed up, and schema-versioned.
- Treat user-provided paths, archives, images, and manifests as untrusted.
  Validate on the native side, cap sizes, reject SVG, and never execute pack
  content.
- Surface errors to the user; do not hide failed native operations behind
  success-shaped fallbacks.
- Update directly related tests and documentation. Do not commit secrets or
  include personal data in fixtures.

## Pull requests

Describe the user-visible behavior, tests run, manual Windows checks still
needed, and any known limitations. For UI changes, include a screenshot or GIF
when practical. Do not claim native acceptance based only on a browser preview
or a successful compile.
