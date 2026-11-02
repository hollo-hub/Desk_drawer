import { RATINGS } from "./study-model.js";

const SOURCE_KINDS = new Set(["link", "file", "folder"]);
const TITLE_LIMIT = 160;
const SECTION_LIMIT = 160;
const TARGET_LIMIT = 4096;

const validId = (value) => typeof value === "string" && value.trim().length > 0;
const validTitle = (value, limit) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= limit;

export function prepareStudyData(appData) {
  let existing = appData.study && typeof appData.study === "object" && !Array.isArray(appData.study)
    ? appData.study
    : appData.study == null
      ? {}
      : { legacyData: appData.study };
  if (existing.courses != null && (typeof existing.courses !== "object" || Array.isArray(existing.courses))) {
    existing = { legacyData: existing };
  }
  const courses = existing.courses ?? {};
  appData.study = { ...existing, courses: { ...courses } };
  return appData.study;
}

export function studyCourseData(study, courseId) {
  if (!validId(courseId)) return {};
  const courseData = study?.courses?.[courseId];
  return courseData && typeof courseData === "object" && !Array.isArray(courseData) ? courseData : {};
}

function updateStudyCourse(study, courseId, update) {
  if (!validId(courseId)) throw new Error("Choose a course before changing study data.");
  const courses = study?.courses && typeof study.courses === "object" && !Array.isArray(study.courses)
    ? study.courses
    : {};
  return {
    ...(study && typeof study === "object" && !Array.isArray(study) ? study : {}),
    courses: {
      ...courses,
      [courseId]: update(studyCourseData(study, courseId)),
    },
  };
}

export function createStudySource({ id, title, kind, target, now = new Date() }) {
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  const normalizedTarget = typeof target === "string" ? target.trim() : "";
  if (!validId(id) || !validTitle(normalizedTitle, TITLE_LIMIT)) {
    throw new Error("Source titles must contain 1 to 160 characters.");
  }
  if (!SOURCE_KINDS.has(kind)) throw new Error("Choose a web link, file, or folder as the source type.");
  if (!normalizedTarget || normalizedTarget.length > TARGET_LIMIT) {
    throw new Error("Enter or choose a valid source location.");
  }
  if (kind === "link") {
    let url;
    try {
      url = new URL(normalizedTarget);
    } catch {
      throw new Error("Enter a valid http:// or https:// web link.");
    }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw new Error("Enter a valid http:// or https:// web link without embedded credentials.");
    }
  } else if (typeof normalizedTarget !== "string" || !/^[a-zA-Z]:[\\/]|^\\\\/.test(normalizedTarget)) {
    throw new Error("Choose a local absolute Windows file or folder path.");
  }
  const timestamp = new Date(now);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Enter a valid source creation date.");
  return {
    id,
    title: normalizedTitle,
    kind,
    target: normalizedTarget,
    createdAt: timestamp.toISOString(),
    chapters: [],
  };
}

export function addStudySource(study, courseId, source) {
  if (!source || !validId(source.id)) throw new Error("The source is invalid.");
  const current = studyCourseData(study, courseId);
  if (current.sources != null && !Array.isArray(current.sources)) {
    throw new Error("Saved sources in this course are invalid and were left unchanged.");
  }
  if ((current.sources ?? []).some((item) => item?.id === source.id)) {
    throw new Error("That source already exists.");
  }
  return updateStudyCourse(study, courseId, (course) => ({
    ...course,
    sources: [...(Array.isArray(course.sources) ? course.sources : []), source],
  }));
}

export function createStudyChapter({ id, title, target = "", now = new Date() }) {
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  const normalizedTarget = typeof target === "string" ? target.trim() : "";
  if (!validId(id) || !validTitle(normalizedTitle, SECTION_LIMIT)) {
    throw new Error("Chapter titles must contain 1 to 160 characters.");
  }
  if (normalizedTarget.length > TARGET_LIMIT) throw new Error("The chapter link or path is too long.");
  const timestamp = new Date(now);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Enter a valid chapter creation date.");
  return {
    id,
    title: normalizedTitle,
    ...(normalizedTarget ? { target: normalizedTarget } : {}),
    createdAt: timestamp.toISOString(),
    recallHistory: [],
  };
}

