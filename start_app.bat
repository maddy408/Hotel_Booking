@echo off
cd /d "%~dp0"
echo Starting Tamarind Court Front Desk Application...

start "Tamarind Court - Backend (Port 8080)" cmd /k "cd /d %~dp0backend && php -S 0.0.0.0:8080 -t public public/index.php"
start "Tamarind Court - Frontend (Port 5173)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Backend:  http://127.0.0.1:8080 (or http://10.94.9.9:8080)
echo Frontend: http://localhost:5173 (or http://10.94.9.9:5173)
echo.
echo Application is running!
ping 127.0.0.1 -n 5 >nul
