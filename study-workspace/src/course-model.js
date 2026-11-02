export const COURSE_COLORS = [
  { name: "Rose", value: "#e58a9b" },
  { name: "Teal", value: "#5fb3a8" },
  { name: "Amber", value: "#e2b25c" },
  { name: "Lavender", value: "#9a91cf" },
  { name: "Sand", value: "#d3ad91" },
  { name: "Ink", value: "#626781" },
];

const DEFAULT_COLOR = COURSE_COLORS[0].value;
const DAY_MS = 24 * 60 * 60 * 1000;

export function createEmptyCourse() {
  return {
    id: crypto.randomUUID(),
    name: "",
    color: DEFAULT_COLOR,
    folder: "",
    additionalFolders: [],
    links: [],
    apps: [],
    resourceGroups: [],
    resourceAssignments: [],
    filingKeywords: [],
    notes: "",
    createdAt: new Date().toISOString(),
  };
}

export function parseCourseLinks(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const separator = line.indexOf("|");
      const title = separator < 0 ? "" : line.slice(0, separator).trim();
      const address = (separator < 0 ? line : line.slice(separator + 1)).trim();

      let parsed;
      try {
        parsed = new URL(address);
      } catch {
        throw new Error(`Link on line ${index + 1} is not a valid web URL.`);
      }

      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error(`Link on line ${index + 1} must start with http:// or https://.`);
      }

      return {
        title: title || parsed.hostname,
        url: parsed.href,
      };
    });
}

export function courseLinksText(links) {
  return links.map(({ title, url }) => `${title} | ${url}`).join("\n");
}

export function upsertCourse(courses, course) {
  const existingIndex = courses.findIndex((item) => item.id === course.id);
  if (existingIndex < 0) return [...courses, course];

  return courses.map((item, index) => (index === existingIndex ? course : item));
}

export function removeCourse(courses, courseId) {
  if (courses.length <= 1) {
    throw new Error("At least one course must remain.");
  }
  return courses.filter((course) => course.id !== courseId);
}

export function daysSinceLastStudy(course, sessions, now = new Date()) {
  let latestDate = course.createdAt;

  for (const session of sessions) {
    if (session.courseId !== course.id || !session.startedAt) continue;
    if (!latestDate || new Date(session.startedAt) > new Date(latestDate)) {
      latestDate = session.startedAt;
    }
  }

  const reference = localCalendarDay(latestDate);
  if (!reference) return null;
  return Math.max(0, localCalendarDay(now) - reference);
}

export function weeklyMinutes(course, sessions, now = new Date()) {
  const weekStart = startOfLocalWeek(now).getTime();
  const totalSeconds = sessions.reduce((total, session) => {
    const startedAt = new Date(session.startedAt).getTime();
    if (session.courseId !== course.id || !Number.isFinite(startedAt) || startedAt < weekStart) {
      return total;
    }
    return total + session.actualSec;
  }, 0);

  return Math.floor(totalSeconds / 60);
}

export function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m this week`;
}

function localCalendarDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

function startOfLocalWeek(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}
