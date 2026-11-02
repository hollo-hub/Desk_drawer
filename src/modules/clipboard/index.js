import { writeText } from '@tauri-apps/plugin-clipboard-manager';

let cleanup = [];
let clips = [];
let clipboardPaused = false;
const HISTORY_LIFETIME_MS = 24 * 60 * 60 * 1000;
const FADE_WINDOW_MS = 60 * 60 * 1000;

function render(panel, ctx) {
  const query = panel.querySelector('#clipSearch').value.trim().toLowerCase();
  const list = panel.querySelector('#clips');
  const matching = clips.filter((item) => item.text.toLowerCase().includes(query));
  ctx?.animateListExit(list, matching.map((item) => item.id));
  list.replaceChildren();
  if (!matching.length) {
    const empty = document.createElement('li');
    empty.className = 'hint empty-state-message';
    empty.textContent = query ? 'No matching clipboard items.' : 'Nothing here yet. Copy some text.';
    list.append(empty);
    return;
  }

  for (const item of matching) {
    const row = document.createElement('li');
    row.dataset.motionKey = item.id;
    const remaining = HISTORY_LIFETIME_MS - (Date.now() - item.copiedAt);
    if (!item.pinned && remaining < FADE_WINDOW_MS) {
      row.style.opacity = String(Math.max(0.25, remaining / FADE_WINDOW_MS));
    }
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'clip-copy';
    copy.dataset.id = item.id;
    const preview = document.createElement('span');
    preview.textContent = item.text;
    const metadata = document.createElement('small');
    metadata.textContent = `${item.kind}${item.pinned ? ' · pinned' : ''} · ${new Date(item.copiedAt).toLocaleString()}`;
    copy.append(preview, metadata);
    if (item.kind === 'color') {
      const swatch = document.createElement('span');
      swatch.className = 'clip-swatch';
      swatch.style.backgroundColor = item.text;
      swatch.setAttribute('aria-label', `Color ${item.text}`);
      row.append(swatch);
    }

    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'btn alt clip-pin';
    pin.dataset.id = item.id;
    pin.dataset.pinned = String(item.pinned);
    pin.textContent = item.pinned ? 'Unpin' : 'Pin';
    row.append(copy, pin);
    list.append(row);
  }
}

async function addClip(text, ctx) {
  const value = text.trim();
  if (!value) return false;
  try {
    await ctx.invoke('add_clipboard_item', { text: value });
    return true;
  } catch (error) {
    ctx.toast(`Could not save clipboard text: ${error}`);
    return false;
  }
}

export function mount(panel) {
  panel.hidden = true;
}

export function unmount(panel) {
  panel.hidden = true;
}

export async function start(ctx) {
  const panel = document.getElementById('p-clip');
  const $ = (selector) => panel.querySelector(selector);
  let preferences = await ctx.loadSettings();
  clipboardPaused = preferences.clipboard_paused;
  $('#clipPause').setAttribute('aria-pressed', String(clipboardPaused));
  $('#clipPause').textContent = clipboardPaused ? 'Resume history' : 'Pause history';
  await ctx.invoke('prune_clipboard_history');
  preferences = await ctx.loadSettings();
  clips = preferences.clipboard_history;
  render(panel, ctx);

  const listeners = [];
  try {
    listeners.push(await ctx.listen('clipboard-pause-changed', (event) => {
      clipboardPaused = event.payload;
      $('#clipPause').setAttribute('aria-pressed', String(clipboardPaused));
      $('#clipPause').textContent = clipboardPaused ? 'Resume history' : 'Pause history';
    }));
    listeners.push(await ctx.listen('clipboard-history-changed', (event) => {
      clips = event.payload;
      render(panel, ctx);
    }));
    listeners.push(await ctx.listen('clipboard-error', (event) => ctx.toast(event.payload)));
    listeners.push(await ctx.listen('clipboard-kind-copied', (event) => {
      ctx.events.emit('clipboard.copied', { kind: event.payload });
    }));
  } catch (error) {
    listeners.forEach((dispose) => dispose());
    throw error;
  }
  cleanup.push(...listeners);

  $('#clips').onclick = async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const item = clips.find((clip) => clip.id === button.dataset.id);
    if (!item) return;
    if (button.classList.contains('clip-pin')) {
      try {
        await ctx.invoke('set_clipboard_pinned', { id: item.id, pinned: !item.pinned });
        if (!item.pinned) {
          const bounds = button.getBoundingClientRect();
          ctx.emitParticles?.('sparkle', bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
        }
      } catch (error) {
        ctx.toast(`Could not update the pin: ${error}`);
      }
      return;
    }
    try {
      await writeText(item.text);
      ctx.toast('Copied');
    } catch (error) {
      ctx.toast(`Could not copy the selected text: ${error}`);
    }
  };
  $('#clipSearch').oninput = () => render(panel, ctx);
  $('#clipAdd').onclick = async () => {
    if (await addClip($('#clipIn').value, ctx)) $('#clipIn').value = '';
  };
  $('#clipIn').onkeydown = (event) => {
    if (event.key === 'Enter') $('#clipAdd').click();
  };
  $('#clipPaste').onclick = async () => {
    try {
      const text = await ctx.invoke('read_clipboard_for_user');
      if (text) {
        if (await addClip(text, ctx)) ctx.toast('Saved from clipboard');
      } else {
        ctx.toast('The clipboard has no readable text');
      }
    } catch (error) {
      ctx.toast(`Could not read the clipboard: ${error}`);
    }
  };
  $('#clipClear').onclick = () => ctx.invoke('clear_clipboard_history')
    .catch((error) => ctx.toast(`Could not clear clipboard history: ${error}`));
  $('#clipPause').onclick = () => ctx.invoke('set_clipboard_paused', { paused: !clipboardPaused })
    .catch((error) => ctx.toast(`Could not change clipboard history: ${error}`));

  const onCopy = () => {
    if (clipboardPaused) return;
    const selection = String(document.getSelection());
    if (selection) setTimeout(() => { void addClip(selection, ctx); }, 0);
  };
  document.addEventListener('copy', onCopy);
  cleanup.push(() => document.removeEventListener('copy', onCopy));
  const expiryTimer = setInterval(() => {
    void ctx.invoke('prune_clipboard_history')
      .catch((error) => ctx.toast(`Could not expire clipboard history: ${error}`));
  }, 60_000);
  cleanup.push(() => clearInterval(expiryTimer));
}

export async function stop() {
  cleanup.forEach((dispose) => dispose());
  cleanup = [];
  const panel = document.getElementById('p-clip');
  panel.querySelector('#clips').onclick = null;
  panel.querySelector('#clipSearch').oninput = null;
  panel.querySelector('#clipAdd').onclick = null;
  panel.querySelector('#clipIn').onkeydown = null;
  panel.querySelector('#clipPaste').onclick = null;
  panel.querySelector('#clipClear').onclick = null;
  panel.querySelector('#clipPause').onclick = null;
  clips = [];
}
