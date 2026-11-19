'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const src = path.join(__dirname, '..', 'src')

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function channel(c) {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const L1 = luminance(a)
  const L2 = luminance(b)
  const hi = Math.max(L1, L2)
  const lo = Math.min(L1, L2)
  return (hi + 0.05) / (lo + 0.05)
}

const FILES = ['settings.html', 'logs.html', 'splash.html', 'setup.html', 'inbox.html', 'quick.html']

describe('local chrome keyboard focus', () => {
  for (const file of FILES) {
    it(`${file} defines :focus-visible and a --focus-ring`, () => {
      const css = fs.readFileSync(path.join(src, file), 'utf8')
      assert.match(css, /:focus-visible/)
      assert.match(css, /--focus-ring:/)
    })
  }
})

describe('local chrome contrast (WCAG 2.2)', () => {
  it('body and muted text on the dark settings/logs chrome meet 4.5:1', () => {
    assert.ok(contrast('#e6edf3', '#0d1117') >= 4.5)
    assert.ok(contrast('#8b949e', '#0d1117') >= 4.5)
    assert.ok(contrast('#8b949e', '#161b22') >= 4.5)
    assert.ok(contrast('#ffffff', '#2B6CEA') >= 4.5)
  })

  it('splash hint text meets 4.5:1 in light and dark, and the focus ring meets 3:1', () => {
    const splash = fs.readFileSync(path.join(src, 'splash.html'), 'utf8')
    assert.match(splash, /\.hint \{[^}]*color: #5c5f66/)
    assert.ok(contrast('#5c5f66', '#f7f7f8') >= 4.5)
    assert.ok(contrast('#9ca0a8', '#1a1b1e') >= 4.5)
    assert.ok(contrast('#1f2328', '#f7f7f8') >= 4.5)
    // light-mode ring must not use the decorative orange (#fb923c fails 3:1 on #f7f7f8)
    assert.ok(contrast('#c2410c', '#f7f7f8') >= 3)
    assert.ok(contrast('#fb923c', '#1a1b1e') >= 3)
    assert.match(splash, /--focus-ring: #c2410c/)
    assert.match(splash, /--focus-ring: #fb923c/)
  })

  it('settings/logs focus ring meets 3:1 against the dark background', () => {
    assert.ok(contrast('#2B6CEA', '#0d1117') >= 3)
  })
})
