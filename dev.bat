@echo off
cd /d "%~dp0"
echo.
echo ╔══════════════════════════════════╗
echo ║   DeepSeek Code 开发者模式       ║
echo ║   Vite: http://localhost:5175    ║
echo ║   按 Ctrl+C 停止                 ║
echo ╚══════════════════════════════════╝
echo.
call npm run dev
pause
