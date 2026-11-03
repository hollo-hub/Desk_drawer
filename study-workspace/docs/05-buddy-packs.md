# Buddy sprite packs

The Desk Buddy is a decorative, state-driven sprite. Rendering is data-driven:
the default ghost pack lives in `src/buddy/packs/ghost.js`, and adding another
pack should require one new file in that directory.

## Pack contract

Each pack provides:

- SVG frames for `idle`, `blink`, `focus`, `done`, `nudge`, and `paused`
- A private palette that includes a silhouette rim and a stage backdrop
- A stable id, display name, and default marker

The registry discovers pack files automatically. Buddy colors never inherit
the course accent. A pack backdrop keeps both dark and light sprites readable
in either theme.

Legacy skin data with a `ghost` field is normalized to the new `buddy` field
when loaded. New data should use `buddy`; the compatibility path exists only
to preserve existing user files.

## States and accessibility

- **Idle:** gentle motion and occasional blinking; idle messages are shuffled
  without immediately repeating.
- **Focus:** focused pose and calm breathing during a session.
- **Paused:** still, faded body and a short pause message.
- **Done:** completion pose and small celebratory sparkles.
- **Nudge:** reminder pose when a course has gone untouched.
- **Blink:** brief closed-eye frame, then return to idle.

The buddy is decorative (`aria-hidden`); its separate bubble is a polite live
region. The bubble never replaces focus, paused, completion, or nudge messages
with idle chatter. Reduced motion stops non-essential sprite and bubble
animation while preserving the state art and message.

The buddy is hidden in the empty desk state. Its focus halo is a separate
course-colored UI indicator and follows timer progress.
