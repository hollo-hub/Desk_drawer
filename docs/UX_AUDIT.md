# Desk Drawer UX Audit

**Date:** 2026-10-11  
**Scope:** Phase A review before Stage 10 / Phase B implementation

## Review method and limits

I read `AGENT_BRIEF.md`, reviewed the current HTML, CSS, frontend behavior,
Tauri window configuration and native tray/shortcut setup, and inspected the
shared app page at a 686 × 960 browser viewport. The shared page is the Vite
preview, not the native Tauri window. Its status area reports a failed theme
save because the Tauri `invoke` API is unavailable in that preview, and the
console reports a similar native API error for desk customization.

Consequently, this review can assess the web UI and configuration, but it
cannot establish native title-bar behavior, actual monitor DPI scaling,
window-state restoration, tray behavior, native permission prompts, or
performance. No 100%, 125%, or 150% Windows scaling test was run.

## Findings

| # | Finding | Why it matters | Proposed fix | Effort | Priority |
|---|---|---|---|---|---|
| 1 | The workspace is vertically dense. The enabled drawers and utility modules are all rendered as tabs; the inspected preview showed 15 tabs over three rows. The configured window is 800 × 680 with a 520 × 560 minimum, and the CSS switches to three tab columns at narrow widths. | At the minimum size, navigation can consume much of the height needed by the selected tool. At 150% scaling, usable logical space may be tighter still. | Group or collapse secondary tools, preserve one clear primary action per page, and test every page at the configured minimum and at 100/125/150% scaling. | M | P1 |
| 2 | Settings is a single short page, not a discoverable settings system. It currently exposes close-to-tray, launch-at-login, buddy mode, Glass opacity, and desk image/sticker controls. There is no settings search, section navigation, per-section reset, command palette, or consistent live preview. | Users cannot find or reset settings by intent, and adding Stage 10 controls to this page will make it harder to scan. | Build the planned Settings sections and searchable setting metadata; provide plain descriptions, live application, reset-to-default per section, and a clear restart prompt only for unavoidable native changes. | L | P1 |
| 3 | Design tokens cover theme colors, but most spacing, typography, border widths, shadows, radii, and motion values remain literal CSS values. Values include 3 px borders, 5 px shadows, several font sizes, and unrelated spacing increments. | Visual changes and new themes can drift between pages; the layout does not consistently follow the requested 4 px rhythm. | Create one shared token layer for color, spacing, type, borders, shadows, radii, and motion; migrate existing styles rather than adding a parallel token system. | M | P1 |
| 4 | Accessibility foundations are mixed. A visible `:focus-visible` outline exists and many controls have labels/status regions, but custom tab strips do not expose a keyboard shortcut guide; the main tab strip is not observed to implement arrow-key/roving-focus navigation. Text sizes are fixed in CSS and no user text-size setting or high-contrast theme is present. | Keyboard-only users may have to tab through many controls, and users needing larger text or stronger contrast have no in-app controls. | Add a shortcuts sheet, complete tab keyboard semantics and focus order, and implement text sizing and high contrast with Windows contrast preferences considered. Keep reduced-motion behavior, which is already present in CSS, and test it alongside all new effects. | M | P1 |
| 5 | Empty and task states are inconsistent. There are useful startup/status/error messages in some areas (for example module startup, installed packs, and Tidy Downloads), but several content lists begin as empty lists without a shared empty-state pattern. State coverage is not documented per drawer/module. | An empty list can look like missing or broken content; disabled, loading, success, and failure states vary by feature. | Inventory each drawer and module state, then standardize concise empty/loading/error/success/disabled messaging with a next action where appropriate. Preserve inline feedback and use undo instead of confirmation where safe. | M | P1 |
| 6 | Windows integration is partly configured but not acceptance-tested in this review. Tauri sets a native decorated, resizable, visible, taskbar window with minimum dimensions; the native code configures a tray and Ctrl+Shift+Space shortcut. The UI offers Cozy/Night/Glass selection, but does not expose system-following theme, Windows accent, high contrast, or text scaling. | The app may feel inconsistent with Windows, and the requested Native/Soft modes, scaling behavior, tray escape paths, and monitor transitions have native-only failure modes. | Preserve Native as the default; validate current window/tray behavior first, then test style switching, maximize/snap, drag/resize, monitor changes, saved bounds, scaling and close-to-tray on real Windows displays. | L | P1 |
| 7 | User-facing English strings are embedded in HTML and JavaScript instead of a language resource. | New Settings, onboarding, permission, and diagnostics copy will be difficult to translate consistently if added the same way. | Extract all user-facing copy into an English resource module and route new and existing UI text through it; keep identifiers and diagnostic details separate from displayed copy. | M | P2 |
| 8 | Release and performance evidence does not cover the proposed new interactions. No native measurements for physics animation, Lock mode, or Eco Off/On comparisons were taken during this audit. | Animation and system-monitoring features have explicit CPU, idle, privacy, and escape-safety requirements that cannot be inferred from a successful frontend build. | Add focused tests and a repeatable native measurement checklist; report only measurements actually captured, including visible, hidden/tray, and roam cases for Eco. | L | P1 |

