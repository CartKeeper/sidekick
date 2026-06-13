// src/electron/preload.cjs — Sidekick preload bridge
// Exposes window.sidekick to the renderer process

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sidekick', {
  platform: process.platform,

  // Dock controls
  togglePanel: () => ipcRenderer.send('toggle-panel'),
  switchToDocked: () => ipcRenderer.send('switch-to-docked'),
  switchToDetached: () => ipcRenderer.send('switch-to-detached'),
  getDockState: () => ipcRenderer.sendSync('get-dock-state'),

  // Dock position preferences
  listDisplays: () => ipcRenderer.invoke('list-displays'),
  getDockPosition: () => ipcRenderer.invoke('get-dock-position'),
  setDockPosition: (pos) => ipcRenderer.invoke('set-dock-position', pos),

  // Auto-lock
  reportActivity: () => ipcRenderer.send('user-activity'),
  setAutoLockTimeout: (ms) => ipcRenderer.send('set-auto-lock-timeout', ms),
  getAutoLockTimeout: () => ipcRenderer.invoke('get-auto-lock-timeout'),

  // Launch actions
  openExternal: (url) => ipcRenderer.send('open-external', url),
  openInVscode: (path) => ipcRenderer.send('open-in-vscode', path),

  // Events from main process
  onDockState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('dock-state', handler);
    return () => ipcRenderer.removeListener('dock-state', handler);
  },

  onLockVault: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('lock-vault', handler);
    return () => ipcRenderer.removeListener('lock-vault', handler);
  },
});
