@echo off
setlocal

cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo Failed to install dependencies.
    exit /b 1
  )
)

echo Starting HackLab on http://127.0.0.1:3000
call npm.cmd start
