export const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'buddy', label: 'Buddy' },
  { id: 'animations', label: 'Animations' },
  { id: 'modules', label: 'Modules' },
  { id: 'behavior', label: 'Behavior Lab' },
  { id: 'privacy', label: 'Privacy and Permissions' },
  { id: 'hotkeys', label: 'Hotkeys' },
  { id: 'data', label: 'Data' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'about', label: 'About' },
  { id: 'developer', label: 'Developer' },
];

export const SETTINGS_CATALOG = [
  {
    id: 'close-to-tray',
    section: 'general',
    name: 'Close to tray',
    description: 'Keep clipboard history and break reminders running when the window closes.',
    target: 'closeToTray',
  },
  {
    id: 'launch-at-login',
    section: 'general',
    name: 'Launch at login',
    description: 'Start Desk Drawer hidden in the tray when you sign in to Windows.',
    target: 'launchAtLogin',
  },
  {
    id: 'window-style',
    section: 'appearance',
    name: 'Window style',
    description: 'Choose the Native Windows title bar or Soft borderless style with a transparent margin and window physics.',
    target: 'windowStyle',
  },
  {
    id: 'theme',
    section: 'appearance',
    name: 'Theme',
    description: 'Choose Cozy, Night, Transparent, Frost, Paper, Arcade, Forest, Savanna dusk, Terminal, High contrast, or an imported theme.',
    target: 'settingsTheme',
  },
  {
    id: 'glass-opacity',
    section: 'appearance',
    name: 'Glass opacity',
    description: 'Adjust how much of the Windows material shows through Glass.',
    target: 'glassOpacity',
  },
  {
    id: 'desk-background',
    section: 'appearance',
    name: 'Desk background',
    description: 'Choose a local background image for the desk.',
    target: 'chooseDeskBackground',
  },
  {
    id: 'desk-stickers',
    section: 'appearance',
    name: 'Desk stickers',
    description: 'Add local image stickers to the desk.',
    target: 'addDeskSticker',
  },
  {
    id: 'buddy-mode',
    section: 'buddy',
    name: 'Buddy mode',
    description: 'Choose whether the buddy stays in the desk, roams the desktop, or is off.',
    target: 'buddyMode',
  },
  {
    id: 'animations-enabled',
    section: 'animations',
    name: 'Animations',
    description: 'Turn interface and buddy animations on or off. Windows reduced-motion settings still take priority.',
    target: 'animationsEnabled',
  },
  {
    id: 'drawer-style',
    section: 'animations',
    name: 'Drawer transition',
    description: 'Choose slide, pop, or instant panel transitions.',
    target: 'drawerStyle',
  },
  {
    id: 'animation-intensity',
    section: 'animations',
    name: 'Animation intensity',
    description: 'Choose Off, Calm, or Lively motion.',
    target: 'animationIntensity',
  },
  {
    id: 'animation-speed',
    section: 'animations',
    name: 'Animation speed',
    description: 'Set motion speed between 0.5× and 2×.',
    target: 'animationSpeed',
  },
  {
    id: 'animation-stiffness',
    section: 'animations',
    name: 'Spring stiffness',
    description: 'Tune how quickly animation springs return to rest.',
    target: 'animationStiffness',
  },
  {
    id: 'animation-bounciness',
    section: 'animations',
    name: 'Spring bounciness',
    description: 'Tune spring overshoot and settle.',
    target: 'animationBounciness',
  },
  {
    id: 'animation-window-jelly',
    section: 'animations',
    name: 'Soft window jelly drag',
    description: 'Toggle spring sway while moving a Soft window.',
    target: 'motionJelly',
  },
  {
    id: 'animation-buddy-impact',
    section: 'animations',
    name: 'Buddy impact squash',
    description: 'Toggle squash and stretch when the buddy is picked up, dropped, or petted.',
    target: 'motionBuddyImpacts',
  },
  {
    id: 'animation-desk-particles',
    section: 'animations',
    name: 'Desk particles',
    description: 'Toggle small sparkle, heart, and landing effects.',
    target: 'motionParticles',
  },
  {
    id: 'dock-magnification',
    section: 'animations',
    name: 'Dock-style tab magnification',
    description: 'Enlarge drawer tabs near the pointer without moving other tabs.',
    target: 'dockMagnification',
  },
  {
    id: 'rubber-band',
    section: 'animations',
    name: 'Rubber-band scrolling',
    description: 'Spring back softly at the top and bottom of scrollable panels.',
    target: 'rubberBandScrolling',
  },
  {
    id: 'cursor-tilt',
    section: 'animations',
    name: 'Cursor tilt',
    description: 'Tilt the desk up to three degrees toward the pointer in Soft style.',
    target: 'cursorTilt',
  },
  {
    id: 'reminder-bounce',
    section: 'animations',
    name: 'Buddy reminder bounce',
    description: 'Bounce the buddy briefly when a break reminder starts.',
    target: 'reminderBounce',
  },
  {
    id: 'taskbar-flash',
    section: 'animations',
    name: 'Taskbar attention on reminders',
    description: 'Ask Windows to flash the taskbar button when a break reminder starts.',
    target: 'taskbarFlash',
  },
  {
    id: 'list-item-motion',
    section: 'animations',
    name: 'List item motion',
    description: 'Fade and slide list entries in and out with an eight pixel movement.',
    target: 'listItemMotion',
  },
  {
    id: 'loading-idle',
    section: 'animations',
    name: 'Loading shimmer and empty-state idle',
    description: 'Show a quiet loading shimmer and gentle idle effect for empty lists.',
    target: 'loadingIdleEffects',
  },
  {
    id: 'theme-crossfade',
    section: 'animations',
    name: 'Theme crossfade',
    description: 'Crossfade theme changes when the View Transitions API is available.',
    target: 'themeCrossfade',
  },
  {
    id: 'developer-mode',
    section: 'advanced',
    name: 'Developer mode',
    description: 'Show local debugging tools, event inspection, rule diagnostics, and performance snapshots. Off by default.',
    target: 'developerMode',
  },
  {
    id: 'behavior-lab',
    section: 'behavior',
    name: 'Behavior Lab',
    description: 'Edit buddy personality, rules, sensors, and validated behavior packs.',
    target: 'openBehaviorLab',
  },
  {
    id: 'buddy-sensors',
    section: 'privacy',
    name: 'Buddy sensors',
    description: 'Choose what coarse activity signals the buddy can sense. Sensors are local and can be disabled at any time.',
    target: 'openBehaviorSensors',
  },
  {
    id: 'global-hotkey',
    section: 'hotkeys',
    name: 'Show or hide Desk Drawer',
    description: 'Press Ctrl+Shift+Space to show or hide the window.',
    target: null,
  },
  {
    id: 'drawer-hotkeys',
    section: 'hotkeys',
    name: 'Drawer shortcuts',
    description: 'Use the number keys for drawers and M, S, or B for Modules, Settings, and Behavior Lab.',
    target: null,
  },
];

function normalized(value) {
  return String(value ?? '').trim().toLocaleLowerCase('en-US');
}

export function searchSettings(entries, query) {
  const needle = normalized(query);
  if (!needle) return [];
  return entries.filter((entry) =>
    normalized(entry.name).includes(needle)
    || normalized(entry.description).includes(needle));
}
