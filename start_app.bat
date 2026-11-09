@echo off
cd /d "%~dp0"
echo Starting Tamarind Court Front Desk Application...

start "Tamarind Court - Backend (Port 8099)" cmd /c "cd /d %~dp0backend && C:\xampp\php\php.exe -S 127.0.0.1:8099 -t public public/index.php"
start "Tamarind Court - Frontend (Port 5173)" cmd /c "cd /d %~dp0frontend && npm run dev"

echo Backend:  http://127.0.0.1:8099
echo Frontend: http://localhost:5173
echo.
echo Application is running!
timeout /t 5

