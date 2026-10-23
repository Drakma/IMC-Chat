'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('imcWindow', { overlay: (color, symbolColor) => ipcRenderer.send('overlay', { color: String(color), symbolColor: String(symbolColor) }) });
