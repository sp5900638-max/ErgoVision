@echo off
title ErgoVision Frontend
cd /d "%~dp0frontend"
echo ========================================================
echo  ErgoVision React + Vite Frontend
echo  App URL: http://localhost:5173
echo ========================================================
call npm.cmd run dev
pause
