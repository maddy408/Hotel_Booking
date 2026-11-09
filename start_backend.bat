@echo off
cd /d "%~dp0backend"
echo ========================================================
echo  Starting Tamarind Court Backend API on port 8099
echo ========================================================
C:\xampp\php\php.exe -S 0.0.0.0:8099 -t public public/index.php
pause
