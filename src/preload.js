'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  onLog: (cb) => ipcRenderer.on('setup-log', (_e, msg) => cb(msg)),
  onStatus: (cb) => ipcRenderer.on('setup-status', (_e, msg) => cb(msg)),
  appVersion: () => ipcRenderer.invoke('app-version'),
})
