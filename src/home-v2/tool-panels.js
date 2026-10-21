import { invoke, isTauri } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open } from '@tauri-apps/plugin-dialog';
import { closePanel } from './panels.js';

const TOOL_PANEL_PREFS_KEY = 'desk-drawer.v2.tool-panels';

function readToolPanelPreferences() {
  const raw = localStorage.getItem(TOOL_PANEL_PREFS_KEY);
  if (!raw) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Saved tool panel data has an invalid format.');
  }
  return value;
}

function writeToolPanelPreferences(value) {
  localStorage.setItem(TOOL_PANEL_PREFS_KEY, JSON.stringify(value));
}

async function callToolPanelCommand(command, payload = {}) {
  if (isTauri()) {
    return invoke(command, payload);
  }

  const saved = readToolPanelPreferences();
  switch (command) {
    case 'app_preferences':
      return {
        notes: typeof saved.notes === 'string' ? saved.notes : '',
        links: Array.isArray(saved.links) ? saved.links : [],
        saved_scenes: Array.isArray(saved.saved_scenes) ? saved.saved_scenes : [],
        clipboard_history: Array.isArray(saved.clipboard_history) ? saved.clipboard_history : [],
        clipboard_paused: saved.clipboard_paused === true,
        enabled_modules: saved.enabled_modules && typeof saved.enabled_modules === 'object' ? saved.enabled_modules : {},
      };
    case 'save_scratch_notes': {
      saved.notes = typeof payload.notes === 'string' ? payload.notes : '';
      writeToolPanelPreferences(saved);
      return undefined;
    }
    case 'save_links': {
      saved.links = Array.isArray(payload.links) ? payload.links : [];
      writeToolPanelPreferences(saved);
      return undefined;
    }
    case 'save_scenes': {
      saved.saved_scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
      writeToolPanelPreferences(saved);
      return undefined;
    }
    case 'set_clipboard_pinned': {
      const history = Array.isArray(saved.clipboard_history) ? saved.clipboard_history : [];
      const item = history.find((entry) => entry.id === payload.id);
      if (item) item.pinned = Boolean(payload.pinned);
      saved.clipboard_history = history;
      writeToolPanelPreferences(saved);
      return undefined;
    }
    case 'set_clipboard_paused': {
      saved.clipboard_paused = Boolean(payload.paused);
      writeToolPanelPreferences(saved);
      return undefined;
    }
    case 'clear_unpinned_clipboard_history': {
      const history = Array.isArray(saved.clipboard_history) ? saved.clipboard_history : [];
      const remaining = history.filter((entry) => entry.pinned === true);
      saved.clipboard_history = remaining;
      writeToolPanelPreferences(saved);
      return remaining.length;
    }
    case 'open_saved_link':
    case 'apply_layout':
      return undefined;
    default:
      return undefined;
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, handler, className = '') {
  const node = element('button', className, text);
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
}

function field(labelText, control) {
  const label = element('label', 'panel-field');
  label.append(element('span', '', labelText), control);
  return label;
}

function statusLine(body) {
  const status = element('p', 'panel-status');
  status.setAttribute('role', 'status');
  body.append(status);
  return status;
}

function report(status, message, error = null) {
  if (error) console.error(message, error);
  status.textContent = message;
}

function moduleEnabled(preferences, id) {
  return preferences.enabled_modules?.[id] === true;
}

function disabledState(body, api, preferences, id, name, status) {
  if (moduleEnabled(preferences, id)) return false;
  body.replaceChildren();
  body.append(
    element('p', 'panel-copy', `${name} is turned off. Enable it from Modules to use this panel.`),
    button('Open Modules', () => api.openClassic('modules'), 'primary'),
    status,
  );
  return true;
}

function emptyState(body, copy, actionText, action) {
  body.append(element('p', 'panel-empty', copy));
  if (actionText && action) body.append(button(actionText, action, 'primary'));
}

async function preferences() {
  return callToolPanelCommand('app_preferences');
}

export function registerToolPanels(registerPanel) {
registerPanel('notes', {
  title: 'Notes',
  mount(body, api) {
    const status = statusLine(body);
    const textarea = document.createElement('textarea');
    textarea.maxLength = 20_000;
    textarea.rows = 12;
    textarea.placeholder = 'Type your note here';
    textarea.setAttribute('aria-label', 'Scratch notes');
    const count = element('small', 'panel-meta', '0 characters');
    body.prepend(textarea);
    body.append(count);

    let timer = 0;
    let generation = 0;
    const save = async () => {
      const current = ++generation;
      try {
        await callToolPanelCommand('save_scratch_notes', { notes: textarea.value });
        if (current !== generation) return;
        report(status, 'Saved on this device.');
      } catch (error) {
        if (current !== generation) return;
        report(status, 'Could not save notes. Try again.', error);
      }
    };
    const onInput = () => {
      count.textContent = `${textarea.value.length} characters`;
      report(status, 'Saving…');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void save(); }, 500);
    };
    textarea.addEventListener('input', onInput);

    void preferences().then((saved) => {
      if (disabledState(body, api, saved, 'notes', 'Notes', status)) return;
      textarea.value = typeof saved.notes === 'string' ? saved.notes.slice(0, 20_000) : '';
      count.textContent = `${textarea.value.length} characters`;
      report(status, 'Saved on this device.');
    }).catch((error) => report(status, 'Could not load notes.', error));

    return () => {
      window.clearTimeout(timer);
      textarea.removeEventListener('input', onInput);
    };
  },
});

