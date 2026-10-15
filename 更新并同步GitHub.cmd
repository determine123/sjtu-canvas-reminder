@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\publish.ps1" -Message "Update extension"
if errorlevel 1 echo Update failed. Read the error above; nothing was force-pushed.
pause
