@echo off
cd /d "%~dp0backend"
echo ========================================================
echo  Starting Tamarind Court Backend API on port 8080
echo ========================================================
php -S 0.0.0.0:8080 -t public public/index.php
pause
