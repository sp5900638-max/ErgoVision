@echo off
title ErgoSense 360 - AI Posture & Vision Monitor
cd /d "%~dp0"

echo ========================================================
echo   ErgoSense 360 - Real-Time Ergonomic & Vision Monitor
echo   Starting server on http://127.0.0.1:8000 ...
echo   App URL: http://127.0.0.1:8000
echo   API Docs: http://127.0.0.1:8000/docs
echo   Telemetry WS: ws://127.0.0.1:8000/ws/telemetry
echo ========================================================
echo.

:: Launch browser in background once the server starts listening
start "" cmd /c "powershell -Command ""for ($i=0; $i -lt 30; $i++) { if (Test-NetConnection -ComputerName 127.0.0.1 -Port 8000 -InformationLevel Quiet) { Start-Process 'http://127.0.0.1:8000'; break } Start-Sleep -Seconds 1 }"""

:: Start the unified FastAPI server
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
pause
