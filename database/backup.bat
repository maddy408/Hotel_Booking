@echo off
REM Daily mysqldump backup for the tamarind_court database (Windows / XAMPP).
REM Schedule with Windows Task Scheduler, e.g. daily at 2:00 AM:
REM   schtasks /create /tn "TamarindCourtBackup" /tr "C:\xampp\htdocs\tamarind-court\database\backup.bat" /sc daily /st 02:00
REM
REM Edit MYSQLDUMP, DB_USER, DB_PASS, DB_NAME below to match backend\.env.

setlocal

set MYSQLDUMP="C:\Program Files\MySQL\MySQL Server 9.4\bin\mysqldump.exe"
set DB_HOST=127.0.0.1
set DB_PORT=3306
set DB_USER=root
set DB_PASS=
set DB_NAME=tamarind_court
set BACKUP_DIR=%~dp0backups
set RETENTION_DAYS=14

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

for /f "tokens=2-4 delims=/ " %%a in ('date /t') do set DATESTAMP=%%c%%a%%b
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TIMESTAMP=%%a%%b

set OUT_FILE=%BACKUP_DIR%\tamarind_court_%DATESTAMP%_%TIMESTAMP%.sql

%MYSQLDUMP% --host=%DB_HOST% --port=%DB_PORT% --user=%DB_USER% --password=%DB_PASS% --single-transaction --routines --triggers %DB_NAME% > "%OUT_FILE%"

echo Backup written to %OUT_FILE%

REM Prune backups older than RETENTION_DAYS days.
forfiles /p "%BACKUP_DIR%" /m tamarind_court_*.sql /d -%RETENTION_DAYS% /c "cmd /c del @path" 2>nul

endlocal
