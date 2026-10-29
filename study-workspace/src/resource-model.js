export const DEFAULT_RESOURCE_GROUP_NAME = "Unsorted";

export function prepareCourseResources(course) {
  course.additionalFolders ??= [];
  course.resourceGroups ??= [];
  course.resourceAssignments ??= [];
  if (course.resourceGroups.length === 0) {
    course.resourceGroups.push({
      id: `default-${course.id}`,
      name: DEFAULT_RESOURCE_GROUP_NAME,
    });
  }
  return course;
}

export function courseResources(course) {
  if (!course) return [];
  const folders = [course.folder, ...(course.additionalFolders ?? [])]
    .filter(Boolean)
    .filter((path, index, all) => all.indexOf(path) === index);

  return [
    ...folders.map((target, index) => ({
      kind: "folder",
      target,
      title: index === 0 && course.folder === target ? "Course folder" : pathName(target),
    })),
    ...course.links.map((link) => ({
      kind: "link",
      target: link.url,
      title: link.title || link.url,
    })),
    ...course.apps.map((target) => ({
      kind: "file",
      target,
      title: pathName(target),
    })),
  ].map((resource) => ({
    ...resource,
    groupId: course.resourceAssignments.find(
      (assignment) =>
        assignment.kind === resource.kind && assignment.target === resource.target,
    )?.groupId ?? course.resourceGroups[0]?.id,
  }));
}

export function createResourceGroup(name, id = crypto.randomUUID()) {
  const normalizedName = name.trim();
  if (!normalizedName || [...normalizedName].length > 60) return null;
  return { id, name: normalizedName };
}

export function moveResourceToGroup(assignments, resource, groupId) {
  const remaining = assignments.filter(
    (assignment) =>
      assignment.kind !== resource.kind || assignment.target !== resource.target,
  );
  return [...remaining, { kind: resource.kind, target: resource.target, groupId }];
}

export function removeResourceGroup(groups, assignments, groupId) {
  if (groups.length <= 1 || groups[0].id === groupId) return null;
  const remainingGroups = groups.filter((group) => group.id !== groupId);
  const fallbackGroupId = remainingGroups[0].id;
  return {
    groups: remainingGroups,
    assignments: assignments.map((assignment) =>
      assignment.groupId === groupId
        ? { ...assignment, groupId: fallbackGroupId }
        : assignment,
    ),
  };
}

function pathName(path) {
  return path.split(/[\\/]/).at(-1) || path;
}
