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

## ⚠️ 发布前必做：开发环境验证

**在构建安装包之前，必须确认 dev 模式能正常运行！**

```bash
# 1. 启动 dev server
cd D:\douzhongjun\deepseekcode
npm run dev

# 2. 确认以下几点：
#    - Electron 窗口正常打开
#    - UI 渲染正常，不白屏
#    - 能发送消息、接收回复
#    - 功能正常（版本号显示、模型切换、session 管理等）

# 3. 确认无误后，Ctrl+C 停止 dev server，再构建
```

**永远不要不经 dev 验证就直接 `npm run dist`。** 已发生的事故：v0.1.8 未验证导致白屏。

## 前置条件

- **管理员权限**终端（winCodeSign 签名需要）
- `gh` CLI 已登录 PeanutsDou
- SSH Key `~/.ssh/peanutsDouAI.pem` 可访问服务器（111.229.84.47）
- 构建产物在 `release/` 目录

## 发布流程

### 1. 版本号

```bash
cd D:\douzhongjun\deepseekcode
node -e "const p=require('./package.json');p.version='0.1.X';require('fs').writeFileSync('./package.json',JSON.stringify(p,null,2)+'\n')"
```

### 2. 构建

以**管理员身份**运行终端（右键 → 以管理员身份运行）：

```bash
cd D:\douzhongjun\deepseekcode
npm run dist
```

### 3. 整理产物

electron-builder 产出文件名含空格，重命名：

```powershell
$ver = "0.1.X"
Move-Item -LiteralPath "release\DeepSeek Code Setup $ver.exe" -Destination "release\dsc-setup-$ver.exe" -Force
Move-Item -LiteralPath "release\DeepSeek Code Setup $ver.exe.blockmap" -Destination "release\dsc-setup-$ver.exe.blockmap" -Force
```

### 4. 生成 latest.yml

```powershell
$exe = Get-Item "release\dsc-setup-$ver.exe"
$block = Get-Item "release\dsc-setup-$ver.exe.blockmap"
$exeHash = (Get-FileHash $exe.FullName -Algorithm SHA512).Hash.ToLower()
$blockHash = (Get-FileHash $block.FullName -Algorithm SHA512).Hash.ToLower()

$latest = @"
version: $ver
files:
  - url: http://111.229.84.47/deepseekcode/dsc-setup-$ver.exe
    sha512: $exeHash
    size: $($exe.Length)
  - url: http://111.229.84.47/deepseekcode/dsc-setup-$ver.exe.blockmap
    sha512: $blockHash
    size: $($block.Length)
path: dsc-setup-$ver.exe
sha512: $exeHash
releaseDate: '$(Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ")'
"@
[System.IO.File]::WriteAllText("$pwd\release\latest.yml", $latest, [System.Text.Encoding]::UTF8)
```

### 5. 上传到服务器

```bash
scp -i ~/.ssh/peanutsDouAI.pem release\dsc-setup-$ver.exe ubuntu@111.229.84.47:/var/www/html/deepseekcode/
scp -i ~/.ssh/peanutsDouAI.pem release\dsc-setup-$ver.exe.blockmap ubuntu@111.229.84.47:/var/www/html/deepseekcode/
scp -i ~/.ssh/peanutsDouAI.pem release\latest.yml ubuntu@111.229.84.47:/var/www/html/deepseekcode/
```

清理旧版本（服务器只保留最新一个）：

```bash
ssh -i ~/.ssh/peanutsDouAI.pem ubuntu@111.229.84.47 "rm -f /var/www/html/deepseekcode/dsc-setup-旧版本号.exe*"
```

### 6. 提交代码 + Tag

```bash
git add .
git commit -m "v$ver: xxx"
git tag v$ver
git push origin master --tags
```

### 7. 创建 GitHub Release（包含 latest.yml）

**latest.yml 必须上传到 GitHub Release**。已安装旧版的用户通过 GitHub 检测到新版本，再从服务器下载。

```bash
gh release create v$ver -R PeanutsDou/deepseekcode \
  --title "v$ver" \
  --notes "## v$ver

### 改动
- xxx
- yyy

### 下载
[服务器直链](http://111.229.84.47/deepseekcode/dsc-setup-$ver.exe)" \
  release\latest.yml
```

## 服务器管理

| 项目 | 详情 |
|------|------|
| IP | 111.229.84.47 |
| 用户 | ubuntu |
| SSH Key | `~/.ssh/peanutsDouAI.pem` |
| Web 目录 | `/var/www/html/deepseekcode/` |
| 带宽 | ~3Mbps 出站 |
| 防火墙 | 端口 80 已开放（备注：dc版本管理） |


## 下载页面

公开发布链接（HTTPS，Cloudflare Tunnel，自动 HTTPS）：
```
https://keys-mark-backup-hold.trycloudflare.com/deepseekcode/
```

直连链接（HTTP，服务器 IP）：
```
http://111.229.84.47/deepseekcode/
```

页面动态读取 `latest.yml`，版本号、下载链接、文件大小均为自动展示，**发布新版本后无需手动更新页面**。

如需更换 Tunnel URL（服务器重启后可能变化），SSH 到服务器查看：
```bash
ssh -i ~/.ssh/peanutsDouAI.pem ubuntu@111.229.84.47 "grep -o 'https://[^ ]*\.trycloudflare\.com' /tmp/cf.log | tail -1"
```
## 差异更新

- 首次从手动安装迁移到自动更新 → 全量下载
- 后续自动更新 → 对比 blockmap，只下载变化部分
- blockmap 必须随安装包一起上传

## 包配置

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
