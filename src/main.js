'use strict'

const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, shell, nativeImage } = require('electron')
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

const logBuffer = []
let lastStatus = '正在准备...'
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
  logBuffer.push(message)
  if (setupWin && !setupWin.isDestroyed()) {
    setupWin.webContents.send('setup-log', message)
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

/** Locate a usable Node.js: system install first, then bundled runtime, else download one. */
async function ensureNode() {
  setStep(1)
  setStatus('检测运行环境...')
  const system = systemNodeDir()
  if (system) {
    log(`检测到系统 Node.js：${system}`)
    return system
  }
  const local = localNodeDir()
  if (local) {
    log(`使用内置 Node.js 运行时：${local}`)
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

function dshEntry() {
  const candidates = [
    path.join(prefixDir(), 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    path.join(prefixDir(), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  ]
  return candidates.find((p) => fs.existsSync(p)) || null
}

async function npmInstallDsh(nodeDir, version) {
  setStatus(`安装 DeepSeek Harness (${version})...`)
  log(`npm install ${DSH_PACKAGE}@${version}`)
  fs.mkdirSync(prefixDir(), { recursive: true })
  await run(
    nodeBin(nodeDir),
    [npmCli(nodeDir), 'install', '-g', `${DSH_PACKAGE}@${version}`, `--prefix=${prefixDir()}`, '--no-fund', '--no-audit'],
    { env: envWithNode(nodeDir) },
  )
  const state = readState()
  state.dshVersion = version
  writeState(state)
  log(`DeepSeek Harness ${version} 安装完成`)
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

async function startServer(nodeDir) {
  const entry = dshEntry()
  if (!entry) throw new Error('未找到 dsh，请重启应用重新安装')
  serverPort = await freePort()
  setStep(4)
  setStatus('启动 dsh web 服务...')
  log(`启动服务：dsh web --port ${serverPort}`)
  serverProc = spawn(nodeBin(nodeDir), [entry, 'web', '--port', String(serverPort)], {
    env: envWithNode(nodeDir),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverProc.stdout.on('data', (b) => log(b.toString().trim()))
  serverProc.stderr.on('data', (b) => log(b.toString().trim()))
  serverProc.on('exit', (code) => {
    serverProc = null
    if (!quitting) {
      dialog.showErrorBox('dsh web 服务已退出', `退出码：${code}。请重启应用。`)
    }
  })
  await waitForServer(serverPort)
  log('服务已就绪')
}

function stopServer() {
  if (serverProc) {
    const proc = serverProc
    serverProc = null
    try {
      if (isWin) spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'])
      else proc.kill('SIGTERM')
    } catch {
      // process already gone
    }
  }
}

function createSetupWindow() {
  setupWin = new BrowserWindow({
    width: 720,
    height: 520,
    resizable: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  setupWin.setMenuBarVisibility(false)
  setupWin.webContents.on('did-finish-load', () => {
    setupWin.webContents.send('setup-status', lastStatus)
    setupWin.webContents.send('setup-step', lastStep)
    if (lastProgress >= 0) setupWin.webContents.send('setup-progress', lastProgress)
    for (const line of logBuffer) setupWin.webContents.send('setup-log', line)
  })
  setupWin.loadFile(path.join(__dirname, 'setup.html'))
}

function createMainWindow() {
  const saved = readState().windowBounds || {}
  mainWin = new BrowserWindow({
    width: saved.width || 1280,
    height: saved.height || 840,
    x: saved.x,
    y: saved.y,
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: isMac ? undefined : { color: '#f7f7f8', symbolColor: '#555555', height: 34 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (saved.maximized) mainWin.maximize()
  mainWin.setMenuBarVisibility(false)
  mainWin.webContents.on('did-finish-load', () => {
    mainWin.webContents.insertCSS(
      'body::before{content:"";position:fixed;top:0;left:0;right:140px;height:10px;z-index:2147483647;-webkit-app-region:drag;}',
    )
  })
  mainWin.loadURL(`http://127.0.0.1:${serverPort}/`)
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
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
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  settingsWin.setMenuBarVisibility(false)
  settingsWin.loadFile(path.join(__dirname, 'settings.html'))
  settingsWin.on('closed', () => {
    settingsWin = null
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
    await startServer(activeNodeDir)
    if (mainWin) mainWin.loadURL(`http://127.0.0.1:${serverPort}/`)
    sendUpdateEvent({ phase: 'done', version: latest })
    return { status: 'updated', version: latest }
  } catch (e) {
    sendUpdateEvent({ phase: 'error', message: e.message })
    return { status: 'error', message: e.message }
  } finally {
    updating = false
  }
}

function createTray() {
  const image = nativeImage.createFromPath(path.join(__dirname, 'tray.png'))
  tray = new Tray(image)
  tray.setToolTip('DSH Desktop')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: showMainWindow },
      { label: '设置', click: createSettingsWindow },
      { label: '检查 dsh 更新', click: () => manualDshUpdate() },
      { label: '在浏览器中打开', click: () => shell.openExternal(`http://127.0.0.1:${serverPort}/`) },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
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

async function checkAppUpdate() {
  if (!app.isPackaged) return
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = true
    await autoUpdater.checkForUpdatesAndNotify()
  } catch (e) {
    console.warn('app update check failed:', e.message)
  }
}

async function boot() {
  createSetupWindow()
  try {
    const nodeDir = await ensureNode()
    await ensureDsh(nodeDir)
    await startServer(nodeDir)
    activeNodeDir = nodeDir
    Menu.setApplicationMenu(null)
    createTray()
    createMainWindow()
    if (process.env.DSH_DESKTOP_SETTINGS === '1') createSettingsWindow()
    if (setupWin && !setupWin.isDestroyed()) setupWin.close()
    setupWin = null
    checkAppUpdate()
  } catch (e) {
    setStatus('启动失败')
    log(`错误：${e.message}`)
    dialog.showErrorBox('启动失败', e.message)
  }
}

ipcMain.handle('app-version', () => app.getVersion())
ipcMain.handle('get-settings', () => ({
  ...readSettings(),
  dshVersion: readState().dshVersion || null,
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
ipcMain.handle('open-data-dir', () => shell.openPath(userDir()))

app.on('before-quit', () => {
  quitting = true
  stopServer()
})

app.on('window-all-closed', () => {
  if (!tray || quitting) app.quit()
})

app.whenReady().then(boot)
