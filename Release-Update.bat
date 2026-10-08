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
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "$p='%CURVER%'.Split('.'); $p[$p.Length-1]=[int]$p[$p.Length-1]+1; $p -join '.'"`) do set "SUGVER=%%v"

echo Versi saat ini : %CURVER%
echo Saran versi baru: %SUGVER%
echo.
echo Notepad akan terbuka untuk mengisi changelog, satu perubahan per baris.
echo Simpan, lalu tutup Notepad untuk melanjutkan.
pause
start /wait notepad "%~dp0changelog.txt"

echo.
set "NEWVER="
echo ------------------------------------------
echo  Versi saat ini  : %CURVER%
echo  Saran versi baru: %SUGVER%
echo ------------------------------------------
set /p NEWVER=Versi baru (Enter = %SUGVER%): 
if "%NEWVER%"=="" set "NEWVER=%SUGVER%"
echo.

if "%NEWVER%"=="%CURVER%" (
    echo [PERHATIAN] Versi sama dengan sebelumnya. Panel tidak akan menampilkan
    echo notifikasi update kalau versinya tidak naik.
    choice /c yn /m "Tetap lanjut dengan versi yang sama"
    if errorlevel 2 goto cancel
)

echo [1/5] Membuat update.json versi %NEWVER% ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-update.ps1" -Version "%NEWVER%"
if errorlevel 1 goto fail

set "VER=%NEWVER%"

echo.
echo [2/5] Commit versi %VER% ...
git add -A
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Update %VER%"
    if errorlevel 1 goto fail
) else (
    echo Tidak ada perubahan baru untuk di-commit.
)

echo.
echo [3/5] Sinkron dengan GitHub ...
git pull --rebase --autostash
if errorlevel 1 (
    echo [ERROR] Pull gagal atau ada konflik. Jalankan "git status" untuk detailnya.
    goto fail
)

echo.
echo [4/5] Push ke GitHub ...
git push
if errorlevel 1 goto fail

echo.
echo [5/5] Verifikasi di GitHub ...
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
for /f "delims=" %%h in ('git rev-parse HEAD') do set "LOCALH=%%h"
for /f "tokens=1" %%h in ('git ls-remote origin refs/heads/%BRANCH%') do set "REMOTEH=%%h"
for /f "usebackq delims=" %%r in (`powershell -NoProfile -Command "(ConvertFrom-Json ([IO.File]::ReadAllText('version.json').TrimStart([char]0xFEFF))).repo"`) do set "REPO=%%r"
if /i "%LOCALH%"=="%REMOTEH%" (
    echo Push terverifikasi: GitHub sudah menerima commit terbaru.
) else (
    echo [GAGAL] Commit di GitHub tidak sama dengan di komputer. Push belum berhasil.
    goto fail
)
echo.
echo Isi update.json di GitHub saat ini:
curl -s "https://raw.githubusercontent.com/%REPO%/%BRANCH%/update.json?t=%RANDOM%" | findstr /c:"latest_version"
echo Seharusnya versi %VER%.
echo Kalau masih versi lama, itu cache GitHub. Tunggu 2-5 menit.

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

:cancel
echo.
echo Dibatalkan. Tidak ada yang diubah.
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
