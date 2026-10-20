const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hafiza', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (payload) => ipcRenderer.invoke('data:save', payload),
  loadSample: () => ipcRenderer.invoke('sample:load'),
  notify: (payload) => ipcRenderer.invoke('notify', payload),
  dataLocation: () => ipcRenderer.invoke('data:location'),
  openDataFolder: () => ipcRenderer.invoke('data:open-folder'),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (enabled) => ipcRenderer.invoke('autostart:set', enabled),
  info: () => ipcRenderer.invoke('app:info'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onRefresh: (handler) => ipcRenderer.on('app:refresh', () => handler()),
  onOpenTask: (handler) => ipcRenderer.on('task:open', (_, taskId) => handler(taskId))
});
