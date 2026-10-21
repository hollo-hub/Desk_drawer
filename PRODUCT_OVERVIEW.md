# Desk Drawer — Product and Feature Overview

**Presentation brief · Project snapshot: October 2026**

## At a glance

Desk Drawer is a Windows desktop companion that brings small everyday tools
and a customizable animated desk buddy into one compact workspace. It is
designed to make common desktop tasks easier to reach while adding a friendly,
personal touch to the workday.

The project is at an early prototype stage (version 0.1.0). Its current
direction is a modular, locally focused utility: people can choose which tools
to enable, personalize the look and behavior, and keep their notes and
preferences on their own device.

### Short introduction for a talk

> Desk Drawer is a customizable Windows companion that combines an animated
> desktop buddy with practical tools like clipboard history, saved links,
> focus timers, window layouts, and file organization. Instead of making users
> open a separate app for each small task, Desk Drawer puts useful utilities
> in one personal workspace—and lets people choose how it looks and behaves.

## Who it is for

- People who regularly switch between small desktop tasks and want quick
  access to lightweight utilities.
- Students, writers, developers, and remote workers who use focus sessions,
  saved resources, or repeatable window arrangements.
- Anyone who enjoys a more personal desktop, including an animated companion
  and customizable themes.

## Features

### Everyday tools

Desk Drawer is built from independently manageable modules. Users can enable
the tools they want rather than having every feature active.

| Tool | What it does |
| --- | --- |
| **Clipboard** | Browse and search recent clipboard text; pin useful entries, pause capture, manage history, and reuse saved text, links, or color entries. |
| **Links** | Save and search websites, folders, and applications for quick access. |
| **Layouts** | Arrange eligible open windows using Coding, Writing, and Video Call presets. |
| **Rename** | Preview file-name patterns for selected or dropped files before applying a rename. |
| **Focus Timer** | Run a configurable focus countdown from 1 minute up to 7 days. Customize its countdown text color or use the current theme color. |
| **Break Buddy** | Keep an animated buddy on the desk and use break reminders to add a friendly prompt to work sessions. |
| **Scratch Notes** | Keep a small note stored on the device. |
| **Color Picker** | Pick a color, inspect its values, and copy its hexadecimal code. |
| **Keep Awake** | Temporarily prevent Windows from sleeping or turning off the display. |
| **Pin Window** | Keep the Desk Drawer window above other windows until it is unpinned. |
| **Tidy Downloads** | Preview a file sort by type before moving files. The operation checks for conflicts and supports rollback and undo. |
| **Scenes** | Save a work setup combining a window layout and optional focus timer. A scene can also open selected saved links, folders, or apps and offer a break after focus. |

### Animated desk buddy

- Choose among bundled animated buddies, including Tabby, Midnight, Snow, and
  three Slime variants.
- Import validated buddy packs or create a custom buddy from a supported
  sprite sheet.
- Configure personality and behavior rules in the Behavior Lab; supported
  rules can react to app events and buddy states.
- Interact with the buddy through desk movement and mouse actions. Its
  animations cover states such as idle, walking, sitting, sleeping, reacting,
  being carried, and falling.
- Control buddy movement and sprite animation separately, or switch to the
  optional desktop-roaming presentation. Roam uses separate transparent
  windows and is designed to avoid interfering with typing in other apps.
- Buddy packs are validated data packages. The app does not run code supplied
  by a pack.

### Appearance and personalization

- Choose from ten built-in themes: Cozy, Night, Transparent, Frost, Paper,
  Arcade, Forest, Savanna Dusk, Terminal, and High Contrast.
- Create, import, and export custom themes. Theme settings include colors,
  fonts, borders, corners, shadows, opacity, and selected visual effects.
- Add local desk backgrounds and stickers. Place stickers on the desk, move
  or resize them, and remove them when no longer needed.
- Pick between Native and Soft window styles. Soft provides custom window
  movement, resize controls, and spring-style transitions; Native keeps the
  standard Windows window frame.
- Adjust motion and animation preferences, including reduced-motion choices,
  optional effects, and an Eco setting. These settings provide controls; the
  app's real-world power and performance impact has not yet been fully
  benchmarked.

### Settings and advanced tools

- Search categorized settings by name or description and navigate with the
  Ctrl+K command palette.
- Enable or disable modules and reset supported preference sections.
- Use optional Developer mode for diagnostics such as event summaries,
  behavior-rule traces, test controls, pack checks, local logs, and process
  performance snapshots. Developer mode is off by default.
- Use Windows tray and startup integrations to keep the companion accessible
  and configure whether it starts with Windows.

## How it is designed

- **Windows desktop app:** Built with Tauri 2 and Rust for the native desktop
  layer, with an HTML, CSS, and JavaScript frontend.
- **Modular:** Features are organized as separate tools that can be managed
  independently.
- **Local-first:** The app does not require an account or cloud service.
  Settings, notes, themes, and clipboard history are stored on the device.
- **Personalizable:** Themes, backgrounds, stickers, buddy packs, and motion
  settings let users shape the workspace.
- **Validated imports:** Custom theme and buddy files are checked against
  defined formats and asset limits before use.

## Current status and things to be clear about

Desk Drawer 0.1.0 is an early prototype, not a finished product. The feature
set above describes the current project implementation; individual modules
may be off until enabled. Some native Windows interactions still need more
hands-on testing, especially theme importing and visual effects, display
scaling and multi-monitor behavior, animation settings, and first-run
preference/consent flows. Performance and battery-use measurements are not yet
comprehensive, and a release workflow still needs an end-to-end tagged-release
check.

## Future direction

The project notes identify these areas for continued work:

- Improve onboarding and first-run setup, and finish native verification of
  settings and consent prompts.
- Continue polishing the experience and verify tray/close behavior is easy to
  understand.
- Measure animation smoothness, CPU, memory, and Eco behavior on real Windows
  systems; refine motion and buddy idle presentation based on those results.
- Expand accessibility and reach through localization and carefully tested
  reduced-motion behavior.
- Explore a safe Lock mode, diagnostics/safe mode, portable packaging, and
  additional release polish.
- Complete native acceptance testing for custom themes, buddy packs, window
  behavior, display scaling, and multi-monitor setups.

These items are areas for future development and verification, not promises
about a release date or guaranteed roadmap.

## Suggested talk flow

1. **The problem:** Small desktop tasks are scattered across separate tools,
   while the desktop itself often feels impersonal.
2. **The idea:** Put a set of practical, optional utilities and a customizable
   animated buddy together in one desktop companion.
3. **A quick tour:** Show the modular tools, a focus session or scene, then the
   buddy and one visual customization.
4. **What makes it different:** Local-first design, per-tool choice, validated
   personalization, and motion settings.
5. **What comes next:** Finish usability and native testing, measure real
   performance, and prioritize accessibility and onboarding.

## Project links

- [Project README](./README.md) — build instructions, development status, and
  project structure.
- [Buddy pack guide](./PACK_GUIDE.md) — how validated buddy packs are
  structured.
- [Theme format](./docs/THEME_FORMAT.md) — custom theme file and asset format.
