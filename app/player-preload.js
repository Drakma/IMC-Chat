'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('imcPlayer', {
  cmd: (c) => ipcRenderer.invoke('player:cmd', c),
  on: (fn) => ipcRenderer.on('player:event', (e, d) => fn(d)),
});
