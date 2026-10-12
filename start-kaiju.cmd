@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missingnode
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a===24&&b>=16?0:1)"
if errorlevel 1 goto missingnode
if not exist node_modules call npm ci
if errorlevel 1 goto failed
call npm run build
if errorlevel 1 goto failed
echo.
echo Open http://127.0.0.1:4318 in your browser.
echo Press Ctrl+C here to stop the local server.
call npm start
goto end
:missingnode
echo Please install Node.js 24.16 or a newer Node 24 release.
goto failed
:failed
echo Startup could not complete. Read the error above.
pause
exit /b 1
:end
endlocal
