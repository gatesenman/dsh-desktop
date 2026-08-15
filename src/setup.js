'use strict'

const logEl = document.getElementById('log')
const statusEl = document.getElementById('status')
const barEl = document.getElementById('bar')
const barTextEl = document.getElementById('barText')
const toggleEl = document.getElementById('toggleLog')

const TOTAL_STEPS = 4
let currentStep = 0

function renderSteps() {
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const el = document.getElementById(`step${i}`)
    el.className = 'step' + (i < currentStep ? ' done' : i === currentStep ? ' active' : '')
    const link = document.getElementById(`link${i}`)
    if (link) link.className = 'link' + (i < currentStep ? ' fill' : '')
  }
  if (currentStep > 0) {
    barEl.style.width = `${((currentStep - 1) / TOTAL_STEPS) * 100}%`
    barTextEl.textContent = ''
  }
}

window.dshDesktop.onStatus((msg) => { statusEl.textContent = msg })
window.dshDesktop.onStep((step) => {
  currentStep = step
  renderSteps()
})
window.dshDesktop.onProgress((pct) => {
  const base = ((currentStep - 1) / TOTAL_STEPS) * 100
  barEl.style.width = `${base + (pct / 100) * (100 / TOTAL_STEPS)}%`
  barTextEl.textContent = `下载中 ${pct}%`
})
window.dshDesktop.onLog((msg) => {
  logEl.textContent += msg + '\n'
  logEl.scrollTop = logEl.scrollHeight
})

toggleEl.addEventListener('click', () => {
  const open = logEl.classList.toggle('open')
  toggleEl.textContent = open ? '收起详情 ▴' : '查看详情 ▾'
  if (open) logEl.scrollTop = logEl.scrollHeight
})
