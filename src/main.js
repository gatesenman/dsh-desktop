'use strict'

const { app, BrowserWindow, Menu, Notification, Tray, clipboard, dialog, ipcMain, shell, nativeImage, nativeTheme, powerMonitor } = require('electron')
const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const http = require('http')
const https = require('https')
const net = require('net')
const os = require('os')
const path = require('path')

const DSH_PACKAGE = '@deepseek-ai/dsh'
const FALLBACK_NODE_VERSION = '24.8.0'
const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

let setupWin = null
let mainWin = null
let settingsWin = null
let logsWin = null
let tray = null
let serverProc = null
let serverPort = null
let activeNodeDir = null
let updating = false
let quitting = false

const DEFAULT_SETTINGS = {
  openAtLogin: false,
  closeToTray: true,
  autoUpdateDsh: true,
}

function readSettings() {
  return { ...DEFAULT_SETTINGS, ...(readState().settings || {}) }
}

function writeSettings(settings) {
  const state = readState()
  state.settings = settings
  writeState(state)
}

function userDir() {
  return app.getPath('userData')
}

function runtimeDir() {
  return path.join(userDir(), 'runtime')
}

function prefixDir() {
  return path.join(userDir(), 'dsh')
}

function versionsDir() {
  return path.join(userDir(), 'dsh-versions')
}

function versionInstallDir(version) {
  return path.join(versionsDir(), version)
}

/** DeepSeek Harness home directory holding profiles, settings, and credentials. */
function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

function statePath() {
  return path.join(userDir(), 'state.json')
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeState(state) {
  fs.mkdirSync(userDir(), { recursive: true })
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2))
}

const LOG_LIMIT = 5000
const LOG_FILE_LIMIT = 2 * 1024 * 1024
const logBuffer = []
let logStream = null
let lastStatus = '正在准备...'

function logFilePath() {
  return path.join(userDir(), 'dsh-desktop.log')
}

function appendLogFile(line) {
  try {
    if (!logStream) {
      fs.mkdirSync(userDir(), { recursive: true })
      const file = logFilePath()
      try {
        if (fs.statSync(file).size > LOG_FILE_LIMIT) fs.renameSync(file, `${file}.old`)
      } catch {
        // log file absent — nothing to rotate
      }
      logStream = fs.createWriteStream(file, { flags: 'a' })
    }
    logStream.write(line + '\n')
  } catch {
    // logging to disk is best-effort
  }
}
let lastStep = 0
let lastProgress = -1

function setStep(step) {
  lastStep = step
  lastProgress = -1
  if (setupWin && !setupWin.isDestroyed()) {
    setupWin.webContents.send('setup-step', step)
  }
}

function setProgress(pct) {
  lastProgress = pct
  if (setupWin && !setupWin.isDestroyed()) {
    setupWin.webContents.send('setup-progress', pct)
  }
}

function log(message) {
  console.log('[dsh-desktop]', message)
  const line = `[${new Date().toLocaleTimeString('en-GB')}] ${message}`
  logBuffer.push(line)
  appendLogFile(line)
  if (logBuffer.length > LOG_LIMIT) logBuffer.splice(0, logBuffer.length - LOG_LIMIT)
  if (setupWin && !setupWin.isDestroyed()) {
    setupWin.webContents.send('setup-log', message)
  }
  if (logsWin && !logsWin.isDestroyed()) {
    logsWin.webContents.send('app-log', line)
  }
}

function setStatus(status) {
  lastStatus = status
  if (setupWin && !setupWin.isDestroyed()) {
    setupWin.webContents.send('setup-status', status)
  }
}

