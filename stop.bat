@echo off
echo Stopping Discord Music Bot...
taskkill /F /IM python.exe /T >nul 2>&1
taskkill /F /IM uvicorn.exe /T >nul 2>&1
echo Done.
pause
