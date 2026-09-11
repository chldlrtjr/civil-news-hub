@echo off
cd /d "%~dp0"
title Civil News Hub Server

echo ======================================================
echo    Civil News Hub - Server Starting...
echo    PC Browser:   http://localhost:8000/#news
echo    Mobile Phone: https://diverse-tattoo-exterior-reporting.trycloudflare.com/#news
echo    To stop the server, press Ctrl + C or close this window.
echo ======================================================
echo.

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
