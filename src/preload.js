'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  onLog: (cb) => ipcRenderer.on('setup-log', (_e, msg) => cb(msg)),
  onStatus: (cb) => ipcRenderer.on('setup-status', (_e, msg) => cb(msg)),
  onUpdateEvent: (cb) => ipcRenderer.on('update-event', (_e, payload) => cb(payload)),
  appVersion: () => ipcRenderer.invoke('app-version'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),
  manualUpdate: () => ipcRenderer.invoke('manual-update'),
  openDataDir: () => ipcRenderer.invoke('open-data-dir'),
})