function fetchJson(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': 'dsh-desktop' }, timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJson(res.headers.location, timeoutMs).then(resolve, reject)
        res.resume()
        return
      }
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error('request timeout')))
    req.on('error', reject)
  })
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': 'dsh-desktop' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest).then(resolve, reject)
        res.resume()
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`download failed: HTTP ${res.statusCode} for ${url}`))
        res.resume()
        return
      }
      const total = Number(res.headers['content-length']) || 0
      let done = 0
      let lastPct = -1
      const file = fs.createWriteStream(dest)
      res.on('data', (chunk) => {
        done += chunk.length
        if (total) {
          const pct = Math.floor((done / total) * 100)
          if (pct !== lastPct) {
            lastPct = pct
            setProgress(pct)
            if (pct % 10 === 0) log(`下载中... ${pct}%`)
          }
        }
      })
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    })
    req.on('error', reject)
  })
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, shell: false })
    let tail = ''
    const onData = (buf) => {
      const text = buf.toString()
      tail = (tail + text).slice(-4000)
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) log(line.trim())
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${path.basename(cmd)} 退出码 ${code}\n${tail}`))
    })
  })
}

/** Whether a version string satisfies dsh's engines range: ^22.19.0 || >=24. */
function nodeVersionOk(version) {
  const m = /v?(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!m) return false
  const [major, minor] = [Number(m[1]), Number(m[2])]
  return major >= 24 || (major === 22 && minor >= 19)
}

function systemNodeDir() {
  const probe = spawnSync(isWin ? 'node.exe' : 'node', ['--version'], { encoding: 'utf8', shell: false })
  if (probe.status === 0 && nodeVersionOk(probe.stdout.trim())) {
    const which = spawnSync(isWin ? 'where' : 'which', [isWin ? 'node.exe' : 'node'], { encoding: 'utf8' })
    if (which.status === 0) {
      const first = which.stdout.split(/\r?\n/).find(Boolean)
      if (first) return path.dirname(first)
    }
  }
  return null
}

/** Node.js runtime shipped inside the installer (resources/node-runtime). */
function bundledNodeDir() {
  if (!app.isPackaged) return null
  const base = path.join(process.resourcesPath, 'node-runtime')
  const dir = isWin ? base : path.join(base, 'bin')
  return fs.existsSync(path.join(dir, isWin ? 'node.exe' : 'node')) ? dir : null
}

function localNodeDir() {
  const marker = path.join(runtimeDir(), 'node-dir.txt')
  try {
    const dir = fs.readFileSync(marker, 'utf8').trim()
    const nodeBin = path.join(dir, isWin ? 'node.exe' : 'node')
    if (fs.existsSync(nodeBin)) return dir
  } catch {
    // marker absent — no local runtime installed yet
  }
  return null
}

async function latestNode24() {
  try {
    const index = await fetchJson('https://nodejs.org/dist/index.json')
    const entry = index.find((e) => /^v24\./.test(e.version))
    if (entry) return entry.version.slice(1)
  } catch (e) {
    log(`获取 Node.js 版本列表失败，使用内置版本 ${FALLBACK_NODE_VERSION}：${e.message}`)
  }
  return FALLBACK_NODE_VERSION
}

async function installLocalNode() {
  const version = await latestNode24()
  const platform = isWin ? 'win' : process.platform === 'darwin' ? 'darwin' : 'linux'
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const ext = isWin ? 'zip' : 'tar.gz'
  const base = `node-v${version}-${platform}-${arch}`
  const url = `https://nodejs.org/dist/v${version}/${base}.${ext}`
  log(`正在下载 Node.js v${version} (${platform}-${arch})...`)
  fs.mkdirSync(runtimeDir(), { recursive: true })
  const archive = path.join(runtimeDir(), `${base}.${ext}`)
  await download(url, archive)
  log('正在解压 Node.js...')
  await run('tar', ['-xf', archive, '-C', runtimeDir()])
  fs.rmSync(archive, { force: true })
  const dir = isWin ? path.join(runtimeDir(), base) : path.join(runtimeDir(), base, 'bin')
  fs.writeFileSync(path.join(runtimeDir(), 'node-dir.txt'), dir)
  log(`Node.js 安装完成：${dir}`)
  return dir
}

/** Locate a usable Node.js: system install, then installer-bundled runtime, then previously downloaded one, else download. */
async function ensureNode() {
  setStep(1)
  setStatus('检测运行环境...')
  const system = systemNodeDir()
  if (system) {
    log(`检测到系统 Node.js：${system}`)
    return system
  }
  const bundled = bundledNodeDir()
  if (bundled) {
    log(`使用安装包内置 Node.js 运行时：${bundled}`)
    return bundled
  }
  const local = localNodeDir()
  if (local) {
    log(`使用本地 Node.js 运行时：${local}`)
    return local
  }
  log('未检测到符合要求的 Node.js（需要 22.19+ 或 24+），将自动安装内置运行时')
  setStep(2)
  setStatus('自动安装 Node.js 运行时...')
  return installLocalNode()
}

function envWithNode(nodeDir) {
  const sep = isWin ? ';' : ':'
  return { ...process.env, PATH: `${nodeDir}${sep}${process.env.PATH || ''}` }
}

function npmCli(nodeDir) {
  if (isWin) {
    const local = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (fs.existsSync(local)) return local
  } else {
    const local = path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (fs.existsSync(local)) return local
  }
  const probe = spawnSync(isWin ? 'node.exe' : 'node', ['-e', "console.log(require.resolve('npm/bin/npm-cli.js'))"], {
    encoding: 'utf8',
    env: envWithNode(nodeDir),
  })
  if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim()
  throw new Error('未找到 npm，请确认 Node.js 安装完整')
}

function nodeBin(nodeDir) {
  return path.join(nodeDir, isWin ? 'node.exe' : 'node')
}

