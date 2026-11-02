let panel;
let context;
let pinned = false;
let handler;

function render() {
  const button = panel.querySelector('#pinWindowToggle');
  button.textContent = pinned ? 'Unpin Desk Drawer' : 'Pin Desk Drawer on top';
  button.setAttribute('aria-pressed', String(pinned));
  panel.querySelector('#pinWindowStatus').textContent = pinned
    ? 'Desk Drawer stays above other windows.'
    : 'Desk Drawer uses normal window ordering.';
}

export function mount(element) {
  panel = element;
  panel.hidden = true;
}

export function unmount(element) {
  element.hidden = true;
}

export async function start(ctx) {
  context = ctx;
  pinned = Boolean((await ctx.loadSettings()).window_pinned);
  handler = async () => {
    const next = !pinned;
    try {
      await ctx.invoke('set_window_pinned', { pinned: next });
      pinned = next;
      render();
      ctx.events.emit('tool.used', { id: 'pin-window', action: next ? 'pinned' : 'unpinned' });
    } catch (error) {
      ctx.toast(`Could not change the window pin: ${error}`);
    }
  };
  panel.querySelector('#pinWindowToggle').addEventListener('click', handler);
  render();
}

export async function stop() {
  panel.querySelector('#pinWindowToggle').removeEventListener('click', handler);
  handler = undefined;
  if (pinned) {
    await context.invoke('set_window_pinned', { pinned: false });
    pinned = false;
  }
}
