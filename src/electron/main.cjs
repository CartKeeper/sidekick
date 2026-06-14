// src/electron/main.cjs — Sidekick Electron main process
// Features: server spawn, window management, dock mode, system tray, auto-lock

// Strip ELECTRON_RUN_AS_NODE before importing electron — if this env var is set
// (e.g. inherited from a parent Sidekick server process), the Electron binary
// runs as plain Node and `app` will be undefined. Deleting it here and
// re-execing ensures the binary restarts in proper Electron mode.
if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE;
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow, shell, ipcMain, Tray, Menu, screen, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

// ─── Constants ───────────────────────────────────────────────────────────────

const isDev = process.argv.includes('--dev') || !app.isPackaged;
const SERVER_PORT = 9999;
const VITE_PORT = 5199;

const STRIP_WIDTH = 72;
const PANEL_WIDTH = 600;

const DEFAULT_WINDOW_WIDTH = 1100;
const DEFAULT_WINDOW_HEIGHT = 750;
const MIN_WINDOW_WIDTH = 800;
const MIN_WINDOW_HEIGHT = 600;

const AUTO_LOCK_DEFAULT_MS = 30 * 60 * 1000; // 30 minutes
const AUTO_LOCK_MIN_MS = 60_000;              // 1 minute
const AUTO_LOCK_MAX_MS = 86_400_000;          // 24 hours

const BG_COLOR = '#0a0a0f';

// ─── State ───────────────────────────────────────────────────────────────────

let mainWindow = null;
let serverProcess = null;
let tray = null;
let dockMode = false;
let panelOpen = false;
let autoLockTimer = null;
let autoLockMs = AUTO_LOCK_DEFAULT_MS; // number = ms, null = disabled

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAppRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..', '..');
}

function getLoadURL() {
  return isDev
    ? `http://localhost:${VITE_PORT}`
    : `http://localhost:${SERVER_PORT}`;
}

// ─── Preferences ─────────────────────────────────────────────────────────────

function getPrefsPath() {
  return path.join(app.getPath('userData'), 'prefs.json');
}

function readPrefs() {
  try {
    return JSON.parse(fs.readFileSync(getPrefsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writePrefs(patch) {
  const current = readPrefs();
  const next = { ...current, ...patch };
  try {
    fs.writeFileSync(getPrefsPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save prefs:', err);
  }
  return next;
}

// ─── Dock Geometry ───────────────────────────────────────────────────────────

function resolveDockDisplay() {
  const displays = screen.getAllDisplays();
  const prefs = readPrefs();

  // 1) Explicit saved display
  if (prefs.dockDisplayId != null) {
    const match = displays.find((d) => d.id === prefs.dockDisplayId);
    if (match) return match;
  }

  // 2) Display the main window is currently on (when toggling into dock mode)
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const b = mainWindow.getBounds();
      return screen.getDisplayMatching(b);
    } catch {
      // fall through
    }
  }

  // 3) Primary fallback
  return screen.getPrimaryDisplay();
}

function getDockBounds() {
  const display = resolveDockDisplay();
  const { workArea } = display;
  const prefs = readPrefs();
  const edge = prefs.dockEdge === 'left' ? 'left' : 'right';
  const w = panelOpen ? STRIP_WIDTH + PANEL_WIDTH : STRIP_WIDTH;

  return {
    x: edge === 'left' ? workArea.x : workArea.x + workArea.width - w,
    y: workArea.y,
    width: w,
    height: workArea.height,
  };
}

// ─── Server Management ───────────────────────────────────────────────────────

async function startServer() {
  // Reuse an already-running server (e.g. from `npm run dev`) if one is healthy
  // on our port. This avoids a port clash AND lets the Electron app run on top
  // of the dev stack without rebuilding better-sqlite3 for Electron's ABI.
  try {
    const res = await fetch(`http://localhost:${SERVER_PORT}/api/auth/status`);
    if (res.ok) {
      console.log(`[server] reusing existing server on ${SERVER_PORT}`);
      return;
    }
  } catch {
    // Nothing healthy on the port — fall through and spawn our own.
  }

  const appRoot = getAppRoot();
  const tsxPath = path.join(appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const serverPath = path.join(appRoot, 'src', 'server', 'index.ts');

  serverProcess = spawn(process.execPath, [tsxPath, serverPath], {
    cwd: appRoot,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: 'pipe',
  });

  serverProcess.stdout.on('data', (d) => console.log(`[server] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => console.error(`[server] ${d.toString().trim()}`));
  serverProcess.on('error', (err) => console.error('Failed to start server:', err));

  return new Promise((resolve) => {
    const poll = () => {
      fetch(`http://localhost:${SERVER_PORT}/api/auth/status`)
        .then((res) => (res.ok ? resolve() : setTimeout(poll, 300)))
        .catch(() => setTimeout(poll, 300));
    };
    setTimeout(poll, 500);
  });
}

function killServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

// ─── Window Creation ─────────────────────────────────────────────────────────

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const preload = path.join(__dirname, 'preload.cjs');

  const commonWebPrefs = {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
  };

  if (dockMode) {
    const bounds = getDockBounds();
    mainWindow = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: false,
      backgroundColor: BG_COLOR,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: true,
      roundedCorners: true,
      webPreferences: commonWebPrefs,
      show: false,
    });
  } else {
    const w = DEFAULT_WINDOW_WIDTH;
    const h = DEFAULT_WINDOW_HEIGHT;
    mainWindow = new BrowserWindow({
      x: workArea.x + Math.round((workArea.width - w) / 2),
      y: workArea.y + Math.round((workArea.height - h) / 2),
      width: w,
      height: h,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: BG_COLOR,
      webPreferences: commonWebPrefs,
      show: false,
    });
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.loadURL(getLoadURL());

  // Open external links in the OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Collapse panel when the dock window loses focus — unless the cursor is
  // still hovering over Sidekick. That way, launching VS Code or the browser
  // (which steals focus) doesn't close the panel while the user is still
  // interacting with Sidekick.
  mainWindow.on('blur', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!(dockMode && panelOpen)) return;

    try {
      const cursor = screen.getCursorScreenPoint();
      const b = mainWindow.getBounds();
      const prefs = readPrefs();
      const edge = prefs.dockEdge === 'left' ? 'left' : 'right';
      // Only the always-visible strip (on the screen-facing edge) counts as
      // "still on Sidekick". Hovering it keeps the panel open — e.g. while an
      // app you just launched steals focus. Clicking anywhere else collapses it.
      const stripX = edge === 'left' ? b.x : b.x + b.width - STRIP_WIDTH;
      const overStrip =
        cursor.x >= stripX &&
        cursor.x < stripX + STRIP_WIDTH &&
        cursor.y >= b.y &&
        cursor.y < b.y + b.height;
      if (overStrip) return; // hovering the strip — keep panel open
    } catch {
      // fall through to collapse on any cursor lookup failure
    }

    panelOpen = false;
    mainWindow.setBounds(getDockBounds(), true);
    sendDockState();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Push initial dock state once the page loads
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    sendDockState();
  });
}

