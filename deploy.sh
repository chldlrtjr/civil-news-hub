#!/bin/bash
set -e

echo "🚀 [Deploy] Civil News Hub 최신 배포를 시작합니다..."
cd /home/ubuntu/workspace

# 1. GitHub에서 최신 코드 동기화
echo "📥 1. GitHub에서 최신 코드(origin/main)를 가져옵니다..."
git fetch origin main
git reset --hard origin/main

# 2. 파이썬 가상환경 패키지 확인
if [ -f "venv/bin/activate" ]; then
    echo "📦 2. 파이썬 가상환경 의존성을 점검합니다..."
    venv/bin/pip install -q -r requirements.txt
fi

# 3. 백엔드 Flask/Gunicorn 서비스 재시작
echo "🔄 3. 백엔드 서비스(civil-news-hub.service)를 재시작합니다..."
sudo systemctl restart civil-news-hub.service

# 4. Nginx 웹서버 리로드
echo "🌐 4. Nginx 리버스 프록시를 리로드합니다..."
sudo systemctl reload nginx

echo ""
echo "✅ [Deploy] 배포가 성공적으로 완료되었습니다!"
systemctl status civil-news-hub.service --no-pager -n 3