export function addStudyChapter(study, courseId, sourceId, chapter) {
  const current = studyCourseData(study, courseId);
  if (current.sources != null && !Array.isArray(current.sources)) {
    throw new Error("Saved sources in this course are invalid and were left unchanged.");
  }
  const sources = Array.isArray(current.sources) ? current.sources : [];
  const source = sources.find((item) => item?.id === sourceId);
  if (!source) throw new Error("The source could not be found in this course.");
  if (source.chapters != null && !Array.isArray(source.chapters)) {
    throw new Error("Saved chapters for this source are invalid and were left unchanged.");
  }
  const chapters = Array.isArray(source.chapters) ? source.chapters : [];
  if (chapters.some((item) => item?.id === chapter.id)) throw new Error("That chapter already exists.");
  return updateStudyCourse(study, courseId, (course) => ({
    ...course,
    sources: (Array.isArray(course.sources) ? course.sources : []).map((item) => item?.id === sourceId
      ? { ...item, chapters: [...(Array.isArray(item.chapters) ? item.chapters : []), chapter] }
      : item),
  }));
}

export function removeStudySource(study, courseId, sourceId) {
  const current = studyCourseData(study, courseId);
  if (current.sources != null && !Array.isArray(current.sources)) {
    throw new Error("Saved sources in this course are invalid and were left unchanged.");
  }
  const sources = Array.isArray(current.sources) ? current.sources : [];
  const source = sources.find((item) => item?.id === sourceId);
  if (!source) throw new Error("The source could not be found in this course.");
  if (source.chapters != null && !Array.isArray(source.chapters)) {
    throw new Error("Saved chapters for this source are invalid and were left unchanged.");
  }
  if (current.reviewItems != null && !Array.isArray(current.reviewItems)) {
    throw new Error("Saved review questions are invalid and were left unchanged.");
  }
  const chapterIds = new Set((source.chapters ?? [])
    .filter((chapter) => chapter && typeof chapter.id === "string")
    .map((chapter) => chapter.id));
  return updateStudyCourse(study, courseId, (course) => ({
    ...course,
    sources: (Array.isArray(course.sources) ? course.sources : []).filter((source) => source?.id !== sourceId),
    reviewItems: (Array.isArray(course.reviewItems) ? course.reviewItems : [])
      .filter((item) => item?.sourceId !== sourceId &&
        !(item?.sourceId == null && chapterIds.has(item?.chapterId ?? item?.unitId))),
  }));
}

export function removeStudyChapter(study, courseId, sourceId, chapterId) {
  const current = studyCourseData(study, courseId);
  if (current.sources != null && !Array.isArray(current.sources)) {
    throw new Error("Saved sources in this course are invalid and were left unchanged.");
  }
  if (current.reviewItems != null && !Array.isArray(current.reviewItems)) {
    throw new Error("Saved review questions are invalid and were left unchanged.");
  }
  const source = (Array.isArray(current.sources) ? current.sources : [])
    .find((item) => item?.id === sourceId);
  if (!source || !(Array.isArray(source.chapters) ? source.chapters : [])
    .some((chapter) => chapter?.id === chapterId)) {
    throw new Error("The chapter could not be found in this course.");
  }
  if (source.chapters != null && !Array.isArray(source.chapters)) {
    throw new Error("Saved chapters for this source are invalid and were left unchanged.");
  }
  return updateStudyCourse(study, courseId, (course) => ({
    ...course,
    sources: (Array.isArray(course.sources) ? course.sources : []).map((item) => item?.id === sourceId
      ? {
        ...item,
        chapters: (Array.isArray(item.chapters) ? item.chapters : [])
          .filter((chapter) => chapter?.id !== chapterId),
      }
      : item),
    reviewItems: (Array.isArray(course.reviewItems) ? course.reviewItems : [])
      .filter((item) => (item?.sourceId !== sourceId || (item?.chapterId ?? item?.unitId) !== chapterId)),
  }));
}

