@echo off
rem One-click launcher for the Pedro Pathing Visualizer (Windows).
rem Double-click this file. It installs dependencies the first time, starts the
rem dev server, and opens your browser. Close this window to stop the server.

cd /d "%~dp0"

title Pedro Pathing Visualizer
echo Pedro Pathing Visualizer
echo Folder: %CD%
echo.

rem Drop a nicely-iconed "Pedro Visualizer" shortcut on the Desktop the first
rem time, so from then on there's a duck icon to double-click.
set "PV_LNK=%USERPROFILE%\Desktop\Pedro Visualizer.lnk"
if not exist "%PV_LNK%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%PV_LNK%'); $s.TargetPath='%~f0'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0assets\visualizer.ico,0'; $s.Description='Pedro Pathing Visualizer'; $s.Save()" >nul 2>nul
  if exist "%PV_LNK%" echo Created a "Pedro Visualizer" shortcut on your Desktop.
  echo.
)

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