registerPanel('links', {
  title: 'Links',
  mount(body, api) {
    const status = statusLine(body);
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search links';
    search.setAttribute('aria-label', 'Search links');
    const list = element('div', 'panel-list');
    const form = element('form', 'panel-form');
    const title = document.createElement('input');
    title.maxLength = 120;
    title.required = true;
    title.placeholder = 'Name';
    title.setAttribute('aria-label', 'Link name');
    const kind = document.createElement('select');
    kind.setAttribute('aria-label', 'Link type');
    for (const [value, label] of [['url', 'Site'], ['folder', 'Folder'], ['app', 'App']]) {
      const option = element('option', '', label);
      option.value = value;
      kind.append(option);
    }
    const target = document.createElement('input');
    target.required = true;
    target.placeholder = 'https://example.com';
    target.setAttribute('aria-label', 'URL or path');
    const tags = document.createElement('input');
    tags.placeholder = 'Group or tags';
    tags.setAttribute('aria-label', 'Group or tags');
    const browse = button('Browse', async () => {
      try {
        const selected = await open({
          directory: kind.value === 'folder',
          multiple: false,
          title: kind.value === 'folder' ? 'Choose a folder' : 'Choose an application',
        });
        if (typeof selected === 'string') target.value = selected;
      } catch (error) {
        report(status, 'Could not open the path picker.', error);
      }
    });
    const submit = element('button', 'primary', 'Save link');
    submit.type = 'submit';
    const cancel = button('Cancel edit', () => resetForm());
    cancel.hidden = true;
    form.append(
      field('Name', title),
      field('Type', kind),
      field('Target', target),
      field('Group or tags', tags),
      element('div', 'panel-actions'),
    );
    form.querySelector('.panel-actions').append(browse, submit, cancel);
    body.prepend(search);
    body.append(form, list);

    let links = [];
    let editing = null;
    let collapsed = new Set();
    const resetForm = () => {
      editing = null;
      form.reset();
      kind.value = 'url';
      submit.textContent = 'Save link';
      cancel.hidden = true;
    };
    const render = () => {
      const query = search.value.trim().toLowerCase();
      list.replaceChildren();
      const filtered = links.filter((link) =>
        [link.title, link.target, ...(link.tags ?? [])].some((value) => value.toLowerCase().includes(query)));
      const groups = new Map();
      for (const link of filtered) {
        const group = link.tags?.[0] || 'Saved links';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(link);
      }
      if (!filtered.length) {
        emptyState(list, query ? 'No links match that search.' : 'Save the sites, folders, and apps you open every study session.', 'Add link', () => title.focus());
        return;
      }
      for (const [group, items] of groups) {
        const section = element('section', 'panel-group');
        const heading = button(`${collapsed.has(group) ? '›' : '⌄'} ${group}`, () => {
          if (collapsed.has(group)) collapsed.delete(group);
          else collapsed.add(group);
          render();
        }, 'panel-group-toggle');
        section.append(heading);
        if (!collapsed.has(group)) {
          for (const link of items) {
            const row = element('div', 'panel-card');
            const label = element('div', 'panel-card-copy');
            label.append(element('strong', '', link.title), element('small', '', `${link.kind} · ${link.target}`));
            row.append(
              label,
              button('Open', async () => {
                try {
                  await callToolPanelCommand('open_saved_link', { id: link.id });
                  report(status, `Opened ${link.title}.`);
                } catch (error) {
                  report(status, `Could not open ${link.title}.`, error);
                }
              }),
              button('Edit', () => {
                editing = link.id;
                title.value = link.title;
                kind.value = link.kind;
                target.value = link.target;
                tags.value = (link.tags ?? []).join(', ');
                submit.textContent = 'Update link';
                cancel.hidden = false;
                title.focus();
              }),
              button('Delete', async () => {
                const next = links.filter((item) => item.id !== link.id);
                try {
                  await callToolPanelCommand('save_links', { links: next });
                  links = next;
                  render();
                  report(status, 'Link deleted.');
                } catch (error) {
                  report(status, 'Could not delete the link.', error);
                }
              }),
            );
            section.append(row);
          }
        }
        list.append(section);
      }
    };
    const onSubmit = async (event) => {
      event.preventDefault();
      const link = {
        id: editing ?? crypto.randomUUID(),
        title: title.value.trim(),
        kind: kind.value,
        target: target.value.trim(),
        tags: tags.value.split(',').map((tag) => tag.trim()).filter(Boolean),
      };
      const next = editing
        ? links.map((item) => item.id === editing ? link : item)
        : [...links, link];
      try {
        await callToolPanelCommand('save_links', { links: next });
        links = next;
        resetForm();
        render();
        report(status, 'Link saved.');
      } catch (error) {
        report(status, 'Could not save the link. Check its URL or path.', error);
      }
    };
    const onSearch = () => render();
    form.addEventListener('submit', onSubmit);
    search.addEventListener('input', onSearch);
    void preferences().then((saved) => {
      if (disabledState(body, api, saved, 'links', 'Links', status)) return;
      links = Array.isArray(saved.links) ? saved.links : [];
      render();
    }).catch((error) => report(status, 'Could not load links.', error));
    return () => {
      form.removeEventListener('submit', onSubmit);
      search.removeEventListener('input', onSearch);
    };
  },
});

