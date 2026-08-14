<p align="center">
  <img src="build/icon.png" width="120" alt="DSH Desktop" />
</p>

<h1 align="center">DSH Desktop</h1>

<p align="center">中文 | <a href="#english">English</a></p>

---

[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 的非官方桌面版，支持 macOS / Windows / Linux。

> **来源与技术说明**：本项目内容来源于官方站点 / 官方仓库 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（官方使用方式为 `npx @deepseek-ai/dsh web`），通过 **Electron + electron-builder** 打包为桌面应用，应用内嵌官方 `dsh web` 服务的 Web UI；logo 为 DeepSeek 官方 logo，版权归 DeepSeek 所有。

等价于 `npx @deepseek-ai/dsh web`，但打包成了开箱即用的桌面应用：

- **首次启动自动配置环境**：自动检测系统 Node.js（需要 22.19+ 或 24+）；没有的话自动下载内置 Node.js 运行时，然后自动安装 `@deepseek-ai/dsh`，全程可视化进度。
- **内嵌 Web UI**：安装完成后自动启动 `dsh web` 服务并内嵌在应用窗口中，下次启动直接进入。
- **无干扰界面**：主窗口无菜单栏/工具条，就像原生应用一样干净。
- **系统托盘**：关闭窗口可最小化到托盘继续运行，托盘菜单支持显示窗口、设置、检查更新、在浏览器中打开和退出。
- **系统设置**：开机自动启动、关闭窗口时最小化到托盘、启动时自动更新 dsh，均可在设置窗口中开关。
- **更新**：
  - 手动更新：设置窗口或托盘菜单点击「检查并更新 dsh」，后台自动执行安装命令，完成后自动重启服务；
  - 自动更新：开启后每次启动自动检查 `@deepseek-ai/dsh` 的 npm 新版本并升级；
  - 应用本身通过 GitHub Releases 自动更新（electron-updater）。

## 界面预览

### 内嵌 Web UI（无工具条）

![DSH Desktop 主窗口](assets/main-window.png)

### 设置与手动更新

![DSH Desktop 设置](assets/settings.png)

## 下载安装

从 [Releases](https://github.com/gatesenman/dsh-desktop/releases) 下载对应平台的安装包：

| 平台 | 安装包 |
| --- | --- |
| macOS | `.dmg`（x64 / arm64） |
| Windows | `.exe`（NSIS 安装程序） |
| Linux | `.AppImage` / `.deb` |

## 从源码运行

```sh
npm install
npm start
```

## 打包

```sh
npm run dist          # 当前平台
```

推送 `v*` 标签会触发 GitHub Actions 在三个平台上构建并发布 Release。

## 数据目录

Node.js 运行时、dsh 安装目录和状态文件保存在应用用户数据目录（macOS: `~/Library/Application Support/dsh-desktop`，Windows: `%APPDATA%/dsh-desktop`，Linux: `~/.config/dsh-desktop`）。

## License

MIT

---

<a id="english"></a>

# English

An unofficial desktop app for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness), supporting macOS / Windows / Linux.

> **Source & tech notes**: The content comes from the official site / official repository [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (officially used via `npx @deepseek-ai/dsh web`). It is packaged as a desktop app with **Electron + electron-builder**, embedding the official `dsh web` service's Web UI. The logo is the official DeepSeek logo, copyright belongs to DeepSeek.

Equivalent to `npx @deepseek-ai/dsh web`, but packaged as a ready-to-use desktop app:

- **Automatic environment setup on first launch**: detects system Node.js (requires 22.19+ or 24+); if missing, downloads a bundled Node.js runtime, then installs `@deepseek-ai/dsh` automatically, with visual progress.
- **Embedded Web UI**: starts the `dsh web` service and embeds it in the app window; subsequent launches go straight in.
- **Distraction-free UI**: no menu bar / toolbar on the main window.
- **System tray**: closing the window can minimize to tray and keep the service running; the tray menu supports show window, settings, check for updates, open in browser, and quit.
- **System settings**: launch at login, minimize to tray on close, and auto-update dsh on startup — all toggleable in the settings window.
- **Updates**:
  - Manual: click "Check and update dsh" in the settings window or tray menu; the install command runs in the background and the service restarts automatically;
  - Automatic: when enabled, checks npm for a new `@deepseek-ai/dsh` version on every launch and upgrades;
  - The app itself auto-updates via GitHub Releases (electron-updater).

## Screenshots

### Embedded Web UI (no toolbar)

![DSH Desktop main window](assets/main-window.png)

### Settings & manual update

![DSH Desktop settings](assets/settings.png)

## Download

Grab the installer for your platform from [Releases](https://github.com/gatesenman/dsh-desktop/releases):

| Platform | Installer |
| --- | --- |
| macOS | `.dmg` (x64 / arm64) |
| Windows | `.exe` (NSIS installer) |
| Linux | `.AppImage` / `.deb` |

## Run from source

```sh
npm install
npm start
```

## Build

```sh
npm run dist          # current platform
```

Pushing a `v*` tag triggers GitHub Actions to build and publish a Release on all three platforms.

## Data directory

The Node.js runtime, dsh installation, and state files live in the app's user data directory (macOS: `~/Library/Application Support/dsh-desktop`, Windows: `%APPDATA%/dsh-desktop`, Linux: `~/.config/dsh-desktop`).

## License

MIT
