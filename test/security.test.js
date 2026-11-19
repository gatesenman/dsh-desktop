'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  isLocalAppUrl,
  isAllowedExternalUrl,
  secureWebPreferences,
  isTrustedIpcSender,
} = require('../src/security')

describe('isLocalAppUrl', () => {
  it('accepts file chrome and the loopback dsh port', () => {
    assert.equal(isLocalAppUrl('file:///tmp/settings.html', 43069), true)
    assert.equal(isLocalAppUrl('http://127.0.0.1:43069/', 43069), true)
    assert.equal(isLocalAppUrl('http://127.0.0.1:43069/?token=abc', 43069), true)
    assert.equal(isLocalAppUrl('http://localhost:43069/path', 43069), true)
  })
  it('rejects other hosts and ports', () => {
    assert.equal(isLocalAppUrl('http://127.0.0.1:1/', 43069), false)
    assert.equal(isLocalAppUrl('http://example.com/', 43069), false)
    assert.equal(isLocalAppUrl('http://127.0.0.1:43069/', null), false)
    assert.equal(isLocalAppUrl('not a url', 43069), false)
  })
})

describe('isAllowedExternalUrl', () => {
  it('allows local app URLs and this repo / deepseek-ai https pages', () => {
    assert.equal(isAllowedExternalUrl('http://127.0.0.1:9/?token=x', 9), true)
    assert.equal(isAllowedExternalUrl('https://github.com/gatesenman/dsh-desktop', 9), true)
    assert.equal(isAllowedExternalUrl('https://github.com/gatesenman/dsh-desktop/pull/2', 9), true)
    assert.equal(isAllowedExternalUrl('https://github.com/deepseek-ai/dsh', 9), true)
  })
  it('rejects arbitrary http(s), other github paths, and dangerous schemes', () => {
    assert.equal(isAllowedExternalUrl('https://evil.example/', 9), false)
    assert.equal(isAllowedExternalUrl('http://evil.example/', 9), false)
    assert.equal(isAllowedExternalUrl('https://github.com/gatesenman/other', 9), false)
    assert.equal(isAllowedExternalUrl('https://github.com/gatesenman/dsh-desktop-evil', 9), false)
    assert.equal(isAllowedExternalUrl('javascript:alert(1)', 9), false)
    assert.equal(isAllowedExternalUrl('data:text/html,hi', 9), false)
  })
})

describe('secureWebPreferences', () => {
  it('forces sandbox, isolation, and webSecurity even if overrides try to drop them', () => {
    const prefs = secureWebPreferences({
      preload: '/tmp/preload.js',
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    })
    assert.equal(prefs.sandbox, true)
    assert.equal(prefs.nodeIntegration, false)
    assert.equal(prefs.contextIsolation, true)
    assert.equal(prefs.webSecurity, true)
    assert.equal(prefs.preload, '/tmp/preload.js')
  })
})

describe('isTrustedIpcSender', () => {
  it('accepts file chrome and rejects empty or remote frames', () => {
    assert.equal(isTrustedIpcSender({ senderFrame: { url: 'file:///app/settings.html' } }, 1), true)
    assert.equal(isTrustedIpcSender({ senderFrame: { url: 'https://evil.example/' } }, 1), false)
    assert.equal(isTrustedIpcSender({}, 1), false)
  })
})
