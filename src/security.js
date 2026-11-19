'use strict'

/** Host/path prefixes that may be opened in the system browser (https only). */
const ALLOWED_HTTPS = [
  { host: 'github.com', path: '/gatesenman/dsh-desktop' },
  { host: 'www.github.com', path: '/gatesenman/dsh-desktop' },
  { host: 'github.com', path: '/deepseek-ai/' },
  { host: 'www.github.com', path: '/deepseek-ai/' },
]

function pathAllowed(pathname, prefix) {
  if (prefix.endsWith('/')) return pathname.startsWith(prefix) || pathname + '/' === prefix
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

/** True for the local file chrome or the embedded dsh web origin on loopback. */
function isLocalAppUrl(url, serverPort) {
  let u
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol === 'file:') return true
  if (u.protocol !== 'http:') return false
  if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return false
  if (serverPort == null || serverPort === '') return false
  const port = u.port === '' ? 80 : Number(u.port)
  return port === Number(serverPort)
}

/** Local app URLs plus a tight https allow-list. Used before shell.openExternal. */
function isAllowedExternalUrl(url, serverPort) {
  if (isLocalAppUrl(url, serverPort)) return true
  let u
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  return ALLOWED_HTTPS.some((rule) => host === rule.host && pathAllowed(u.pathname, rule.path))
}

/** webPreferences that cannot drop sandbox / isolation / webSecurity. */
function secureWebPreferences(overrides = {}) {
  const { preload } = overrides
  const prefs = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  }
  if (preload) prefs.preload = preload
  return prefs
}

/** IPC from the local file chrome (settings, logs, inbox, …) is trusted. */
function isTrustedIpcSender(event, serverPort) {
  const frame = event && event.senderFrame
  const url = frame && frame.url
  if (!url) return false
  return isLocalAppUrl(url, serverPort)
}

module.exports = {
  ALLOWED_HTTPS,
  isLocalAppUrl,
  isAllowedExternalUrl,
  secureWebPreferences,
  isTrustedIpcSender,
}
