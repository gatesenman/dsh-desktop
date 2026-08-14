'use strict'

const $ = (id) => document.getElementById(id)
const keys = ['openAtLogin', 'closeToTray', 'autoUpdateDsh']

async function load() {
  const s = await window.dshDesktop.getSettings()
  for (const k of keys) $(k).checked = !!s[k]
  $('meta').textContent = `dsh 版本：${s.dshVersion || '未安装'}\n应用版本：${s.appVersion}\n数据目录：${s.dataDir}`
}
load()

for (const k of keys) {
  $(k).addEventListener('change', () => {
    window.dshDesktop.setSettings({ [k]: $(k).checked })
  })
}

$('dataDirBtn').addEventListener('click', () => window.dshDesktop.openDataDir())

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
