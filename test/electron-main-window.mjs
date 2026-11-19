#!/usr/bin/env node
// Launches the app under Electron and checks the main window is the dsh web UI
// (not 'authentication required') and that every BrowserWindow was created
// with sandbox: true.
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const { _electron } = require('playwright-core')

const outDir = process.env.DSH_E2E_OUT || join(root, 'test-results')
mkdirSync(outDir, { recursive: true })

const userDir = mkdtempSync(join(tmpdir(), 'dsh-desktop-e2e-'))
const configHome = join(userDir, 'config')
const dshHome = process.env.DSH_HOME || join(userDir, 'dsh-home')
mkdirSync(join(configHome, 'dsh-desktop'), { recursive: true })
mkdirSync(dshHome, { recursive: true })
writeFileSync(
  join(configHome, 'dsh-desktop', 'state.json'),
  JSON.stringify({ autoUpdateDsh: false, closeToTray: false }),
)

const electronPath = require('electron')
const app = await _electron.launch({
  executablePath: typeof electronPath === 'string' ? electronPath : electronPath,
  args: [root],
  env: {
    ...process.env,
    XDG_CONFIG_HOME: configHome,
    DSH_HOME: dshHome,
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  },
  timeout: 180000,
})

const result = {
  foundMain: false,
  authRequired: false,
  sandbox: null,
  title: null,
  url: null,
  bodyPreview: '',
}

try {
  const deadline = Date.now() + 150000
  let main = null
  while (Date.now() < deadline && !main) {
    const windows = app.windows()
    for (const w of windows) {
      const url = w.url()
      if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) {
        main = w
        break
      }
    }
    if (!main) await new Promise((r) => setTimeout(r, 500))
  }
  if (!main) {
    const windows = app.windows()
    main = windows[windows.length - 1] || null
  }
  if (!main) throw new Error('no Electron windows opened')

  result.url = main.url()
  await main.waitForFunction(
    () => document.body && document.body.innerText && document.body.innerText.trim().length > 0,
    null,
    { timeout: 30000 },
  )
  result.title = await main.title()
  const body = await main.evaluate(() => (document.body ? document.body.innerText : ''))
  result.bodyPreview = String(body).slice(0, 800)
  const lower = (result.bodyPreview + ' ' + result.title).toLowerCase()
  result.authRequired = lower.includes('authentication required')
  result.foundMain = result.url.startsWith('http://127.0.0.1:') || result.url.startsWith('http://localhost:')

  const prefs = await app.evaluate(async ({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows().map((w) => {
      const p = w.webContents.getLastWebPreferences()
      return { sandbox: p.sandbox, nodeIntegration: p.nodeIntegration, contextIsolation: p.contextIsolation }
    })
  })
  result.sandbox = prefs
  const shot = join(outDir, 'main-window.png')
  await main.screenshot({ path: shot })
  result.screenshot = shot

  writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2))
  assert.equal(result.authRequired, false, `page looks like auth required: ${result.bodyPreview}`)
  assert.equal(result.foundMain, true, `main window was not the local dsh web UI (url=${result.url})`)
  assert.ok(prefs.length > 0, 'no windows to inspect')
  for (const p of prefs) {
    assert.equal(p.sandbox, true, `sandbox not enabled: ${JSON.stringify(p)}`)
    assert.equal(p.nodeIntegration, false)
    assert.equal(p.contextIsolation, true)
  }
  const safeUrl = result.url.replace(/\?token=[^&]*/g, '?token=REDACTED')
  console.log(JSON.stringify({ ok: true, title: result.title, url: safeUrl, sandbox: prefs }, null, 2))
} catch (err) {
  const safeUrl = result.url && result.url.replace(/\?token=[^&]*/g, '?token=REDACTED')
  writeFileSync(join(outDir, 'result.json'), JSON.stringify({ ok: false, error: String(err), ...result, url: safeUrl }, null, 2))
  throw err
} finally {
  await app.close()
}