## Window-frame plugin assessment

The current `tauri-plugin-frame` crate is a plausible candidate for **Soft-mode
title-bar controls**, but it does not cover the whole requested window-style
feature. Its published v1.1.8 README describes Tauri v2 support on Windows 10
and 11, custom title-bar controls, and a native Windows 11 Snap Layout hover
path using `HTMAXBUTTON`. Snap Layouts are Windows 11-only. The plugin does not
provide the 24 px transparent desk margin, app-specific resize handles, or
window physics; those still need separate implementation and testing.

The plugin is third-party, not an official Tauri plugin. Its documented setup
uses undecorated windows and requests window-operation permissions; it also
documents enabling `withGlobalTauri`. That wider JavaScript API exposure is a
security trade-off and should not be enabled casually. **Recommendation:** do
not add it during the audit. During the Soft-window substep, first inspect its
current source/API and required capabilities against this app's security
configuration. Use it only if the needed Snap Layout path works without
unnecessary privilege expansion; otherwise keep Native as the robust fallback
and implement only the necessary custom frame integration.

References checked:

- [Tauri v2 window customization](https://v2.tauri.app/learn/window-customization/)
- [Tauri v2 window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/)
- [`tauri-plugin-frame` 1.1.8 crate README](https://crates.io/crates/tauri-plugin-frame/1.1.8)

## Proposed Phase B plan

Proceed one sub-step at a time and stop for review after each gate:

1. **B1 — Settings foundation:** implement categorized Settings, metadata-based
   search across names and descriptions, live persistence/migrations, preview
   and per-section reset. Add migration and settings-search tests. Start with
   controls needed by later phases; avoid a broad redesign in this step.
2. **B2 — Developer mode:** keep all developer UI absent unless enabled; add
   filtered event inspection, matched/skipped rule explanations, live buddy
   mood/state and sensor views, test events/forced states/clock override, pack
   validation/reload, logs, feature flags, performance overlay, data-folder
   access, and per-module data reset. Keep DevTools development-only unless a
   release-safe design is proven. Add event-filter tests; no telemetry.
3. **B3 — Eco mode:** implement Off/Auto/On and explain why Auto activates;
   reduce animation/polling/work and pause roam as specified. Add switching
   tests and measure Off versus On for visible, hidden/tray, and roam cases.
4. **B4 — Audit P0/P1 polish:** centralize design tokens; correct minimum-size
   density, state coverage, keyboard/focus behavior, contrast, screen-reader
   labels and text sizing; test the Windows scaling matrix and system reduced
   motion.
5. **Stage 10 window/accessibility controls:** add Native/Soft style selection
   with a restart prompt only if required; implement Soft titlebar controls,
   drag, resize, maximize, double-click and Windows 11 snap support, plus the
   approximately 24 px transparent desk margin. Add Transparent theme with
   legibility outline/shadow and separate panel/drawer/text opacity. Add Lock
   mode only with click-through behavior and a tested escape via the buddy,
   rebindable hotkey and tray unlock, plus a visible unlock hint.
6. **Stage 10 motion:** in Soft mode, add spring-driven drag sway, springy
   open/close, shrink-to-tray hide, drawer-tab magnification, rubber-band list
   scrolling, optional cursor tilt, and reminder bounce/taskbar flash. Provide
   master/effect toggles, Off/Calm/Lively intensity, and stiffness/bounciness;
   reduced motion and Eco must force effects off. Measure active CPU against
   the 2% cap and verify zero animation work while idle.
7. **Stage 10 essentials and onboarding:** add Eco controls and reasons, Quiet
   hours, high contrast, text size, screen-reader labels, and an onboarding
   tour for buddy name/theme/mode/Stage 9 permissions. Move all user-facing
   text into English language resources. Add local logs, Copy diagnostics,
   two-crash startup safe mode, portable ZIP and Credits/licenses.
8. **Stage 10 update and acceptance gate:** keep the opt-in update check off by
   default, show its own permission prompt, and make release metadata checking
   the only network call; no telemetry or other network access. Test migrations,
   theme validation, clamped physics settings, safe mode, lock escape,
   window-style interactions, display scaling and reduced motion. Compare
   Native/Soft, capture jelly motion and CPU figures, and list every native
   check that remains untested.

## Phase A result

The audit is complete. No application code was changed. The UX findings and
proposed sequence above are not implementation approval: stop here until the
owner approves or revises the Phase B plan.