function dshEntryIn(prefix) {
  const candidates = [
    path.join(prefix, 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    path.join(prefix, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  ]
  return candidates.find((p) => fs.existsSync(p)) || null
}

/** npm prefix holding the active dsh install: the pinned version dir, else the legacy shared prefix. */
function activeDshPrefix() {
  const version = readState().dshVersion
  if (version && dshEntryIn(versionInstallDir(version))) return versionInstallDir(version)
  return prefixDir()
}

function dshEntry() {
  return dshEntryIn(activeDshPrefix())
}

/** The previously installed dsh version, kept on disk for one-click rollback. */
function rollbackCandidate() {
  const prev = readState().dshPreviousVersion
  if (prev && prev !== readState().dshVersion && dshEntryIn(versionInstallDir(prev))) return prev
  return null
}

/** Removes stale versioned installs, keeping only the active and rollback versions. */
function pruneDshVersions() {
  const state = readState()
  const keep = new Set([state.dshVersion, state.dshPreviousVersion].filter(Boolean))
  let entries = []
  try {
    entries = fs.readdirSync(versionsDir())
  } catch {
    // versions dir absent — nothing to prune
  }
  for (const name of entries) {
    if (!keep.has(name)) fs.rmSync(versionInstallDir(name), { recursive: true, force: true })
  }
}

/** Installs one dsh version into its own prefix, prechecks it, then promotes it to active with rollback kept. */
async function npmInstallDsh(nodeDir, version) {
  setStatus(`安装 DeepSeek Harness (${version})...`)
  log(`npm install ${DSH_PACKAGE}@${version}`)
  const prefix = versionInstallDir(version)
  fs.mkdirSync(prefix, { recursive: true })
  await run(
    nodeBin(nodeDir),
    [npmCli(nodeDir), 'install', '-g', `${DSH_PACKAGE}@${version}`, `--prefix=${prefix}`, '--no-fund', '--no-audit'],
    { env: envWithNode(nodeDir) },
  )
  const entry = dshEntryIn(prefix)
  if (!entry) {
    fs.rmSync(prefix, { recursive: true, force: true })
    throw new Error(`安装后未找到 dsh 入口文件（${version}）`)
  }
  setStatus(`校验 DeepSeek Harness (${version})...`)
  try {
    await run(nodeBin(nodeDir), [entry, '--version'], { env: envWithNode(nodeDir) })
  } catch (e) {
    fs.rmSync(prefix, { recursive: true, force: true })
    throw e
  }
  const state = readState()
  if (state.dshVersion && state.dshVersion !== version) {
    migrateLegacyInstall(state.dshVersion)
    state.dshPreviousVersion = state.dshVersion
  }
  state.dshVersion = version
  writeState(state)
  pruneDshVersions()
  log(`DeepSeek Harness ${version} 安装并校验完成`)
}

/** Moves a dsh install living in the legacy shared prefix into its versioned directory so it stays rollback-able. */
function migrateLegacyInstall(version) {
  if (dshEntryIn(versionInstallDir(version))) return
  if (!dshEntryIn(prefixDir())) return
  try {
    fs.mkdirSync(versionsDir(), { recursive: true })
    fs.renameSync(prefixDir(), versionInstallDir(version))
    log(`已迁移 dsh ${version} 到版本目录`)
  } catch (e) {
    log(`迁移旧版 dsh 失败（跳过）：${e.message}`)
  }
}

/** Rolls the active dsh back to the previous kept version and restarts the service. */
async function rollbackDsh() {
  const prev = rollbackCandidate()
  if (!prev) return { status: 'none' }
  if (updating || restarting) return { status: 'busy' }
  const state = readState()
  const from = state.dshVersion
  log(`回滚 dsh：${from} → ${prev}`)
  state.dshPreviousVersion = from
  state.dshVersion = prev
  writeState(state)
  const result = await restartService()
  if (result.status === 'restarted') {
    updateTray()
    if (Notification.isSupported()) {
      new Notification({ title: 'dsh 已回滚', body: `当前版本：${prev}（原 ${from}）`, icon: path.join(__dirname, 'icon.png') }).show()
    }
  } else if (result.status === 'error') {
    const revert = readState()
    revert.dshVersion = from
    revert.dshPreviousVersion = prev
    writeState(revert)
    log(`回滚后服务启动失败，已还原到 ${from}`)
    await restartService()
  }
  return result
}

async function latestDshVersion() {
  const meta = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(DSH_PACKAGE)}/latest`)
  return meta.version
}

/** Install dsh on first launch; afterwards upgrade in place when npm has a newer version. */
async function ensureDsh(nodeDir) {
  setStep(3)
  const installed = dshEntry() ? readState().dshVersion : null
  if (!installed) {
    setStatus('首次启动：安装 DeepSeek Harness...')
    const version = await latestDshVersion()
    await npmInstallDsh(nodeDir, version)
    return
  }
  if (!readSettings().autoUpdateDsh) {
    log(`已安装 DeepSeek Harness ${installed}（已关闭启动时自动更新）`)
    return
  }
  log(`已安装 DeepSeek Harness ${installed}，检查更新...`)
  setStatus('检查版本更新...')
  try {
    const latest = await latestDshVersion()
    if (latest !== installed) {
      log(`发现新版本 ${latest}，正在更新...`)
      await npmInstallDsh(nodeDir, latest)
    } else {
      log('已是最新版本')
    }
  } catch (e) {
    log(`检查更新失败（跳过）：${e.message}`)
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

function waitForServer(port, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 3000 }, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', retry)
      req.on('timeout', () => req.destroy(new Error('timeout')))
      function retry() {
        if (Date.now() > deadline) reject(new Error('等待 dsh web 服务启动超时'))
        else setTimeout(attempt, 500)
      }
    }
    attempt()
  })
}

const CRASH_RESTART_LIMIT = 3
const STABLE_UPTIME_MS = 60000
let crashRestarts = 0

async function startServer(nodeDir) {
  const entry = dshEntry()
  if (!entry) throw new Error('未找到 dsh，请重启应用重新安装')
  serverPort = await freePort()
  setStep(4)
  setStatus('启动 dsh web 服务...')
  log(`启动服务：dsh web --port ${serverPort}`)
  serverProc = spawn(nodeBin(nodeDir), [entry, 'web', '--port', String(serverPort)], {
    env: envWithNode(nodeDir),
    cwd: workspaceDir() || undefined,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWin,
  })
  serverProc.stdout.on('data', (b) => log(b.toString().trim()))
  serverProc.stderr.on('data', (b) => log(b.toString().trim()))
  const proc = serverProc
  const startedAt = Date.now()
  serverProc.on('exit', (code) => {
    if (serverProc === proc) serverProc = null
    if (!quitting && !proc.expectedExit) {
      if (Date.now() - startedAt > STABLE_UPTIME_MS) crashRestarts = 0
      handleServerCrash(code)
    }
  })
  await waitForServer(serverPort)
  log('服务已就绪')
}

/** Automatically restarts the dsh service after an unexpected exit, with a retry limit. */
async function handleServerCrash(code) {
  if (crashRestarts >= CRASH_RESTART_LIMIT) {
    dialog.showErrorBox('dsh web 服务已退出', `退出码：${code}。自动重启多次失败，请检查日志后重启应用。`)
    return
  }
  crashRestarts++
  log(`dsh web 服务意外退出（退出码 ${code}），自动重启（第 ${crashRestarts}/${CRASH_RESTART_LIMIT} 次）...`)
  try {
    await startServer(activeNodeDir)
    if (mainWin && !mainWin.isDestroyed()) mainWin.loadURL(`http://127.0.0.1:${serverPort}/`)
    log('服务已自动恢复')
  } catch (e) {
    dialog.showErrorBox('dsh web 服务重启失败', e.message)
  }
}

