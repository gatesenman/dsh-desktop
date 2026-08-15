'use strict'

const $ = (id) => document.getElementById(id)
const keys = ['openAtLogin', 'closeToTray', 'autoUpdateDsh']

async function load() {
  const s = await window.dshDesktop.getSettings()
  for (const k of keys) $(k).checked = !!s[k]
  $('meta').textContent = `dsh 版本：${s.dshVersion || '未安装'}\n应用版本：${s.appVersion}\n数据目录：${s.dataDir}`
  $('rollbackBtn').disabled = !s.dshRollbackVersion
  $('rollbackBtn').textContent = s.dshRollbackVersion ? `回滚 dsh 到 ${s.dshRollbackVersion}` : '回滚 dsh（无可用版本）'
}
load()

for (const k of keys) {
  $(k).addEventListener('change', () => {
    window.dshDesktop.setSettings({ [k]: $(k).checked })
  })
}

$('dataDirBtn').addEventListener('click', () => window.dshDesktop.openDataDir())

$('logsBtn').addEventListener('click', () => window.dshDesktop.openLogs())

$('restartBtn').addEventListener('click', async () => {
  $('restartBtn').disabled = true
  setUpdateStatus('正在重启服务...')
  const result = await window.dshDesktop.restartService()
  if (result.status === 'restarted') setUpdateStatus('服务已重启', 'ok')
  else if (result.status === 'busy') setUpdateStatus('已有任务在进行中')
  else setUpdateStatus(`重启失败：${result.message}`, 'err')
  $('restartBtn').disabled = false
})

function setUpdateStatus(text, kind) {
  const el = $('updateStatus')
  el.textContent = text
  el.className = kind || ''
}

function setBusy(busy) {
  $('updateBtn').disabled = busy
  $('updateBarWrap').className = busy ? 'bar-wrap show' : 'bar-wrap'
}

$('updateBtn').addEventListener('click', async () => {
  setBusy(true)
  setUpdateStatus('检查更新中...')
  const result = await window.dshDesktop.manualUpdate()
  if (result.status === 'latest') setUpdateStatus(`已是最新版本（${result.version}）`, 'ok')
  else if (result.status === 'updated') setUpdateStatus(`已更新到 ${result.version}，服务已重启`, 'ok')
  else if (result.status === 'busy') setUpdateStatus('已有更新任务在进行中')
  else setUpdateStatus(`更新失败：${result.message}`, 'err')
  setBusy(false)
  load()
})

function setMaintStatus(text, kind) {
  const el = $('maintStatus')
  el.textContent = text
  el.className = kind || ''
}

$('doctorBtn').addEventListener('click', () => window.dshDesktop.runDoctor())

$('backupBtn').addEventListener('click', async () => {
  $('backupBtn').disabled = true
  setMaintStatus('正在备份...')
  const result = await window.dshDesktop.backupData()
  if (result.status === 'saved') setMaintStatus(`备份完成：${result.filePath}`, 'ok')
  else if (result.status === 'canceled') setMaintStatus('')
  else setMaintStatus(`备份失败：${result.message}`, 'err')
  $('backupBtn').disabled = false
})

$('restoreBtn').addEventListener('click', async () => {
  $('restoreBtn').disabled = true
  setMaintStatus('正在恢复...')
  const result = await window.dshDesktop.restoreData()
  if (result.status === 'restarted') setMaintStatus('恢复完成，服务已重启', 'ok')
  else if (result.status === 'canceled') setMaintStatus('')
  else setMaintStatus(`恢复失败：${result.message || ''}`, 'err')
  $('restoreBtn').disabled = false
})

$('rollbackBtn').addEventListener('click', async () => {
  $('rollbackBtn').disabled = true
  setMaintStatus('正在回滚 dsh...')
  const result = await window.dshDesktop.rollbackDsh()
  if (result.status === 'restarted') setMaintStatus('回滚完成，服务已重启', 'ok')
  else if (result.status === 'none') setMaintStatus('没有可回滚的版本')
  else if (result.status === 'busy') setMaintStatus('已有任务在进行中')
  else setMaintStatus(`回滚失败：${result.message || ''}`, 'err')
  load()
})

window.dshDesktop.onUpdateEvent((e) => {
  const map = {
    checking: ['检查更新中...', ''],
    installing: [`发现新版本 ${e.version}，后台安装中...`, ''],
    restarting: ['安装完成，正在重启服务...', ''],
    done: [`已更新到 ${e.version}`, 'ok'],
    latest: [`已是最新版本（${e.version}）`, 'ok'],
    error: [`更新失败：${e.message}`, 'err'],
  }
  if (map[e.phase]) setUpdateStatus(map[e.phase][0], map[e.phase][1])
})
