export const MAX_NOTE_TITLE_LENGTH = 120;
export const MAX_NOTE_CONTENT_LENGTH = 50000;

export function prepareAppNotes(appData) {
  appData.notes ??= [];
  for (const course of appData.courses) {
    if (
      course.notes?.length > 0 &&
      !appData.notes.some(
        (note) => note.courseId === course.id && note.content === course.notes,
      )
    ) {
      const createdAt = course.createdAt || new Date().toISOString();
      appData.notes.push({
        id: crypto.randomUUID(),
        courseId: course.id,
        title: "Untitled note",
        content: course.notes,
        createdAt,
        updatedAt: createdAt,
      });
    }
    course.notes = "";
  }
  return appData;
}

export function createCourseNote(
  courseId,
  title = "Untitled note",
  id = crypto.randomUUID(),
  now = new Date().toISOString(),
) {
  const normalizedTitle = title.trim();
  if (
    !courseId ||
    !normalizedTitle ||
    normalizedTitle.length > MAX_NOTE_TITLE_LENGTH
  ) {
    return null;
  }

  return {
    id,
    courseId,
    title: normalizedTitle,
    content: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function searchCourseNotes(notes, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...notes];
  return notes.filter((note) =>
    `${note.title}\n${note.content}`.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export function updateCourseNote(note, updates, now = new Date().toISOString()) {
  const title = updates.title?.trim() ?? note.title;
  const content = updates.content ?? note.content;
  if (!title || title.length > MAX_NOTE_TITLE_LENGTH) {
    throw new Error(`Note titles must contain 1 to ${MAX_NOTE_TITLE_LENGTH} characters.`);
  }
  if ([...content].length > MAX_NOTE_CONTENT_LENGTH) {
    throw new Error(`Notes must be ${MAX_NOTE_CONTENT_LENGTH.toLocaleString()} characters or fewer.`);
  }
  return { ...note, title, content, updatedAt: now };
}
