'use strict'

const $ = (id) => document.getElementById(id)
const openTasks = new Set()

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function statusLabel(status) {
  return { running: '进行中', done: '完成', error: '失败' }[status] || status
}

function renderTasks(tasks) {
  const list = $('taskList')
  list.textContent = ''
  if (!tasks.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = '还没有任务，输入一句话任务试试'
    list.appendChild(empty)
    return
  }
  for (const task of tasks) {
    const item = document.createElement('div')
    item.className = 'task' + (openTasks.has(task.id) ? ' open' : '')

    const head = document.createElement('div')
    head.className = 'task-head'
    const badge = document.createElement('span')
    badge.className = `badge ${task.status}`
    badge.textContent = statusLabel(task.status)
    const prompt = document.createElement('span')
    prompt.className = 'task-prompt'
    prompt.textContent = task.prompt
    prompt.title = task.prompt
    head.appendChild(badge)
    head.appendChild(prompt)

    if (task.status === 'running') {
      const cancel = document.createElement('button')
      cancel.className = 'secondary small'
      cancel.textContent = '取消'
      cancel.addEventListener('click', (e) => {
        e.stopPropagation()
        window.dshDesktop.inboxCancel(task.id)
      })
      head.appendChild(cancel)
    } else {
      const copy = document.createElement('button')
      copy.className = 'secondary small'
      copy.textContent = '复制结果'
      copy.addEventListener('click', (e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(task.output || '')
        copy.textContent = '已复制'
        setTimeout(() => (copy.textContent = '复制结果'), 1200)
      })
      head.appendChild(copy)
    }
    const del = document.createElement('button')
    del.className = 'secondary small'
    del.textContent = '删除'
    del.addEventListener('click', (e) => {
      e.stopPropagation()
      openTasks.delete(task.id)
      window.dshDesktop.inboxDelete(task.id)
    })
    head.appendChild(del)

    head.addEventListener('click', () => {
      if (openTasks.has(task.id)) openTasks.delete(task.id)
      else openTasks.add(task.id)
      item.classList.toggle('open')
    })
    item.appendChild(head)

    const meta = document.createElement('div')
    meta.className = 'task-meta'
    meta.textContent = `${task.source || ''} · ${fmtTime(task.createdAt)}${task.finishedAt ? ` → ${fmtTime(task.finishedAt)}` : ''}`
    item.appendChild(meta)

    const output = document.createElement('div')
    output.className = 'task-output'
    output.textContent = task.status === 'running' ? '任务运行中...' : task.output || '（无输出）'
    item.appendChild(output)

    list.appendChild(item)
  }
}

function scheduleDesc(s) {
  return s.type === 'interval' ? `每隔 ${s.everyHours} 小时 · ${s.prompt}` : `每天 ${s.time} · ${s.prompt}`
}

function renderSchedules(schedules) {
  const list = $('schedList')
  list.textContent = ''
  if (!schedules.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = '没有定时任务，点「新增」创建（如：每天 9 点总结昨天的工作目录变化）'
    list.appendChild(empty)
    return
  }
  for (const s of schedules) {
    const row = document.createElement('div')
    row.className = 'sched' + (s.disabled ? ' disabled' : '')
    const name = document.createElement('span')
    name.className = 'sched-name'
    name.textContent = s.name
    const desc = document.createElement('span')
    desc.className = 'sched-desc'
    desc.textContent = scheduleDesc(s)
    desc.title = s.prompt
    const toggle = document.createElement('button')
    toggle.className = 'secondary small'
    toggle.textContent = s.disabled ? '启用' : '停用'
    toggle.addEventListener('click', () => window.dshDesktop.scheduleSave({ ...s, disabled: !s.disabled }))
    const runNow = document.createElement('button')
    runNow.className = 'secondary small'
    runNow.textContent = '立即运行'
    runNow.addEventListener('click', () => window.dshDesktop.inboxRun(s.prompt))
    const del = document.createElement('button')
    del.className = 'secondary small'
    del.textContent = '删除'
    del.addEventListener('click', () => window.dshDesktop.scheduleDelete(s.id))
    row.appendChild(name)
    row.appendChild(desc)
    row.appendChild(runNow)
    row.appendChild(toggle)
    row.appendChild(del)
    list.appendChild(row)
  }
}

async function load() {
  const data = await window.dshDesktop.inboxList()
  renderTasks(data.tasks)
  renderSchedules(data.schedules)
}

$('runBtn').addEventListener('click', () => {
  const text = $('promptInput').value.trim()
  if (!text) return
  $('promptInput').value = ''
  window.dshDesktop.inboxRun(text)
})
$('promptInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('runBtn').click()
})

$('clearBtn').addEventListener('click', () => window.dshDesktop.inboxClear())

$('addSchedBtn').addEventListener('click', () => $('schedForm').classList.toggle('show'))
$('schedCancelBtn').addEventListener('click', () => $('schedForm').classList.remove('show'))
$('schedType').addEventListener('change', () => {
  const interval = $('schedType').value === 'interval'
  $('schedTime').style.display = interval ? 'none' : ''
  $('schedHours').style.display = interval ? '' : 'none'
  $('schedHoursUnit').style.display = interval ? '' : 'none'
})
$('schedSaveBtn').addEventListener('click', () => {
  const name = $('schedName').value.trim()
  const prompt = $('schedPrompt').value.trim()
  if (!name || !prompt) return
  window.dshDesktop.scheduleSave({
    name,
    prompt,
    type: $('schedType').value,
    time: $('schedTime').value || '09:00',
    everyHours: Number($('schedHours').value) || 24,
  })
  $('schedName').value = ''
  $('schedPrompt').value = ''
  $('schedForm').classList.remove('show')
})

window.dshDesktop.onInboxChanged(load)
load()
