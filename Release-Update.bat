@echo off
setlocal
cd /d "%~dp0"
color 0B
title Release Update MultiTool
echo ==========================================
echo  RELEASE UPDATE MULTITOOL  (1 klik)
echo ==========================================
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Git tidak ditemukan. Install Git for Windows dulu.
    goto fail
)
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Folder ini bukan repository Git.
    goto fail
)

rem jangan biarkan Git mengubah akhir baris file (penyebab checksum mismatch)
git config core.autocrlf false

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(ConvertFrom-Json ([IO.File]::ReadAllText('version.json').TrimStart([char]0xFEFF))).version"`) do set "CURVER=%%v"
echo Versi saat ini: %CURVER%
echo.
echo Notepad akan terbuka untuk mengisi changelog, satu perubahan per baris.
echo Simpan, lalu tutup Notepad untuk melanjutkan.
pause
start /wait notepad "%~dp0changelog.txt"

echo.
set "NEWVER="
set /p NEWVER=Versi baru, contoh 1.8.2 (Enter = tetap %CURVER%): 
echo.

echo [1/4] Membuat update.json ...
if "%NEWVER%"=="" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-update.ps1"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-update.ps1" -Version "%NEWVER%"
)
if errorlevel 1 goto fail

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(ConvertFrom-Json ([IO.File]::ReadAllText('version.json').TrimStart([char]0xFEFF))).version"`) do set "VER=%%v"

echo.
echo [2/4] Commit versi %VER% ...
git add -A
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Update %VER%"
    if errorlevel 1 goto fail
) else (
    echo Tidak ada perubahan baru untuk di-commit.
)

echo.
echo [3/4] Sinkron dengan GitHub ...
git pull --rebase --autostash
if errorlevel 1 (
    echo [ERROR] Pull gagal atau ada konflik. Jalankan "git status" untuk detailnya.
    goto fail
)

echo.
echo [4/4] Push ke GitHub ...
git push
if errorlevel 1 goto fail

color 0A
echo.
echo ==========================================
echo  SELESAI - versi %VER% sudah di GitHub
echo ==========================================
echo Tunggu 2-5 menit (cache GitHub), lalu cek di panel.
echo.
pause
endlocal
exit /b 0

:fail
color 0C
echo.
echo [GAGAL] Proses dihentikan. Baca pesan error di atas.
echo.
pause
endlocal
exit /b 1