function stopServer() {
  if (serverProc) {
    const proc = serverProc
    proc.expectedExit = true
    serverProc = null
    try {
      if (isWin) {
        spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'])
      } else if (quitting) {
        process.kill(-proc.pid, 'SIGKILL')
      } else {
        process.kill(-proc.pid, 'SIGTERM')
        setTimeout(() => {
          try {
            process.kill(-proc.pid, 'SIGKILL')
          } catch {
            // process group already gone
          }
        }, 4000)
      }
    } catch {
      // process already gone
    }
  }
}

/** Hardens a window: external links open in the browser, no webviews, minimal permissions. */
function secureWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file://') || url.startsWith(`http://127.0.0.1:${serverPort}`)) return
    e.preventDefault()
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url)
  })
  win.webContents.on('will-attach-webview', (e) => e.preventDefault())
}

function createSetupWindow() {
  setupWin = new BrowserWindow({
    width: 720,
    height: 520,
    resizable: false,
    backgroundColor: '#0b1020',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  setupWin.setMenuBarVisibility(false)
  secureWindow(setupWin)
  setupWin.webContents.on('did-finish-load', () => {
    setupWin.webContents.send('setup-status', lastStatus)
    setupWin.webContents.send('setup-step', lastStep)
    if (lastProgress >= 0) setupWin.webContents.send('setup-progress', lastProgress)
    for (const line of logBuffer) setupWin.webContents.send('setup-log', line)
  })
  setupWin.loadFile(path.join(__dirname, 'setup.html'))
}

/** Window background matching the system theme, so pages don't flash white while loading. */
function themeBackground() {
  return nativeTheme.shouldUseDarkColors ? '#1a1b1e' : '#f7f7f8'
}

/** Title bar overlay colors matching the current system light/dark theme. */
function overlayColors() {
  return nativeTheme.shouldUseDarkColors
    ? { color: '#1a1b1e', symbolColor: '#c9cdd3', height: 34 }
    : { color: '#f7f7f8', symbolColor: '#555555', height: 34 }
}

function createMainWindow({ splash = false } = {}) {
  const saved = readState().windowBounds || {}
  mainWin = new BrowserWindow({
    width: saved.width || 1280,
    height: saved.height || 840,
    x: saved.x,
    y: saved.y,
    backgroundColor: themeBackground(),
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: isMac ? undefined : overlayColors(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (saved.maximized) mainWin.maximize()
  mainWin.setMenuBarVisibility(false)
  if (!isMac) {
    const applyOverlay = () => {
      if (mainWin && !mainWin.isDestroyed()) mainWin.setTitleBarOverlay(overlayColors())
    }
    nativeTheme.on('updated', applyOverlay)
    mainWin.on('closed', () => nativeTheme.removeListener('updated', applyOverlay))
  }
  mainWin.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !(isMac ? input.meta : input.control)) return
    const wc = mainWin.webContents
    if (input.shift && input.key.toLowerCase() === 'r') {
      e.preventDefault()
      restartService()
      return
    }
    if (!input.shift && input.key.toLowerCase() === 'u') {
      e.preventDefault()
      manualDshUpdate()
      return
    }
    let level = null
    if (input.key === '=' || input.key === '+') level = Math.min(wc.getZoomLevel() + 0.5, 5)
    else if (input.key === '-') level = Math.max(wc.getZoomLevel() - 0.5, -5)
    else if (input.key === '0') level = 0
    if (level !== null) {
      e.preventDefault()
      wc.setZoomLevel(level)
      const state = readState()
      state.zoomLevel = level
      writeState(state)
    }
  })
  mainWin.webContents.on('did-finish-load', () => {
    if (!mainWin.webContents.getURL().startsWith('http')) return
    const savedZoom = readState().zoomLevel
    if (typeof savedZoom === 'number') mainWin.webContents.setZoomLevel(savedZoom)
    mainWin.webContents.insertCSS(
      'body::before{content:"";position:fixed;top:0;left:0;right:140px;height:10px;z-index:2147483647;-webkit-app-region:drag;}',
    )
  })
  if (splash) mainWin.loadFile(path.join(__dirname, 'splash.html'))
  else mainWin.loadURL(`http://127.0.0.1:${serverPort}/`)
  secureWindow(mainWin)
  const saveBounds = () => {
    if (!mainWin || mainWin.isDestroyed() || mainWin.isMinimized()) return
    const state = readState()
    state.windowBounds = { ...(mainWin.isMaximized() ? state.windowBounds : mainWin.getBounds()), maximized: mainWin.isMaximized() }
    writeState(state)
  }
  mainWin.on('close', (e) => {
    saveBounds()
    if (!quitting && readSettings().closeToTray && tray) {
      e.preventDefault()
      mainWin.hide()
      const state = readState()
      if (!state.trayHintShown && Notification.isSupported()) {
        new Notification({
          title: 'DSH Desktop 仍在后台运行',
          body: '服务未中断，可从系统托盘重新打开窗口或彻底退出。',
          icon: path.join(__dirname, 'icon.png'),
        }).show()
        state.trayHintShown = true
        writeState(state)
      }
    }
  })
  mainWin.on('closed', () => {
    mainWin = null
  })
}

function showMainWindow() {
  if (mainWin) {
    mainWin.show()
    mainWin.focus()
  } else if (serverPort) {
    createMainWindow()
  }
}

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show()
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 560,
    height: 660,
    resizable: false,
    backgroundColor: themeBackground(),
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  settingsWin.setMenuBarVisibility(false)
  secureWindow(settingsWin)
  settingsWin.loadFile(path.join(__dirname, 'settings.html'))
  settingsWin.on('closed', () => {
    settingsWin = null
  })
}

function createLogsWindow() {
  if (logsWin && !logsWin.isDestroyed()) {
    logsWin.show()
    logsWin.focus()
    return
  }
  logsWin = new BrowserWindow({
    width: 860,
    height: 620,
    backgroundColor: themeBackground(),
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  logsWin.setMenuBarVisibility(false)
  secureWindow(logsWin)
  logsWin.loadFile(path.join(__dirname, 'logs.html'))
  logsWin.on('closed', () => {
    logsWin = null
  })
}

function sendUpdateEvent(payload) {
  for (const win of [settingsWin, setupWin]) {
    if (win && !win.isDestroyed()) win.webContents.send('update-event', payload)
  }
}

/** Manually triggered background update of the dsh package; restarts the embedded server when a new version lands. */
async function manualDshUpdate() {
  if (updating) return { status: 'busy' }
  updating = true
  try {
    sendUpdateEvent({ phase: 'checking' })
    const installed = readState().dshVersion || null
    const latest = await latestDshVersion()
    if (latest === installed) {
      sendUpdateEvent({ phase: 'latest', version: installed })
      return { status: 'latest', version: installed }
    }
    sendUpdateEvent({ phase: 'installing', version: latest })
    await npmInstallDsh(activeNodeDir, latest)
    sendUpdateEvent({ phase: 'restarting', version: latest })
    stopServer()
    try {
      await startServer(activeNodeDir)
    } catch (e) {
      if (installed && rollbackCandidate() === installed) {
        log(`新版本 ${latest} 启动失败，自动回退到 ${installed}`)
        const state = readState()
        state.dshVersion = installed
        state.dshPreviousVersion = latest
        writeState(state)
        await startServer(activeNodeDir)
      } else {
        throw e
      }
    }
    if (mainWin) mainWin.loadURL(`http://127.0.0.1:${serverPort}/`)
    sendUpdateEvent({ phase: 'done', version: readState().dshVersion })
    updateTray()
    return { status: 'updated', version: readState().dshVersion }
  } catch (e) {
    sendUpdateEvent({ phase: 'error', message: e.message })
    return { status: 'error', message: e.message }
  } finally {
    updating = false
  }
}

let restarting = false

/** Restarts the embedded dsh web service and reloads the main window. */
async function restartService() {
  if (restarting || updating) return { status: 'busy' }
  restarting = true
  try {
    log('手动重启服务...')
    stopServer()
    await startServer(activeNodeDir)
    if (mainWin && !mainWin.isDestroyed()) mainWin.loadURL(`http://127.0.0.1:${serverPort}/`)
    log('服务重启完成')
    return { status: 'restarted' }
  } catch (e) {
    return { status: 'error', message: e.message }
  } finally {
    restarting = false
  }
}

/** Opens a system terminal in the app data dir with the managed Node.js and dsh on PATH. */
function openTerminal() {
  const sep = isWin ? ';' : ':'
  const extra = [activeNodeDir, path.join(activeDshPrefix(), 'bin')].filter(Boolean).join(sep)
  const env = { ...process.env, PATH: `${extra}${sep}${process.env.PATH || ''}` }
  const cwd = userDir()
  try {
    if (isWin) {
      spawn('cmd.exe', ['/c', 'start', 'cmd.exe'], { env, cwd, detached: true, stdio: 'ignore' }).unref()
    } else if (isMac) {
      const script = path.join(userDir(), 'open-terminal.command')
      fs.writeFileSync(
        script,
        `#!/bin/bash\ncd ${JSON.stringify(cwd)}\nexport PATH=${JSON.stringify(extra)}:"$PATH"\nexec "$SHELL"\n`,
        { mode: 0o755 },
      )
      spawn('open', ['-a', 'Terminal', script], { detached: true, stdio: 'ignore' }).unref()
    } else {
      const terminals = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm']
      const found = terminals.find((t) => spawnSync('which', [t], { encoding: 'utf8' }).status === 0)
      if (!found) {
        log('未找到可用的终端程序（尝试过 x-terminal-emulator/gnome-terminal/konsole/xfce4-terminal/xterm）')
        return
      }
      spawn(found, [], { env, cwd, detached: true, stdio: 'ignore' }).unref()
    }
    log('已打开终端（node 与 dsh 已加入 PATH）')
  } catch (e) {
    log(`打开终端失败：${e.message}`)
  }
}

/** Backs up the DSH home (sessions, settings, credentials) and desktop preferences into one archive. */
async function backupData() {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '备份 DSH 数据',
    defaultPath: path.join(app.getPath('downloads'), `dsh-backup-${new Date().toISOString().slice(0, 10)}.tar.gz`),
    filters: [{ name: 'DSH 备份', extensions: ['tar.gz', 'tgz'] }],
  })
  if (canceled || !filePath) return { status: 'canceled' }
  const staging = path.join(userDir(), 'backup-staging')
  try {
    fs.rmSync(staging, { recursive: true, force: true })
    fs.mkdirSync(staging, { recursive: true })
    try {
      fs.copyFileSync(statePath(), path.join(staging, 'dsh-desktop-state.json'))
    } catch {
      // no desktop state yet — back up the DSH home alone
    }
    const home = dshHome()
    const args = ['-czf', filePath]
    if (fs.existsSync(home)) {
      args.push('--exclude', 'node_modules', '-C', path.dirname(home), path.basename(home))
    }
    args.push('-C', staging, '.')
    await run('tar', args)
    log(`备份完成：${filePath}`)
    if (Notification.isSupported()) {
      new Notification({
        title: '备份完成',
        body: `${filePath}\n备份包含 API 凭据，请妥善保管`,
        icon: path.join(__dirname, 'icon.png'),
      }).show()
    }
    return { status: 'saved', filePath }
  } catch (e) {
    log(`备份失败：${e.message}`)
    dialog.showErrorBox('备份失败', e.message)
    return { status: 'error', message: e.message }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

/** Rejects archives whose member paths could escape the extraction directory. */
async function assertSafeArchive(archive) {
  const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (listing.status !== 0) throw new Error('无法读取备份文件（不是有效的 tar.gz 归档）')
  for (const entry of listing.stdout.split('\n')) {
    if (!entry) continue
    if (path.isAbsolute(entry) || entry.split('/').includes('..')) {
      throw new Error(`备份文件包含不安全的路径：${entry}`)
    }
  }
}

/** Preference keys restored from a backup; runtime install records stay owned by this machine. */
const RESTORED_STATE_KEYS = ['settings', 'windowBounds', 'zoomLevel', 'workspaceDir', 'recentWorkspaces']

/** Restores a backup archive into the DSH home after confirmation, then restarts the service. */
async function restoreData() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '选择备份文件',
    filters: [{ name: 'DSH 备份', extensions: ['gz', 'tgz'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths[0]) return { status: 'canceled' }
  const archive = filePaths[0]
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: '恢复备份',
    message: '恢复将覆盖当前的会话、设置与凭据，并重启服务。确定继续？',
    buttons: ['恢复', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  })
  if (response !== 0) return { status: 'canceled' }
  const staging = path.join(userDir(), 'restore-staging')
  let serverStopped = false
  try {
    await assertSafeArchive(archive)
    fs.rmSync(staging, { recursive: true, force: true })
    fs.mkdirSync(staging, { recursive: true })
    await run('tar', ['-xzf', archive, '-C', staging])
    const home = dshHome()
    const restoredHome = path.join(staging, path.basename(home))
    if (!fs.existsSync(restoredHome)) throw new Error('备份文件中未找到 DSH 数据目录')
    stopServer()
    serverStopped = true
    fs.cpSync(restoredHome, home, { recursive: true, force: true })
    const restoredState = path.join(staging, 'dsh-desktop-state.json')
    if (fs.existsSync(restoredState)) {
      const incoming = JSON.parse(fs.readFileSync(restoredState, 'utf8'))
      const state = readState()
      for (const key of RESTORED_STATE_KEYS) {
        if (incoming[key] !== undefined) state[key] = incoming[key]
      }
      writeState(state)
    }
    fs.rmSync(staging, { recursive: true, force: true })
    log(`已从备份恢复：${archive}`)
    updateTray()
    return restartService()
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true })
    log(`恢复失败：${e.message}`)
    dialog.showErrorBox('恢复失败', e.message)
    if (serverStopped) await restartService()
    return { status: 'error', message: e.message }
  }
}

function probeUrl(url, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'user-agent': 'dsh-desktop' }, timeout: timeoutMs }, (res) => {
      res.resume()
      resolve(`可达（HTTP ${res.statusCode}）`)
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', (e) => resolve(`不可达（${e.message}）`))
  })
}

