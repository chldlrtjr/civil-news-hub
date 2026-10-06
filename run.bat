@echo off
cd /d "%~dp0"
title Civil News Hub Server

set PORT=8000

echo ======================================================
echo    Civil News Hub - Server Starting...
echo    PC Browser:   http://localhost:8000/#news
echo    Mobile Phone: https://addresses-proposition-anybody-tube.trycloudflare.com/#news
echo    To stop the server, press Ctrl + C or close this window.
echo ======================================================
echo.

echo [1/2] 깃허브 원격 저장소에서 최신 실시간 데이터 동기화 중 (git pull)...
git pull origin main --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo  [+] 깃허브 최신 데이터 동기화 완료!
) else (
    echo  [*] 오프라인 또는 네트워크 지연으로 로컬 기존 데이터로 실행합니다.
)
echo.

echo [2/2] Civil News Hub 웹 서버 구동 중...
python app.py
if errorlevel 1 (
    echo.
    echo [Notice] Trying python launcher py...
    py app.py
)

if errorlevel 1 (
    echo.
    echo [ERROR] Python could not be executed. Please ensure Python is installed.
    pause
)
