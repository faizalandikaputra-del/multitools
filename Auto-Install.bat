@echo off
setlocal EnableExtensions
color 0A
title Auto-Installer / Updater MultiTool
echo ==========================================
echo  AUTO-INSTALLER / UPDATER MULTITOOL
echo ==========================================
echo.

set "EXT_ROOT=%APPDATA%\Adobe\CEP\extensions"
set "DEST_DIR=%EXT_ROOT%\MultiTool"

:: Sumber = folder tempat file .bat ini berada (jika berisi CSXS\manifest.xml),
:: atau subfolder "MultiTool" di sebelah file .bat ini.
set "SRC_DIR=%~dp0"
if "%SRC_DIR:~-1%"=="\" set "SRC_DIR=%SRC_DIR:~0,-1%"
if not exist "%SRC_DIR%\CSXS\manifest.xml" set "SRC_DIR=%SRC_DIR%\MultiTool"

if not exist "%SRC_DIR%\CSXS\manifest.xml" (
    color 0C
    echo [ERROR] File MultiTool tidak ditemukan.
    echo Letakkan file Auto-Install.bat ini di dalam folder MultiTool hasil ekstrak,
    echo atau di sebelah folder "MultiTool", lalu jalankan lagi.
    echo.
    pause
    exit /b 1
)

:: Peringatan jika After Effects masih terbuka (tidak menghentikan proses)
tasklist /FI "IMAGENAME eq AfterFX.exe" 2>nul | find /I "AfterFX.exe" >nul
if not errorlevel 1 (
    echo [!] After Effects sedang terbuka. File tetap akan disalin,
    echo     tetapi AE harus ditutup lalu dibuka lagi agar update terbaca.
    echo.
)

echo [1/3] Menerapkan Registry PlayerDebugMode...
:: Aktifkan ekstensi tanpa tanda tangan untuk semua versi CSXS (AE 2019 sampai terbaru)
FOR /L %%I IN (5,1,22) DO (
    REG ADD "HKEY_CURRENT_USER\Software\Adobe\CSXS.%%I" /v "PlayerDebugMode" /t REG_SZ /d "1" /f >nul 2>&1
    REG ADD "HKEY_CURRENT_USER\Software\Adobe\CSXS.%%I" /v "LogLevel" /t REG_SZ /d "1" /f >nul 2>&1
)
echo Registry berhasil diterapkan.
echo.

echo [2/3] Memeriksa struktur direktori...
if not exist "%EXT_ROOT%" mkdir "%EXT_ROOT%"
if exist "%DEST_DIR%\CSXS\manifest.xml" (set "MODE=UPDATE") else (set "MODE=INSTALL")
echo Mode: %MODE%
echo.

if "%MODE%"=="UPDATE" (
    echo [3/3] Ekstensi terdeteksi. Melakukan UPDATE semua file...
) else (
    echo [3/3] Ekstensi belum ada. Melakukan INSTALL BARU...
)
:: robocopy: salin semua folder + file tersembunyi (.debug), timpa yang lama.
:: Kode keluar 0-7 = sukses, 8 ke atas = gagal.
robocopy "%SRC_DIR%" "%DEST_DIR%" /E /IS /IT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP /XF Auto-Install.bat *.zip >nul
if errorlevel 8 (
    color 0C
    echo.
    echo [ERROR] Gagal menyalin file. Tutup After Effects lalu coba lagi.
    echo.
    pause
    exit /b 1
)
echo Selesai!

echo.
echo ==========================================
echo  Proses Selesai! Tutup lalu buka After Effects,
echo  kemudian: Window ^> Extensions ^> Multi Tool
echo ==========================================
pause
endlocal
