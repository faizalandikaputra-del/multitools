@echo off
setlocal
color 0B
title Make-Update MultiTool
echo ==========================================
echo  MAKE-UPDATE MULTITOOL  (buat update.json)
echo ==========================================
echo.
echo Versi baru diambil dari version.json. Untuk mengganti, ketik di sini
echo (mis. 1.9.0) atau langsung tekan Enter untuk memakai versi di version.json.
set "NEWVER="
set /p NEWVER=Versi baru: 
echo.
if "%NEWVER%"=="" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-update.ps1"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-update.ps1" -Version "%NEWVER%"
)
if errorlevel 1 (
    color 0C
    echo.
    echo [ERROR] Gagal membuat update.json.
)
echo.
pause
endlocal
