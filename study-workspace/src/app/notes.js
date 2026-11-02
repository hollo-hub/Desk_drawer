import { appState } from "./state.js";
import { createCourseNote, searchCourseNotes, updateCourseNote } from "../note-model.js";
import { findCourse } from "./workspace.js";
import { noteCharacterCount, noteContentInput, noteEditor, noteList, noteListEmpty, noteNoSelection, noteSearchInput, noteTitleInput, notesSaveHint } from "./dom.js";
import { scheduleSave, setSaveStatus } from "./persistence.js";

export function renderNotesWorkspace(course) {
  if (!course) {
    renderNoteList();
    return;
  }
  const notes = notesForCourse(course.id);
  if (!notes.some((note) => note.id === appState.selectedNoteId)) {
    appState.selectedNoteId = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? null;
  }
  renderNoteList();
  const selectedNote = notes.find((note) => note.id === appState.selectedNoteId);
  noteEditor.hidden = !selectedNote;
  noteNoSelection.hidden = Boolean(selectedNote);
  if (selectedNote) {
    noteTitleInput.value = selectedNote.title;
    noteContentInput.value = selectedNote.content;
    noteCharacterCount.textContent = `${[...selectedNote.content].length.toLocaleString()} characters`;
    noteSaveHintFor(selectedNote);
  }
}

export function renderNoteList() {
  noteList.replaceChildren();
  const course = findCourse(appState.selectedCourseId);
  const notes = course ? notesForCourse(course.id) : [];
  const matchingNotes = searchCourseNotes(notes, noteSearchInput.value)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  noteListEmpty.hidden = matchingNotes.length > 0;
  noteListEmpty.textContent = notes.length > 0
    ? "No notes match your search."
    : "No notes yet. Create one to get started.";

  for (const note of matchingNotes) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-list-item";
    button.dataset.noteSelect = note.id;
    button.setAttribute("aria-current", String(note.id === appState.selectedNoteId));
    const title = document.createElement("strong");
    title.textContent = note.title;
    const preview = document.createElement("span");
    preview.textContent = note.content.trim().replace(/\s+/g, " ").slice(0, 72) || "Empty note";
    const updated = document.createElement("small");
    updated.textContent = formatNoteDate(note.updatedAt);
    button.append(title, preview, updated);
    item.append(button);
    noteList.append(item);
  }
}

export function formatNoteDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : `Edited ${date.toLocaleDateString()}`;
}

export function noteSaveHintFor(note) {
  notesSaveHint.textContent = `Last edited ${formatNoteDate(note.updatedAt).replace(/^Edited /, "")}`;
}

export function notesForCourse(courseId) {
  return (appState.appData?.notes ?? []).filter((note) => note.courseId === courseId);
}

export function createSelectedCourseNote() {
  const course = findCourse(appState.selectedCourseId);
  if (!course) return;
  const note = createCourseNote(course.id);
  if (!note) {
    setSaveStatus("Could not create a note.", "error");
    return;
  }
  appState.appData.notes.push(note);
  appState.selectedNoteId = note.id;
  noteSearchInput.value = "";
  renderNotesWorkspace(course);
  noteTitleInput.focus();
  noteTitleInput.select();
  scheduleSave();
}

export function handleNoteListClick(event) {
  const button = event.target.closest("[data-note-select]");
  if (!button) return;
  appState.selectedNoteId = button.dataset.noteSelect;
  renderNotesWorkspace(findCourse(appState.selectedCourseId));
}

export function updateSelectedCourseNote() {
  const course = findCourse(appState.selectedCourseId);
  const noteIndex = appState.appData.notes.findIndex(
    (note) => note.courseId === course?.id && note.id === appState.selectedNoteId,
  );
  if (!course || noteIndex < 0) return;
  try {
    appState.appData.notes[noteIndex] = updateCourseNote(
      appState.appData.notes[noteIndex],
      { title: noteTitleInput.value, content: noteContentInput.value },
    );
  } catch (error) {
    setSaveStatus(String(error), "error");
    return;
  }
  noteCharacterCount.textContent = `${[...noteContentInput.value].length.toLocaleString()} characters`;
  renderNoteList();
  noteSaveHintFor(appState.appData.notes[noteIndex]);
  scheduleSave(500);
}

export function deleteSelectedCourseNote() {
  const course = findCourse(appState.selectedCourseId);
  if (!course || !appState.selectedNoteId) return;
  const note = appState.appData.notes.find((item) => item.courseId === course.id && item.id === appState.selectedNoteId);
  if (!note || !window.confirm(`Delete "${note.title}"? This cannot be undone.`)) return;
  appState.appData.notes = appState.appData.notes.filter((item) => item.id !== note.id);
  appState.selectedNoteId = null;
  renderNotesWorkspace(course);
  scheduleSave();
}

export function applyNoteFormatting(event) {
  const button = event.target.closest("[data-note-format]");
  if (!button || noteContentInput.disabled) return;
  const start = noteContentInput.selectionStart;
  const end = noteContentInput.selectionEnd;
  const selected = noteContentInput.value.slice(start, end);
  const actions = {
    heading: () => ({ before: "# ", after: "", block: true }),
    bullet: () => ({ before: "- ", after: "", block: true }),
    checklist: () => ({ before: "- [ ] ", after: "", block: true }),
    quote: () => ({ before: "> ", after: "", block: true }),
    bold: () => ({ before: "**", after: "**" }),
    italic: () => ({ before: "*", after: "*" }),
    code: () => ({ before: "`", after: "`" }),
    link: () => ({ before: "[", after: "](https://example.com)" }),
  };
  const action = actions[button.dataset.noteFormat];
  if (!action) return;
  const { before, after, block } = action();
  const text = block
    ? (selected || "List item").split("\n").map((line) => `${before}${line}`).join("\n")
    : `${before}${selected || "text"}${after}`;
  noteContentInput.setRangeText(text, start, end, "select");
  noteContentInput.focus();
  noteContentInput.dispatchEvent(new Event("input", { bubbles: true }));
}
