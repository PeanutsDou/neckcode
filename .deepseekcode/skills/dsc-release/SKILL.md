---
name: dsc-release
description: DeepSeek Code 版本构建与发布流程。TRIGGER when: 用户要求发布新版本、构建安装包、创建 Release、或提到 electron-builder 打包。
---

# DeepSeek Code 发布 Skill

## 架构总览

```
构建（本地） → 上传到自建服务器 → 创建 GitHub Release（仅 changelog）
                    ↘                          ↙
          latest.yml 同时上传服务器 + GitHub
                    ↓
      用户客户端 → 检测更新 → 从服务器下载安装包
```

| 组件 | 角色 | URL |
|------|------|-----|
| 自建服务器（nginx） | 安装包分发 | http://111.229.84.47/deepseekcode/ |
| GitHub Release | 版本历史 & changelog | https://github.com/PeanutsDou/deepseekcode/releases |

## 前置条件

- **管理员权限**终端（winCodeSign 签名需要）
- `gh` CLI 已登录 PeanutsDou
- SSH Key `~/.ssh/peanutsDouAI.pem` 可访问服务器（111.229.84.47）
- 构建产物在 `release/` 目录

## 发布流程

### 1. 版本号

```bash
npm version minor  # 或 npm version patch，或手动改 package.json
```

### 2. 构建

以**管理员身份**运行终端（右键 → 以管理员身份运行）：

```bash
cd D:\douzhongjun\deepseekcode
npm run dist
```

### 3. 整理产物

electron-builder 产出文件名含空格，重命名：

```bash
cd D:\douzhongjun\deepseekcode
$ver = "0.1.X"
$exeFile = "release\DeepSeek Code Setup $ver.exe"
$blockFile = "release\DeepSeek Code Setup $ver.exe.blockmap"
Move-Item -LiteralPath $exeFile -Destination "release\dsc-setup-$ver.exe" -Force
Move-Item -LiteralPath $blockFile -Destination "release\dsc-setup-$ver.exe.blockmap" -Force
```

### 4. 生成 latest.yml

必须包含 exe 和 blockmap 两个文件条目（差异更新需要 blockmap）：

```powershell
$ver = "0.1.X"
$exe = Get-Item "release\dsc-setup-$ver.exe"
$block = Get-Item "release\dsc-setup-$ver.exe.blockmap"
$exeHash = (Get-FileHash $exe.FullName -Algorithm SHA512).Hash.ToLower()
$blockHash = (Get-FileHash $block.FullName -Algorithm SHA512).Hash.ToLower()

$latest = @"
version: $ver
files:
  - url: dsc-setup-$ver.exe
    sha512: $exeHash
    size: $($exe.Length)
  - url: dsc-setup-$ver.exe.blockmap
    sha512: $blockHash
    size: $($block.Length)
path: dsc-setup-$ver.exe
sha512: $exeHash
releaseDate: '$(Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ")'
"@
[System.IO.File]::WriteAllText("release\latest.yml", $latest, [System.Text.Encoding]::UTF8)
```

### 5. 上传到服务器

```bash
scp -i ~/.ssh/peanutsDouAI.pem release\dsc-setup-$ver.exe ubuntu@111.229.84.47:/var/www/html/deepseekcode/
scp -i ~/.ssh/peanutsDouAI.pem release\dsc-setup-$ver.exe.blockmap ubuntu@111.229.84.47:/var/www/html/deepseekcode/
scp -i ~/.ssh/peanutsDouAI.pem release\latest.yml ubuntu@111.229.84.47:/var/www/html/deepseekcode/
```

验证：
```bash
ssh -i ~/.ssh/peanutsDouAI.pem ubuntu@111.229.84.47 "ls -la /var/www/html/deepseekcode/"
```

### 6. 提交代码 + Tag

```bash
git add .
git commit -m "v$ver: xxx"
git tag v$ver
git push origin master --tags
```

### 7. 上传 latest.yml 到 GitHub（关键！）

**这一步不能省。** 已经安装旧版的用户从 GitHub 检测更新，读到 latest.yml 后从服务器下载。

```bash
gh release upload v$ver -R PeanutsDou/deepseekcode release\latest.yml --clobber
```

### 8. 创建 GitHub Release（仅 changelog）

不传安装包（服务器才是分发源）：

```bash
gh release create v$ver -R PeanutsDou/deepseekcode \
  --title "v$ver" \
  --notes "## v$ver

### 改动
- xxx
- yyy

### 下载
[服务器直链](http://111.229.84.47/deepseekcode/dsc-setup-$ver.exe)"
```

## 服务器管理

### Nginx 配置

默认 `/var/www/html/deepseekcode/` 即服务目录，已配置好。

### 清理旧版本

发布新版本后，可 SSH 到服务器删除旧 exe：

```bash
ssh -i ~/.ssh/peanutsDouAI.pem ubuntu@111.229.84.47 "rm /var/www/html/deepseekcode/dsc-setup-oldver.exe"
```

### 带宽

服务器为腾讯云轻量，约 3Mbps 出站带宽。133MB 安装包下载约 6 分钟。

## 差异更新说明

- 首次跨分发通道的更新（如手动安装 → 自动更新通道）为全量下载
- 后续自动更新自动使用 blockmap 差异，仅下载变化部分
- 差异越小（如只改 README），更新越快

## 构建配置

`package.json` 中 `build` 字段：

```json
{
  "win": {
    "target": [{ "target": "nsis", "arch": ["x64"] }],
    "icon": "resources/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true
  },
  "publish": {
    "provider": "generic",
    "url": "http://111.229.84.47/deepseekcode/"
  }
}
```

## 自动更新链路

```
autoUpdater.checkForUpdates()
  → 读取 generic provider url → http://111.229.84.47/deepseekcode/latest.yml
  → 对比版本 → 有新版本？
    → 下载 dsc-setup-newver.exe（全量） 或 差异更新（blockmap 对比）
    → 验证 SHA512
    → update-downloaded 事件
    → 用户点击安装 → quitAndInstall()
```
