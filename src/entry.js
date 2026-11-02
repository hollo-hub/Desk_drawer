import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

let label = '';
try {
  label = getCurrentWebviewWindow().label;
} catch {
  // The app also supports running in a regular browser for UI previews.
}

if (label === 'roam' || label === 'roam_hitbox') {
  const { startRoamWindow } = await import('./roam.js');
  await startRoamWindow(label);
} else {
  await import('./main.js');
}
