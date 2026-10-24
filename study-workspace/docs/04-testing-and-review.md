# Testing and review

## Manual test checklist (Phase 1)
- [ ] Fresh install starts with an empty Desk; the first-run guide spotlights live controls, allows interaction, and never reopens after Skip or Finish
- [ ] Add 3 courses; rename; delete; deleting the last is blocked; restart keeps them
- [ ] Choose a folder and several files (including a video); Start opens folder, files in registered apps, links, and apps; missing folder shows message and timer still runs
- [ ] Notes and tasks pages stay course-scoped and persist across restarts; task completion and removal work; the first unfinished task links from Desk to Tasks
- [ ] Resources from older course data appear in Unsorted; create groups, move resources between them, remove a group without losing resources, open each resource, and verify original files never move
- [ ] Only http and https links open; `javascript:` and `file:` are rejected
- [ ] 25 min session: minimise 10 minutes, restore; time is correct
- [ ] Pause 1 minute then resume; end time shifts correctly
- [ ] End early under 5 seconds logs nothing; later than that logs actual minutes
- [ ] Halo arc shortens with time remaining, stays constant in opacity, and is gone at zero; cat hops at completion
- [ ] Window resizes, minimises, maximises, remembers size; closing quits cleanly
- [ ] Theme follows system and the toggle overrides it
- [ ] Dark appearance updates the full interface; system appearance tracks OS changes
- [ ] Interface sounds play on interaction and can be toggled off
- [ ] Session notifications request permission, can be disabled, and appear when a session ends
- [ ] Operating-system reduced-motion preference stops animation
- [ ] Desk Drawer logo returns to Desk from every workspace page
- [ ] Keyboard only: reach every control with visible focus
- [ ] Corrupt the data file on purpose; app starts from backup and tells the user
- [ ] Idle CPU under 1 percent, memory stable over a 2 hour session

## Notes and History checks
- [ ] Create a named course with no folders, links, files, notes, or tasks; it saves and remains usable.
- [ ] Create multiple notes in one course, search by title and body, edit titles and content, and delete a note.
- [ ] Use each Markdown toolbar action with and without a text selection; autosave survives restart.
- [ ] Existing single-text course notes appear in the notebook after migration without losing their content.
- [ ] End a logged focus session; the optional reflection can be skipped, saved later in History, and survives restart.

## Questions for outside reviewers
1. After 30 seconds, can you say in one sentence what this app is?
2. Would you use it before every study session? What would stop you?
3. What felt pointless, confusing or slow?
4. What do you already do by hand that is missing here (tabs, folders, notes)?
5. Is the cat helpful, distracting, or both?
6. Would you install it or recommend it? Why or why not?

## Critique template (copy per reviewer)
Reviewer, course/year: ____ Date: ____
First impression (one line): ____
Where I got stuck: ____
Most useful part: ____
Least useful part: ____
Would use weekly? Yes / Maybe / No. Why: ____
One thing to add, one thing to cut: ____

## Remaining validation
- The configured Windows NSIS installer still needs to be built and tested on Windows.
- The two-week real-use checkpoint must be completed before deciding whether to continue.
- Final cat artwork and a contrast review remain separate polish work.
