import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createMotionEngine } from './core/motion.js';
import { createPlaceholderSpriteSheet, drawSpriteFrame } from './core/sprite-sheet.js';
import { createBuddyStateMachine } from './core/buddy-state.js';
import { validateInstalledDeskPackAssets } from './core/desk-pack.js';
import './style.css';

const FRAME_MS = 1000 / 20;
const SLEEP_FRAME_MS = 500;
const HIDDEN_POLL_MS = 1000;
const CURSOR_POLL_MS = 2500;
const BUDDY_SIZE = 48;
const LABEL = await import('@tauri-apps/api/webviewWindow')
  .then(({ getCurrentWebviewWindow }) => getCurrentWebviewWindow().label);

function addStyles() {
  document.body.classList.add('roam-window');
}

function showError(error) {
  const status = document.querySelector('#roamStatus');
  status.textContent = `Buddy error: ${error?.message ?? error}`;
  status.hidden = false;
}

function createDrawerSprite() {
  const colors = getComputedStyle(document.documentElement);
  return createPlaceholderSpriteSheet(document, {
    body: colors.getPropertyValue('--buddy').trim(),
    ink: colors.getPropertyValue('--ink').trim(),
    accent: colors.getPropertyValue('--accent').trim(),
  });
}

async function startBuddyWindow() {
  const canvas = document.querySelector('#roamBuddy');
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('Could not create the roaming buddy canvas.');
  const motion = createMotionEngine({ documentRef: document });

  let config = null;
  let spriteSheet = createDrawerSprite();
  let packDef = null;
  let spriteUrl = null;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMotion.matches;
  let sleeping = false;
  let visible = true;
  let menuOpen = false;
  let frame = 0;
  let x = 32;
  let targetX = 32;
  let monitors = await invoke('roam_monitor_areas');
  if (!monitors.length) throw new Error('No displays are available for roaming.');
  let area = monitors[0];
  let lastTick = 0;
  let lastAllowedCheck = 0;
  let lastCursorCheck = 0;
  let stopped = false;
  let tickBusy = false;
  let cancelBuddyMotion = null;
  let hiddenPollTimer = null;
  const stateMachine = createBuddyStateMachine('idle');

  const draw = () => {
    const moving = Math.abs(targetX - x) > 0.5;
    const lowMotion = reduced || motion.getPolicy().ecoMode;
    const nextState = !visible ? 'hidden'
      : sleeping ? 'sleeping'
        : moving && !lowMotion && !menuOpen ? 'walking' : 'idle';
    if (stateMachine.state === 'hidden' && nextState !== 'hidden') {
      stateMachine.transition('idle');
    }
    stateMachine.transition(nextState);
    const animation = sleeping ? 'sleep' : moving && !lowMotion ? 'walk' : 'idle';
    const selectedAnimation = packDef?.buddy.animations?.[animation] ? animation : 'idle';
    drawSpriteFrame(context, spriteSheet, selectedAnimation, frame, 0, 0, BUDDY_SIZE, BUDDY_SIZE, packDef);
    document.querySelector('#roamSleep').hidden = !sleeping;
  };

  const applyConfig = async (nextConfig) => {
    let nextPack = null;
    let nextSheet = createDrawerSprite();
    let nextUrl = null;
    if (nextConfig.assets) {
      const [validatedPack, bytes] = validateInstalledDeskPackAssets(nextConfig.assets);
      nextPack = validatedPack;
      nextUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      const image = new Image();
      try {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('The installed buddy sprite could not be decoded.'));
          image.src = nextUrl;
        });
      } catch (error) {
        URL.revokeObjectURL(nextUrl);
        throw error;
      }
      nextSheet = image;
    }
    const previousUrl = spriteUrl;
    config = nextConfig;
    packDef = nextPack;
    spriteSheet = nextSheet;
    spriteUrl = nextUrl;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    draw();
  };

  const syncPosition = () => {
    const scale = area.scaleFactor;
    const left = Math.round(area.x + x * scale);
    const top = Math.round(area.y + area.height - BUDDY_SIZE * scale);
    return invoke('set_roam_buddy_position', { x: left, y: top, scaleFactor: scale });
  };

  const chooseNextTarget = () => {
    const right = Math.max(0, Math.floor(area.width / area.scaleFactor) - BUDDY_SIZE);
    targetX = Math.round(Math.random() * right);
  };

  const findCurrentMonitor = (available) => available.find((monitor) => {
    const physicalX = monitor.x + x * monitor.scaleFactor;
    const physicalY = monitor.y + monitor.height - BUDDY_SIZE * monitor.scaleFactor;
    return physicalX >= monitor.x
      && physicalX < monitor.x + monitor.width
      && physicalY >= monitor.y
      && physicalY < monitor.y + monitor.height;
  }) ?? available[0];

  const updateEnvironment = async (now) => {
    const allowed = await invoke('roam_is_allowed');
    if (allowed !== visible) {
      await invoke('set_roam_buddy_visible', { visible: allowed });
      visible = allowed;
      draw();
    }
    if (!visible) return;

    monitors = await invoke('roam_monitor_areas');
    if (!monitors.length) throw new Error('No displays are available for roaming.');
    const current = findCurrentMonitor(monitors);
    if (current !== area) {
      area = current;
      x = Math.min(x, Math.max(0, Math.floor(area.width / area.scaleFactor) - BUDDY_SIZE));
      targetX = x;
      await syncPosition();
    }

    if (now - lastCursorCheck >= CURSOR_POLL_MS) {
      lastCursorCheck = now;
      const target = await invoke('roam_cursor_target');
      if (target && Math.random() < config.clinginess / 100) {
        const targetMonitor = monitors[target.monitorIndex];
        if (targetMonitor && targetMonitor !== area) {
          area = targetMonitor;
          x = Math.min(x, Math.max(0, Math.floor(area.width / area.scaleFactor) - BUDDY_SIZE));
        }
        if (targetMonitor) {
          targetX = Math.max(0, Math.min(
            Math.floor(area.width / area.scaleFactor) - BUDDY_SIZE,
            target.x - BUDDY_SIZE / 2,
          ));
        }
      }
    }
  };

  const updateBuddyRate = () => {
    if (cancelBuddyMotion) {
      const moving = Math.abs(targetX - x) > 0.5;
      motion.setFps('roaming-buddy', sleeping || reduced || menuOpen ? 2 : moving ? 20 : 6);
    }
  };
  const stopBuddyMotion = () => {
    const cancel = cancelBuddyMotion;
    cancelBuddyMotion = null;
    cancel?.();
  };
  const startBuddyMotion = () => {
    if (cancelBuddyMotion || !visible || stopped) return;
    cancelBuddyMotion = motion.register({
      id: 'roaming-buddy',
      kind: 'buddy-idle',
      fps: sleeping || reduced || menuOpen
        ? 2
        : Math.abs(targetX - x) > 0.5 ? 20 : 6,
      element: canvas,
      update({ frameTime }) {
        void tick(frameTime);
        return !stopped;
      },
      onStop() {
        cancelBuddyMotion = null;
      },
    });
  };

  const tick = async (now = performance.now()) => {
    if (stopped || tickBusy) return;
    tickBusy = true;
    try {
      if (now - lastAllowedCheck >= HIDDEN_POLL_MS) {
        lastAllowedCheck = now;
        await updateEnvironment(now);
      }
      if (visible) {
        const delay = sleeping || reduced || menuOpen ? SLEEP_FRAME_MS : FRAME_MS;
        if (now - lastTick >= delay) {
          const elapsed = lastTick === 0 ? delay : Math.min(now - lastTick, 100);
          lastTick = now;
          frame = sleeping || reduced || menuOpen ? (frame + 1) % 2 : (frame + 1) % 120;
          if (!sleeping && !reduced && !motion.getPolicy().ecoMode && !menuOpen) {
            if (Math.abs(targetX - x) < 1) chooseNextTarget();
            x += Math.sign(targetX - x) * Math.min(1.2 * (elapsed / FRAME_MS), Math.abs(targetX - x));
            await syncPosition();
          }
          updateBuddyRate();
          draw();
        }
      }
      document.querySelector('#roamStatus').hidden = true;
    } catch (error) {
      console.error('Desktop buddy update failed:', error);
      showError(error);
      if (visible) {
        try {
          await invoke('set_roam_buddy_visible', { visible: false });
          visible = false;
        } catch (visibilityError) {
          console.error('Could not safely hide the desktop buddy:', visibilityError);
          showError(visibilityError);
        }
      }
    } finally {
      tickBusy = false;
      if (stopped) return;
      if (visible) {
        if (hiddenPollTimer !== null) {
          clearTimeout(hiddenPollTimer);
          hiddenPollTimer = null;
        }
        startBuddyMotion();
      } else {
        stopBuddyMotion();
        if (hiddenPollTimer === null) {
          hiddenPollTimer = window.setTimeout(() => {
            hiddenPollTimer = null;
            void tick(performance.now());
          }, HIDDEN_POLL_MS);
        }
      }
    }
  };

  await applyConfig(await invoke('roam_buddy_config'));
  await syncPosition();
  draw();
  void tick(performance.now());

  const onMotionChange = (event) => {
    reduced = event.matches;
    if (reduced) targetX = x;
    updateBuddyRate();
    draw();
  };
  reducedMotion.addEventListener('change', onMotionChange);
  const unlisten = await listen('roam-action', ({ payload }) => {
    if (payload === 'sleep') sleeping = true;
    if (payload === 'wake' || payload === 'pet') sleeping = false;
    updateBuddyRate();
    draw();
  });
  const unlistenMenu = await listen('roam-menu', ({ payload }) => {
    menuOpen = Boolean(payload);
    updateBuddyRate();
  });
  const unlistenPack = await listen('desk-pack-changed', async () => {
    try {
      await applyConfig(await invoke('roam_buddy_config'));
    } catch (error) {
      console.error('Could not refresh roaming buddy pack assets:', error);
      showError(error);
    }
  });

  window.addEventListener('pagehide', () => {
    stopped = true;
    if (hiddenPollTimer !== null) clearTimeout(hiddenPollTimer);
    hiddenPollTimer = null;
    stopBuddyMotion();
    motion.dispose();
    reducedMotion.removeEventListener('change', onMotionChange);
    unlisten();
    unlistenMenu();
    unlistenPack();
    if (spriteUrl) URL.revokeObjectURL(spriteUrl);
  }, { once: true });
}

