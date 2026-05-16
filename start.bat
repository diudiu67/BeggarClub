@echo off
echo Starting Discord Music Bot...

:: Kill any existing instance first
pm2 delete discord-music >nul 2>&1

:: Start in background
pm2 start ecosystem.config.js

echo.
echo Bot is running in the background.
echo Open http://localhost:8000 in your browser.
echo.
echo To stop: run stop.bat
echo To see logs: run logs.bat
echo.
timeout /t 3 /nobreak >nul
start http://localhost:8000
