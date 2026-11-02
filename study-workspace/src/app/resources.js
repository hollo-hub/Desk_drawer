import { appState } from "./state.js";
import { courseResources, createResourceGroup, moveResourceToGroup, removeResourceGroup } from "../resource-model.js";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { parseCourseLinks } from "../course-model.js";
import { findCourse } from "./workspace.js";
import { newResourceGroupInput, resourceGroupList, resourceLinkForm, resourceLinkTitleInput, resourceLinkUrlInput, resourceList, resourceListEmpty } from "./dom.js";
import { persistNow, scheduleSave, setSaveStatus } from "./persistence.js";

export function addResourceGroup(event) {
  event.preventDefault();
  const course = findCourse(appState.selectedCourseId);
  if (!course) return;
  const group = createResourceGroup(newResourceGroupInput.value);
  if (!group) {
    newResourceGroupInput.focus();
    return;
  }
  if (course.resourceGroups.some((item) => item.name.toLocaleLowerCase() === group.name.toLocaleLowerCase())) {
    setSaveStatus("A resource group with that name already exists.", "error");
    newResourceGroupInput.focus();
    return;
  }
  course.resourceGroups.push(group);
  newResourceGroupInput.value = "";
  renderResourceGroups(course);
  renderResourceList(course);
  scheduleSave();
}

export function renderResourceGroups(course) {
  resourceGroupList.replaceChildren();
  if (!course) return;

  const resources = courseResources(course);
  for (const group of course.resourceGroups) {
    const item = document.createElement("li");
    item.className = "resource-group-chip";
    const name = document.createElement("span");
    name.textContent = group.name;
    const count = document.createElement("small");
    count.textContent = String(resources.filter((resource) => resource.groupId === group.id).length);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.removeResourceGroup = group.id;
    remove.disabled = course.resourceGroups.length <= 1 || group.id === course.resourceGroups[0].id;
    remove.setAttribute("aria-label", `Remove ${group.name} group`);
    remove.textContent = "Remove";
    item.append(name, count, remove);
    resourceGroupList.append(item);
  }
}

export function renderResourceList(course) {
  resourceList.replaceChildren();
  const resources = courseResources(course);
  resourceListEmpty.hidden = !course || resources.length > 0;
  if (!course) return;

  for (const group of course.resourceGroups) {
    const groupedResources = resources.filter((resource) => resource.groupId === group.id);
    if (groupedResources.length === 0) continue;
    const groupItem = document.createElement("li");
    groupItem.className = "resource-list-group";
    const heading = document.createElement("h2");
    heading.textContent = group.name;
    const items = document.createElement("ul");
    items.className = "resource-group-items";

    for (const resource of groupedResources) {
      const item = document.createElement("li");
      item.className = "resource-library-item";
      const details = document.createElement("span");
      details.className = "resource-library-details";
      const title = document.createElement("strong");
      title.textContent = resource.title;
      const target = document.createElement("small");
      target.textContent = resource.target;
      details.append(title, target);

      const groupSelect = document.createElement("select");
      groupSelect.dataset.resourceGroup = "true";
      groupSelect.dataset.resourceKind = resource.kind;
      groupSelect.dataset.resourceTarget = resource.target;
      groupSelect.setAttribute("aria-label", `Group for ${resource.title}`);
      for (const optionGroup of course.resourceGroups) {
        const option = document.createElement("option");
        option.value = optionGroup.id;
        option.textContent = optionGroup.name;
        groupSelect.append(option);
      }
      groupSelect.value = resource.groupId;

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.dataset.openResource = "true";
      openButton.dataset.resourceKind = resource.kind;
      openButton.dataset.resourceTarget = resource.target;
      openButton.textContent = "Open";
      openButton.setAttribute("aria-label", `Open ${resource.title}`);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.dataset.removeResource = "true";
      removeButton.dataset.resourceKind = resource.kind;
      removeButton.dataset.resourceTarget = resource.target;
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", `Remove ${resource.title}`);

      const actions = document.createElement("span");
      actions.className = "resource-library-actions";
      actions.append(groupSelect, openButton, removeButton);
      item.append(details, actions);
      items.append(item);
    }

    groupItem.append(heading, items);
    resourceList.append(groupItem);
  }
}