async function startHitboxWindow() {
  const menu = document.querySelector('#roamContextMenu');
  const surface = document.querySelector('#roamSurface');
  const motion = createMotionEngine({ documentRef: document });
  let pointerStart = null;
  let moved = false;
  let clickTimer = 0;
  let menuOpen = false;
  let movePending = false;
  let pendingOffset = null;
  let cancelPendingFrame = null;

  const closeMenu = async () => {
    if (!menuOpen) return;
    menuOpen = false;
    menu.hidden = true;
    surface.classList.remove('menu-open');
    try {
      await invoke('set_roam_context_menu', { open: false });
    } catch (error) {
      showError(error);
    }
  };

  const openMenu = async () => {
    try {
      await invoke('set_roam_context_menu', { open: true });
      menuOpen = true;
      menu.hidden = false;
      surface.classList.add('menu-open');
    } catch (error) {
      showError(error);
    }
  };

  const callAction = async (action) => {
    try {
      await invoke('roam_action', { action });
      if (action !== 'hide') await closeMenu();
      else {
        menu.hidden = true;
        surface.classList.remove('menu-open');
      }
    } catch (error) {
      showError(error);
    }
  };

  menu.querySelectorAll('[data-roam-action]').forEach((button) => {
    button.addEventListener('click', () => void callAction(button.dataset.roamAction));
  });

  surface.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (!menuOpen) void openMenu();
  });
  document.addEventListener('pointerdown', (event) => {
    if (menuOpen && !menu.contains(event.target)) void closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') void closeMenu();
  });

  surface.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || menu.contains(event.target)) return;
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    moved = false;
    surface.setPointerCapture(event.pointerId);
  });
  surface.addEventListener('pointermove', (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    pendingOffset = { offsetX: Math.round(event.clientX), offsetY: Math.round(event.clientY) };
    if (cancelPendingFrame) return;
    cancelPendingFrame = motion.scheduleFrame(async () => {
      cancelPendingFrame = null;
      if (!pendingOffset) return;
      const offset = pendingOffset;
      pendingOffset = null;
      try {
        await invoke('move_roam_buddy_to_cursor', offset);
      } catch (error) {
        showError(error);
      }
    });
  });
  surface.addEventListener('pointerup', () => {
    if (!pointerStart) return;
    pointerStart = null;
    if (moved) return;
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = 0;
      void callAction('open');
    } else {
      clickTimer = window.setTimeout(() => {
        clickTimer = 0;
        void callAction('pet');
      }, 260);
    }
  });

  window.addEventListener('pagehide', () => {
    if (clickTimer) clearTimeout(clickTimer);
    cancelPendingFrame?.();
    motion.dispose();
  }, { once: true });
}

export async function startRoamWindow(label = LABEL) {
  addStyles();
  document.querySelector('.wrap')?.setAttribute('hidden', '');
  document.querySelector('#toast')?.setAttribute('hidden', '');
  document.querySelector('#roamSurface')?.removeAttribute('aria-hidden');
  try {
    if (label === 'roam') await startBuddyWindow();
    else await startHitboxWindow();
  } catch (error) {
    console.error('Could not start desktop roaming:', error);
    showError(error);
  }
}
