---
name: dsc-release
description: DeepSeek Code 版本构建与发布流程。TRIGGER when: 用户要求发布新版本、构建安装包、创建 Release、或提到 electron-builder 打包。
---

# DeepSeek Code 发布 Skill

## 前置条件

- Windows 环境下需要**管理员权限**运行终端（winCodeSign 解压需要创建符号链接）
- `gh` CLI 已安装并登录 PeanutsDou
- 所有构建产物在 `release/` 目录下

## 发布流程

### 1. 版本号

```bash
# 修改 package.json 中的 version 字段
node -e "const p=require('./package.json');p.version='0.1.X';require('fs').writeFileSync('./package.json',JSON.stringify(p,null,2)+'\n')"
```

### 2. 构建

```bash
# 以管理员身份运行
npm run dist
```

### 3. 文件重命名（关键！）

electron-builder 产出的文件名含空格，会导致 GitHub Release 和 latest.yml 文件名不匹配。必须重命名为不含空格的简单名称：

```bash
cd release
# 重命名 exe（去掉空格）
Move-Item -LiteralPath "DeepSeek Code Setup 0.1.X.exe" -Destination "dsc-setup-0.1.X.exe"
Move-Item -LiteralPath "DeepSeek Code Setup 0.1.X.exe.blockmap" -Destination "dsc-setup-0.1.X.exe.blockmap"
```

### 4. 生成 latest.yml

文件名与 Release 上的文件名必须一致：

```powershell
$ver = "0.1.X"
$exeFile = Get-Item "release\dsc-setup-$ver.exe"
$exeHash = (Get-FileHash $exeFile.FullName -Algorithm SHA512).Hash.ToLower()
$exeSize = $exeFile.Length

$latest = @"
version: $ver
files:
  - url: dsc-setup-$ver.exe
    sha512: $exeHash
    size: $exeSize
path: dsc-setup-$ver.exe
sha512: $exeHash
releaseDate: '$(Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ")'
"@
[System.IO.File]::WriteAllText("release\latest.yml", $latest, [System.Text.Encoding]::UTF8)
```

### 5. 提交代码

```bash
git add .
git commit -m "v0.1.X: 描述改动"
git tag v0.1.X
git push origin master --tags
```

### 6. 创建 GitHub Release

```bash
gh release create v0.1.X -R PeanutsDou/deepseekcode \
  --title "v0.1.X" \
  --notes "## v0.1.X

### 改动
- xxx
- yyy" \
  release\dsc-setup-0.1.X.exe \
  release\dsc-setup-0.1.X.exe.blockmap \
  release\latest.yml
```

## 重要注意事项

| 问题 | 原因 | 解决 |
|------|------|------|
| 文件名含空格 | electron-builder 产物命名 | 重命名为短横线/点分隔 |
| latest.yml 与资产不匹配 | gh release upload 会把空格转成点 | 重命名后手动生成 latest.yml |
| 管理员权限必需 | winCodeSign 解压 macOS dylib 符号链接 | 右键管理员运行终端 |
| 国内下载慢 | GitHub 下载速度不稳定 | 后续版本加入 GH Proxy |

## 自动更新链路

```
electron-builder → .exe + latest.yml → gh release upload → GitHub Release
    ↓
用户客户端（已安装旧版） → autoUpdater.checkForUpdates()
    → 读取 latest.yml → 对比版本 → 下载 .exe → 验证 SHA512
    → update-downloaded 事件 → 用户点击安装 → quitAndInstall()
```

## 构建配置要点

`package.json` 中的 `build` 配置：

```json
{
  "build": {
    "appId": "com.peanuts.deepseekcode",
    "productName": "DeepSeek Code",
    "win": {
      "icon": "resources/icon.ico",
      "target": [{ "target": "nsis", "arch": ["x64"] }]
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    },
    "publish": {
      "provider": "github",
      "owner": "PeanutsDou",
      "repo": "deepseekcode"
    }
  }
}
```

- `win.icon` 指定应用图标（必须有，否则用默认 Electron 图标）
- `nsis.oneClick: false` 允许用户选择安装目录
- `publish.provider: "github"` 启用 electron-updater 从 GitHub Release 拉取更新
