@echo off
cd /d "%~dp0"
echo Starting Tamarind Court Front Desk Application...

start "Tamarind Court - PHP Engine" /min cmd /c "cd /d %~dp0backend && php -S 127.0.0.1:8000 -t public public/index.php"
start "Tamarind Court - Backend (Port 8080)" cmd /k "cd /d %~dp0backend && node proxy.mjs"
start "Tamarind Court - Frontend (Port 5173)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Backend:  http://127.0.0.1:8080 (or http://192.168.1.105:8080)
echo Frontend: http://localhost:5173 (or http://192.168.1.105:5173)
echo.
echo Application is running!
ping 127.0.0.1 -n 5 >nul
