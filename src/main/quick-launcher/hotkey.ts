import { getConfig } from '../config';

type UiohookEvent = {
  keycode?: number;
};

type UiohookModule = {
  uIOhook: {
    on(event: 'keydown', listener: (event: UiohookEvent) => void): void;
    off(event: 'keydown', listener: (event: UiohookEvent) => void): void;
    start(): void;
    stop(): void;
  };
  UiohookKey: {
    Ctrl: number;
    CtrlRight: number;
  };
};

let hookModule: UiohookModule | null = null;
let listener: ((event: UiohookEvent) => void) | null = null;
let lastCtrlDownAt = 0;
let lastTriggeredAt = 0;
let running = false;

function isCtrlKey(keycode: number | undefined): boolean {
  if (!hookModule || typeof keycode !== 'number') return false;
  return keycode === hookModule.UiohookKey.Ctrl || keycode === hookModule.UiohookKey.CtrlRight;
}

export function startQuickLauncherHotkey(onTrigger: () => void): void {
  if (running) return;

  hookModule = require('uiohook-napi') as UiohookModule;
  listener = (event) => {
    if (!isCtrlKey(event.keycode)) return;
    const cfg = getConfig().quickLauncher;
    if (cfg?.enabled === false) return;
    const now = Date.now();
    const triggerWindowMs = cfg?.triggerWindowMs || 500;
    const withinDoubleTap = now - lastCtrlDownAt <= triggerWindowMs;
    const outsideTriggerCooldown = now - lastTriggeredAt > 300;
    lastCtrlDownAt = now;
    if (withinDoubleTap && outsideTriggerCooldown) {
      lastTriggeredAt = now;
      onTrigger();
    }
  };

  hookModule.uIOhook.on('keydown', listener);
  hookModule.uIOhook.start();
  running = true;
  console.info('[QuickLauncher] global Ctrl double-tap listener started');
}

export function stopQuickLauncherHotkey(): void {
  if (hookModule && listener) {
    hookModule.uIOhook.off('keydown', listener);
  }
  if (running) {
    hookModule?.uIOhook.stop();
  }
  hookModule = null;
  listener = null;
  lastCtrlDownAt = 0;
  lastTriggeredAt = 0;
  running = false;
}
