@echo off
setlocal
cd /d "%~dp0"
color 0E
title Downgrade MultiTool
echo ==========================================
echo  DOWNGRADE / ROLLBACK VERSI
echo ==========================================
echo Isi file kembali seperti versi lama, lalu dirilis
echo sebagai nomor versi BARU supaya panel menawarkan update.
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Git tidak ditemukan.
    goto fail
)
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Folder ini bukan repository Git.
    goto fail
)
git config core.autocrlf false

set "DIRTY="
for /f "delims=" %%i in ('git status --porcelain') do set "DIRTY=1"
if defined DIRTY (
    echo [ERROR] Ada perubahan yang belum di-commit di folder ini.
    echo Jalankan Release-Update.bat dulu, atau pindahkan perubahan itu,
    echo lalu jalankan Downgrade.bat lagi.
    goto fail
)

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(ConvertFrom-Json ([IO.File]::ReadAllText('version.json').TrimStart([char]0xFEFF))).version"`) do set "CURVER=%%v"
echo Versi saat ini: %CURVER%
echo.
echo Riwayat versi terakhir, kode di kiri:
echo ------------------------------------------
git log --oneline --grep="^Update [0-9]" -n 25
echo ------------------------------------------
echo.
set "TARGET="
set /p TARGET=Ketik KODE versi tujuan (contoh 7eafa9a), lalu Enter: 
if "%TARGET%"=="" goto cancel

git cat-file -e "%TARGET%^{commit}" >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Kode "%TARGET%" tidak ditemukan.
    goto fail
)
for /f "delims=" %%t in ('git log -1 --format^=%%s %TARGET%') do set "TSUBJ=%%t"
echo.
echo Tujuan: %TSUBJ%
echo File extension akan dikembalikan seperti itu.
echo Skrip rilis, version.json, dan changelog.txt tidak diubah.
choice /c yn /m "Lanjutkan"
if errorlevel 2 goto cancel

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "$p='%CURVER%'.Split('.'); $p[$p.Length-1]=[int]$p[$p.Length-1]+1; $p -join '.'"`) do set "SUGVER=%%v"
echo.
echo ------------------------------------------
echo  Versi saat ini  : %CURVER%
echo  Saran versi baru: %SUGVER%
echo ------------------------------------------
echo Versi baru HARUS lebih tinggi dari %CURVER%, bukan nomor lama.
set "NEWVER="
set /p NEWVER=Versi baru (Enter = %SUGVER%): 
if "%NEWVER%"=="" set "NEWVER=%SUGVER%"
if "%NEWVER%"=="%CURVER%" (
    echo [ERROR] Versi harus berbeda dan lebih tinggi dari versi saat ini.
    goto fail
)

echo.
echo [1/5] Mengembalikan file ke %TSUBJ% ...
git checkout %TARGET% -- . ":!Release-Update.bat" ":!Downgrade.bat" ":!Buat-Zip.bat" ":!make-update.ps1" ":!Auto-Install.bat" ":!.gitattributes" ":!.gitignore" ":!changelog.txt" ":!update.json" ":!version.json"
if errorlevel 1 goto fail
for /f "usebackq delims=" %%f in (`git -c core.quotepath^=false diff --name-only --diff-filter^=A %TARGET% HEAD -- . ":!Release-Update.bat" ":!Downgrade.bat" ":!Buat-Zip.bat" ":!make-update.ps1" ":!Auto-Install.bat" ":!.gitattributes" ":!.gitignore" ":!changelog.txt" ":!update.json" ":!version.json"`) do git rm -q -f -- "%%f"

> "%~dp0changelog.txt" echo Kembali ke isi %TSUBJ%
echo.
echo Notepad terbuka untuk mengecek changelog. Simpan lalu tutup.
start /wait notepad "%~dp0changelog.txt"

echo.
echo [2/5] Membuat update.json versi %NEWVER% ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-update.ps1" -Version "%NEWVER%"
if errorlevel 1 goto fail
set "VER=%NEWVER%"

echo.
echo [3/5] Commit versi %VER% ...
git add -A
git commit -m "Update %VER% (downgrade ke %TSUBJ%)"
if errorlevel 1 goto fail

echo.
echo [4/5] Sinkron dan push ke GitHub ...
git pull --rebase --autostash
if errorlevel 1 (
    echo [ERROR] Pull gagal atau ada konflik. Jalankan "git status" untuk detailnya.
    goto fail
)
git push
if errorlevel 1 goto fail

echo.
echo [5/5] Verifikasi di GitHub ...
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
for /f "delims=" %%h in ('git rev-parse HEAD') do set "LOCALH=%%h"
for /f "tokens=1" %%h in ('git ls-remote origin refs/heads/%BRANCH%') do set "REMOTEH=%%h"
if /i "%LOCALH%"=="%REMOTEH%" (
    echo Push terverifikasi: GitHub sudah menerima commit terbaru.
) else (
    echo [GAGAL] Commit di GitHub tidak sama dengan di komputer. Push belum berhasil.
    goto fail
)

color 0A
echo.
echo ==========================================
echo  SELESAI - versi %VER% dirilis dengan isi lama
echo ==========================================
echo Tunggu 2-5 menit, lalu klik Check update di panel.
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
echo Kalau sudah terlanjur mengubah file, batalkan dengan:
echo     git reset --hard HEAD
echo.
pause
endlocal
exit /b 1
