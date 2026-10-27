#!/bin/bash
# Civil News Hub - 서버 일일 백업 (매일 04:30 KST, crontab 등록)
# git에 없는 비밀값·토큰·서버 설정과 수집 데이터를 추가 디스크(~/data)에 보관합니다.
# 복원: tar -xzf <백업파일> -C /  (경로가 절대경로로 저장되어 있음)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/data/backups}"
KEEP_DAYS=14
LOG_FILE="$SCRIPT_DIR/backup.log"

umask 077  # 백업 파일에 비밀값이 들어 있으므로 소유자만 읽기 가능
mkdir -p "$BACKUP_DIR"

STAMP="$(date '+%Y%m%d-%H%M')"
CRONTAB_DUMP="$BACKUP_DIR/.crontab.txt"
crontab -l > "$CRONTAB_DUMP" 2>/dev/null

TARGETS=(
  "$SCRIPT_DIR/.env"
  "$SCRIPT_DIR/kakao_token.json"
  "$SCRIPT_DIR/data"
  "$CRONTAB_DUMP"
  /etc/nginx/sites-available/civil-news-hub
  /etc/systemd/system/civil-*.service
)
EXISTING=()
for t in "${TARGETS[@]}"; do [ -e "$t" ] && EXISTING+=("$t"); done

ARCHIVE="$BACKUP_DIR/civil-backup-$STAMP.tar.gz"
if tar -czf "$ARCHIVE" --absolute-names "${EXISTING[@]}" 2>>"$LOG_FILE"; then
  echo "[$(date '+%F %T')] ✅ 백업 완료: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))" >> "$LOG_FILE"
else
  echo "[$(date '+%F %T')] ❌ 백업 실패" >> "$LOG_FILE"
  "$SCRIPT_DIR/venv/bin/python3" "$SCRIPT_DIR/kakao_notifier.py" --message "⚠️ [Civil News Hub] 서버 일일 백업 실패 ($(date '+%m-%d %H:%M'))

로그: ~/workspace/backup.log" >> "$LOG_FILE" 2>&1
fi
rm -f "$CRONTAB_DUMP"

# 보관 기간이 지난 백업 삭제
find "$BACKUP_DIR" -name 'civil-backup-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
