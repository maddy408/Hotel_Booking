@echo off
cd /d "%~dp0backend"
echo ========================================================
echo  Starting KKK Lodge Backend API on port 8080
echo ========================================================
start "PHP Engine" /min php -S 127.0.0.1:8000 -t public public/index.php
node proxy.mjs
pause
