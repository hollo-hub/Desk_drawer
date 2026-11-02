import { open } from '@tauri-apps/plugin-dialog';

let panel;
let context;
let files = [];
let handlers = [];
let dragCleanup;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function currentDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function displayName(path) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

function render() {
  const pattern = panel.querySelector('#pattern').value || '{name}';
  const today = currentDate();
  const list = panel.querySelector('#names');
  context?.animateListExit(list, files.map((file) => file.path));
  list.innerHTML = files.map((file, index) => {
    const dot = file.name.lastIndexOf('.');
    const stem = dot > 0 ? file.name.slice(0, dot) : file.name;
    const ext = dot > 0 ? file.name.slice(dot) : '';
    const output = pattern
      .replace(/\{name\}/g, stem)
      .replace(/\{n\}/g, String(index + 1).padStart(2, '0'))
      .replace(/\{date\}/g, today)
      .replace(/[^\w-]+/g, '-') + ext;
    return `<li data-motion-key="${escapeHtml(file.path)}"><span>${escapeHtml(file.name)}</span><b>${escapeHtml(output)}</b></li>`;
  }).join('');
}

function takePaths(paths, ctx) {
  if (!paths.length) return;
  files = paths.map((path) => ({ path, name: displayName(path) }));
  render();
  ctx.hop();
}

export function mount(element) {
  panel = element;
  panel.hidden = true;
}

export function unmount(element) {
  element.hidden = true;
  context = null;
}

export async function start(ctx) {
  context = ctx;
  const addHandler = (element, name, handler) => {
    element.addEventListener(name, handler);
    handlers.push([element, name, handler]);
  };
  const choose = panel.querySelector('#chooseFiles');
  addHandler(choose, 'click', async () => {
    try {
      const selected = await open({ multiple: true, title: 'Choose files to rename' });
      if (selected) takePaths(Array.isArray(selected) ? selected : [selected], ctx);
    } catch (error) {
      ctx.toast(`Could not open the file picker: ${error}`);
    }
  });
  addHandler(panel.querySelector('#pattern'), 'input', render);
  addHandler(panel.querySelector('#renBtn'), 'click', async () => {
    if (!files.length) {
      ctx.toast('Choose or drop files first');
      return;
    }
    try {
      const outcomes = await ctx.invoke('rename_files', {
        paths: files.map((file) => file.path),
        pattern: panel.querySelector('#pattern').value,
        date: currentDate(),
      });
      files = outcomes.map((file) => ({ path: file.path, name: displayName(file.path) }));
      render();
      const failures = outcomes.filter((file) => !file.renamed);
      if (failures.length) {
        ctx.toast(`${failures.length} file${failures.length === 1 ? '' : 's'} could not be renamed: ${failures[0].error}`);
      } else {
        ctx.events.emit('file.renamed', { count: outcomes.length });
        ctx.toast(`Renamed ${outcomes.length} file${outcomes.length === 1 ? '' : 's'}`);
      }
    } catch (error) {
      ctx.toast(`Could not rename files: ${error}`);
    }
  });
  dragCleanup = await ctx.webview.onDragDropEvent((event) => {
    if (event.payload.type === 'over') choose.classList.add('over');
    if (event.payload.type === 'leave' || event.payload.type === 'drop') choose.classList.remove('over');
    if (event.payload.type === 'drop') takePaths(event.payload.paths, ctx);
  });
  render();
}

export async function stop() {
  handlers.forEach(([element, name, handler]) => element.removeEventListener(name, handler));
  handlers = [];
  if (dragCleanup) {
    await dragCleanup();
    dragCleanup = undefined;
  }
  panel.querySelector('#chooseFiles').classList.remove('over');
}
