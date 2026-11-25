#!/bin/bash
# Civil News Hub - 서버 일일 백업 (매일 04:30 KST, crontab 등록)
# git에 없는 비밀값·토큰·서버 설정과 수집 데이터를 추가 디스크(~/data)에 보관합니다.
# 복원: tar -xzf <백업파일> -C /  (경로가 절대경로로 저장되어 있음)
# 구글 드라이브에는 gpg 로 암호화한 .tar.gz.gpg 만 올려요(.env·카카오 토큰이 들어 있어서).
#   암호: ~/.backup_passphrase (600, 백업에 넣지 않음 — 서버를 잃어도 풀 수 있게 비밀번호 관리자에도 보관)
#   드라이브 백업 복원: gpg --batch --pinentry-mode loopback --passphrase-file ~/.backup_passphrase --decrypt <파일.gpg> > 백업.tar.gz
#   (암호 파일이 없는 새 서버에서는 gpg --decrypt <파일.gpg> > 백업.tar.gz 로 실행하면 암호를 물어봐요)

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
)
EXISTING=()
for t in "${TARGETS[@]}"; do [ -e "$t" ] && EXISTING+=("$t"); done

ARCHIVE="$BACKUP_DIR/civil-backup-$STAMP.tar.gz"
REMOTE="gdrive:civil-news-hub-backup"  # rclone(drive.file 범위): 이 폴더만 보임
PASS_FILE="${BACKUP_PASS_FILE:-$HOME/.backup_passphrase}"
alert() {
  echo "[$(date '+%F %T')] ❌ $1" >> "$LOG_FILE"
  "$SCRIPT_DIR/venv/bin/python3" "$SCRIPT_DIR/kakao_notifier.py" --message "⚠️ [Civil News Hub] $1 ($(date '+%m-%d %H:%M'))

로그: ~/workspace/backup.log" >> "$LOG_FILE" 2>&1
}
if tar -czf "$ARCHIVE" --absolute-names "${EXISTING[@]}" 2>>"$LOG_FILE"; then
  echo "[$(date '+%F %T')] ✅ 백업 완료: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))" >> "$LOG_FILE"
  ENC="$ARCHIVE.gpg"
  if [ ! -s "$PASS_FILE" ]; then
    alert "백업 암호 파일(~/.backup_passphrase)이 없어 구글 드라이브 업로드를 건너뜀"  # 평문으로는 올리지 않아요
  elif ! gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASS_FILE" \
         --symmetric --cipher-algo AES256 -o "$ENC" "$ARCHIVE" 2>>"$LOG_FILE"; then
    alert "백업 암호화 실패"
  elif rclone copy "$ENC" "$REMOTE" 2>>"$LOG_FILE"; then
    echo "[$(date '+%F %T')] ✅ 구글 드라이브 업로드 완료 (암호화)" >> "$LOG_FILE"
    rclone delete "$REMOTE" --min-age "${KEEP_DAYS}d" 2>>"$LOG_FILE"
  else
    alert "백업 구글 드라이브 업로드 실패"
  fi
  rm -f "$ENC"  # 서버 로컬 디스크에는 원본 tar.gz 만 둬요(700 폴더)
else
  alert "서버 일일 백업 실패"
fi
rm -f "$CRONTAB_DUMP"

# 보관 기간이 지난 백업 삭제
find "$BACKUP_DIR" -name 'civil-backup-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
