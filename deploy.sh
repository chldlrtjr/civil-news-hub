#!/bin/bash
# 서버를 <커밋 해시> 로 맞춰요. 감시기(데이터만 바뀐 커밋)와 server/approve_deploy.sh(사람이 승인한 코드)만 불러요.
# 검사한 바로 그 해시로 reset 해서, 검사와 배포 사이에 main 이 바뀌어도 검사 안 한 커밋이 들어오지 않아요
set -e
cd "$(dirname "$0")"
source server/deploy_guard.sh

TARGET="$1"
if [ -z "$TARGET" ]; then
  echo "사용법: deploy.sh <커밋 해시>  (코드 배포는 server/approve_deploy.sh <해시>)"
  exit 2
fi
if ! may_deploy "$TARGET"; then
  echo "[Deploy] $TARGET 은 코드가 바뀌었는데 승인되지 않아 배포하지 않아요"
  exit 3
fi

echo "[Deploy] $TARGET 으로 맞춰요..."
git reset -q --hard "$TARGET"

# 서버 cron은 레포의 server/crontab.txt 가 기준 (push만으로 반영)
if [ -f server/crontab.txt ]; then
    crontab server/crontab.txt
fi

# 파이썬 가상환경 패키지 확인
if [ -f "venv/bin/activate" ]; then
    echo "[Deploy] 파이썬 가상환경 의존성을 점검합니다..."
    venv/bin/pip install -q -r requirements.txt
fi

echo "[Deploy] 배포가 끝났어요"
