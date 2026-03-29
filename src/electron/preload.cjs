const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('sidekick', {
  platform: process.platform,
});
