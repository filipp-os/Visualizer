@echo off
rem Force Windows to forget cached icons. Use this if the "Pedro Visualizer"
rem shortcut still shows an old / white-cornered icon after an update -- Windows
rem caches icons by path and doesn't always notice when the file changes.
rem
rem No administrator rights needed. It briefly closes Explorer windows and
rem reopens the desktop; that's normal.

echo Clearing the Windows icon cache...
ie4uinit.exe -show
taskkill /IM explorer.exe /F >nul 2>nul
del /A /Q "%localappdata%\IconCache.db" >nul 2>nul
del /A /F /Q "%localappdata%\Microsoft\Windows\Explorer\iconcache*" >nul 2>nul
start explorer.exe

echo.
echo Done. If the icon is still wrong, sign out of Windows and back in.
timeout /t 4 >nul
