const LAYOUTS = {
  coding: [[0, 0, 60, 100], [60, 0, 40, 50], [60, 50, 40, 50]],
  writing: [[20, 0, 60, 100], [82, 0, 18, 100], [0, 0, 18, 100]],
  call: [[0, 0, 70, 100], [70, 0, 30, 50], [70, 50, 30, 50]],
};

let panel;
let handlers = [];

function preview(name, ctx) {
  panel.querySelectorAll('#screen .win').forEach((win, index) => {
    const [left, top, width, height] = LAYOUTS[name][index];
    Object.assign(win.style, { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` });
  });
  panel.querySelectorAll('[data-l]').forEach((button) => button.classList.toggle('alt', button.dataset.l !== name));
  ctx.hop();
}

export function mount(element) {
  panel = element;
  panel.hidden = true;
}

export function unmount(element) {
  element.hidden = true;
}

export async function start(ctx) {
  for (const button of panel.querySelectorAll('[data-l]')) {
    const handler = async () => {
      const name = button.dataset.l;
      preview(name, ctx);
      try {
        const arranged = await ctx.invoke('apply_layout', { name });
        ctx.events.emit('layout.applied', { layout: name, count: arranged });
        ctx.toast(`Arranged ${arranged} window${arranged === 1 ? '' : 's'}`);
      } catch (error) {
        ctx.toast(`Could not apply this layout: ${error}`);
      }
    };
    button.addEventListener('click', handler);
    handlers.push([button, handler]);
  }
  const preferences = await ctx.loadSettings();
  preview(preferences.active_layout, ctx);
}

export function stop() {
  handlers.forEach(([button, handler]) => button.removeEventListener('click', handler));
  handlers = [];
}
