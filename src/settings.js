'use strict'

const $ = (id) => document.getElementById(id)
const keys = ['openAtLogin', 'closeToTray', 'autoUpdateDsh']

async function load() {
  const s = await window.dshDesktop.getSettings()
  for (const k of keys) $(k).checked = !!s[k]
  $('meta').textContent = `dsh 版本：${s.dshVersion || '未安装'}　应用版本：${s.appVersion}\n数据目录：${s.dataDir}`
}
load()

for (const k of keys) {
  $(k).addEventListener('change', () => {
    window.dshDesktop.setSettings({ [k]: $(k).checked })
  })
}

$('dataDirBtn').addEventListener('click', () => window.dshDesktop.openDataDir())

$('updateBtn').addEventListener('click', async () => {
  $('updateBtn').disabled = true
  $('updateStatus').textContent = '检查更新中...'
  const result = await window.dshDesktop.manualUpdate()
  if (result.status === 'latest') $('updateStatus').textContent = `已是最新版本（${result.version}）`
  else if (result.status === 'updated') $('updateStatus').textContent = `已更新到 ${result.version}，服务已重启`
  else if (result.status === 'busy') $('updateStatus').textContent = '已有更新任务在进行中'
  else $('updateStatus').textContent = `更新失败：${result.message}`
  $('updateBtn').disabled = false
  load()
})

window.dshDesktop.onUpdateEvent((e) => {
  const map = {
    checking: '检查更新中...',
    installing: `发现新版本 ${e.version}，后台安装中...`,
    restarting: '安装完成，正在重启服务...',
    done: `已更新到 ${e.version}`,
    latest: `已是最新版本（${e.version}）`,
    error: `更新失败：${e.message}`,
  }
  if (map[e.phase]) $('updateStatus').textContent = map[e.phase]
})
