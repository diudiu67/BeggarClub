@echo off
setlocal
cd /d "%~dp0"

REM Build frontend if dist doesn't exist
if not exist "frontend\dist" (
    echo [Setup] Building frontend...
    cd frontend
    call npm install
    call npm run build
    cd ..
)

REM Install/update backend dependencies
echo [Setup] Checking backend dependencies...
pip install -r backend\requirements.txt

REM Start the server
echo.
echo [Server] Starting Discord Music Bot...
echo [Server] Web UI: http://localhost:8080
echo [Server] Press Ctrl+C to stop.
echo.
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8080

pause
