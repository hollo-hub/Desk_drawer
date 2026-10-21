import { THEMES, ORDER } from './themes.js';

const TOOLS = [
  ['scenes', 'Scenes', 'study mode layout timer links'], ['focus', 'Focus timer', 'pomodoro countdown halo'],
  ['clipboard', 'Clipboard', 'history snippets paste'], ['links', 'Links', 'bookmarks sites folders apps'],
  ['notes', 'Notes', 'scratch note'], ['tidy', 'Tidy downloads', 'sort files folder'],
  ['rename', 'Rename files', 'batch pattern'], ['layouts', 'Window layouts', 'coding writing call'],
  ['picker', 'Color picker', 'hex eyedropper'], ['awake', 'Keep awake', 'prevent sleep'],
  ['buddy', 'Buddy', 'cat behavior themes'], ['settings', 'Settings', 'motion cursor window startup'],
];

export function initPalette(api) {
  const root = document.createElement('div');
  root.id = 'palette'; root.hidden = true;
  root.innerHTML = '<div class="pal-box" role="dialog" aria-label="Command palette"><input class="pal-in" placeholder="Type a command" aria-label="Command"><ul class="pal-list" role="listbox"></ul></div>';
  document.body.appendChild(root);
  const input = root.querySelector('.pal-in'), list = root.querySelector('.pal-list');
  let items = [], sel = 0;

  const commands = () => [
    ...TOOLS.map(([id, label, kw]) => ({ label, kw, run: () => api.openPanel(id) })),
    { label: 'Summon or tuck tools', kw: 'orbit ring halo', run: () => api.toggleTools() },
    ...ORDER.map((id) => ({ label: 'Theme: ' + THEMES[id].name, kw: 'theme appearance', run: () => api.set({ theme: id }) })),
  ];
  const match = (q, s) => { let i = 0; s = s.toLowerCase(); for (const ch of q.toLowerCase()) { i = s.indexOf(ch, i); if (i < 0) return false; i++; } return true; };

  function render() {
    const q = input.value.trim();
    items = commands().filter((c) => !q || match(q, c.label + ' ' + c.kw));
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = '';
    items.forEach((c, i) => {
      const li = document.createElement('li');
      li.textContent = c.label; li.setAttribute('role', 'option');
      if (i === sel) li.className = 'on';
      li.onclick = () => run(i);
      list.appendChild(li);
    });
  }
  function run(i) { const c = items[i]; if (!c) return; close(); c.run(); }
  function open() { root.hidden = false; input.value = ''; sel = 0; render(); input.focus(); }
  function close() { root.hidden = true; }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); root.hidden ? open() : close(); return; }
    if (root.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  });
  input.addEventListener('input', () => { sel = 0; render(); });
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
}
