#!/bin/bash
set -e

echo "🚀 [Deploy] Civil News Hub 최신 배포를 시작합니다..."
cd /home/ubuntu/workspace

# 1. GitHub에서 최신 코드 동기화
echo "📥 1. GitHub에서 최신 코드(origin/main)를 가져옵니다..."
git fetch origin main
git reset --hard origin/main

# 서버 cron은 레포의 server/crontab.txt 가 기준 (push만으로 반영)
if [ -f server/crontab.txt ]; then
    crontab server/crontab.txt
fi

# 2. 파이썬 가상환경 패키지 확인
if [ -f "venv/bin/activate" ]; then
    echo "📦 2. 파이썬 가상환경 의존성을 점검합니다..."
    venv/bin/pip install -q -r requirements.txt
fi

echo ""
echo "✅ [Deploy] 배포가 성공적으로 완료되었습니다!"
