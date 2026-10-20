@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 set "PATH=D:\node.js;%PATH%"
node scripts/player/backup-public.mjs
echo.
pause
endlocal