registerPanel('clipboard', {
  title: 'Clipboard',
  mount(body, api) {
    const status = statusLine(body);
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search clips';
    search.setAttribute('aria-label', 'Search clips');
    const filters = element('div', 'panel-filters');
    const list = element('div', 'panel-list');
    const footer = element('div', 'panel-actions');
    const capture = document.createElement('input');
    capture.type = 'checkbox';
    capture.setAttribute('aria-label', 'Capture clipboard history');
    const captureLabel = field('Capture history', capture);
    const clear = button('Clear unpinned');
    const count = element('small', 'panel-meta');
    footer.append(captureLabel, clear, count);
    body.prepend(search, filters);
    body.append(list, footer);

    let clips = [];
    let paused = false;
    let filter = 'all';
    let confirmClear = false;
    const refresh = async () => {
      const saved = await preferences();
      if (disabledState(body, api, saved, 'clipboard', 'Clipboard', status)) return;
      clips = Array.isArray(saved.clipboard_history) ? saved.clipboard_history : [];
      paused = saved.clipboard_paused === true;
      capture.checked = !paused;
      render();
    };
    const render = () => {
      filters.replaceChildren();
      for (const [id, label] of [['all', 'All'], ['text', 'Text'], ['link', 'Links'], ['color', 'Colors'], ['pinned', 'Pinned']]) {
        filters.append(button(label, () => { filter = id; render(); }, filter === id ? 'selected' : ''));
      }
      const query = search.value.trim().toLowerCase();
      const rows = clips.filter((clip) => {
        const kindMatch = filter === 'all' || clip.kind === filter || (filter === 'pinned' && clip.pinned);
        return kindMatch && clip.text.toLowerCase().includes(query);
      });
      list.replaceChildren();
      const max = 200;
      count.textContent = `${clips.length} of ${max}`;
      if (!rows.length) {
        emptyState(list, 'Nothing copied yet. Copy something and it will show up here.');
      } else {
        for (const clip of rows) {
          const row = element('div', 'panel-card clipboard-card');
          const text = element('span', 'clipboard-preview', clip.text);
          text.title = clip.text;
          const metadata = element('small', '', `${clip.kind} · ${new Date(clip.copiedAt).toLocaleString()}`);
          const copy = button('Copy', async () => {
            try {
              await writeText(clip.text);
              report(status, 'Copied clip.');
            } catch (error) {
              report(status, 'Could not copy the clip.', error);
            }
          });
          const pin = button(clip.pinned ? 'Unpin' : 'Pin', async () => {
            try {
              await callToolPanelCommand('set_clipboard_pinned', { id: clip.id, pinned: !clip.pinned });
              await refresh();
            } catch (error) {
              report(status, 'Could not update the pin.', error);
            }
          });
          row.append(element('div', 'panel-card-copy', ''), copy, pin);
          row.querySelector('.panel-card-copy').append(text, metadata);
          if (clip.kind === 'color') {
            const swatch = element('span', 'clip-swatch');
            swatch.style.backgroundColor = clip.text;
            swatch.setAttribute('aria-label', `Color ${clip.text}`);
            row.prepend(swatch);
          }
          list.append(row);
        }
      }
      clear.textContent = confirmClear ? 'Confirm clear unpinned' : 'Clear unpinned';
    };
    const onSearch = () => render();
    const onCapture = async () => {
      try {
        paused = !capture.checked;
        await callToolPanelCommand('set_clipboard_paused', { paused });
        report(status, paused ? 'Clipboard capture paused.' : 'Clipboard capture resumed.');
      } catch (error) {
        capture.checked = !capture.checked;
        report(status, 'Could not change clipboard capture.', error);
      }
    };
    const onClear = async () => {
      if (!confirmClear) {
        confirmClear = true;
        render();
        return;
      }
      try {
        await callToolPanelCommand('clear_unpinned_clipboard_history');
        confirmClear = false;
        await refresh();
        report(status, 'Unpinned clips cleared.');
      } catch (error) {
        report(status, 'Could not clear unpinned clips.', error);
      }
    };
    search.addEventListener('input', onSearch);
    capture.addEventListener('change', onCapture);
    clear.addEventListener('click', onClear);
    void refresh().catch((error) => report(status, 'Could not load clipboard history.', error));
    const timer = window.setInterval(() => {
      void refresh().catch((error) => report(status, 'Could not refresh clipboard history.', error));
    }, 3000);
    return () => {
      window.clearInterval(timer);
      search.removeEventListener('input', onSearch);
      capture.removeEventListener('change', onCapture);
      clear.removeEventListener('click', onClear);
    };
  },
});

