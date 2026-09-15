#!/bin/bash
set -e

# Civil News Hub - Daily Auto Scraper + Deploy (매일 07:00 KST 실행)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

LOG_FILE="$SCRIPT_DIR/cron_scrape.log"

# 로그 파일 10MB 초과 시 자동 순환 (무한 증가 방지)
if [ -f "$LOG_FILE" ] && [ "$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE")" -gt 10485760 ]; then
  mv "$LOG_FILE" "${LOG_FILE}.old"
fi

echo "" >> "$LOG_FILE"
echo "=================================================================" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] 🚀 Civil News Hub 자동 크롤링 시작" >> "$LOG_FILE"
echo "=================================================================" >> "$LOG_FILE"

# 1. 토목 뉴스 크롤링
echo "[1/5] 뉴스 수집 중 (scraper.py)..." >> "$LOG_FILE"
"$SCRIPT_DIR/venv/bin/python3" scraper.py >> "$LOG_FILE" 2>&1

# 2. 토목 공모전 전담 수집 및 요강 실사 파이프라인
echo "[2/5] 공모전 전담 수집 및 요강 실사 중 (contest_scraper.py)..." >> "$LOG_FILE"
"$SCRIPT_DIR/venv/bin/python3" contest_scraper.py >> "$LOG_FILE" 2>&1

# 3. 토목 엔지니어링 채용 공고 크롤링
echo "[3/5] 채용 공고 수집 중 (job_scraper.py)..." >> "$LOG_FILE"
"$SCRIPT_DIR/venv/bin/python3" job_scraper.py >> "$LOG_FILE" 2>&1

# 4. 전북대학교 아르바이트 공고 크롤링
echo "[4/6] 전북대 아르바이트 수집 및 정제 중 (jbnu_scraper.py)..." >> "$LOG_FILE"
"$SCRIPT_DIR/venv/bin/python3" jbnu_scraper.py >> "$LOG_FILE" 2>&1

# 5. 공모전 데이터 무결성 전수 검증 (GEMINI.md Rule 1-⑦)
echo "[5/6] 공모전 무결성 전수 검증 중 (test_contests_integrity.py)..." >> "$LOG_FILE"
"$SCRIPT_DIR/venv/bin/python3" test_contests_integrity.py >> "$LOG_FILE" 2>&1

# 6. GitHub 자동 배포 (data 변경분 commit + push → GitHub Pages 자동 반영)
echo "[6/6] GitHub 자동 배포 중..." >> "$LOG_FILE"
git add data/news.json data/contests.json data/jobs.json data/jbnu_albas.json >> "$LOG_FILE" 2>&1

if git diff --cached --quiet; then
  echo "  ℹ️  데이터 변경 없음 — push 건너뜀" >> "$LOG_FILE"
else
  COMMIT_MSG="chore: [로컬 자동 수집] $(date '+%Y-%m-%d %H:%M') 토목 뉴스, 공모전, 채용 및 알바 데이터 업데이트"
  git commit -m "$COMMIT_MSG" >> "$LOG_FILE" 2>&1

  # push 실패 시 최대 3회 재시도 (네트워크 일시 장애 대비)
  PUSH_OK=0
  for i in 1 2 3; do
    if git push origin main >> "$LOG_FILE" 2>&1; then
      PUSH_OK=1
      break
    fi
    echo "  ⚠️  push 실패 (${i}/3회) — 10초 후 재시도..." >> "$LOG_FILE"
    sleep 10
  done

  if [ "$PUSH_OK" -eq 0 ]; then
    echo "  ❌ push 3회 연속 실패 — 다음 크롤링 시 재시도됩니다." >> "$LOG_FILE"
  else
    echo "  ✅ GitHub push 성공 → GitHub Pages 자동 배포 트리거됨" >> "$LOG_FILE"
  fi
fi

echo "=================================================================" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] ✅ 전체 파이프라인 완료!" >> "$LOG_FILE"
echo "=================================================================" >> "$LOG_FILE"
