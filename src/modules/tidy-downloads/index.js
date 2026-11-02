import { open } from '@tauri-apps/plugin-dialog';

let panel;
let ctx;
let handlers = [];
let directory;
let preview = [];
let undoMoves = [];

function showMoves(items, target) {
  target.replaceChildren();
  for (const item of items) {
    const row = document.createElement('li');
    row.textContent = `${item.original.split(/[\\/]/).at(-1)} → ${item.destination.split(/[\\/]/).at(-2)}/`;
    target.append(row);
  }
}

function status(message) {
  panel.querySelector('#tidyStatus').textContent = message;
}

export function mount(element) {
  panel = element;
  panel.hidden = true;
}

export function unmount(element) {
  element.hidden = true;
}

export async function start(context) {
  ctx = context;
  const listen = (button, handler) => {
    button.addEventListener('click', handler);
    handlers.push([button, handler]);
  };
  listen(panel.querySelector('#chooseTidyFolder'), async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Choose a folder to organize' });
      if (!selected) return;
      directory = selected;
      preview = [];
      undoMoves = [];
      panel.querySelector('#tidyPreview').replaceChildren();
      panel.querySelector('#runTidy').disabled = true;
      panel.querySelector('#undoTidy').disabled = true;
      panel.querySelector('#tidyFolder').textContent = directory;
      preview = await ctx.invoke('preview_tidy_downloads', { directory });
      showMoves(preview, panel.querySelector('#tidyPreview'));
      panel.querySelector('#runTidy').disabled = preview.length === 0;
      panel.querySelector('#undoTidy').disabled = true;
      status(`${preview.length} file${preview.length === 1 ? '' : 's'} will be sorted into type folders. Nothing moves until you confirm.`);
    } catch (error) {
      status(`Could not preview this folder: ${error}`);
    }
  });
  listen(panel.querySelector('#runTidy'), async () => {
    if (!directory || preview.length === 0) return;
    panel.querySelector('#runTidy').disabled = true;
    try {
      undoMoves = await ctx.invoke('tidy_downloads', { directory, preview });
      preview = [];
      showMoves(undoMoves, panel.querySelector('#tidyPreview'));
      panel.querySelector('#runTidy').disabled = true;
      panel.querySelector('#undoTidy').disabled = false;
      status(`Moved ${undoMoves.length} file${undoMoves.length === 1 ? '' : 's'}. Undo is available until this list changes.`);
      ctx.events.emit('file.tidied', { count: undoMoves.length });
      ctx.events.emit('tool.used', { id: 'tidy-downloads', action: 'organized' });
    } catch (error) {
      status(`Could not organize files: ${error}`);
    }
  });
  listen(panel.querySelector('#undoTidy'), async () => {
    panel.querySelector('#undoTidy').disabled = true;
    try {
      await ctx.invoke('undo_tidy_downloads', { directory, moves: undoMoves });
      const count = undoMoves.length;
      undoMoves = [];
      panel.querySelector('#undoTidy').disabled = true;
      panel.querySelector('#tidyPreview').replaceChildren();
      status(`Restored ${count} file${count === 1 ? '' : 's'} to the original folder.`);
      ctx.events.emit('tool.used', { id: 'tidy-downloads', action: 'undo' });
    } catch (error) {
      panel.querySelector('#undoTidy').disabled = false;
      status(`Could not undo file moves: ${error}`);
    }
  });
}

export function stop() {
  handlers.forEach(([button, handler]) => button.removeEventListener('click', handler));
  handlers = [];
}