registerPanel('scenes', {
  title: 'Scenes',
  mount(body, api) {
    const status = statusLine(body);
    const list = element('div', 'panel-list');
    const form = element('form', 'panel-form');
    const name = document.createElement('input');
    name.maxLength = 40;
    name.required = true;
    name.placeholder = 'Scene name';
    name.setAttribute('aria-label', 'Scene name');
    const layout = document.createElement('select');
    layout.setAttribute('aria-label', 'Window layout');
    for (const [value, label] of [['coding', 'Coding'], ['writing', 'Writing'], ['call', 'Video call']]) {
      const option = element('option', '', label);
      option.value = value;
      layout.append(option);
    }
    const minutes = document.createElement('input');
    minutes.type = 'number';
    minutes.min = '1';
    minutes.max = '10080';
    minutes.value = '25';
    minutes.setAttribute('aria-label', 'Focus minutes');
    const linksBox = element('div', 'panel-list');
    const reminder = document.createElement('input');
    reminder.type = 'checkbox';
    reminder.checked = true;
    reminder.setAttribute('aria-label', 'Offer a break after focus');
    const save = element('button', 'primary', 'Save scene');
    save.type = 'submit';
    const cancel = button('Cancel', () => { form.hidden = true; list.hidden = false; });
    form.append(
      field('Name', name),
      field('Layout', layout),
      field('Focus minutes', minutes),
      field('Links to open', linksBox),
      field('Offer a break after focus', reminder),
      element('div', 'panel-actions'),
    );
    form.querySelector('.panel-actions').append(save, cancel);
    const add = button('New scene', () => { form.hidden = false; list.hidden = true; name.focus(); }, 'primary');
    form.hidden = true;
    body.append(list, add, form);

    let scenes = [];
    let links = [];
    const checkedLinks = () => [...linksBox.querySelectorAll('input:checked')].map((input) => input.value).slice(0, 8);
    const render = () => {
      list.replaceChildren();
      if (!scenes.length) {
        emptyState(list, 'No scenes yet. A scene sets up your window layout, timer, and links in one click.', 'Create scene', () => add.click());
        return;
      }
      for (const scene of scenes) {
        const row = element('div', 'panel-card');
        const details = element('div', 'panel-card-copy');
        details.append(
          element('strong', '', scene.name),
          element('small', '', `${scene.layout} · ${scene.focusMinutes} min · ${(scene.openLinks ?? []).length} links`),
        );
        row.append(
          details,
          button('Start', async () => {
            try {
              for (const id of scene.openLinks ?? []) await callToolPanelCommand('open_saved_link', { id });
              await callToolPanelCommand('apply_layout', { name: scene.layout });
              const permission = scene.breakAfter ? api.requestFocusNotifications() : Promise.resolve(false);
              api.startFocus(scene.focusMinutes, scene.breakAfter, permission);
              closePanel();
            } catch (error) {
              report(status, `Could not start ${scene.name}.`, error);
            }
          }),
          button('Edit', () => edit(scene)),
          button('Delete', async () => {
            try {
              const next = scenes.filter((item) => item.id !== scene.id);
              await callToolPanelCommand('save_scenes', { scenes: next });
              scenes = next;
              render();
              report(status, 'Scene deleted.');
            } catch (error) {
              report(status, 'Could not delete the scene.', error);
            }
          }),
        );
        list.append(row);
      }
    };
    const edit = (scene) => {
      name.value = scene.name;
      layout.value = scene.layout;
      minutes.value = String(scene.focusMinutes);
      reminder.checked = scene.breakAfter;
      for (const checkbox of linksBox.querySelectorAll('input')) {
        checkbox.checked = scene.openLinks?.includes(checkbox.value) ?? false;
      }
      form.dataset.editing = scene.id;
      save.textContent = 'Update scene';
      form.hidden = false;
      list.hidden = true;
      name.focus();
    };
    const onSubmit = async (event) => {
      event.preventDefault();
      const duration = Number(minutes.value);
      if (!Number.isInteger(duration) || duration < 1 || duration > 10_080) {
        report(status, 'Choose a whole focus duration from 1 to 10,080 minutes.');
        return;
      }
      const id = form.dataset.editing || crypto.randomUUID();
      const scene = {
        id,
        name: name.value.trim(),
        layout: layout.value,
        focusMinutes: duration,
        breakAfter: reminder.checked,
        openLinks: checkedLinks(),
      };
      const next = form.dataset.editing
        ? scenes.map((item) => item.id === id ? scene : item)
        : [...scenes, scene];
      try {
        await callToolPanelCommand('save_scenes', { scenes: next });
        scenes = next;
        delete form.dataset.editing;
        form.reset();
        minutes.value = '25';
        reminder.checked = true;
        form.hidden = true;
        list.hidden = false;
        save.textContent = 'Save scene';
        render();
        report(status, 'Scene saved.');
      } catch (error) {
        report(status, 'Could not save the scene.', error);
      }
    };
    form.addEventListener('submit', onSubmit);
    void preferences().then((saved) => {
      if (disabledState(body, api, saved, 'scenes', 'Scenes', status)) return;
      scenes = Array.isArray(saved.saved_scenes) ? saved.saved_scenes : [];
      links = Array.isArray(saved.links) ? saved.links : [];
      for (const link of links.slice(0, 8)) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = link.id;
        checkbox.setAttribute('aria-label', link.title);
        linksBox.append(field(link.title, checkbox));
      }
      render();
    }).catch((error) => report(status, 'Could not load scenes.', error));
    return () => form.removeEventListener('submit', onSubmit);
  },
});
}
