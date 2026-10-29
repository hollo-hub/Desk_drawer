# Desk Buddy ghost

The ghost is the Desk’s pixel-art companion: a friendly, compact visual cue rather than a mascot that blocks study actions. Keep its styling consistent with the soft lavender workspace and make its state legible without relying on color alone.

## Sprite and states

`src/buddy/ghost-sprite.js` generates crisp, scalable 16×16 SVG sprites. It accepts the state (`idle`, `blink`, `focus`, `done`, `nudge`, or `paused`), hem frame (0 or 1), and coat (`lavender`, `mint`, `coral`, or `sunny`). Lavender is the default; course colors may select a matching coat where available.

- **Idle:** gentle CSS bob, alternating hem frame about every 350 ms, and a brief blink about every 3.6 seconds. The bubble rotates through ten encouragements in a shuffled order without immediately repeating.
- **Focus:** focused eyes and gentle breathing while a session is active.
- **Paused:** still, faded body and a short “Paused.” message.
- **Done:** happy expression, three small hops, and course-colored sparkles.
- **Nudge:** concerned expression and the once-per-launch study reminder.
- **Blink:** short closed-eye frame, then return to idle.

Bubble text changes use a brief bounce. The bubble remains a polite live region and never replaces the focus, paused, completion, or nudge message with idle chatter.

## Accessibility and behavior

Respect the operating system’s reduced-motion preference: stop hem-frame changes, blinking, bobbing, hops, and bubble motion while keeping state illustrations and messages. The buddy is decorative (`aria-hidden`) because its messages are announced separately by the bubble. When there is no selected course, the empty desk stays uncluttered and the buddy is hidden.

The focus halo begins full at session start. Countdown sessions shrink it with remaining time; stopwatch sessions shrink it over the selected focus length. A pause freezes the halo, and ending the session hides it.
