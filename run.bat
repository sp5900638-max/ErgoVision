@echo off
title ErgoVision - AI Posture Monitor
cd /d "%~dp0"

echo ========================================================
echo   ErgoVision - Integrated Real-Time Posture Monitor
echo   Hosting Frontend, API, and WebSockets on one server!
echo   Opening: http://localhost:8000
echo ========================================================
echo.

:: Open the browser after 2 seconds in background
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000"

:: Start the unified server
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
pause
