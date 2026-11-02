let panel;
let context;
let active = false;
let handler;

function render() {
  const button = panel.querySelector('#keepAwakeToggle');
  button.textContent = active ? 'Allow sleep again' : 'Keep this PC awake';
  button.setAttribute('aria-pressed', String(active));
  panel.querySelector('#keepAwakeStatus').textContent = active
    ? 'Windows sleep and display idle timers are being held until you stop this or disable the module.'
    : 'Sleep behavior is unchanged.';
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
  handler = async () => {
    const next = !active;
    try {
      await ctx.invoke('set_keep_awake', { active: next });
      active = next;
      render();
      if (next) ctx.events.emit('tool.used', { id: 'keep-awake', action: 'started' });
      ctx.toast(next ? 'Keep-awake is on' : 'Normal sleep behavior restored');
    } catch (error) {
      ctx.toast(`Could not change keep-awake: ${error}`);
    }
  };
  panel.querySelector('#keepAwakeToggle').addEventListener('click', handler);
  active = false;
  render();
}

export async function stop() {
  panel.querySelector('#keepAwakeToggle').removeEventListener('click', handler);
  handler = undefined;
  if (active) {
    await context.invoke('set_keep_awake', { active: false });
    active = false;
  }
}
