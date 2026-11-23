#!/bin/bash
# 매일 08:40 KST(crontab): 아침 요약을 Codex로 만들어 data/digest.json 으로 push 해요.
# 09:00 trigger_digest.sh 가 Actions를 깨우면 Actions는 이 파일로 카드를 만들어 텔레그램 발송만 해요.
cd /home/ubuntu/workspace || exit 1
LOG=/home/ubuntu/workspace/cron_scrape.log
echo "[$(date '+%F %T')] 아침 요약 만들기 (Codex)" >> "$LOG"
venv/bin/python3 daily_digest.py --build >> "$LOG" 2>&1 || { echo "  아침 요약 만들기 실패" >> "$LOG"; exit 1; }
git add data/digest.json
git diff --cached --quiet && exit 0
git commit -q -m "chore: [로컬 자동 수집] $(date '+%F') 아침 요약" >> "$LOG" 2>&1
for i in 1 2 3; do
  git push -q origin main >> "$LOG" 2>&1 && exit 0
  git pull -q --rebase origin main >> "$LOG" 2>&1
  sleep 10
done
echo "  아침 요약 push 실패" >> "$LOG"
exit 1
