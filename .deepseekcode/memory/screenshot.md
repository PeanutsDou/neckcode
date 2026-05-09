---
name: Screenshot Capability
description: 通过 PowerShell 可截取当前屏幕并保存为 PNG
type: reference
---

# 屏幕截图

当前模型不支持直接看图。截图用 PowerShell 实现：

```bash
powershell.exe -c "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; \$screen = [System.Windows.Forms.Screen]::PrimaryScreen; \$bounds = \$screen.Bounds; \$bitmap = New-Object System.Drawing.Bitmap \$bounds.Width, \$bounds.Height; \$graphics = [System.Drawing.Graphics]::FromImage(\$bitmap); \$graphics.CopyFromScreen(\$bounds.X, \$bounds.Y, 0, 0, \$bounds.Size); \$bitmap.Save('screenshot.png', [System.Drawing.Imaging.ImageFormat]::Png); \$graphics.Dispose(); \$bitmap.Dispose()"
```

截图后如需看图内容，调 Qwen-VL 模型读取。
