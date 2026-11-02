# Retro style brief

## Purpose

Desk Drawer should feel like a personal study tool with a clear point of view,
not a generic AI productivity dashboard. The proposed direction is a **cozy
16-bit study console**: retro software structure, pixel-art character,
restrained motion, and a readable writing experience.

This brief is a conversation starter for the creative team. It becomes an
implementation contract only after the team confirms the decisions marked
**TBD**.

## Direction

**One sentence:** Desk Drawer is a cozy 16-bit study console that makes opening
a course and starting focus feel like using a personal desktop game cartridge.

### Avoid

- Glassmorphism, frosted cards, and large decorative gradients
- Generic AI-dashboard layouts
- Excessive rounded pills and floating cards
- Constant movement or decorative animation
- Pixel fonts for long-form reading
- Game mechanics that make study setup slower

### Keep

- The empty-by-default first launch
- The one-time interactive guide
- The Desk Buddy ghost
- A one-action route from course selection to study start
- Local-first storage and explicit save errors
- Searchable Markdown notes and practical resource handling

## Decisions needed from creative

| Area | Proposed baseline | Creative decision |
|---|---|---|
| Retro reference | Cozy 16-bit study console | **TBD:** game, 90s software, early web, or another reference |
| Character | Pixel ghost buddy | **TBD:** final character, personality, and approved sprite |
| Display font | Bitmap/pixel font for timer and labels | **TBD:** font file and license |
| Reading font | Readable system or humanist sans-serif | **TBD:** final body font |
| Corners | Square or very small radius | **TBD:** exact radius |
| Borders | 2px dark pixel border | **TBD:** thickness and shadow |
| Motion | Small state-based animations only | **TBD:** motion limits and timing |
| Sound | Optional short interface sounds | **TBD:** final sound set and license |
| Texture | Flat color or subtle pixel texture | **TBD:** texture usage and asset source |

## Proposed visual tokens

These are starting values, not final approvals.

```text
Ink / border       #25233A
Warm paper         #F5EBDD
Lavender panel     #C9C4E8
Coral accent       #E58A9B
Teal accent        #5FB3A8
Amber highlight    #E2B25C
Muted text         #62657F
Error              #A52F49
```

The final palette should stay compact. Each color needs a role, a contrast
check, and a light/dark-theme equivalent. Color must not be the only signal for
selection, completion, warnings, or errors.

## Component rules

### Desk

- Make the buddy and timer the visual center.
- Use a clear rectangular status panel instead of a floating glass card.
- Keep the primary Start action visually dominant.
- Keep the course dock compact and scannable.
- Preserve the empty state: no sample course, task, note, or resource.

### Buddy

- Use crisp nearest-neighbor scaling.
- Keep the ghost decorative and announce text through the existing live region.
- Define final frames for idle, blink, focus, done, nudge, and paused.
- Use animation to communicate state, not as background decoration.
- Provide a static reduced-motion presentation.

### Timer

- Treat the timer as a compact game-status display, not a marketing hero.
- Keep `00:00` as the stopwatch starting value.
- Show countdown and stopwatch state with text as well as color or motion.
- Confirm whether the halo remains in the final direction or becomes a pixel
  progress bar, segmented ring, or status meter.

### Notes

- Prioritize writing comfort over visual novelty.
- Keep the editor readable at normal zoom.
- Use retro styling for the toolbar, note list, and metadata rather than
  turning the writing surface into a decorative texture.
- Preserve searchable titled Markdown notes and keyboard-friendly editing.

### Resources and tasks

- Resources may use a file-manager, shortcut, or inventory metaphor.
- Tasks may use a checklist or quest-list metaphor.
- Both must remain recognizable without requiring users to learn game rules.

### Guide and settings

- The guide should feel like built-in software help, not an AI assistant.
- Settings controls must remain obvious and accessible.
- Keep appearance, notification, sound, and reduced-motion choices easy to
  find.

## Motion and sound contract

The team should specify maximum duration and repetition for each animation.
The default should be calm:

- Idle buddy motion: slow and repeatable
- Message change: one short bounce
- Button feedback: one press response
- Page transitions: short and optional
- Timer start/end: one clear state change
- No looping background effects

Reduced-motion mode must remove non-essential motion while preserving state,
feedback, and usability. Sounds must be optional, short, licensed, and disabled
when the user turns interface sounds off.

## Required creative handoff

Before implementation, provide:

1. One approved direction sentence
2. Five to ten reference images with a note about what each contributes
3. Light and dark color palettes with contrast checks
4. Display and body fonts with licenses
5. Button, panel, border, shadow, and focus-state examples
6. Final buddy sprite dimensions, states, frames, and palette
7. A Desk layout sketch showing the primary Start action
8. A Notes layout sketch showing a realistic writing session
9. A mobile layout sketch
10. Motion and sound timing rules
11. A list of visual elements explicitly rejected

## Questions for the creative review

1. Which retro era or platform are we referencing?
2. Should the product feel more like software, a game, or a notebook?
3. Which current elements specifically feel AI-generated or generic?
4. Is the ghost final, and what personality should it communicate?
5. Should the timer feel like a HUD, a stopwatch, or a desk clock?
6. Should Notes look like a notebook, editor, or file system?
7. How much animation is acceptable during a focused session?
8. Which assets can the team deliver, and what licenses apply?
9. What should a user remember visually after one session?
10. Which decisions are mandatory for version 2.1, and which can wait?

## Product constraints

The redesign must not remove or weaken:

- Local-first operation and no telemetry
- Empty first-run workspace
- One-time interactive guide
- Stopwatch, countdown, pause, and resume
- Course resources, notes, tasks, history, and stats
- Dark mode, notifications, sound toggle, and reduced-motion support
- Explicit save failures
- The ten-second course-to-focus outcome
