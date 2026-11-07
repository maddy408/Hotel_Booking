@echo off
cd /d "%~dp0backend"
echo ========================================================
echo  Starting Tamarind Court Backend API on http://127.0.0.1:8099
echo ========================================================
C:\xampp\php\php.exe -S 127.0.0.1:8099 -t public public/index.php
pause

