/**
 * Desktop Pet Window — transparent always-on-top BrowserWindow
 * rendering clawd/calico/cloudling animations driven by Agent state.
 */
import { BrowserWindow, screen, app, ipcMain } from 'electron';
import path from 'path';
import { getConfig, saveConfig } from './config';

// ── Types ─────────────────────────────────────────────────────

export type PetState =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'error'
  | 'attention'
  | 'notification'
  | 'building'
  | 'carrying'
  | 'juggling'
  | 'sleeping';

export type PetTheme = 'clawd' | 'calico' | 'cloudling';

interface ThemeDef {
  width: number;
  height: number;
  ext: string;       // 'svg' | 'apng'
  files: Record<PetState, string>;
}

const THEMES: Record<PetTheme, ThemeDef> = {
  clawd: {
    width: 200, height: 200, ext: 'svg',
    files: {
      idle: 'clawd-idle-follow.svg',
      thinking: 'clawd-working-thinking.svg',
      working: 'clawd-working-typing.svg',
      error: 'clawd-error.svg',
      attention: 'clawd-happy.svg',
      notification: 'clawd-notification.svg',
      building: 'clawd-working-building.svg',
      carrying: 'clawd-working-carrying.svg',
      juggling: 'clawd-working-juggling.svg',
      sleeping: 'clawd-sleeping.svg',
    },
  },
  calico: {
    width: 266, height: 200, ext: 'apng',
    files: {
      idle: 'calico-idle-follow.svg',
      thinking: 'calico-thinking.apng',
      working: 'calico-working-typing.apng',
      error: 'calico-error.apng',
      attention: 'calico-happy.apng',
      notification: 'calico-notification.apng',
      building: 'calico-working-building.apng',
      carrying: 'calico-working-carrying.apng',
      juggling: 'calico-working-juggling.apng',
      sleeping: 'calico-sleeping.apng',
    },
  },
  cloudling: {
    width: 264, height: 216, ext: 'svg',
    files: {
      idle: 'cloudling-idle.svg',
      thinking: 'cloudling-thinking.svg',
      working: 'cloudling-typing.svg',
      error: 'cloudling-error.svg',
      attention: 'cloudling-attention.svg',
      notification: 'cloudling-notification.svg',
      building: 'cloudling-building.svg',
      carrying: 'cloudling-carrying.svg',
      juggling: 'cloudling-juggling.svg',
      sleeping: 'cloudling-sleeping.svg',
    },
  },
};

// ── State ────────────────────────────────────────────────────
let petWindow: BrowserWindow | null = null;
let petEnabled = true;
let petState: PetState = 'idle';
let petTheme: PetTheme = 'clawd';

let minDisplayTimer: ReturnType<typeof setTimeout> | null = null;
let lastSayText = '';

// ── Window ───────────────────────────────────────────────────

function getPetHtmlPath(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'pet', 'index.html');
  return path.join(__dirname, '..', '..', 'resources', 'pet', 'index.html');
}

export function createPetWindow(): void {
  if (petWindow && !petWindow.isDestroyed()) { petWindow.show(); return; }

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const theme = THEMES[petTheme];

  petWindow = new BrowserWindow({
    width: theme.width,
    height: theme.height,
    x: sw - theme.width - 10,
    y: sh - theme.height - 10,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'pet-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  ipcMain.on('pet:move', (_event, dx: number, dy: number) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const [x, y] = petWindow.getPosition();
    petWindow.setPosition(x + Math.round(dx), y + Math.round(dy));
  });

  petWindow.loadFile(getPetHtmlPath());

  petWindow.once('ready-to-show', () => {
    if (petEnabled) { petWindow?.show(); sendPetState(petState); }
  });
  petWindow.on('closed', () => { petWindow = null; });
}

function recreatePetWindow(): void {
  let oldX = 0, oldY = 0;
  if (petWindow && !petWindow.isDestroyed()) {
    [oldX, oldY] = petWindow.getPosition();
    petWindow.close();
    petWindow = null;
  }
  createPetWindow();
  if (petWindow) petWindow.setPosition(oldX, oldY);
}

// ── Theme ─────────────────────────────────────────────────────

export function getPetTheme(): PetTheme { return petTheme; }

export function setPetTheme(theme: PetTheme): void {
  petTheme = theme;
  try {
    const cfg = getConfig();
    (cfg as any).petTheme = theme;
    saveConfig().catch(() => {});
  } catch {}
  if (petEnabled) recreatePetWindow();
}

// ── Toggle ────────────────────────────────────────────────────

export function togglePet(): void {
  petEnabled = !petEnabled;
  savePetEnabled(petEnabled);
  if (petEnabled) createPetWindow();
  else { petWindow?.close(); petWindow = null; }
}

export function isPetEnabled(): boolean { return petEnabled; }

export function setPetEnabled(enabled: boolean): void {
  petEnabled = enabled;
  savePetEnabled(enabled);
  if (enabled) createPetWindow();
  else { petWindow?.close(); petWindow = null; }
}

function savePetEnabled(enabled: boolean): void {
  try {
    const cfg = getConfig();
    (cfg as any).petEnabled = enabled;
    saveConfig().catch(() => {});
  } catch {}
}

// ── State ─────────────────────────────────────────────────────

export function setPetState(state: PetState): void {
  // Deduplicate: skip if same state
  if (state === petState) return;
  petState = state;

  if (minDisplayTimer) { clearTimeout(minDisplayTimer); minDisplayTimer = null; }
  sendPetState(state);

  // Only auto-return to idle for transient success/error states
  if (state === 'attention') {
    minDisplayTimer = setTimeout(() => {
      minDisplayTimer = null;
      if (petState === 'attention') setPetState('idle');
    }, 4000);
  } else if (state === 'error') {
    minDisplayTimer = setTimeout(() => {
      minDisplayTimer = null;
      if (petState === 'error') setPetState('idle');
    }, 5000);
  }
}

function sendPetState(state: PetState): void {
  const theme = THEMES[petTheme];
  const file = theme.files[state] || theme.files.idle;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:set-state', state, file, petTheme);
  }
}

// ── Cleanup ───────────────────────────────────────────────────

export function destroyPetWindow(): void {
  if (minDisplayTimer) { clearTimeout(minDisplayTimer); minDisplayTimer = null; }
  if (petWindow && !petWindow.isDestroyed()) petWindow.close();
  petWindow = null;
}

/** Show a short speech bubble above the pet */
export function sayPet(text: string): void {
  if (text === lastSayText) return;  // deduplicate
  lastSayText = text;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:say', text.slice(0, 80));
  }
}
