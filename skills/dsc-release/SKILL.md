---
name: dsc-release
description: >
  DeepSeek Code 版本发布完整流程。TRIGGER when: 用户说"发布新版本"、"发版"、"release"、"打包"、"构建安装包"、"做新版本"、"更新版本号"、"推送到 GitHub Release"。SKIP: 纯代码修改不涉及发布。
version: 0.1.0
---

# DeepSeek Code 发布流程

> **重要原则**：发布完成后，`latest.yml` 中的文件名必须与 GitHub Release 上的实际资产文件名**完全一致**。electron-builder 生成的 `latest.yml` 使用短横线（`-`），但 `electron-builder` 上传到 GitHub Release 时会将空格和短横线转为点号（`.`）。不修复会导致自动更新下载 404。

## 前提条件

- 代理已配置：`git config --global http.proxy socks5://127.0.0.1:7897`
- GitHub CLI (`gh`) 已登录
- 有版本号升级计划（语义化版本号）

## 发布步骤（按顺序执行）

### 1. 更新版本号

修改 `package.json` 中的 `version` 字段。例如：
```json
"version": "0.1.5",
```

### 2. 构建 + 打包

```bash
npm run build     # tsc + vite
npm run dist      # electron-builder 生成安装包
```

产物在 `release/` 目录下：
- `DeepSeek Code Setup X.X.X.exe` — 安装包
- `latest.yml` — 自动更新元数据
- `*.blockmap` — 增量更新映射

### 3. 修复 latest.yml 文件名

`npm run dist` 生成的 `latest.yml` 中文件名使用短横线（如 `DeepSeek-Code-Setup-0.1.5.exe`），但 electron-builder 上传到 GitHub Release 时实际文件名使用点号（`DeepSeek.Code.Setup.0.1.5.exe`）。**必须修复**，否则 `electron-updater` 下载 404。

修复方法（Windows PowerShell / Git Bash）：

```bash
python -c "
with open('release/latest.yml', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('DeepSeek-Code-Setup-{版本号}.exe', 'DeepSeek.Code.Setup.{版本号}.exe')
with open('release/latest.yml', 'w', encoding='utf-8') as f:
    f.write(c)
print('Fixed')
"
```

### 4. 提交代码

```bash
git add -A
git commit -m "vX.X.X: <改动摘要>"
git push
```

推送前确认：
- 版本号在 `package.json` 已更新
- 所有代码改动已 `git add`
- `release/` 目录有正确的产物

### 5. 创建 GitHub Release

```bash
gh release create vX.X.X \
  --title "DeepSeek Code vX.X.X" \
  --notes "<更新内容描述>" \
  "release/DeepSeek Code Setup X.X.X.exe" \
  "release/latest.yml"
```

## 自动更新机制说明

| 组件 | 说明 |
|------|------|
| `electron-updater` | 客户端内置，启动后 5 秒延迟检查更新 |
| `latest.yml` | 发布在 GitHub Release 上，客户端对比版本号 |
| `autoDownload: true` | v0.1.4 起默认开启，后台静默下载 |
| `autoInstallOnAppQuit: true` | 退出时安装更新 |

### 更新链路

```
客户端启动 → 5s 延迟 → 请求 latest.yml → 比较版本 → 
  新版可用 → 发送 update:available 事件 → 
  UpdateBanner 显示 + 自动下载 → download-progress 显示百分比 →
  下载完成 → update:downloaded → 用户点重启安装
```

### 注意事项

- 首次发布版本（如 v0.1.0）内没有 `setupAutoUpdater` 代码，从源码运行的版本也不会检查更新。只有通过安装包装的 v0.1.1+ 版本才会自动更新
- GitHub Release 资产文件名使用点号分隔（electron-builder 的行为），`latest.yml` 中的 `url` 和 `path` 必须匹配
- Windows 安装包文件名格式：`DeepSeek Code Setup X.X.X.exe`（本地），上传后变 `DeepSeek.Code.Setup.X.X.X.exe`
- `nsis.oneClick: false` — 允许用户选择安装目录

## 版本历史

| 版本 | 关键新增 |
|------|---------|
| 0.1.0 | 首个安装包发布 |
| 0.1.1 | 初始化模板、autoUpdater 框架 |
| 0.1.2 | 关闭弹窗、更新横幅移至侧边栏 |
| 0.1.3 | 自动静默下载 |
| 0.1.4 | 下载进度百分比 UI |

## 故障排查

**用户在旧版本上看不到更新提示**
- 检查那台电脑能否访问 GitHub（被墙则无法检查更新）
- 手动安装最新版一次，之后自动更新生效

**看到更新提示但下载失败**
- 检查 `latest.yml` 中文件名是否与 Release 资产一致
- GitHub CDN 可能有延迟（几分钟）

**下载按钮点不到**
- v0.1.2 之前 UpdateBanner 在标题栏被 `-webkit-app-region: drag` 遮挡
- 升级到 v0.1.4+ 即可解决（手动安装一次）
