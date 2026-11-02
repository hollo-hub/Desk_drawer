import { open } from '@tauri-apps/plugin-dialog';

let cleanup = [];
let links = [];
let editingId = null;

function resetForm(panel) {
  panel.querySelector('#linkForm').reset();
  panel.querySelector('#linkKind').value = 'url';
  panel.querySelector('#linkSave').textContent = 'Save link';
  panel.querySelector('#linkCancel').hidden = true;
  panel.querySelector('#linkBrowse').hidden = true;
  panel.querySelector('#linkTarget').placeholder = 'https://example.com';
  editingId = null;
}

function render(panel, ctx) {
  const query = panel.querySelector('#linkSearch').value.trim().toLowerCase();
  const list = panel.querySelector('#savedLinks');
  const matching = links.filter((link) =>
    [link.title, link.target, ...link.tags].some((value) => value.toLowerCase().includes(query)));
  ctx?.animateListExit(list, matching.map((link) => link.id));
  list.replaceChildren();
  if (!matching.length) {
    const empty = document.createElement('li');
    empty.className = 'hint empty-state-message';
    empty.textContent = query ? 'No matching saved links.' : 'No saved links yet.';
    list.append(empty);
    return;
  }

  for (const link of matching) {
    const item = document.createElement('li');
    item.dataset.motionKey = link.id;
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'saved-link-open';
    openButton.dataset.action = 'open';
    openButton.dataset.id = link.id;
    const title = document.createElement('strong');
    title.textContent = link.title;
    const detail = document.createElement('small');
    detail.textContent = `${link.kind} · ${link.target}${link.tags.length ? ` · ${link.tags.join(', ')}` : ''}`;
    openButton.append(title, detail);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn alt';
    editButton.dataset.action = 'edit';
    editButton.dataset.id = link.id;
    editButton.textContent = 'Edit';

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'btn alt';
    removeButton.dataset.action = 'remove';
    removeButton.dataset.id = link.id;
    removeButton.textContent = 'Delete';
    item.append(openButton, editButton, removeButton);
    list.append(item);
  }
}

export function mount(panel) {
  panel.hidden = true;
}

export function unmount(panel) {
  panel.hidden = true;
}

export async function start(ctx) {
  const panel = document.getElementById('p-links');
  const $ = (selector) => panel.querySelector(selector);
  links = (await ctx.loadSettings()).links ?? [];
  render(panel, ctx);

  const updateKind = () => {
    const folder = $('#linkKind').value === 'folder';
    $('#linkBrowse').hidden = $('#linkKind').value === 'url';
    $('#linkTarget').placeholder = $('#linkKind').value === 'url'
      ? 'https://example.com'
      : folder ? 'Choose a local folder' : 'Choose an application';
  };
  $('#linkKind').onchange = updateKind;
  updateKind();

  $('#linkBrowse').onclick = async () => {
    try {
      const target = await open($('#linkKind').value === 'folder'
        ? { directory: true, multiple: false }
        : { directory: false, multiple: false, filters: [{ name: 'Applications', extensions: ['exe', 'com', 'bat', 'cmd'] }] });
      if (target) $('#linkTarget').value = target;
    } catch (error) {
      ctx.toast(`Could not choose a path: ${error}`);
    }
  };

  $('#linkForm').onsubmit = async (event) => {
    event.preventDefault();
    const wasEditing = editingId !== null;
    const link = {
      id: editingId ?? crypto.randomUUID(),
      title: $('#linkTitle').value,
      kind: $('#linkKind').value,
      target: $('#linkTarget').value,
      tags: $('#linkTags').value.split(',').map((tag) => tag.trim()).filter(Boolean),
    };
    const updated = editingId
      ? links.map((item) => item.id === editingId ? link : item)
      : [...links, link];
    try {
      await ctx.invoke('save_links', { links: updated });
      links = updated;
      resetForm(panel);
      render(panel, ctx);
      ctx.toast(wasEditing ? 'Link updated' : 'Link saved');
    } catch (error) {
      ctx.toast(`Could not save the link: ${error}`);
    }
  };

  $('#linkCancel').onclick = () => resetForm(panel);
  $('#linkSearch').oninput = () => render(panel, ctx);
  $('#savedLinks').onclick = async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const link = links.find((item) => item.id === button.dataset.id);
    if (!link) return;
    if (button.dataset.action === 'open') {
      try {
        await ctx.invoke('open_saved_link', { id: link.id });
      } catch (error) {
        ctx.toast(`Could not open ${link.title}: ${error}`);
      }
    } else if (button.dataset.action === 'edit') {
      editingId = link.id;
      $('#linkTitle').value = link.title;
      $('#linkKind').value = link.kind;
      $('#linkTarget').value = link.target;
      $('#linkTags').value = link.tags.join(', ');
      $('#linkSave').textContent = 'Update link';
      $('#linkCancel').hidden = false;
      updateKind();
      $('#linkTitle').focus();
    } else if (button.dataset.action === 'remove') {
      const updated = links.filter((item) => item.id !== link.id);
      try {
        await ctx.invoke('save_links', { links: updated });
        links = updated;
        if (editingId === link.id) resetForm(panel);
        render(panel, ctx);
      } catch (error) {
        ctx.toast(`Could not delete ${link.title}: ${error}`);
      }
    }
  };

  cleanup.push(() => {
    $('#linkKind').onchange = null;
    $('#linkBrowse').onclick = null;
    $('#linkForm').onsubmit = null;
    $('#linkCancel').onclick = null;
    $('#linkSearch').oninput = null;
    $('#savedLinks').onclick = null;
  });
}

export async function stop() {
  cleanup.forEach((dispose) => dispose());
  cleanup = [];
  links = [];
  editingId = null;
}
