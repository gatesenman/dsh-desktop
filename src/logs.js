'use strict'

const logEl = document.getElementById('log')
const statusEl = document.getElementById('status')

function atBottom() {
  return logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40
}

function append(line) {
  const stick = atBottom()
  logEl.textContent += line + '\n'
  if (stick) logEl.scrollTop = logEl.scrollHeight
}

window.dshDesktop.getLogs().then((lines) => {
  logEl.textContent = lines.join('\n') + (lines.length ? '\n' : '')
  logEl.scrollTop = logEl.scrollHeight
})

window.dshDesktop.onAppLog(append)

document.getElementById('copyBtn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(logEl.textContent)
  statusEl.textContent = '已复制到剪贴板'
  setTimeout(() => (statusEl.textContent = ''), 2000)
})

document.getElementById('exportBtn').addEventListener('click', async () => {
  const result = await window.dshDesktop.exportLogs()
  if (result.status === 'saved') statusEl.textContent = `已导出：${result.filePath}`
})
