# Design and layout

## Layout: stage and dock
The Desk Buddy ghost is the centre of the Desk page. Courses live in a dock at the bottom. Desk, Notes, and Tasks are separate, lightweight pages connected by the selected course. Editing slides over from the right (bottom sheet on phones).

```
+--------------------------------------------------+
| Desk Drawer       Desk   Resources   Notes   Tasks |
|                                                  |
|         [ ghost buddy says something ]           |
|                                                  |
|                 ( halo )                         |
|                ( pixel ghost )                   |
|                                                  |
|                   24:31                          |
|                  Algorithms                      |
|             (25 min) (50 min) (Custom)         |
|             [ Pause ]  [ End ]                   |
|                                                  |
| [Algorithms][Databases][Networks 5 days]  +  Edit |
+--------------------------------------------------+
        slide-over: course resources and settings
```

## Components
- **Bubble:** one short sentence in the buddy’s voice, polite live region; idle lines rotate without repeating until the set is exhausted, and the bubble bounces when its message changes.
- **Stage:** animated ghost, halo, big timer, course name, length chips, Start/Pause and End.
- **Dock:** horizontally scrollable course cards (name, week time, bar, “N days” tag when untouched 4+ days), add, edit.
- **Notes page:** a course notebook with searchable titled notes, a Markdown insertion toolbar, silent autosave with explicit error feedback, and character count.
- **Tasks page:** quick-add course tasks with one-action completion; the first unfinished task appears as a shortcut on the Desk.
- **Resources page:** course-scoped folders, links, and files grouped by the user; add and open resources in place with no implicit copying or moving.
- **History page:** reverse-chronological sessions with course, date, duration, completion state, and optional reflection.
- **Course sheet:** course identity, folder picker, web links, and file/app picker; selected resources stay at their original paths and open with registered desktop apps.
- **First-run tour:** one-time dimmed overlay with a movable card and live spotlight. Targets stay clickable so the guide teaches the real controls; Skip ends the tour permanently.

## Buddy states
| State | Eyes | Motion | Bubble example |
|---|---|---|---|
| idle | open, blink every ~3.6s | slow bob; hem frame changes every ~350ms | “Ready when you are.” |
| focus | focused eyes | slow breathing | “Opened your folder and 3 links. Focus.” |
| done | happy eyes | three hops, sparkles in course colour | “Nice work: 25 min on Algorithms.” |
| nudge | concerned eyes | idle | “It’s been 5 days since Networks.” |
| paused | open | still and faded | “Paused.” |
| blink | closed | brief, then returns to idle | — |

## Halo
Appears at session start as a full ring in the course colour. For countdowns, the arc shortens with time remaining; for the stopwatch it shortens over the selected focus length, then stays hidden. Pausing freezes progress. Keep opacity constant and respect the operating system’s reduced-motion preference.

## Tokens
- Colour: Dusk lavender `#cfd9f2`, Sand `#f6e6dc`, Ink `#2b2d42`, Rose `#e58a9b`, Teal `#5fb3a8`, Amber `#e2b25c`. Dark theme: `#1d1f36` to `#2e2a4a`.
- Type: system rounded stack, 64px timer, 14px body, 12px minimum.
- Shape: 20px panels, 14px controls, pill chips.
- Motion: gentle transitions answer interactions, plus the buddy’s own idle. Respect the operating system’s reduced-motion preference.
- Look target: open, uncluttered stage with a soft palette and frosted panels; the ghost stays hard-edged pixel art for contrast.

## Accessibility
Keyboard reachable everything with visible focus; timer announced with a timer role; buddy messages in a polite live region; colour never the only signal (selected card has a border, untouched courses have a text tag); the operating system’s reduced-motion preference disables animation; editable fields keep text selection; minimum 12px text; check contrast of muted text on glass.

## Empty and error states
See `03-onboarding-tutorial.md`.

Courses require a name for identification, but every resource and note is optional. A named course with no folder, links, files, tasks, or notes is valid.
