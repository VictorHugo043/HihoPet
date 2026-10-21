import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray, dialog, type MenuItemConstructorOptions } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MenuAction, PointerSample, Settings } from './bridge.js';

const directory = dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let settings: Settings = { muted: false, scale: 1.5 };
let sleeping = false;
let dragging = false;
let opaque = false;
let dragOrigin = { x: 0, y: 0 };
let dragPointer = { x: 0, y: 0 };
let poll: ReturnType<typeof setInterval> | undefined;
let preferencesPath: string;
let lastPointer = { x: NaN, y: NaN };
let previousSample = { x: 0, y: 0, time: 0 };
const scales = [1.1, 1.5, 1.9];

function size(scale: number): { width: number; height: number } {
  return { width: Math.round(192 * scale + 90), height: Math.round(208 * scale + 85) };
}

function save(): void {
  if (!window || window.isDestroyed()) return;
  const { x, y } = window.getBounds();
  writeFileSync(preferencesPath, JSON.stringify({ ...settings, x, y }));
}

function keepOnScreen(): void {
  if (!window) return;
  const bounds = window.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width));
  const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height));
  window.setPosition(x, y);
  lastPointer = { x: NaN, y: NaN };
}

function send(action: MenuAction): void { window?.webContents.send('hiho:action', action); }

function updateHit(): void { window?.setIgnoreMouseEvents(!opaque && !dragging, { forward: true }); }

function setScale(scale: number): void {
  if (!window || !scales.includes(scale)) return;
  const bounds = window.getBounds();
  const next = size(scale);
  settings.scale = scale;
  window.setBounds({ x: Math.round(bounds.x + (bounds.width - next.width) / 2),
    y: Math.round(bounds.y + bounds.height - next.height), ...next });
  keepOnScreen();
  save();
  send({ type: 'settings', settings });
}

function menu(): Menu {
  const items: MenuItemConstructorOptions[] = [
    { label: 'Hiho', enabled: false },
    { type: 'separator' },
    { label: '跳支舞', click: () => send({ type: 'dance' }) },
    { label: sleeping ? '轻轻叫醒' : '睡个小觉', click: () => send({ type: 'sleep' }) },
    { label: '安静模式', type: 'checkbox', checked: settings.muted, click: item => {
      settings.muted = item.checked;
      save();
      send({ type: 'settings', settings });
    } },
    { label: '大小', submenu: ['小小只', '刚刚好', '大一点'].map((label, index) => ({
      label, type: 'radio' as const, checked: settings.scale === scales[index], click: () => setScale(scales[index])
    })) },
    { type: 'separator' },
    { label: '退出 Hiho', click: () => app.quit() }
  ];
  return Menu.buildFromTemplate(items);
}

function startPointerPolling(): void {
  previousSample = { ...screen.getCursorScreenPoint(), time: performance.now() / 1000 };
  poll = setInterval(() => {
    if (!window || window.isDestroyed()) return;
    const point = screen.getCursorScreenPoint();
    const time = performance.now() / 1000;
    const dt = Math.max(1 / 240, time - previousSample.time);
    const moved = point.x !== lastPointer.x || point.y !== lastPointer.y;
    if (dragging) {
      window.setPosition(Math.round(dragOrigin.x + point.x - dragPointer.x), Math.round(dragOrigin.y + point.y - dragPointer.y));
    }
    // Motion is sampled globally even when the transparent window passes mouse clicks through.
    if (moved || dragging) {
      const bounds = window.getBounds();
      const sample: PointerSample = { ...point, localX: point.x - bounds.x, localY: point.y - bounds.y,
        vx: (point.x - previousSample.x) / dt, vy: (point.y - previousSample.y) / dt, moved };
      window.webContents.send('hiho:pointer', sample);
    }
    lastPointer = point;
    previousSample = { ...point, time };
  }, 1000 / 60);
}

