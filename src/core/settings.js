import { invoke } from '@tauri-apps/api/core';

export async function loadSettings() {
  return invoke('app_preferences');
}

export async function setModuleEnabled(id, enabled) {
  return invoke('set_module_enabled', { id, enabled });
}
