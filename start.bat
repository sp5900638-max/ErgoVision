@echo off
title ErgoVision - AI Posture Monitor
cd /d "%~dp0"

echo ========================================================
echo   ErgoVision - Integrated Real-Time Posture Monitor
echo   Starting server on http://127.0.0.1:8000 ...
echo ========================================================
echo.

:: Launch browser in background once the server starts listening
start "" cmd /c "powershell -Command ""for ($i=0; $i -lt 30; $i++) { if (Test-NetConnection -ComputerName 127.0.0.1 -Port 8000 -InformationLevel Quiet) { Start-Process 'http://127.0.0.1:8000'; break } Start-Sleep -Seconds 1 }"""

:: Start the unified FastAPI server
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
pause
