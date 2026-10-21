import type { MenuAction, PetBridge, PointerSample, Settings } from './bridge.js';
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const bridge: PetBridge = {
  ready: () => ipcRenderer.invoke('hiho:ready') as Promise<Settings>,
  hit: opaque => ipcRenderer.send('hiho:hit', opaque),
  prepareDrag: () => ipcRenderer.send('hiho:drag-prepare'),
  startDrag: () => ipcRenderer.send('hiho:drag-start'),
  endDrag: () => ipcRenderer.send('hiho:drag-end'),
  contextMenu: () => ipcRenderer.send('hiho:menu'),
  mood: sleeping => ipcRenderer.send('hiho:mood', sleeping),
  fatal: () => ipcRenderer.send('hiho:fatal'),
  onPointer: callback => ipcRenderer.on('hiho:pointer', (_event, sample: PointerSample) => callback(sample)),
  onAction: callback => ipcRenderer.on('hiho:action', (_event, action: MenuAction) => callback(action))
};
contextBridge.exposeInMainWorld('hiho', bridge);