// ─── Window State Helpers ────────────────────────────────────────────────────

function sendDockState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const prefs = readPrefs();
    const edge = prefs.dockEdge === 'left' ? 'left' : 'right';
    mainWindow.webContents.send('dock-state', { dockMode, panelOpen, dockEdge: edge });
  }
}

function sendLockVault() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lock-vault');
  }
}

function showAndFocusWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function showDockPanel() {
  if (!mainWindow) return;
  panelOpen = true;
  mainWindow.setBounds(getDockBounds(), true);
  sendDockState();
  showAndFocusWindow();
}

// ─── Mode Switching ──────────────────────────────────────────────────────────
// Destroy the old window and create a fresh one with the correct config.

function switchToDocked() {
  if (!mainWindow) return;
  dockMode = true;
  panelOpen = false;
  mainWindow.destroy();
  mainWindow = null;
  createWindow();
}

function switchToDetached() {
  if (!mainWindow) return;
  dockMode = false;
  panelOpen = false;
  mainWindow.destroy();
  mainWindow = null;
  createWindow();
}

function togglePanel() {
  if (!dockMode || !mainWindow) return;
  panelOpen = !panelOpen;
  mainWindow.setBounds(getDockBounds(), true);
  sendDockState();
  if (panelOpen) mainWindow.focus();
}

// ─── System Tray ─────────────────────────────────────────────────────────────

function createTray() {
  const size = 18;
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="9" cy="9" r="7" fill="#6366f1"/>
    <path d="M7 8.5L9 6L11 8.5M9 6V12" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;

  const icon = nativeImage.createFromBuffer(Buffer.from(svg));
  tray = new Tray(icon.resize({ width: size, height: size }));
  tray.setToolTip('Sidekick');

  function rebuildMenu() {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Show Sidekick',
          click: () => {
            if (!mainWindow) return;
            if (dockMode) showDockPanel();
            else showAndFocusWindow();
          },
        },
        { type: 'separator' },
        {
          label: 'Dock Mode',
          type: 'checkbox',
          checked: dockMode,
          click: () => {
            if (dockMode) switchToDetached();
            else switchToDocked();
            rebuildMenu();
          },
        },
        { type: 'separator' },
        { label: 'Lock Vault', click: sendLockVault },
        { label: 'Quit Sidekick', click: () => app.quit() },
      ])
    );
  }

  rebuildMenu();

  tray.on('click', () => {
    if (!mainWindow) return;
    if (dockMode) togglePanel();
    else showAndFocusWindow();
  });
}

// ─── Auto-Lock ───────────────────────────────────────────────────────────────

function resetAutoLock() {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
  if (autoLockMs == null) return; // disabled
  autoLockTimer = setTimeout(() => {
    sendLockVault();
    console.log('[auto-lock] Vault locked after idle timeout');
  }, autoLockMs);
}

function setAutoLockTimeout(ms) {
  if (ms == null) {
    autoLockMs = null;
  } else {
    autoLockMs = Math.max(AUTO_LOCK_MIN_MS, Math.min(ms, AUTO_LOCK_MAX_MS));
  }
  writePrefs({ autoLockMs });
  resetAutoLock();
}

