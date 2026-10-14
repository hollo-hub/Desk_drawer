import { writeText } from '@tauri-apps/plugin-clipboard-manager';

let panel;
let handlers = [];

function updateColor() {
  const input = panel.querySelector('#pickedColor');
  const color = input.value.toUpperCase();
  const [red, green, blue] = color.slice(1).match(/.{2}/g).map((part) => Number.parseInt(part, 16));
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 510;
  const delta = maximum - minimum;
  let hue = 0;
  let saturation = 0;
  if (delta) {
    saturation = (delta / 255) / (1 - Math.abs(2 * lightness - 1));
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = Math.round(hue * 60 + 360) % 360;
  }
  panel.querySelector('#colorSwatch').style.backgroundColor = color;
  panel.querySelector('#colorHex').textContent = color;
  panel.querySelector('#colorRgb').textContent = `RGB ${red}, ${green}, ${blue}`;
  panel.querySelector('#colorHsl').textContent = `HSL ${hue}°, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%`;
}

export function mount(element) {
  panel = element;
  panel.hidden = true;
}

export function unmount(element) {
  element.hidden = true;
}

export async function start(ctx) {
  const listen = (element, event, handler) => {
    element.addEventListener(event, handler);
    handlers.push([element, event, handler]);
  };
  listen(panel.querySelector('#pickedColor'), 'input', updateColor);
  listen(panel.querySelector('#copyPickedColor'), 'click', async () => {
    const color = panel.querySelector('#pickedColor').value.toUpperCase();
    try {
      await writeText(color);
      ctx.events.emit('tool.used', { id: 'color-picker', action: 'copied' });
      ctx.toast(`Copied ${color}`);
    } catch (error) {
      ctx.toast(`Could not copy the color: ${error}`);
    }
  });
  updateColor();
}

export function stop() {
  handlers.forEach(([element, event, handler]) => element.removeEventListener(event, handler));
  handlers = [];
}
