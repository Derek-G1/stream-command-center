@echo off
setlocal
cd /d "%~dp0"
title LiteCast Broadcaster
where node >nul 2>nul || (echo Node.js 22+ is required.& pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo FFmpeg is required and must be on PATH.& pause & exit /b 1)
if not exist node_modules call npm install
if errorlevel 1 pause & exit /b 1
call npm start
pause
