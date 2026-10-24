const DAY_MS = 24 * 60 * 60 * 1000;

export function weekStart(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export function minutesByCourse(courses, sessions, weekOffset = 0, now = new Date()) {
  const start = weekStart(now);
  start.setDate(start.getDate() - weekOffset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const totals = new Map(courses.map((course) => [course.id, 0]));
  for (const session of sessions) {
    const started = new Date(session.startedAt);
    if (started >= start && started < end && totals.has(session.courseId)) {
      totals.set(session.courseId, totals.get(session.courseId) + session.actualSec);
    }
  }
  return courses.map((course) => ({
    courseId: course.id,
    courseName: course.name,
    minutes: Math.floor((totals.get(course.id) ?? 0) / 60),
  }));
}

export function longestStudyStreak(sessions) {
  const days = new Set();
  for (const session of sessions) {
    const date = new Date(session.startedAt);
    if (!Number.isNaN(date.getTime())) {
      days.add(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    }
  }
  const ordered = [...days].sort();
  let longest = 0;
  let streak = 0;
  let previous = null;
  for (const day of ordered) {
    if (previous !== null && day - previous === DAY_MS) {
      streak += 1;
    } else {
      streak = 1;
    }
    longest = Math.max(longest, streak);
    previous = day;
  }
  return longest;
}
