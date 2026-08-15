'use strict'

const input = document.getElementById('quickInput')

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const text = input.value.trim()
    input.value = ''
    if (text) window.dshDesktop.quickSubmit(text)
    else window.dshDesktop.quickHide()
  } else if (e.key === 'Escape') {
    input.value = ''
    window.dshDesktop.quickHide()
  }
})

window.addEventListener('focus', () => input.focus())
