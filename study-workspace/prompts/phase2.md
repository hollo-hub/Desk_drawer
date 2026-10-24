# Phase 2 prompts (start only after Phase 1 is released and used for a week)

## P2-1 Rich notes and session summary
Evolve the dedicated course-linked Notes page with useful formatting and search while keeping local autosave. At session end offer an optional one-line summary saved with the session and shown in History. Done when notes and summaries survive restarts and never block ending a session.

## P2-2 Task planning
Extend the existing low-friction task list with optional due dates, priority, and a clear next action on the desk. Keep task state local and make completion a one-action interaction.

## P2-3 Resource library
Add a dedicated course resource view for organizing links, file references (including video), and folders into user-created groups. Existing resources must appear in a default group without changing their paths. Support adding, opening, removing and regrouping resources. Default to opening files in place; never copy or move files without an explicit user action. Done when resources survive restart and can be added, organized, and opened from the course workspace.

## P2-4 Workspace personalization
Allow choosing an appearance and organizing dashboard components; connect pixel-character states and interactions to real study activity. Keep defaults polished and preserve keyboard/reduced-motion support.

## P2-5 Weekly stats
Add a Stats view reachable from the top bar: hours per course this week and last week as simple bars, total sessions, longest streak of study days. Weeks start Monday 00:00 local time. Done when numbers match the log and the week rolls over correctly on a changed system date.

## P2-6 Download filing
Watch the user’s Downloads folder with the `notify` crate. For new files (ignore partial downloads such as `.crdownload` and `.tmp`) suggest a course using filename rules the user sets per course (keywords). Show a small card: “Move {file} to {course}?” with Move and Dismiss. Moves go to the course folder, rename on conflict, never overwrite or delete, and can be undone for 10 minutes. Feature is off by default and enabled in Settings. Done when a PDF with a matching keyword is offered, moved and undone correctly.

## P2-7 Notifications and tray
Send a system notification at session end. Add a tray icon with Start, Pause and Quit. Closing the window minimises to tray while a session is running and keeps timing. Notifications can be turned off in Settings. Done when a session completes correctly with the window closed to tray.

External Notion and ChatGPT integrations are a later, opt-in phase. Do not store provider passwords or make the core course workflow depend on a network connection.
