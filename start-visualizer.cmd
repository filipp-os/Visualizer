@echo off
rem One-click launcher for the Pedro Pathing Visualizer (Windows).
rem Double-click this file. It installs dependencies the first time, starts the
rem dev server, and opens your browser. Close this window to stop the server.

cd /d "%~dp0"

title Pedro Pathing Visualizer
echo Pedro Pathing Visualizer
echo Folder: %CD%
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js / npm is not installed ^(or not on PATH^).
  echo Install the LTS version from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run - installing dependencies ^(a few minutes, only once^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. See the messages above.
    pause
    exit /b 1
  )
  echo.
)

echo Checking for updates and starting the dev server...
echo A browser tab will open automatically. Leave this window open while you
echo use the visualizer; close it to stop the server.
echo.
call npm start

echo.
echo Server stopped.
pause
