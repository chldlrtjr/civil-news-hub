#!/bin/bash
set -e

# Civil News Hub - Daily Auto Scraper (매일 07:00 KST 실행)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

LOG_FILE="$SCRIPT_DIR/cron_scrape.log"

echo "" >> "$LOG_FILE"
echo "=================================================================" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] 🚀 Civil News Hub 자동 크롤링 시작" >> "$LOG_FILE"
echo "=================================================================" >> "$LOG_FILE"

# 1. 토목 뉴스 & 공모전 크롤링
echo "[1/2] 뉴스 및 공모전 수집 중 (scraper.py)..." >> "$LOG_FILE"
"$SCRIPT_DIR/venv/bin/python3" scraper.py >> "$LOG_FILE" 2>&1

# 2. 토목 엔지니어링 채용 공고 크롤링
echo "[2/2] 채용 공고 수집 중 (job_scraper.py)..." >> "$LOG_FILE"
"$SCRIPT_DIR/venv/bin/python3" job_scraper.py >> "$LOG_FILE" 2>&1

echo "=================================================================" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] ✅ 모든 크롤링 및 데이터 갱신 완료!" >> "$LOG_FILE"
echo "=================================================================" >> "$LOG_FILE"
