'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { redactSecrets, buildDiagnostics, diagnosticsToMarkdown } = require('../src/diagnostics')

describe('diagnostics export', () => {
  it('explains how to reach dsh when it is not running and strips secrets', () => {
    const report = buildDiagnostics({
      running: false,
      version: '1.9.1',
      config: { dataDir: '/tmp/dsh', token: 'super-secret', url: 'http://127.0.0.1:9/?token=abc123' },
    })
    assert.equal(report.running, false)
    assert.match(report.reach, /not running/i)
    assert.equal(report.config.token, '***')
    assert.match(report.config.url, /token=\*\*\*/)
    assert.equal(JSON.stringify(report).includes('super-secret'), false)
    assert.equal(JSON.stringify(report).includes('abc123'), false)
    const md = diagnosticsToMarkdown(report)
    assert.match(md, /dsh-desktop diagnostics/)
    assert.doesNotMatch(md, /super-secret/)
  })

  it('keeps earlier auth-token redaction when the service is up', () => {
    const report = buildDiagnostics({
      running: true,
      port: 43069,
      config: { authToken: 'live-token-value' },
    })
    assert.match(report.reach, /127\.0\.0\.1:43069/)
    assert.doesNotMatch(report.reach, /live-token-value/)
    assert.equal(report.config.authToken, '***')
  })
})
