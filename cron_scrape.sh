#!/bin/bash

# Civil News Hub - Auto Scraper + Deploy (매시간 정각 KST 실행)
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

# 단계별 실행: 한 수집기가 실패해도 나머지 단계는 계속 진행 (실패한 수집기의 JSON은 원자적 저장이라 이전 데이터 유지)
FAILED_STEPS=()
run_step() {
  local label="$1" script="$2"
  echo "$label ($script)..." >> "$LOG_FILE"
  if ! nice -n 10 "$SCRIPT_DIR/venv/bin/python3" "$script" >> "$LOG_FILE" 2>&1; then
    echo "  ❌ $script 실패" >> "$LOG_FILE"
    FAILED_STEPS+=("$script")
    return 1
  fi
}

run_step "[1/8] 뉴스 수집 중" scraper.py || true
run_step "[2/8] 공모전 수집 중 (수동 등록·전북대 공지·위비티)" contest_scraper.py || true
run_step "[3/8] 채용 공고 수집 중" job_scraper.py || true
run_step "[4/8] 전북대 아르바이트 수집 및 정제 중" jbnu_scraper.py || true
run_step "[5/8] 전북대 SW사업단 프로그램 수집 중" swuniv_scraper.py || true
run_step "[6/8] 정적 데이터 번들 컴파일 중" build_data_bundle.py || true

# 7. 공모전 데이터 무결성 전수 검증 (GEMINI.md Rule 1-⑦) — 실패 시 잘못된 데이터가 배포되지 않도록 push 중단
INTEGRITY_OK=1
run_step "[7/8] 공모전 무결성 전수 검증 중" test_contests_integrity.py || INTEGRITY_OK=0

# 8. GitHub 자동 배포 (data 변경분 commit + push → GitHub Pages 자동 반영)
echo "[8/8] GitHub 자동 배포 중..." >> "$LOG_FILE"
if [ "$INTEGRITY_OK" -eq 0 ]; then
  echo "  ⛔ 무결성 검증 실패 — 이번 회차 push 건너뜀" >> "$LOG_FILE"
else
git add data/news.json data/contests.json data/jobs.json data/work24_cache.json data/jbnu_albas.json data/swuniv_programs.json static/cnh_data_bundle.js >> "$LOG_FILE" 2>&1

if git diff --cached --quiet; then
  echo "  ℹ️  데이터 변경 없음 — push 건너뜀" >> "$LOG_FILE"
else
  COMMIT_MSG="chore: [로컬 자동 수집] $(date '+%Y-%m-%d %H:%M') 토목 뉴스, 공모전, 채용, 알바 및 번들 데이터 업데이트"
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
    FAILED_STEPS+=("git push")
  else
    echo "  ✅ GitHub push 성공 → GitHub Pages 자동 배포 트리거됨" >> "$LOG_FILE"
  fi
fi
fi

# 실패 알림: 실패 목록이 바뀔 때만 카카오톡 발송 (같은 실패로 매시간 알림이 쌓이지 않게, 복구 시 1회 알림)
FAIL_STATE_FILE="$SCRIPT_DIR/.cron_fail_state"
CURRENT_FAILS="${FAILED_STEPS[*]}"
PREV_FAILS="$(cat "$FAIL_STATE_FILE" 2>/dev/null || true)"
if [ "$CURRENT_FAILS" != "$PREV_FAILS" ]; then
  if [ -n "$CURRENT_FAILS" ]; then
    ALERT="⚠️ [Civil News Hub] 자동 수집 실패 ($(date '+%m-%d %H:%M'))

실패 단계: ${CURRENT_FAILS}

서버 로그: ~/workspace/cron_scrape.log
다른 단계는 계속 실행되며, 원인이 바뀌거나 복구되면 다시 알려드려요."
  else
    ALERT="✅ [Civil News Hub] 자동 수집 복구 ($(date '+%m-%d %H:%M'))

이전 실패(${PREV_FAILS})가 해결되어 모든 단계가 정상 동작합니다."
  fi
  if "$SCRIPT_DIR/venv/bin/python3" kakao_notifier.py --message "$ALERT" >> "$LOG_FILE" 2>&1; then
    echo "$CURRENT_FAILS" > "$FAIL_STATE_FILE"  # 발송 성공 시에만 상태 저장 → 실패하면 다음 회차에 재시도
  fi
fi

# 9. 잔여 좀비 브라우저 프로세스 정리 (메모리 고갈 방지)
pkill -f "chrome|chromium" 2>/dev/null || true

echo "=================================================================" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] ✅ 전체 파이프라인 완료!" >> "$LOG_FILE"
echo "=================================================================" >> "$LOG_FILE"
