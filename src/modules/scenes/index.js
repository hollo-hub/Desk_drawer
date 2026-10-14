let panel;
let ctx;
let scenes = [];
let handlers = [];

function render() {
  const list = panel.querySelector('#savedScenes');
  ctx?.animateListExit(list, scenes.map((scene) => scene.id));
  list.replaceChildren();
  for (const scene of scenes) {
    const row = document.createElement('li');
    row.dataset.motionKey = scene.id;
    const label = document.createElement('span');
    label.textContent = `${scene.name} · ${scene.layout} · ${scene.focusMinutes} min`;
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn alt';
    apply.textContent = 'Start scene';
    apply.addEventListener('click', () => applyScene(scene));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn alt';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => removeScene(scene.id));
    row.append(label, apply, remove);
    list.append(row);
  }
}

async function persist() {
  await ctx.invoke('save_scenes', { scenes });
  render();
}

async function applyScene(scene) {
  try {
    for (const id of scene.openLinks ?? []) {
      await ctx.invoke('open_saved_link', { id });
    }
    if (scene.openLinks?.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await ctx.invoke('apply_layout', { name: scene.layout });
    const focusEnabled = ctx.isModuleEnabled('focus');
    const breakEnabled = ctx.isModuleEnabled('break');
    if (focusEnabled) {
      ctx.events.emit('focus.start-requested', {
        minutes: scene.focusMinutes,
        breakAfter: scene.breakAfter && breakEnabled,
      });
    }
    ctx.events.emit('tool.used', { id: 'scenes', action: 'started' });
    const notice = [
      !focusEnabled ? 'Focus Timer is disabled' : '',
      scene.breakAfter && !breakEnabled ? 'Break Buddy is disabled' : '',
    ].filter(Boolean).join('; ');
    ctx.toast(notice ? `Started ${scene.name}; ${notice}.` : `Started ${scene.name}`);
  } catch (error) {
    ctx.toast(`Could not start this scene: ${error}`);
  }
}

async function removeScene(id) {
  scenes = scenes.filter((scene) => scene.id !== id);
  try {
    await persist();
    ctx.toast('Scene removed.');
  } catch (error) {
    ctx.toast(`Could not remove the scene: ${error}`);
  }
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
  const preferences = await ctx.loadSettings();
  scenes = preferences.saved_scenes ?? [];
  const sceneLinks = panel.querySelector('#sceneLinks');
  sceneLinks.replaceChildren();
  for (const link of preferences.links ?? []) {
    const label = document.createElement('label');
    label.className = 'setting';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = link.id;
    const text = document.createElement('span');
    text.textContent = `${link.title} (${link.kind})`;
    label.append(checkbox, text);
    sceneLinks.append(label);
  }
  const saveButton = panel.querySelector('#saveScene');
  const handler = async () => {
    const name = panel.querySelector('#sceneName').value.trim();
    if (!name) {
      ctx.toast('Give this scene a name first.');
      return;
    }
    const scene = {
      id: crypto.randomUUID(),
      name,
      layout: panel.querySelector('#sceneLayout').value,
      focusMinutes: Number(panel.querySelector('#sceneFocusMinutes').value),
      breakAfter: panel.querySelector('#sceneBreakAfter').checked,
      openLinks: [...panel.querySelectorAll('#sceneLinks input:checked')].map((input) => input.value),
    };
    scenes = [...scenes, scene];
    try {
      await persist();
      panel.querySelector('#sceneName').value = '';
      ctx.events.emit('tool.used', { id: 'scenes', action: 'saved' });
    } catch (error) {
      scenes = scenes.filter((item) => item.id !== scene.id);
      ctx.toast(`Could not save the scene: ${error}`);
    }
  };
  saveButton.addEventListener('click', handler);
  handlers.push([saveButton, handler]);
  render();
}

export function stop() {
  handlers.forEach(([element, handler]) => element.removeEventListener('click', handler));
  handlers = [];
  panel.querySelector('#savedScenes').replaceChildren();
}
