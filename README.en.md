<p align="center">
  <img src="build/icon.png" width="120" alt="DSH Desktop" />
</p>

<h1 align="center">DSH Desktop</h1>

<p align="center">
  An unofficial desktop client for <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness (dsh)</a> · macOS / Windows / Linux
</p>

<p align="center">
  <a href="https://github.com/gatesenman/dsh-desktop/releases/latest"><img src="https://img.shields.io/github/v/release/gatesenman/dsh-desktop?label=download&color=blue" alt="Release" /></a>
  <a href="https://github.com/gatesenman/dsh-desktop/releases"><img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-success" alt="Platforms" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License" /></a>
</p>

<p align="center"><a href="README.md">中文</a> | <b>English</b></p>

---

DSH Desktop packages the officially published [`@deepseek-ai/dsh`](https://github.com/deepseek-ai/deepseek-harness) into a ready-to-use desktop app: **no command line, no manual Node.js setup** — download the installer, double-click, and the app configures everything automatically and takes you straight to the UI.

> **Technical notes**: The app installs the officially published `@deepseek-ai/dsh` package from npm (officially used via `npx @deepseek-ai/dsh web`), packaged with Electron + electron-builder, embedding the official `dsh web` service's Web UI. **No official source code is copied or modified** — the desktop shell only adds peripheral enhancements (operations, tray, backup, diagnostics) and never touches Harness's internal agent, session, plugin, or permission systems.

## Download

Grab the installer for your platform from [Releases](https://github.com/gatesenman/dsh-desktop/releases):

| Platform | Installer | Notes |
| --- | --- | --- |
| macOS | `.dmg` | x64 / Apple Silicon (arm64) |
| Windows | `.exe` | NSIS installer |
| Linux | `.AppImage` / `.deb` | x64 |

The installer bundles a Node.js runtime, so first-time setup succeeds even offline or on slow networks.

## Highlights

### Zero-friction install & startup

- **Automatic first-launch setup**: detects system Node.js (22.19+ / 24+) → falls back to the **bundled Node.js runtime** → downloads automatically only as a last resort; then installs `@deepseek-ai/dsh` and starts the service, with a step-by-step animated install screen (respects the system "reduce motion" preference).
- **Instant subsequent launches**: environment setup runs only once; afterwards a lightweight splash appears and the main window opens as soon as the service is ready.
- **Single instance + self-healing**: launching again focuses the existing window; the `dsh web` service auto-restarts if it exits unexpectedly; startup failures offer one-click retry or log viewing.

### Agent inbox & scheduled tasks

- **Global-shortcut quick tasks**: press `Ctrl/Cmd+Alt+Space` anywhere to summon an input bar, type a one-line task and hit Enter — the task runs in the background through dsh's official headless mode, and a system notification fires on completion or failure.
- **Agent inbox**: a single place to review the status and results of all background tasks, with cancel (for running tasks), copy result, delete, and clear; clicking a notification opens the inbox.
- **Scheduled tasks**: create tasks that run "daily at HH:MM" or "every N hours" (e.g. summarize yesterday's working-directory changes at 9 AM every day), with enable/disable, run-now, and delete.
- Background tasks require model API credentials (configure them on the Models page of the embedded Web UI).

### Dependable operations

- **dsh version pinning with one-click rollback**: each version installs into its own directory; upgrades install into a new directory and must pass a `dsh --version` preflight before switching; the previous version is kept, the app automatically rolls back if the service fails to start after an upgrade, and manual rollback is available anytime from the tray or settings.
- **One-click backup/restore**: packs the DSH data directory (sessions, settings, credentials) and desktop preferences into a single `tar.gz`; restore asks for confirmation and validates archive paths for safety, then restarts the service. Backups contain API credentials — keep them safe.
- **Environment doctor**: generates a diagnostic report in one click (app/system/Node/dsh versions, service and port status, data-directory read/write, free disk space, proxy and npm/DeepSeek API reachability) that you can copy for troubleshooting; it contains no API keys or other sensitive values and uploads nothing.
- **Update strategy**: manual or automatic dsh updates; the app itself auto-updates via GitHub Releases (a jittered check shortly after startup, every 6 hours, and again after waking from sleep).

### Desktop experience

- **Immersive window**: no title bar or menu bar; window size, position, maximized state, and zoom level are remembered; the background follows the system light/dark theme, so pages never flash white while loading.
- **System tray**: keep running minimized to the tray; the tray menu covers the agent inbox, quick task, working-directory switching, settings, updates, rollback, doctor, backup/restore, opening a terminal (with node and dsh preconfigured on PATH), and more.
- **Working-directory switching**: pick any folder as the dsh service's working directory, with recent folders remembered and one-click restore to default.
- **Security hardening**: the service listens only on a random loopback port; the renderer runs with Node integration disabled and context isolation enabled; external links always open in the system browser.
- **Original artwork**: the app and tray icons are an originally drawn fox character, with no third-party trademark infringement risk.

## Screenshots

**First-launch install animation** (environment check → prepare Node.js → install dsh → start service):

![First-launch setup](assets/setup.png)

**Lightweight startup splash** (follows the system light/dark theme):

![Startup splash](assets/splash.png)

**Main window** (embedded official Web UI, immersive frameless design):

![Main window](assets/main-window.png)

**Agent inbox** (background task results and schedule management):

![Agent inbox](assets/inbox.png)

**Quick task** (summoned with the global shortcut `Ctrl/Cmd+Alt+Space`):

![Quick task](assets/quick.png)

**Settings** (auto-start, tray, updates, maintenance tools):

![Settings](assets/settings.png)

**Console logs** (live view, copy, export):

![Console logs](assets/logs.png)

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+Alt+Space` | Summon the quick-task input bar (global) |
| `Ctrl/Cmd+Shift+R` | Restart the dsh service |
| `Ctrl/Cmd+U` | Check for dsh updates |
| `Ctrl/Cmd` `+` / `-` / `0` | Zoom in / out / reset |

## Run from source & build

```sh
npm install
npm start        # run from source
npm run dist     # build the installer for the current platform
```

Pushing a `v*` tag triggers GitHub Actions to build and publish a Release on macOS, Windows, and Linux.

## Data directory

The Node.js runtime, versioned dsh installations, task records, logs, and state files live in the app's user data directory:

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/dsh-desktop` |
| Windows | `%APPDATA%/dsh-desktop` |
| Linux | `~/.config/dsh-desktop` |

## License

[MIT](LICENSE)
