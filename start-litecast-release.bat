@echo off
setlocal
cd /d "%~dp0"
title LiteCast Broadcaster

where node >nul 2>nul || (
  echo Node.js 22 or newer is required.
  echo Install the current LTS from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

where ffmpeg >nul 2>nul || (
  if not defined FFMPEG_PATH (
    echo FFmpeg was not found on PATH and FFMPEG_PATH is not set.
    echo Install FFmpeg, then try again.
    pause
    exit /b 1
  )
)

if not exist "dist-server\main.js" (
  echo This is not a built LiteCast release. dist-server\main.js is missing.
  pause
  exit /b 1
)

node dist-server\main.js --open
if errorlevel 1 pause