function finishDrag(): void {
  dragging = false;
  keepOnScreen();
  updateHit();
  save();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => window?.showInactive());
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    preferencesPath = join(app.getPath('userData'), 'preferences.json');
    let saved: { x?: number; y?: number } = {};
    try {
      const value = JSON.parse(readFileSync(preferencesPath, 'utf8'));
      settings = { muted: value.muted === true, scale: scales.includes(value.scale) ? value.scale : 1.5 };
      if (Number.isFinite(value.x) && Number.isFinite(value.y)) saved = { x: value.x, y: value.y };
    } catch { /* Missing or invalid preferences use the visible default position. */ }
    const dimensions = size(settings.scale);
    const area = screen.getPrimaryDisplay().workArea;
    window = new BrowserWindow({ ...dimensions,
      x: Math.round(saved.x ?? area.x + area.width - dimensions.width - 24),
      y: Math.round(saved.y ?? area.y + area.height - dimensions.height - 12),
      title: 'Hiho', frame: false, transparent: true, backgroundColor: '#00000000',
      show: false, hasShadow: false, resizable: false, movable: false, focusable: false,
      alwaysOnTop: true, skipTaskbar: true, minimizable: false, maximizable: false, fullscreenable: false,
      ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
      webPreferences: { preload: join(directory, 'preload.cjs'), contextIsolation: true,
        nodeIntegration: false, sandbox: true, devTools: false, backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required' }
    });
    window.setIgnoreMouseEvents(true, { forward: true });
    if (process.platform === 'darwin') {
      app.dock?.hide();
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    }
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.once('ready-to-show', () => { keepOnScreen(); window?.showInactive(); });
    window.loadFile(join(directory, 'index.html'));
    const icon = nativeImage.createFromPath(join(directory, 'assets', 'tray.png'));
    tray = new Tray(icon);
    tray.setToolTip('Hiho 桌宠');
    tray.on('click', () => tray?.popUpContextMenu(menu()));
    tray.on('right-click', () => tray?.popUpContextMenu(menu()));
    screen.on('display-removed', () => { keepOnScreen(); save(); });
    screen.on('display-metrics-changed', () => { keepOnScreen(); save(); });
    startPointerPolling();
  }).catch(() => { dialog.showErrorBox('Hiho 无法启动', '请重新解压完整的 Hiho 应用后再打开。'); app.quit(); });

  ipcMain.handle('hiho:ready', event => {
    if (event.sender !== window?.webContents) throw new Error('Unknown window');
    lastPointer = { x: NaN, y: NaN };
    return settings;
  });
  ipcMain.on('hiho:hit', (event, value) => {
    if (event.sender !== window?.webContents || typeof value !== 'boolean' || opaque === value) return;
    opaque = value;
    updateHit();
  });
  ipcMain.on('hiho:drag-prepare', event => {
    if (event.sender !== window?.webContents || !window) return;
    dragPointer = screen.getCursorScreenPoint();
    const bounds = window.getBounds();
    dragOrigin = { x: bounds.x, y: bounds.y };
  });
  ipcMain.on('hiho:drag-start', event => {
    if (event.sender !== window?.webContents) return;
    dragging = true;
    updateHit();
  });
  ipcMain.on('hiho:drag-end', event => { if (event.sender === window?.webContents) finishDrag(); });
  ipcMain.on('hiho:menu', event => { if (event.sender === window?.webContents && window) menu().popup({ window }); });
  ipcMain.on('hiho:mood', (event, value) => {
    if (event.sender === window?.webContents && typeof value === 'boolean') sleeping = value;
  });
  ipcMain.on('hiho:fatal', event => {
    if (event.sender !== window?.webContents) return;
    dialog.showErrorBox('Hiho 的资源不完整', '请重新解压完整的 Hiho 应用后再打开。');
    app.quit();
  });
  app.on('before-quit', () => { if (poll) clearInterval(poll); save(); });
  app.on('window-all-closed', () => app.quit());
}
