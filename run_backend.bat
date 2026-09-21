@echo off
title ErgoVision Backend
cd /d "%~dp0"
echo ========================================================
echo  ErgoVision FastAPI Backend Server
echo  API Status: http://localhost:8000
echo  Swagger Docs: http://localhost:8000/docs
echo  WebSocket: ws://localhost:8000/ws/posture
echo ========================================================
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
pause
