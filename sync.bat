@echo off
cd /d "%~dp0"
title Civil News Hub Sync & Deploy

echo ==================================================================
echo    Civil News Hub - 최신 데이터 수집 및 자동 배포 동기화
echo ==================================================================
echo.

echo [1/5] 최신 토목 뉴스 수집 중...
python scraper.py

echo [2/5] 토목 엔지니어링 채용 공고 수집 중...
python job_scraper.py

echo [3/6] 전북대학교 아르바이트 공고 수집 중...
python jbnu_scraper.py

echo [4/6] 전북대학교 SW중심대학사업단 프로그램 수집 중...
python swuniv_scraper.py

echo [5/6] 토목 공모전 전담 요강 수집 및 팩트 실사 중...
python contest_scraper.py

echo [6/6] 공모전 무결성 전수 검증 중...
python test_contests_integrity.py
if errorlevel 1 (
    echo.
    echo ❌ [오류] 데이터 무결성 검증에 실패하여 푸시를 중단합니다.
    powershell -ExecutionPolicy Bypass -File notify.ps1 -Title "Civil News Hub" -Message "⚠️ 데이터 무결성 검증 실패로 푸시가 중단되었습니다."
    pause
    exit /b 1
)

echo.
echo 🚀 GitHub 저장소로 변경사항 커밋 및 푸시 중...
git add data/
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "chore: [로컬 자동 수집] 최신 토목 뉴스, 채용, 공모전 및 알바 데이터 업데이트"
    git push origin main
    echo.
    echo ✅ GitHub 및 라이브 서버 동기화 완료!
    powershell -ExecutionPolicy Bypass -File notify.ps1 -Title "Civil News Hub" -Message "최신 데이터 수집 및 GitHub/서버 자동 배포가 완료되었습니다! 🚀"
) else (
    echo ℹ️ 변경된 데이터가 없습니다. (이미 최신 상태)
    powershell -ExecutionPolicy Bypass -File notify.ps1 -Title "Civil News Hub" -Message "모든 데이터가 이미 최신 상태입니다. ✨"
)

echo.
echo ==================================================================
echo    동기화 작업이 성공적으로 종료되었습니다.
echo ==================================================================
timeout /t 3 >nul