function probeLocalServer(port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!port) return resolve('未启动')
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: timeoutMs }, (res) => {
      res.resume()
      resolve(`运行中（端口 ${port}，HTTP ${res.statusCode}）`)
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', (e) => resolve(`异常（端口 ${port}，${e.message}）`))
  })
}

/** Collects a structured environment diagnosis and offers to copy the full report. */
async function runDoctor() {
  const lines = []
  const state = readState()
  lines.push(`应用：DSH Desktop ${app.getVersion()}（${app.isPackaged ? '安装版' : '开发模式'}）`)
  lines.push(`系统：${process.platform} ${process.arch} / Electron ${process.versions.electron} / 内置 Node ${process.versions.node}`)
  const nodeProbe = activeNodeDir ? spawnSync(nodeBin(activeNodeDir), ['--version'], { encoding: 'utf8' }) : null
  lines.push(`服务 Node：${nodeProbe && nodeProbe.status === 0 ? `${nodeProbe.stdout.trim()}（${activeNodeDir}）` : '未就绪'}`)
  const entry = dshEntry()
  lines.push(`dsh：${state.dshVersion || '未安装'}${entry ? '' : '（入口文件缺失！）'}${rollbackCandidate() ? `，可回滚到 ${rollbackCandidate()}` : ''}`)
  lines.push(`dsh 服务：${await probeLocalServer(serverPort)}`)
  const home = dshHome()
  let homeStatus = '不存在'
  try {
    fs.accessSync(home, fs.constants.W_OK)
    homeStatus = '可读写'
  } catch {
    homeStatus = fs.existsSync(home) ? '不可写！' : '不存在（首次使用前正常）'
  }
  lines.push(`DSH 数据目录：${home}（${homeStatus}）`)
  lines.push(`工作目录：${workspaceDir() || '默认（应用数据目录）'}`)
  try {
    const stat = fs.statfsSync(userDir())
    lines.push(`磁盘剩余：${Math.round((stat.bavail * stat.bsize) / 1024 / 1024 / 1024)} GB`)
  } catch {
    // statfs unsupported on this platform — omit disk space
  }
  const proxies = ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY']
    .map((k) => (process.env[k] || process.env[k.toLowerCase()] ? `${k}=已设置` : null))
    .filter(Boolean)
  lines.push(`代理：${proxies.length ? proxies.join('，') : '未设置'}`)
  const [npmReach, apiReach] = await Promise.all([
    probeUrl('https://registry.npmjs.org/-/ping'),
    probeUrl('https://api.deepseek.com/'),
  ])
  lines.push(`npm 仓库：${npmReach}`)
  lines.push(`DeepSeek API：${apiReach}`)
  const report = lines.join('\n')
  log('环境体检完成')
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '环境体检',
    message: '环境体检报告',
    detail: report,
    buttons: ['复制报告', '关闭'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  if (response === 0) clipboard.writeText(report)
  return report
}

/** The default workspace root passed to the dsh service as its working directory. */
function workspaceDir() {
  const dir = readState().workspaceDir
  if (dir && fs.existsSync(dir)) return dir
  return null
}

const RECENT_WORKSPACE_LIMIT = 5

/** Sets the default workspace root, records it as recent, and restarts the service there. */
async function setWorkspace(dir) {
  const previous = readState().workspaceDir
  const state = readState()
  state.workspaceDir = dir || undefined
  if (dir) {
    state.recentWorkspaces = [dir, ...(state.recentWorkspaces || []).filter((d) => d !== dir)].slice(0, RECENT_WORKSPACE_LIMIT)
  }
  writeState(state)
  updateTray()
  log(dir ? `切换默认工作目录：${dir}` : '恢复默认工作目录')
  const result = await restartService()
  if (result.status === 'error') {
    const revert = readState()
    revert.workspaceDir = previous
    writeState(revert)
    updateTray()
    log(`切换工作目录后服务启动失败，已还原`)
    await restartService()
  }
  return result
}

async function pickWorkspace() {
  const { canceled, filePaths } = await dialog.showOpenDialog({ title: '选择工作目录', properties: ['openDirectory'] })
  if (canceled || !filePaths[0]) return
  await setWorkspace(filePaths[0])
}

function workspaceMenu() {
  const state = readState()
  const current = workspaceDir()
  const items = [{ label: '选择文件夹...', click: pickWorkspace }]
  const recents = (state.recentWorkspaces || []).filter((d) => fs.existsSync(d))
  if (recents.length) {
    items.push({ type: 'separator' })
    for (const dir of recents) {
      items.push({
        label: path.basename(dir) + `  (${dir.length > 40 ? '…' + dir.slice(-38) : dir})`,
        type: 'radio',
        checked: dir === current,
        click: () => setWorkspace(dir),
      })
    }
  }
  items.push({ type: 'separator' })
  items.push({ label: '恢复默认（应用数据目录）', type: 'radio', checked: !current, click: () => setWorkspace(null) })
  return items
}

function trayMenuTemplate() {
  const prev = rollbackCandidate()
  return [
    { label: '显示主窗口', click: showMainWindow },
    { label: '工作目录', submenu: workspaceMenu() },
    { label: '设置', click: createSettingsWindow },
    { label: '检查 dsh 更新', click: () => manualDshUpdate() },
    ...(prev ? [{ label: `回滚 dsh 到 ${prev}`, click: () => rollbackDsh() }] : []),
    { label: '环境体检', click: () => runDoctor() },
    { label: '备份数据...', click: () => backupData() },
    { label: '恢复备份...', click: () => restoreData() },
    { label: '查看控制台日志', click: createLogsWindow },
    { label: '重启服务', click: () => restartService() },
    { label: '打开终端', click: openTerminal },
    { label: '在浏览器中打开', click: () => shell.openExternal(`http://127.0.0.1:${serverPort}/`) },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true
        app.quit()
      },
    },
  ]
}

