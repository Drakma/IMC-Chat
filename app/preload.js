'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('imcWindow', { flash: () => ipcRenderer.send('flash'), overlay: (color, symbolColor) => ipcRenderer.send('overlay', { color: String(color), symbolColor: String(symbolColor) }) });