function loadAutoLockFromPrefs() {
  const prefs = readPrefs();
  if (Object.prototype.hasOwnProperty.call(prefs, 'autoLockMs')) {
    const v = prefs.autoLockMs;
    if (v === null) {
      autoLockMs = null;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      autoLockMs = Math.max(AUTO_LOCK_MIN_MS, Math.min(v, AUTO_LOCK_MAX_MS));
    }
  }
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

function setupIPC() {
  ipcMain.on('toggle-panel', () => togglePanel());
  ipcMain.on('switch-to-docked', () => switchToDocked());
  ipcMain.on('switch-to-detached', () => switchToDetached());
  ipcMain.on('get-dock-state', (e) => {
    const prefs = readPrefs();
    const edge = prefs.dockEdge === 'left' ? 'left' : 'right';
    e.returnValue = { dockMode, panelOpen, dockEdge: edge };
  });

  // List available displays for the Preferences UI
  ipcMain.handle('list-displays', () => {
    const primary = screen.getPrimaryDisplay();
    const all = screen.getAllDisplays();
    // Sort visually left-to-right by horizontal bounds, then top-to-bottom
    const sorted = [...all].sort((a, b) =>
      a.bounds.x !== b.bounds.x ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y
    );
    // Locate the display the cursor is on so we can mark "where you are now"
    let cursorDisplayId = null;
    try {
      cursorDisplayId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
    } catch {}

    return sorted.map((d, idx) => {
      const position =
        sorted.length === 1
          ? ''
          : idx === 0
            ? ' — leftmost'
            : idx === sorted.length - 1
              ? ' — rightmost'
              : ` — position ${idx + 1}`;
      const flags = [];
      if (d.id === primary.id) flags.push('primary');
      if (d.id === cursorDisplayId) flags.push('cursor here');
      const flagStr = flags.length ? ` (${flags.join(', ')})` : '';

      return {
        id: d.id,
        label: `${d.workArea.width}×${d.workArea.height}${position}${flagStr}`,
        bounds: d.bounds,
        workArea: d.workArea,
        isPrimary: d.id === primary.id,
        isCursor: d.id === cursorDisplayId,
      };
    });
  });

  ipcMain.handle('get-dock-position', () => {
    const prefs = readPrefs();
    return {
      displayId: prefs.dockDisplayId ?? null,
      edge: prefs.dockEdge === 'left' ? 'left' : 'right',
    };
  });

  ipcMain.handle('set-dock-position', (_e, { displayId, edge }) => {
    const patch = {};
    if (displayId === null || typeof displayId === 'number') patch.dockDisplayId = displayId;
    if (edge === 'left' || edge === 'right') patch.dockEdge = edge;
    writePrefs(patch);
    if (dockMode && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBounds(getDockBounds(), true);
    }
    sendDockState();
    return { ok: true };
  });
  ipcMain.on('user-activity', () => resetAutoLock());
  ipcMain.on('set-auto-lock-timeout', (_e, ms) => setAutoLockTimeout(ms));
  ipcMain.handle('get-auto-lock-timeout', () => autoLockMs);
  ipcMain.on('open-external', (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch((err) => console.error('openExternal failed:', err));
    }
  });
  ipcMain.on('open-in-vscode', (_e, projectPath) => {
    if (typeof projectPath !== 'string' || !projectPath) return;
    // Try `code` on PATH; fall back to macOS `open -b com.microsoft.VSCode`
    const child = spawn('code', [projectPath], { detached: true, stdio: 'ignore' });
    child.on('error', () => {
      if (process.platform === 'darwin') {
        spawn('open', ['-b', 'com.microsoft.VSCode', projectPath], {
          detached: true,
          stdio: 'ignore',
        }).unref();
      } else {
        console.error('VS Code not found on PATH');
      }
    });
    child.unref();
  });
}

// ─── Single Instance Lock ────────────────────────────────────────────────────

// Show "Sidekick" (not "Electron") in the macOS app menu / About panel.
app.setName('Sidekick');

// In dev mode, skip the lock so dev can run alongside the installed app
const gotTheLock = isDev ? true : app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else if (!isDev) {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (dockMode) showDockPanel();
    else showAndFocusWindow();
  });
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Replace the default Electron dock icon with the Sidekick logo. Packaged
  // builds get their icon from the .icns bundle; this covers the dev run.
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = path.join(__dirname, '..', '..', 'assets', 'icon_1024.png');
    try {
      if (fs.existsSync(dockIcon)) app.dock.setIcon(dockIcon);
    } catch (e) {
      console.error('Failed to set dock icon:', e);
    }
  }

  setupIPC();
  loadAutoLockFromPrefs();
  await startServer();
  console.log('API server ready');
  createWindow();
  createTray();
  resetAutoLock();
});

app.on('window-all-closed', () => {
  // Keep tray alive — don't quit
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  killServer();
  if (autoLockTimer) clearTimeout(autoLockTimer);
});
