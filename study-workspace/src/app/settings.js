import { appState } from "./state.js";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { clickSound, colorSchemePreference, confirmSound, settingsDialog, settingsGearButton, soundEffectsSetting } from "./dom.js";
import { scheduleSave, setSaveStatus } from "./persistence.js";

export function applyAppearance() {
  const choice = appState.appData?.settings.theme ?? "system";
  const dark = choice === "dark" ||
    (choice === "system" && colorSchemePreference.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document.querySelector("#theme-setting").value = choice;
  document.querySelector("#notifications-setting").checked =
    appState.appData?.settings.notifications !== false;
  soundEffectsSetting.checked = appState.appData?.settings.soundEffects !== false;
  document.querySelector("#download-filing-setting").checked =
    appState.appData?.settings.downloadFilingEnabled === true;
  const visible = new Set(appState.appData?.settings.dashboardComponents ?? []);
  for (const checkbox of document.querySelectorAll("[data-component-setting]")) {
    checkbox.checked = visible.has(checkbox.dataset.componentSetting);
  }
  applyDashboardComponents();
}

export function applyDashboardComponents() {
  const visible = new Set(appState.appData?.settings.dashboardComponents ?? []);
  for (const element of document.querySelectorAll("[data-dashboard-component]")) {
    element.dataset.dashboardVisible = String(visible.has(element.dataset.dashboardComponent));
  }
}

export function updateThemeSetting() {
  if (!appState.appData) return;
  appState.appData.settings.theme = document.querySelector("#theme-setting").value;
  applyAppearance();
  scheduleSave();
}

export function updateDashboardComponentSetting(event) {
  if (!appState.appData) return;
  const key = event.currentTarget.dataset.componentSetting;
  const visible = new Set(appState.appData.settings.dashboardComponents);
  if (event.currentTarget.checked) visible.add(key);
  else visible.delete(key);
  appState.appData.settings.dashboardComponents = [...visible];
  applyDashboardComponents();
  scheduleSave();
}

export async function updateNotificationsSetting() {
  if (!appState.appData) return;
  const enabled = document.querySelector("#notifications-setting").checked;
  if (enabled) {
    try {
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      if (!granted) {
        document.querySelector("#notifications-setting").checked = false;
        appState.appData.settings.notifications = false;
        scheduleSave();
        setSaveStatus("Notifications are off because permission was not granted.", "error");
        return;
      }
    } catch (error) {
      document.querySelector("#notifications-setting").checked = false;
      appState.appData.settings.notifications = false;
      scheduleSave();
      console.error("Could not enable notifications.", error);
      setSaveStatus(`Could not enable notifications: ${String(error)}`, "error");
      return;
    }
  }
  appState.appData.settings.notifications = enabled;
  scheduleSave();
}

export function updateSoundEffectsSetting() {
  if (!appState.appData) return;
  appState.appData.settings.soundEffects = soundEffectsSetting.checked;
  scheduleSave();
}

export function playInterfaceSound(event) {
  if (!appState.appData?.settings.soundEffects) return;
  const control = event.target.closest("button, a, input[type='checkbox'], select");
  if (!control || control.disabled || control.getAttribute("aria-disabled") === "true") return;
  const sound = control.matches("#start-session, #apply-custom-length") ? confirmSound : clickSound;
  sound.currentTime = 0;
  void sound.play().catch((error) => {
    console.warn("Could not play the interface sound.", error);
  });
}

export function openSettings() {
  if (!appState.appData) return;
  applyAppearance();
  settingsGearButton.setAttribute("aria-expanded", "true");
  settingsDialog.showModal();
}
