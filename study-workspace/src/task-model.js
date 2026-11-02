export function createStudyTask(
  courseId,
  title,
  id = crypto.randomUUID(),
  createdAt = new Date().toISOString(),
  dueAt = null,
) {
  const normalizedTitle = title.trim();
  if (!courseId || !normalizedTitle || normalizedTitle.length > 160) return null;
  if (dueAt && !Number.isFinite(new Date(dueAt).getTime())) return null;

  return {
    id,
    courseId,
    title: normalizedTitle,
    createdAt,
    completed: false,
    ...(dueAt ? { dueAt } : {}),
  };
}

export function tasksForCourse(tasks, courseId) {
  return tasks.filter((task) => task.courseId === courseId);
}

export function nextTaskForCourse(tasks, courseId) {
  return tasks.find((task) => task.courseId === courseId && !task.completed) ?? null;
}

export function toggleStudyTask(tasks, taskId) {
  return tasks.map((task) =>
    task.id === taskId ? { ...task, completed: !task.completed } : task,
  );
}
