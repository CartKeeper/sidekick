const { app, BrowserWindow, shell, ipcMain, Tray, Menu, screen, nativeImage } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');

const isDev = process.argv.includes('--dev') || !app.isPackaged;
const SERVER_PORT = 3778;
const VITE_PORT = 5173;

let mainWindow = null;
let serverProcess = null;
let tray = null;
let dockMode = false; // Start in normal window mode (dock mode available via tray/menu)
let panelOpen = false;
let autoLockTimer = null;
const AUTO_LOCK_MS = 30 * 60 * 1000; // 30 minutes

// --- Dock geometry ---
const STRIP_WIDTH = 52;
const PANEL_WIDTH = 408;
const TOTAL_DOCKED_WIDTH = STRIP_WIDTH + PANEL_WIDTH;

function getDockBounds() {
  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;
  const { x: workX, y: workY } = display.workArea;

  if (panelOpen) {
    return {
      x: workX + screenW - TOTAL_DOCKED_WIDTH,
      y: workY,
      width: TOTAL_DOCKED_WIDTH,
      height: screenH,
    };
  }
  return {
    x: workX + screenW - STRIP_WIDTH,
    y: workY,
    width: STRIP_WIDTH,
    height: screenH,
  };
}

function startServer() {
  const tsxPath = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'tsx');
  const serverPath = path.join(__dirname, '..', 'server', 'index.ts');

  serverProcess = spawn(tsxPath, [serverPath], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, PORT: String(SERVER_PORT) },
    stdio: 'pipe',
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[server] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[server] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });

  // Wait for server to be ready
  return new Promise((resolve) => {
    const check = () => {
      fetch(`http://localhost:${SERVER_PORT}/api/auth/status`)
        .then((res) => {
          if (res.ok) resolve();
          else setTimeout(check, 300);
        })
        .catch(() => setTimeout(check, 300));
    };
    setTimeout(check, 500);
  });
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;
  const { x: workX, y: workY } = display.workArea;

  if (dockMode) {
    const bounds = getDockBounds();
    mainWindow = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: false,
      backgroundColor: '#0a0a0f',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: true,
      roundedCorners: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      show: false,
    });
  } else {
    const w = 1100;
    const h = 750;
    mainWindow = new BrowserWindow({
      x: workX + Math.round((screenW - w) / 2),
      y: workY + Math.round((screenH - h) / 2),
      width: w,
      height: h,
      minWidth: 800,
      minHeight: 600,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: '#0a0a0f',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      show: false,
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${VITE_PORT}`);
  } else {
    mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Blur = close panel in dock mode
  mainWindow.on('blur', () => {
    if (dockMode && panelOpen) {
      panelOpen = false;
      const bounds = getDockBounds();
      mainWindow.setBounds(bounds, true);
      mainWindow.webContents.send('dock-state', { dockMode, panelOpen });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Send initial state once the page loads
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('dock-state', { dockMode, panelOpen });
  });
}

function switchToDocked() {
  if (!mainWindow) return;
  dockMode = true;
  panelOpen = false;
  const bounds = getDockBounds();
  mainWindow.setAlwaysOnTop(true);
  mainWindow.setResizable(false);
  mainWindow.setSkipTaskbar(true);
  mainWindow.setBounds(bounds, true);
  mainWindow.webContents.send('dock-state', { dockMode, panelOpen });
}

function switchToDetached() {
  if (!mainWindow) return;
  dockMode = false;
  panelOpen = false;
  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;
  const { x: workX, y: workY } = display.workArea;
  const w = 1100;
  const h = 750;

  mainWindow.setAlwaysOnTop(false);
  mainWindow.setResizable(true);
  mainWindow.setSkipTaskbar(false);
  mainWindow.setBounds({
    x: workX + Math.round((screenW - w) / 2),
    y: workY + Math.round((screenH - h) / 2),
    width: w,
    height: h,
  }, true);
  mainWindow.webContents.send('dock-state', { dockMode, panelOpen });
}

function togglePanel() {
  if (!dockMode || !mainWindow) return;
  panelOpen = !panelOpen;
  const bounds = getDockBounds();
  mainWindow.setBounds(bounds, true);
  mainWindow.webContents.send('dock-state', { dockMode, panelOpen });
  if (panelOpen) {
    mainWindow.focus();
  }
}

function createTray() {
  // Create a small SVG tray icon
  const iconSize = 18;
  const svgStr = `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="9" cy="9" r="7" fill="#6366f1"/>
    <path d="M7 8.5L9 6L11 8.5M9 6V12" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;
  const icon = nativeImage.createFromBuffer(Buffer.from(svgStr));

  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip('Sidekick');

  const updateMenu = () => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Show Sidekick',
        click: () => {
          if (mainWindow) {
            if (dockMode) {
              panelOpen = true;
              const bounds = getDockBounds();
              mainWindow.setBounds(bounds, true);
              mainWindow.webContents.send('dock-state', { dockMode, panelOpen });
              mainWindow.show();
              mainWindow.focus();
            } else {
              mainWindow.show();
              mainWindow.focus();
            }
          }
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
          updateMenu();
        },
      },
      { type: 'separator' },
      {
        label: 'Lock Vault',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('lock-vault');
          }
        },
      },
      {
        label: 'Quit Sidekick',
        click: () => app.quit(),
      },
    ]);
    tray.setContextMenu(menu);
  };

  updateMenu();
  tray.on('click', () => {
    if (mainWindow) {
      if (dockMode) togglePanel();
      else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// --- Auto-lock ---
function resetAutoLock() {
  if (autoLockTimer) clearTimeout(autoLockTimer);
  autoLockTimer = setTimeout(() => {
    if (mainWindow) {
      mainWindow.webContents.send('lock-vault');
    }
    console.log('[auto-lock] Vault locked after idle timeout');
  }, AUTO_LOCK_MS);
}

// --- IPC Handlers ---
function setupIPC() {
  ipcMain.on('toggle-panel', () => togglePanel());
  ipcMain.on('switch-to-docked', () => switchToDocked());
  ipcMain.on('switch-to-detached', () => switchToDetached());
  ipcMain.on('get-dock-state', (event) => {
    event.returnValue = { dockMode, panelOpen };
  });
  ipcMain.on('user-activity', () => resetAutoLock());
  ipcMain.on('set-auto-lock-timeout', (_event, ms) => {
    // Allow configurable timeout (min 1 min, max 24 hours)
    const clamped = Math.max(60000, Math.min(ms, 86400000));
    if (autoLockTimer) clearTimeout(autoLockTimer);
    autoLockTimer = setTimeout(() => {
      if (mainWindow) {
        mainWindow.webContents.send('lock-vault');
      }
    }, clamped);
  });
}

// --- Single instance ---
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (dockMode) {
        panelOpen = true;
        const bounds = getDockBounds();
        mainWindow.setBounds(bounds, true);
        mainWindow.webContents.send('dock-state', { dockMode, panelOpen });
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  setupIPC();
  await startServer();
  console.log('API server ready');
  createWindow();
  createTray();
  resetAutoLock();
});

app.on('window-all-closed', () => {
  // Don't quit — keep tray alive
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (autoLockTimer) clearTimeout(autoLockTimer);
});
