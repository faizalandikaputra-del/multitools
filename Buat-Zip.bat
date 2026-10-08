@echo off
setlocal
cd /d "%~dp0"
color 0B
title Buat Zip - MultiTool
echo ==========================================
echo  BUAT ZIP BERSIH UNTUK DIBAGIKAN
echo ==========================================
echo.

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(ConvertFrom-Json ([IO.File]::ReadAllText('version.json').TrimStart([char]0xFEFF))).version"`) do set "VER=%%v"
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path"`) do set "OUTDIR=%%d"
if not defined OUTDIR set "OUTDIR=%USERPROFILE%\Downloads"
set "OUT=%OUTDIR%\MultiTool-%VER%.zip"
set "TMPD=%TEMP%\mt_share_%RANDOM%"

echo Versi : %VER%
echo Hasil : %OUT%
echo.

mkdir "%TMPD%\MultiTool" >nul 2>nul
robocopy "%~dp0." "%TMPD%\MultiTool" /E /XD .git /XF update.json changelog.txt Make-Update.bat make-update.ps1 Release-Update.bat Buat-Zip.bat Buat-Zip-Teman.bat Downgrade.bat Auto-Install.bat .gitignore .gitattributes *.zip *.mtold /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
    echo [ERROR] Gagal menyalin file.
    goto fail
)

if not exist "%~dp0Auto-Install.bat" (
    echo [ERROR] Auto-Install.bat tidak ditemukan di folder proyek.
    goto fail
)
copy /y "%~dp0Auto-Install.bat" "%TMPD%\Auto-Install.bat" >nul

if exist "%OUT%" del /q "%OUT%"
tar -a -c -f "%OUT%" -C "%TMPD%" Auto-Install.bat MultiTool
if errorlevel 1 (
    echo [ERROR] Gagal membuat zip. Pastikan Windows 10 atau lebih baru.
    goto fail
)

rmdir /s /q "%TMPD%"
color 0A
echo.
echo SELESAI. Zip ada di folder Downloads, siap dikirim ke teman.
echo Isi zip: Auto-Install.bat + folder MultiTool.
echo.
explorer /select,"%OUT%"
pause
endlocal
exit /b 0

:fail
rmdir /s /q "%TMPD%" >nul 2>nul
color 0C
echo.
pause
endlocal
exit /b 1
