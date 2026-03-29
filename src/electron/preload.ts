import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('sidekick', {
  platform: process.platform,
});
