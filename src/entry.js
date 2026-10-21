import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

let label = '';
let isTauri = false;
try {
  label = getCurrentWebviewWindow().label;
  isTauri = true;
} catch {
  // The app also supports running in a regular browser for UI previews.
}

if (label === 'roam' || label === 'roam_hitbox') {
  const { startRoamWindow } = await import('./roam.js');
  await startRoamWindow(label);
} else {
  if (isTauri) await import('./main.js');
  await import('./home-v2/boot.js');
  if (!isTauri) document.getElementById('v2OpenClassic').hidden = true;
}
