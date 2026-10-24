export function launchMessage(report) {
  const { folderOpened, linksOpened, appsOpened, failures } = report;
  if (failures.length > 0) {
    const first = failures[0];
    const remaining = failures.length > 1 ? ` ${failures.length - 1} more item(s) could not be opened.` : "";
    let message;

    switch (first.kind) {
      case "folderMissing":
        message = `Couldn't find ${first.target}. Check the folder in Edit.`;
        break;
      case "folderOpen":
        message = `Couldn't open folder ${first.target}. Check the folder in Edit.`;
        break;
      case "linkInvalid":
        message = `${first.target} isn't a web link. Links must start with http:// or https://.`;
        break;
      case "linkOpen":
        message = `Couldn't open ${first.target}. Check the link in Edit.`;
        break;
      case "appMissing":
      case "appOpen":
        message = `Couldn't open ${first.target}. Check its path in Edit.`;
        break;
      default:
        message = "Couldn't open one of this course's resources. Check it in Edit.";
    }

    return `${message}${remaining}`;
  }

  if (!folderOpened && linksOpened === 0 && appsOpened === 0) {
    return "Nothing to open yet. Add a folder or links in Edit, or just start the timer.";
  }

  const opened = [];
  if (folderOpened) opened.push("your folder");
  if (linksOpened > 0) opened.push(`${linksOpened} ${linksOpened === 1 ? "link" : "links"}`);
  if (appsOpened > 0) opened.push(`${appsOpened} ${appsOpened === 1 ? "app" : "apps"}`);
  const summary =
    opened.length > 2
      ? `${opened.slice(0, -1).join(", ")}, and ${opened.at(-1)}`
      : opened.join(" and ");
  return `Opened ${summary}. Focus.`;
}
