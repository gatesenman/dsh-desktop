'use strict'

const logEl = document.getElementById('log')
const statusEl = document.getElementById('status')
window.dshDesktop.onStatus((msg) => { statusEl.textContent = msg })
window.dshDesktop.onLog((msg) => {
  logEl.textContent += msg + '\n'
  logEl.scrollTop = logEl.scrollHeight
})
