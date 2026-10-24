export function createStudyTask(courseId, title, id = crypto.randomUUID(), createdAt = new Date().toISOString()) {
  const normalizedTitle = title.trim();
  if (!courseId || !normalizedTitle || normalizedTitle.length > 160) return null;

  return {
    id,
    courseId,
    title: normalizedTitle,
    createdAt,
    completed: false,
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
