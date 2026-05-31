@echo off
setlocal
chcp 65001 >nul

set "NECK_AGENT_HOME=%~dp0"
pushd "%NECK_AGENT_HOME%" >nul

set "PYTHON_CMD="
where py >nul 2>nul && set "PYTHON_CMD=py -3"
if not defined PYTHON_CMD where python >nul 2>nul && set "PYTHON_CMD=python"
if not defined PYTHON_CMD (
  echo [Neck] Python was not found. Install Python 3 or add it to PATH.
  popd >nul
  exit /b 1
)

%PYTHON_CMD% agent.py %*
set "EXIT_CODE=%ERRORLEVEL%"

popd >nul
exit /b %EXIT_CODE%