export function recordChapterRecall(study, courseId, sourceId, chapterId, rating, at = new Date()) {
  if (!RATINGS.includes(rating)) throw new Error(`Unknown rating: ${rating}`);
  const timestamp = new Date(at);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("A valid recall date is required.");
  const current = studyCourseData(study, courseId);
  if (current.sources != null && !Array.isArray(current.sources)) {
    throw new Error("Saved sources in this course are invalid and were left unchanged.");
  }
  if (current.reviewItems != null && !Array.isArray(current.reviewItems)) {
    throw new Error("Saved review questions are invalid and were left unchanged.");
  }
  const source = (Array.isArray(current.sources) ? current.sources : [])
    .find((item) => item?.id === sourceId);
  const chapters = Array.isArray(source?.chapters) ? source.chapters : [];
  const chapter = chapters.find((item) => item?.id === chapterId);
  if (source?.chapters != null && !Array.isArray(source.chapters)) {
    throw new Error("Saved chapters for this source are invalid and were left unchanged.");
  }
  if (chapter?.recallHistory != null && !Array.isArray(chapter.recallHistory)) {
    throw new Error("Saved recall history is invalid and was left unchanged.");
  }
  if (!(Array.isArray(current.sources) ? current.sources : []).some(
    (source) => source?.id === sourceId && (Array.isArray(source.chapters) ? source.chapters : [])
      .some((chapter) => chapter?.id === chapterId),
  )) throw new Error("The chapter could not be found in this course.");
  const attempt = { at: timestamp.toISOString(), rating };
  return updateStudyCourse(study, courseId, (course) => ({
    ...course,
    sources: (Array.isArray(course.sources) ? course.sources : []).map((source) => source?.id === sourceId
      ? {
        ...source,
        chapters: (Array.isArray(source.chapters) ? source.chapters : []).map((chapter) => chapter?.id === chapterId
          ? { ...chapter, recallHistory: [...(Array.isArray(chapter.recallHistory) ? chapter.recallHistory : []), attempt] }
          : chapter),
      }
      : source),
  }));
}

export function chapterRecallProgress(chapter) {
  return (Array.isArray(chapter?.recallHistory) ? chapter.recallHistory : [])
    .some((attempt) => attempt?.rating === "yellow" || attempt?.rating === "green");
}

export function courseSources(study, courseId) {
  const sources = studyCourseData(study, courseId).sources;
  return Array.isArray(sources)
    ? sources.filter((source) => source && typeof source === "object" && !Array.isArray(source))
    : [];
}

export function createReviewQuestion({ id, courseId, sourceId, chapterId, prompt, now = new Date() }) {
  const normalizedPrompt = typeof prompt === "string" ? prompt.trim() : "";
  if (!validId(id) || !validId(courseId) || !validId(sourceId) || !validId(chapterId) ||
      !validTitle(normalizedPrompt, 1000)) {
    throw new Error("A review question must have a chapter and a prompt of 1 to 1,000 characters.");
  }
  const timestamp = new Date(now);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Enter a valid review date.");
  return {
    id,
    courseId,
    sourceId,
    unitId: chapterId,
    chapterId,
    prompt: normalizedPrompt,
    box: 1,
    dueAt: timestamp.toISOString(),
    createdAt: timestamp.toISOString(),
    history: [],
  };
}

export function addReviewQuestion(study, courseId, question) {
  const current = studyCourseData(study, courseId);
  if (question.courseId !== courseId) throw new Error("The review question must belong to this course.");
  if (current.reviewItems != null && !Array.isArray(current.reviewItems)) {
    throw new Error("Saved review questions are invalid and were left unchanged.");
  }
  const questions = Array.isArray(current.reviewItems) ? current.reviewItems : [];
  if (questions.some((item) => item?.id === question.id)) throw new Error("That review question already exists.");
  if (!courseSources(study, courseId).some((source) =>
    source.id === question.sourceId &&
    (Array.isArray(source.chapters) ? source.chapters : []).some((chapter) => chapter?.id === question.chapterId),
  )) throw new Error("Select a saved chapter in this course for the review question.");
  return updateStudyCourse(study, courseId, (course) => ({
    ...course,
    reviewItems: [...(Array.isArray(course.reviewItems) ? course.reviewItems : []), question],
  }));
}

export function updateReviewQuestion(study, courseId, question) {
  const current = studyCourseData(study, courseId);
  if (current.reviewItems != null && !Array.isArray(current.reviewItems)) {
    throw new Error("Saved review questions are invalid and were left unchanged.");
  }
  const items = Array.isArray(current.reviewItems) ? current.reviewItems : [];
  if (!items.some((item) => item?.id === question.id)) {
    throw new Error("The review question could not be found in this course.");
  }
  return updateStudyCourse(study, courseId, (course) => ({
    ...course,
    reviewItems: (Array.isArray(course.reviewItems) ? course.reviewItems : [])
      .map((item) => item?.id === question.id ? question : item),
  }));
}

export function courseReviewItems(study, courseId) {
  const items = studyCourseData(study, courseId).reviewItems;
  return Array.isArray(items) ? items : [];
}
