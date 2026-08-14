# DSH Desktop

[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 的桌面版，支持 macOS / Windows / Linux。

等价于 `npx @deepseek-ai/dsh web`，但打包成了开箱即用的桌面应用：

- **首次启动自动配置环境**：自动检测系统 Node.js（需要 22.19+ 或 24+）；没有的话自动下载内置 Node.js 运行时，然后自动安装 `@deepseek-ai/dsh`，全程可视化进度。
- **内嵌 Web UI**：安装完成后自动启动 `dsh web` 服务并内嵌在应用窗口中，下次启动直接进入。
- **自动更新**：
  - 每次启动自动检查 `@deepseek-ai/dsh` 的 npm 新版本并升级，也可以在菜单「帮助 → 检查 dsh 更新」手动更新；
  - 应用本身通过 GitHub Releases 自动更新（electron-updater）。

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
