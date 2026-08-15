<p align="center">
  <img src="build/icon.png" width="120" alt="DSH Desktop" />
</p>

<h1 align="center">DSH Desktop</h1>

<p align="center"><a href="README.md">中文</a> | <b>English</b></p>

An unofficial desktop app for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness), supporting macOS / Windows / Linux.

A **one-click install-and-use edition** built for people who don't code: no command line, no manual Node.js setup — download the installer, double-click, and the app configures everything automatically and takes you straight to the UI.

> **Source & tech notes**: The app installs the officially published [`@deepseek-ai/dsh`](https://github.com/deepseek-ai/deepseek-harness) package from npm (officially used via `npx @deepseek-ai/dsh web`), packaged with **Electron + electron-builder**, embedding the official `dsh web` service's Web UI. No official source code is copied or modified.

## Screenshots

First-launch automatic setup (environment check → download Node.js → install dsh → start service), with a vivid animated install experience: aurora background, floating particles, spinning halos, step connectors, and a flowing gradient progress bar:

![First-launch setup](assets/setup.png)

Subsequent launches skip the install screen — just a lightweight splash (following the system light/dark theme) before the main window appears:

![Startup splash](assets/splash.png)

Embedded Web UI, frameless immersive window:

![Main window](assets/main-window.png)

Settings (auto-start, tray, updates, restart service, logs, plus maintenance: environment doctor, backup/restore, dsh rollback):

![Settings](assets/settings.png)

Console logs (live view, copy, export):

![Console logs](assets/logs.png)

## Features

- **Automatic environment setup on first launch**: detects system Node.js (requires 22.19+ or 24+); if missing, uses the **Node.js runtime bundled inside the installer** (no download needed — installs succeed even offline or on slow networks), falling back to an automatic download; then installs `@deepseek-ai/dsh` automatically, with a vivid animated install screen and step-by-step progress (respects the system "reduce motion" preference).
- **Instant start once installed**: environment setup only happens on the first launch; subsequent launches skip the install screen and show only a lightweight splash before the main window appears.
- **Original fox icon**: the app and tray icons are an originally drawn fox character, with no third-party trademark infringement risk.
- **Embedded Web UI**: starts the `dsh web` service and embeds it in the app window.
- **Distraction-free UI**: frameless main window with no title bar, menu bar, or toolbar (native window controls kept); window size, position, maximized state, and zoom level are remembered (Ctrl/Cmd +/- to zoom, 0 to reset); the window background follows the system light/dark theme, so pages never flash white while loading.
- **Stable and reliable**: single-instance app (launching again focuses the existing window); the `dsh web` service auto-restarts if it exits unexpectedly; startup failures offer one-click retry or log viewing; shortcuts Ctrl/Cmd+Shift+R restart the service and Ctrl/Cmd+U check for dsh updates.
- **System tray**: closing the window can minimize to tray and keep the service running (a one-time system notification explains this); the tray menu supports show window, switch working directory, settings, check for updates, roll back dsh, environment doctor, backup/restore, open a terminal (with node and dsh preconfigured on PATH), open in browser, and quit.
- **System settings**: launch at login, minimize to tray on close, and auto-update dsh on startup — all toggleable in the settings window; one click opens the data directory.
- **Console logs**: open the log window from settings or the tray menu to watch app and dsh service logs live, with one-click copy and export; logs are also written to `dsh-desktop.log` in the data directory.
- **Restart service**: restart the embedded dsh service with one click from settings or the tray menu, without restarting the app.
- **Updates**: manual "Check and update dsh" runs the install in the background and restarts the service; when auto-update is on, `@deepseek-ai/dsh` is upgraded on every launch; the app itself auto-updates via GitHub Releases (a jittered check shortly after startup, every 6 hours, and again after the system wakes from sleep).
- **Security hardening**: the service listens only on a random loopback port; the renderer runs with Node integration disabled and context isolation enabled; external links always open in the system browser.
- **dsh version pinning with one-click rollback**: each dsh version installs into its own directory; upgrades install into a new directory and run a `dsh --version` preflight before switching; the previous version is kept, the app automatically falls back if the service fails to start after an upgrade, and you can roll back anytime from the tray or settings.
- **One-click backup/restore**: packs the DSH data directory (sessions, settings, credentials) and desktop preferences into a single `tar.gz` archive; restore asks for confirmation, validates archive paths for safety, and restarts the service when done. Backups contain API credentials — keep them safe.
- **Environment doctor**: generates a diagnostic report in one click (app/system/Node/dsh versions, service and port status, data directory read/write, free disk space, proxy and npm/DeepSeek API network reachability) that you can copy and share for troubleshooting; it contains no API keys or other sensitive values and uploads nothing.
- **Working directory switching**: the tray "Working directory" submenu lets you pick any folder as the dsh service's working directory (recent folders are remembered), with one click to restore the default.

## Download

Grab the installer for your platform from [Releases](https://github.com/gatesenman/dsh-desktop/releases):

| Platform | Installer |
| --- | --- |
| macOS | `.dmg` (x64 / arm64) |
| Windows | `.exe` (NSIS installer) |
| Linux | `.AppImage` / `.deb` |

## Run from source & build

```sh
npm install
npm start        # run from source
npm run dist     # build installer for the current platform
```

Pushing a `v*` tag triggers GitHub Actions to build and publish a Release on all three platforms.

## Data directory

The Node.js runtime, dsh installation, logs, and state files live in the app's user data directory (macOS: `~/Library/Application Support/dsh-desktop`, Windows: `%APPDATA%/dsh-desktop`, Linux: `~/.config/dsh-desktop`).

## License

MIT