function updateTray() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate()))
}

function createTray() {
  const image = nativeImage.createFromPath(path.join(__dirname, 'tray.png'))
  tray = new Tray(image)
  tray.setToolTip('DSH Desktop')
  updateTray()
  tray.on('click', showMainWindow)
}

function applyLoginItem(settings) {
  if (isWin || isMac) {
    app.setLoginItemSettings({ openAtLogin: settings.openAtLogin })
  } else {
    const autostartDir = path.join(os.homedir(), '.config', 'autostart')
    const desktopFile = path.join(autostartDir, 'dsh-desktop.desktop')
    if (settings.openAtLogin) {
      fs.mkdirSync(autostartDir, { recursive: true })
      fs.writeFileSync(
        desktopFile,
        `[Desktop Entry]\nType=Application\nName=DSH Desktop\nExec=${JSON.stringify(process.execPath)}\nX-GNOME-Autostart-enabled=true\n`,
      )
    } else {
      fs.rmSync(desktopFile, { force: true })
    }
  }
}

const APP_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000
const UPDATE_STARTUP_DELAY_MS = 30 * 1000
const UPDATE_STARTUP_JITTER_MS = 2 * 60 * 1000
const UPDATE_RESUME_MIN_GAP_MS = 60 * 60 * 1000
let appUpdateTimer = null
let lastUpdateCheck = 0

