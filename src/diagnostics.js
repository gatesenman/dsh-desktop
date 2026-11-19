'use strict'

/** Redact query tokens and obvious secret fields. Never log raw tokens. */
function redactSecrets(value) {
  if (typeof value === 'string') {
    return value.replace(/([?&]token=)[^&#\s]+/gi, '$1***')
  }
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, val] of Object.entries(value)) {
      if (/token|secret|password|apiKey|api_key|authorization/i.test(key)) {
        out[key] = val ? '***' : val
      } else {
        out[key] = redactSecrets(val)
      }
    }
    return out
  }
  return value
}

function buildDiagnostics(input = {}) {
  const running = !!input.running
  const port = input.port ?? null
  const reach =
    running && port
      ? `Open the local desktop or visit http://127.0.0.1:${port}/ (the app adds the auth token; do not share it).`
      : 'DeepSeek Harness (dsh) is not running. Start it from this desktop app, or run `dsh web` in a terminal, then reopen the app.'
  const config = redactSecrets(input.config || {})
  return {
    kind: 'dsh-desktop-diagnostics',
    version: input.version || null,
    running,
    port,
    dataDir: input.dataDir || null,
    reach,
    nextSteps: running
      ? ['If a page fails to load, check the Logs window.', 'Do not paste auth tokens into tickets or chat.']
      : [
          'Start dsh from the desktop app or with `dsh web`.',
          'Confirm the loopback port in Settings once the service is up.',
          'If the binary is missing, install dsh and retry.',
        ],
    config,
  }
}

function diagnosticsToMarkdown(report) {
  const lines = [
    '# dsh-desktop diagnostics',
    '',
    `Running: ${report.running ? 'yes' : 'no'}`,
    report.port ? `Port: ${report.port}` : 'Port: (not running)',
    '',
    report.reach,
    '',
    '## Next steps',
    '',
    ...report.nextSteps.map((s) => `- ${s}`),
    '',
  ]
  return lines.join('\n')
}

module.exports = { redactSecrets, buildDiagnostics, diagnosticsToMarkdown }
