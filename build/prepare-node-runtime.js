'use strict'

// electron-builder beforePack hook: downloads a Node.js runtime for the target
// platform/arch and stages it under node-runtime/<os>-<arch>/ so extraResources
// can bundle it into the installer. Archives are cached in .node-cache/.

const { spawnSync } = require('child_process')
const fs = require('fs')
const https = require('https')
const path = require('path')

const NODE_VERSION = '24.8.0'
const ROOT = path.join(__dirname, '..')

const OS_NAMES = { mac: 'darwin', windows: 'win', linux: 'linux' }
const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64' }

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': 'dsh-desktop-build' } }, (res) => {
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
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    })
    req.on('error', reject)
  })
}

module.exports = async function beforePack(context) {
  const os = OS_NAMES[context.packager.platform.name]
  const arch = ARCH_NAMES[context.arch] || 'x64'
  const platform = os === 'darwin' ? 'darwin' : os
  const ext = os === 'win' ? 'zip' : 'tar.gz'
  const base = `node-v${NODE_VERSION}-${platform}-${arch}`
  const osKey = context.packager.platform.buildConfigurationKey // mac | win | linux
  const stageDir = path.join(ROOT, 'node-runtime', `${osKey}-${arch}`)

  if (fs.existsSync(path.join(stageDir, os === 'win' ? 'node.exe' : path.join('bin', 'node')))) {
    console.log(`  • node runtime already staged: ${stageDir}`)
    return
  }

  const cacheDir = path.join(ROOT, '.node-cache')
  fs.mkdirSync(cacheDir, { recursive: true })
  const archive = path.join(cacheDir, `${base}.${ext}`)
  if (!fs.existsSync(archive)) {
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${base}.${ext}`
    console.log(`  • downloading ${url}`)
    await download(url, archive)
  }

  fs.rmSync(stageDir, { recursive: true, force: true })
  fs.mkdirSync(stageDir, { recursive: true })
  console.log(`  • extracting node runtime to ${stageDir}`)
  const tar = spawnSync('tar', ['-xf', archive, '-C', stageDir, '--strip-components=1'], { stdio: 'inherit' })
  if (tar.status !== 0) throw new Error(`tar exited with code ${tar.status}`)

  // Trim files not needed at runtime to keep the installer small.
  for (const name of ['CHANGELOG.md', 'README.md', 'LICENSE', 'share', 'include', 'node_etw_provider.man']) {
    fs.rmSync(path.join(stageDir, name), { recursive: true, force: true })
  }
  if (os !== 'win') {
    for (const name of ['corepack', 'npx']) {
      fs.rmSync(path.join(stageDir, 'bin', name), { force: true })
    }
    fs.rmSync(path.join(stageDir, 'lib', 'node_modules', 'corepack'), { recursive: true, force: true })
  } else {
    fs.rmSync(path.join(stageDir, 'node_modules', 'corepack'), { recursive: true, force: true })
    for (const name of ['corepack', 'corepack.cmd', 'npx', 'npx.cmd']) {
      fs.rmSync(path.join(stageDir, name), { force: true })
    }
  }
}
