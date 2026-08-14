<p align="center">
  <img src="build/icon.png" width="120" alt="DSH Desktop" />
</p>

<h1 align="center">DSH Desktop</h1>

<p align="center"><a href="#中文">中文</a> | <a href="#english">English</a></p>

## 界面预览 / Screenshots

首次启动自动安装（环境检测 → 下载 Node.js → 安装 dsh → 启动服务） / First-launch automatic setup:

![首次启动安装 / First-launch setup](assets/setup.png)

内嵌 Web UI，无标题栏/菜单栏，沉浸式窗口 / Embedded Web UI, frameless immersive window:

![主窗口 / Main window](assets/main-window.png)

设置（开机自启、最小化到托盘、自动更新、检查并更新 dsh、重启服务、打开数据目录、查看日志） / Settings (auto-start, tray, updates, restart service, logs):

![设置 / Settings](assets/settings.png)

控制台日志（实时查看、复制、导出） / Console logs (live view, copy, export):

![控制台日志 / Console logs](assets/logs.png)

---

<a id="中文"></a>

# 中文

[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 的非官方桌面版，支持 macOS / Windows / Linux。

这是一个适合不会编程的小朋友的**一键安装使用版本**：不需要命令行、不需要自己装 Node.js，下载安装包双击打开，应用会自动完成全部环境配置并直接进入界面。

> **来源与技术说明**：应用通过 npm 安装官方公开发布的 [`@deepseek-ai/dsh`](https://github.com/deepseek-ai/deepseek-harness)（官方使用方式为 `npx @deepseek-ai/dsh web`），通过 **Electron + electron-builder** 打包为桌面应用，内嵌官方 `dsh web` 服务的 Web UI，未复制或修改官方源码。

## 功能

- **首次启动自动配置环境**：自动检测系统 Node.js（需要 22.19+ 或 24+）；没有的话自动下载内置 Node.js 运行时，然后自动安装 `@deepseek-ai/dsh`，全程可视化分步进度。
- **内嵌 Web UI**：安装完成后自动启动 `dsh web` 服务并内嵌在应用窗口中，下次启动直接进入。
- **无干扰界面**：主窗口无标题栏、无菜单栏/工具条（沉浸式窗口，保留原生窗口控制按钮），并记住窗口大小、位置和最大化状态。
- **系统托盘**：关闭窗口可最小化到托盘继续运行（首次会有系统通知提示），托盘菜单支持显示窗口、设置、检查更新、在浏览器中打开和退出。
- **系统设置**：开机自动启动、关闭窗口时最小化到托盘、启动时自动更新 dsh，均可在设置窗口中开关；可一键打开数据目录。
- **控制台日志**：设置或托盘菜单可打开日志窗口，实时查看应用与 dsh 服务运行日志，支持一键复制和导出到文件。
- **重启服务**：设置或托盘菜单一键重启内置 dsh 服务，无需重启应用。
- **更新**：手动点击「立即检查并更新 dsh」后台执行安装并自动重启服务；开启自动更新后每次启动自动升级 `@deepseek-ai/dsh`；应用本身通过 GitHub Releases 自动更新（electron-updater）。

## 下载安装

从 [Releases](https://github.com/gatesenman/dsh-desktop/releases) 下载对应平台的安装包：

| 平台 | 安装包 |
| --- | --- |
| macOS | `.dmg`（x64 / arm64） |
| Windows | `.exe`（NSIS 安装程序） |
| Linux | `.AppImage` / `.deb` |

## 从源码运行与打包

```sh
npm install
npm start        # 从源码运行
npm run dist     # 打包当前平台安装包
```

推送 `v*` 标签会触发 GitHub Actions 在三个平台上构建并发布 Release。

## 数据目录

Node.js 运行时、dsh 安装目录和状态文件保存在应用用户数据目录（macOS: `~/Library/Application Support/dsh-desktop`，Windows: `%APPDATA%/dsh-desktop`，Linux: `~/.config/dsh-desktop`）。

---

<a id="english"></a>

# English

An unofficial desktop app for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness), supporting macOS / Windows / Linux.

A **one-click install-and-use edition** built for people who don't code: no command line, no manual Node.js setup — download the installer, double-click, and the app configures everything automatically and takes you straight to the UI.

> **Source & tech notes**: The app installs the officially published [`@deepseek-ai/dsh`](https://github.com/deepseek-ai/deepseek-harness) package from npm (officially used via `npx @deepseek-ai/dsh web`), packaged with **Electron + electron-builder**, embedding the official `dsh web` service's Web UI. No official source code is copied or modified.

## Features

- **Automatic environment setup on first launch**: detects system Node.js (requires 22.19+ or 24+); if missing, downloads a bundled Node.js runtime, then installs `@deepseek-ai/dsh` automatically, with step-by-step visual progress.
- **Embedded Web UI**: starts the `dsh web` service and embeds it in the app window; subsequent launches go straight in.
- **Distraction-free UI**: frameless main window with no title bar, menu bar, or toolbar (native window controls kept); window size, position, and maximized state are remembered.
- **System tray**: closing the window can minimize to tray and keep the service running (a one-time system notification explains this); the tray menu supports show window, settings, check for updates, open in browser, and quit.
- **System settings**: launch at login, minimize to tray on close, and auto-update dsh on startup — all toggleable in the settings window; one click opens the data directory.
- **Console logs**: open the log window from settings or the tray menu to watch app and dsh service logs live, with one-click copy and export to file.
- **Restart service**: restart the embedded dsh service with one click from settings or the tray menu, without restarting the app.
- **Updates**: manual "Check and update dsh" runs the install in the background and restarts the service; when auto-update is on, `@deepseek-ai/dsh` is upgraded on every launch; the app itself auto-updates via GitHub Releases (electron-updater).

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

The Node.js runtime, dsh installation, and state files live in the app's user data directory (macOS: `~/Library/Application Support/dsh-desktop`, Windows: `%APPDATA%/dsh-desktop`, Linux: `~/.config/dsh-desktop`).

## License

MIT