export function removeSelectedResourceGroup(event) {
  const button = event.target.closest("[data-remove-resource-group]");
  const course = findCourse(appState.selectedCourseId);
  if (!button || !course) return;
  const result = removeResourceGroup(
    course.resourceGroups,
    course.resourceAssignments,
    button.dataset.removeResourceGroup,
  );
  if (!result) return;
  course.resourceGroups = result.groups;
  course.resourceAssignments = result.assignments;
  renderResourceGroups(course);
  renderResourceList(course);
  scheduleSave();
}

export function moveSelectedResource(event) {
  const select = event.target.closest("[data-resource-group]");
  const course = findCourse(appState.selectedCourseId);
  if (!select || !course) return;
  const resource = {
    kind: select.dataset.resourceKind,
    target: select.dataset.resourceTarget,
  };
  course.resourceAssignments = moveResourceToGroup(
    course.resourceAssignments,
    resource,
    select.value,
  );
  renderResourceGroups(course);
  renderResourceList(course);
  scheduleSave();
}

export async function handleResourceAction(event) {
  const button = event.target.closest("[data-open-resource], [data-remove-resource]");
  const course = findCourse(appState.selectedCourseId);
  if (!button || !course) return;
  const kind = button.dataset.resourceKind;
  const target = button.dataset.resourceTarget;

  if (button.hasAttribute("data-open-resource")) {
    try {
      if (!(await persistNow())) {
        setSaveStatus("Save this resource before opening it.", "error");
        return;
      }
      await invoke("open_resource", { courseId: course.id, kind, target });
    } catch (error) {
      console.error("Could not open the selected resource.", error);
      setSaveStatus(`Could not open resource: ${String(error)}`, "error");
    }
    return;
  }

  if (kind === "folder") {
    if (course.folder === target) course.folder = "";
    course.additionalFolders = course.additionalFolders.filter((folder) => folder !== target);
  } else if (kind === "link") {
    course.links = course.links.filter((link) => link.url !== target);
  } else {
    course.apps = course.apps.filter((path) => path !== target);
  }
  course.resourceAssignments = course.resourceAssignments.filter(
    (assignment) => assignment.kind !== kind || assignment.target !== target,
  );
  renderResourceGroups(course);
  renderResourceList(course);
  scheduleSave();
}

export async function chooseLibraryFolder() {
  const course = findCourse(appState.selectedCourseId);
  if (!course) return;
  try {
    const folder = await open({
      directory: true,
      multiple: false,
      canCreateDirectories: true,
      title: "Add a course resource folder",
    });
    if (folder === null) return;
    if (folder !== course.folder && !course.additionalFolders.includes(folder)) {
      course.additionalFolders.push(folder);
    }
    renderResourceGroups(course);
    renderResourceList(course);
    scheduleSave();
  } catch (error) {
    console.error("Could not add a resource folder.", error);
    setSaveStatus(`Could not add folder: ${String(error)}`, "error");
  }
}

export async function chooseLibraryFiles() {
  const course = findCourse(appState.selectedCourseId);
  if (!course) return;
  try {
    const selected = await open({
      directory: false,
      multiple: true,
      title: "Add course resource files",
    });
    if (selected === null) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    course.apps = [...new Set([...course.apps, ...paths])];
    renderResourceGroups(course);
    renderResourceList(course);
    scheduleSave();
  } catch (error) {
    console.error("Could not add resource files.", error);
    setSaveStatus(`Could not add files: ${String(error)}`, "error");
  }
}

export function addCourseLinkResource(event) {
  event.preventDefault();
  const course = findCourse(appState.selectedCourseId);
  if (!course) return;
  try {
    const title = resourceLinkTitleInput.value.trim();
    const [link] = parseCourseLinks(resourceLinkUrlInput.value);
    if (title) link.title = title;
    if (!course.links.some((item) => item.url === link.url)) {
      course.links.push(link);
    }
    resourceLinkForm.reset();
    renderResourceGroups(course);
    renderResourceList(course);
    scheduleSave();
  } catch (error) {
    setSaveStatus(String(error), "error");
    resourceLinkUrlInput.focus();
  }
}
