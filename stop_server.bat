@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Civil News Hub Server Shutdown

echo ======================================================
echo    Civil News Hub - 백그라운드 서버 종료
echo ======================================================

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$conns = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue; " ^
    "if ($conns) { " ^
    "    foreach ($conn in $conns) { " ^
    "        $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue; " ^
    "        if ($p) { " ^
    "            Write-Host ('서버 프로세스(PID: ' + $p.Id + ', 이름: ' + $p.ProcessName + ')를 종료합니다...'); " ^
    "            Stop-Process -Id $p.Id -Force; " ^
    "        } " ^
    "    } " ^
    "    Write-Host '[OK] Civil News Hub 백그라운드 서버가 성공적으로 종료되었습니다.' -ForegroundColor Green; " ^
    "} else { " ^
    "    Write-Host '[INFO] 현재 실행 중인 Civil News Hub 서버(포트 8000)가 없습니다.' -ForegroundColor Yellow; " ^
    "}"

timeout /t 2 >nul
exit
