const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');

const isDev = process.argv.includes('--dev') || !app.isPackaged;
const SERVER_PORT = 3778;
const VITE_PORT = 5173;

let mainWindow = null;
let serverProcess = null;

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
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  // Start the API server
  await startServer();
  console.log('API server ready');
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
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
});
