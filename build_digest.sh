#!/bin/bash
# 매일 08:40 KST(crontab): 아침 요약을 Codex로 만들어 data/digest.json 으로 push 해요.
# 09:00 trigger_digest.sh 가 Actions를 깨우면 Actions는 이 파일로 카드를 만들어 텔레그램 발송만 해요.
# Codex 는 daily_digest.py 안에서 도구(셸·웹검색 등)를 모두 끈 채 빈 임시 폴더에서 돌아요.
cd /home/ubuntu/workspace || exit 1
source server/deploy_guard.sh
LOG=/home/ubuntu/workspace/cron_scrape.log
echo "[$(date '+%F %T')] 아침 요약 만들기 (Codex)" >> "$LOG"
venv/bin/python3 daily_digest.py --build >> "$LOG" 2>&1 || { echo "  아침 요약 만들기 실패" >> "$LOG"; exit 1; }
git add data/digest.json
git diff --cached --quiet && exit 0
git commit -q -m "chore: [로컬 자동 수집] $(date '+%F') 아침 요약" >> "$LOG" 2>&1
for i in 1 2 3; do
  git push -q origin main >> "$LOG" 2>&1 && exit 0
  git fetch -q origin main >> "$LOG" 2>&1 || { sleep 10; continue; }
  # 원격에 승인 안 된 코드 커밋이 있으면 끌어오지 않아요: rebase 하면 그 코드가 서버 작업 트리로 들어와 다음 cron 이 실행해요
  if ! may_deploy FETCH_HEAD; then
    echo "  원격에 승인 안 된 코드 커밋이 있어 아침 요약 push 를 미뤄요 (감시기가 카카오로 알려요)" >> "$LOG"
    exit 1
  fi
  # 검사한 바로 그 커밋 위로만 다시 쌓아요(pull 은 그 사이 또 바뀐 원격을 끌어올 수 있어요)
  git rebase -q "$(git rev-parse FETCH_HEAD)" >> "$LOG" 2>&1 || git rebase --abort >> "$LOG" 2>&1
  sleep 10
done
echo "  아침 요약 push 실패" >> "$LOG"
exit 1
