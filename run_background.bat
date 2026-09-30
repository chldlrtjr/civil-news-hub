@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Civil News Hub Background Server

echo ======================================================
echo    Civil News Hub - 백그라운드 서버 실행
echo    주소: http://localhost:8000/#news
echo ======================================================

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue; " ^
    "if (-not $conn) { " ^
    "    $py = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source; " ^
    "    if (-not $py) { $py = 'C:\Users\최익석\AppData\Local\Programs\Python\Python312\pythonw.exe' }; " ^
    "    Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine = ('\"' + $py + '\" app.py'); CurrentDirectory = (Get-Location).Path} | Out-Null; " ^
    "    Start-Sleep -Seconds 1; " ^
    "} " ^
    "Start-Process 'http://localhost:8000/#news'"

echo [OK] 백그라운드 서버가 성공적으로 구동되었습니다.
echo 이제 이 터미널 창을 닫으셔도 웹사이트는 계속 유지됩니다!
echo (서버를 종료하고 싶으실 때는 stop_server.bat 을 실행하시면 됩니다)
timeout /t 2 >nul
exit
