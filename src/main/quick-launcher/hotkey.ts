import { getConfig } from '../config';

type UiohookEvent = {
  keycode?: number;
};

type UiohookModule = {
  uIOhook: {
    on(event: 'keydown' | 'keyup', listener: (event: UiohookEvent) => void): void;
    off(event: 'keydown' | 'keyup', listener: (event: UiohookEvent) => void): void;
    start(): void;
    stop(): void;
  };
  UiohookKey: {
    Ctrl: number;
    CtrlRight: number;
  };
};

let hookModule: UiohookModule | null = null;
let keydownListener: ((event: UiohookEvent) => void) | null = null;
let keyupListener: ((event: UiohookEvent) => void) | null = null;
let lastCtrlDownAt = 0;
let lastTriggeredAt = 0;
let ctrlIsDown = false;
let running = false;

function isCtrlKey(keycode: number | undefined): boolean {
  if (!hookModule || typeof keycode !== 'number') return false;
  return keycode === hookModule.UiohookKey.Ctrl || keycode === hookModule.UiohookKey.CtrlRight;
}

export function startQuickLauncherHotkey(onTrigger: () => void): void {
  if (running) return;

  hookModule = require('uiohook-napi') as UiohookModule;
  keydownListener = (event) => {
    if (!isCtrlKey(event.keycode)) return;
    if (ctrlIsDown) return;
    ctrlIsDown = true;
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
  keyupListener = (event) => {
    if (!isCtrlKey(event.keycode)) return;
    ctrlIsDown = false;
  };

  hookModule.uIOhook.on('keydown', keydownListener);
  hookModule.uIOhook.on('keyup', keyupListener);
  hookModule.uIOhook.start();
  running = true;
  console.info('[QuickLauncher] global Ctrl double-tap listener started');
}

export function stopQuickLauncherHotkey(): void {
  if (hookModule && keydownListener) {
    hookModule.uIOhook.off('keydown', keydownListener);
  }
  if (hookModule && keyupListener) {
    hookModule.uIOhook.off('keyup', keyupListener);
  }
  if (running) {
    hookModule?.uIOhook.stop();
  }
  hookModule = null;
  keydownListener = null;
  keyupListener = null;
  lastCtrlDownAt = 0;
  lastTriggeredAt = 0;
  ctrlIsDown = false;
  running = false;
}
