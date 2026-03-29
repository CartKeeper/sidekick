const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sidekick', {
  platform: process.platform,

  // Dock controls
  togglePanel: () => ipcRenderer.send('toggle-panel'),
  switchToDocked: () => ipcRenderer.send('switch-to-docked'),
  switchToDetached: () => ipcRenderer.send('switch-to-detached'),
  getDockState: () => ipcRenderer.sendSync('get-dock-state'),

  // Auto-lock
  reportActivity: () => ipcRenderer.send('user-activity'),

  // Listen for state changes from main process
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
