'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('imcWindow', { watch: (login, opt) => ipcRenderer.invoke('player:watch', login, opt), flash: () => ipcRenderer.send('flash'), overlay: (color, symbolColor) => ipcRenderer.send('overlay', { color: String(color), symbolColor: String(symbolColor) }) });
