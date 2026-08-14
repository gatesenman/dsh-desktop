'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  onLog: (cb) => ipcRenderer.on('setup-log', (_e, msg) => cb(msg)),
  onStatus: (cb) => ipcRenderer.on('setup-status', (_e, msg) => cb(msg)),
  onStep: (cb) => ipcRenderer.on('setup-step', (_e, step) => cb(step)),
  onProgress: (cb) => ipcRenderer.on('setup-progress', (_e, pct) => cb(pct)),
  onUpdateEvent: (cb) => ipcRenderer.on('update-event', (_e, payload) => cb(payload)),
  appVersion: () => ipcRenderer.invoke('app-version'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),
  manualUpdate: () => ipcRenderer.invoke('manual-update'),
  openDataDir: () => ipcRenderer.invoke('open-data-dir'),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  exportLogs: () => ipcRenderer.invoke('export-logs'),
  onAppLog: (cb) => ipcRenderer.on('app-log', (_e, line) => cb(line)),
})
