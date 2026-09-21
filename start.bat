@echo off
title ErgoVision Launcher
cd /d "%~dp0"
echo Starting ErgoVision Posture Monitor Services...
start "ErgoVision Backend" "%~dp0run_backend.bat"
start "ErgoVision Frontend" "%~dp0run_frontend.bat"
echo.
echo ========================================================
echo  Both Backend and Frontend have been launched!
echo  Open http://localhost:5173 in your browser
echo ========================================================
echo.
pause
