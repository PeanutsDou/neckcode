import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { getConfig, saveConfig } from '../config';

let launcherWindow: BrowserWindow | null = null;
let savePositionTimer: ReturnType<typeof setTimeout> | null = null;

function getLauncherUrl(): { devUrl: string; filePath: string } {
  return {
    devUrl: 'http://localhost:5175/quick-launcher.html',
    filePath: path.join(__dirname, '../../renderer/quick-launcher.html'),
  };
}

async function loadLauncherRenderer(win: BrowserWindow): Promise<void> {
  const { devUrl, filePath } = getLauncherUrl();
  const launchedForDevServer = process.env.npm_lifecycle_event === 'dev:main';
  if (!process.env.NODE_ENV && !win.isDestroyed() && launchedForDevServer) {
    await win.loadURL(devUrl);
    return;
  }
  if (!win.isDestroyed() && launchedForDevServer) {
    await win.loadURL(devUrl);
    return;
  }
  await win.loadFile(filePath);
}

function centerOnCursorDisplay(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const bounds = display.workArea;
  const size = win.getBounds();
  const x = Math.round(bounds.x + (bounds.width - size.width) / 2);
  const y = Math.round(bounds.y + (bounds.height - size.height) / 2);
  win.setPosition(x, y, false);
}

function isPointVisible(x: number, y: number): boolean {
  return screen.getAllDisplays().some(display => {
    const area = display.workArea;
    return x >= area.x && y >= area.y && x < area.x + area.width && y < area.y + area.height;
  });
}

function placeLauncher(win: BrowserWindow): void {
  const saved = getConfig().quickLauncher?.position;
  if (saved && isPointVisible(saved.x, saved.y)) {
    win.setPosition(saved.x, saved.y, false);
    return;
  }
  centerOnCursorDisplay(win);
}

function scheduleSavePosition(win: BrowserWindow): void {
  if (savePositionTimer) clearTimeout(savePositionTimer);
  savePositionTimer = setTimeout(() => {
    savePositionTimer = null;
    if (win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    const cfg = getConfig();
    cfg.quickLauncher = {
      ...(cfg.quickLauncher || {
        enabled: true,
        triggerWindowMs: 400,
        inputAutoHideMs: 5000,
        panelAutoHideMs: 10000,
        mode: 'chat' as const,
      }),
      position: { x, y },
    };
    saveConfig().catch(() => {});
  }, 250);
}

export function createQuickLauncherWindow(): BrowserWindow {
  if (launcherWindow && !launcherWindow.isDestroyed()) return launcherWindow;

  launcherWindow = new BrowserWindow({
    width: 480,
    height: 44,
    minWidth: 480,
    minHeight: 44,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  launcherWindow.setAlwaysOnTop(true, 'floating');
  launcherWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });
  launcherWindow.on('moved', () => scheduleSavePosition(launcherWindow!));

  void loadLauncherRenderer(launcherWindow).catch(err => {
    console.error('[QuickLauncher] failed to load renderer:', err);
  });

  return launcherWindow;
}

export function getQuickLauncherWindow(): BrowserWindow | null {
  return launcherWindow && !launcherWindow.isDestroyed() ? launcherWindow : null;
}

export function showQuickLauncher(): void {
  const win = createQuickLauncherWindow();
  if (!win.isVisible()) placeLauncher(win);
  win.show();
  win.focus();
  setTimeout(() => {
    if (!win.isDestroyed()) {
      win.webContents.send('quick-launcher:shown');
      // 推送当前主题
      const cfg = getConfig();
      win.webContents.executeJavaScript(`
        document.documentElement.setAttribute('data-theme', '${cfg.theme || 'light'}');
        document.documentElement.setAttribute('data-light-scheme', '${cfg.lightScheme || 'default'}');
      `).catch(() => {});
    }
  }, 20);
}

export function hideQuickLauncher(): void {
  const win = getQuickLauncherWindow();
  if (!win) return;
  win.webContents.send('quick-launcher:hidden');
  win.hide();
}

export function toggleQuickLauncher(): void {
  const win = createQuickLauncherWindow();
  if (win.isVisible()) {
    hideQuickLauncher();
  } else {
    showQuickLauncher();
  }
}

export function setQuickLauncherMode(mode: 'chat' | 'find'): void {
  const cfg = getConfig();
  cfg.quickLauncher = {
    ...(cfg.quickLauncher || {
      enabled: true,
      triggerWindowMs: 400,
      inputAutoHideMs: 5000,
      panelAutoHideMs: 10000,
      mode: 'chat' as const,
    }),
    mode,
  };
  saveConfig().catch(() => {});
}

export function setQuickLauncherExpanded(expanded: boolean): void {
  const win = getQuickLauncherWindow();
  if (!win) return;
  const bounds = win.getBounds();
  const nextWidth = expanded ? 540 : 480;
  const nextHeight = expanded ? 380 : 44;
  win.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: nextWidth,
    height: nextHeight,
  }, true);
}

export function resizeQuickLauncher(height: number): void {
  const win = getQuickLauncherWindow();
  if (!win) return;
  if (win.isDestroyed()) return;
  const bounds = win.getBounds();
  const h = Math.max(44, Math.min(600, Math.round(height)));
  win.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: 480,
    height: h,
  }, true);
}

export function getQuickLauncherMode(): 'chat' | 'find' {
  return getConfig().quickLauncher?.mode || 'chat';
}

export function getQuickLauncherState(): {
  mode: 'chat' | 'find';
  inputAutoHideMs: number;
  panelAutoHideMs: number;
} {
  const cfg = getConfig().quickLauncher;
  return {
    mode: cfg?.mode || 'chat',
    inputAutoHideMs: cfg?.inputAutoHideMs || 5000,
    panelAutoHideMs: cfg?.panelAutoHideMs || 10000,
  };
}

export function destroyQuickLauncherWindow(): void {
  const win = getQuickLauncherWindow();
  if (!win) return;
  win.destroy();
  launcherWindow = null;
}