async function checkAppUpdate() {
  if (!app.isPackaged) return
  lastUpdateCheck = Date.now()
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = true
    await autoUpdater.checkForUpdatesAndNotify()
  } catch (e) {
    console.warn('app update check failed:', e.message)
  }
}

/** Schedules update checks: delayed+jittered at startup, periodic, and after system resume. */
function scheduleUpdateChecks() {
  if (appUpdateTimer) return
  setTimeout(checkAppUpdate, UPDATE_STARTUP_DELAY_MS + Math.random() * UPDATE_STARTUP_JITTER_MS)
  appUpdateTimer = setInterval(checkAppUpdate, APP_UPDATE_INTERVAL_MS)
  powerMonitor.on('resume', () => {
    if (Date.now() - lastUpdateCheck > UPDATE_RESUME_MIN_GAP_MS) checkAppUpdate()
  })
}

/** Offers retry / view logs / quit when startup fails, looping until resolved. */
async function showBootFailure(message) {
  const win = setupWin && !setupWin.isDestroyed() ? setupWin : mainWin && !mainWin.isDestroyed() ? mainWin : null
  const options = {
    type: 'error',
    title: '启动失败',
    message: 'DSH Desktop 启动失败',
    detail: `${message}\n\n你可以重试，或打开控制台日志查看详情。`,
    buttons: ['重试', '查看日志', '退出'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  }
  const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
  if (response === 0) {
    boot()
  } else if (response === 1) {
    createLogsWindow()
    showBootFailure(message)
  } else {
    quitting = true
    app.quit()
  }
}

let booting = false

async function boot() {
  if (booting) return
  booting = true
  const firstRun = !dshEntry()
  if (firstRun) {
    if (!setupWin || setupWin.isDestroyed()) createSetupWindow()
  } else if (!mainWin || mainWin.isDestroyed()) {
    Menu.setApplicationMenu(null)
    createMainWindow({ splash: true })
  }
  try {
    const nodeDir = await ensureNode()
    await ensureDsh(nodeDir)
    await startServer(nodeDir)
    activeNodeDir = nodeDir
    Menu.setApplicationMenu(null)
    if (!tray) createTray()
    if (mainWin && !mainWin.isDestroyed()) mainWin.loadURL(`http://127.0.0.1:${serverPort}/`)
    else createMainWindow()
    if (process.env.DSH_DESKTOP_SETTINGS === '1') createSettingsWindow()
    if (setupWin && !setupWin.isDestroyed()) setupWin.close()
    setupWin = null
    scheduleUpdateChecks()
  } catch (e) {
    setStatus('启动失败')
    log(`错误：${e.message}`)
    booting = false
    showBootFailure(e.message)
    return
  }
  booting = false
}

ipcMain.handle('app-version', () => app.getVersion())
ipcMain.handle('get-settings', () => ({
  ...readSettings(),
  dshVersion: readState().dshVersion || null,
  dshRollbackVersion: rollbackCandidate(),
  appVersion: app.getVersion(),
  dataDir: userDir(),
}))
ipcMain.handle('set-settings', (_e, settings) => {
  const merged = { ...readSettings(), ...settings }
  writeSettings(merged)
  applyLoginItem(merged)
  return merged
})
ipcMain.handle('manual-update', () => manualDshUpdate())
ipcMain.handle('run-doctor', () => runDoctor())
ipcMain.handle('backup-data', () => backupData())
ipcMain.handle('restore-data', () => restoreData())
ipcMain.handle('rollback-dsh', () => rollbackDsh())
ipcMain.handle('open-data-dir', () => shell.openPath(userDir()))
ipcMain.handle('open-logs', () => createLogsWindow())
ipcMain.handle('restart-service', () => restartService())
ipcMain.handle('get-logs', () => logBuffer.slice())
ipcMain.handle('export-logs', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(logsWin, {
    title: '导出日志',
    defaultPath: path.join(app.getPath('downloads'), `dsh-desktop-${Date.now()}.log`),
    filters: [{ name: 'Log', extensions: ['log', 'txt'] }],
  })
  if (canceled || !filePath) return { status: 'canceled' }
  fs.writeFileSync(filePath, logBuffer.join('\n') + '\n')
  return { status: 'saved', filePath }
})

app.on('before-quit', () => {
  quitting = true
  stopServer()
})

app.on('window-all-closed', () => {
  if (!tray || quitting) app.quit()
})

app.on('activate', showMainWindow)

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', showMainWindow)
  app.whenReady().then(boot)
} else {
  app.quit()
}
