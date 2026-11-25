#!/bin/bash
# ==============================================================================
# Civil News Hub - GitHub main 브랜치 감시기 (Auto Deploy Watcher, systemd civil-auto-deploy)
#
# 60초마다 origin/main 을 보고, 데이터만 바뀐 커밋(data/**, static/cnh_data_bundle.js)은 바로 받아요.
# 코드가 바뀐 커밋은 받지 않고 카카오로 알려요. 코드 배포는 사람이 PC 에서
#   ssh jcloud ~/workspace/server/approve_deploy.sh <해시>
# 로 해요. 판정 규칙은 server/deploy_guard.sh 에 있어요.
# ==============================================================================

WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$WORKSPACE_DIR"
source server/deploy_guard.sh

LOG_FILE="$WORKSPACE_DIR/auto_deploy.log"
CHECK_INTERVAL=60  # 체크 주기 (초) - 디스크 I/O 절감
# 승인 배포로 감시기 코드가 바뀌면 스스로 끝내요: systemd(Restart=always)가 새 코드로 다시 띄워요(sudo 없이)
self_sum() { cat "$0" server/deploy_guard.sh 2>/dev/null | md5sum; }
SELF_SUM="$(self_sum)"

echo "[Auto Deploy Watcher] 감시 시작: $WORKSPACE_DIR (main, ${CHECK_INTERVAL}초마다)"

# 로그 파일 크기 제한 (5MB 초과 시 백업 순환)
rotate_log_if_needed() {
    if [ -f "$LOG_FILE" ]; then
        LOG_SIZE=$(stat -c%s "$LOG_FILE" 2>/dev/null || stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)
        if [ "$LOG_SIZE" -gt 5242880 ]; then
            mv "$LOG_FILE" "${LOG_FILE}.old"
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] 로그 파일이 5MB를 초과하여 ${LOG_FILE}.old 로 순환되었습니다." >> "$LOG_FILE"
        fi
    fi
}

while true; do
    rotate_log_if_needed
    if [ "$(self_sum)" != "$SELF_SUM" ]; then
        echo "[$(date '+%F %T')] 감시기 코드가 바뀌어 다시 시작해요"
        exit 0
    fi

    # 가벼운 조회로 바뀐 게 있을 때만 받아 봐요. 이미 막고 알린 해시면 다시 받지 않아요
    REMOTE_HASH=$(git ls-remote origin refs/heads/main 2>/dev/null | awk '{print $1}')
    LOCAL_HASH=$(git rev-parse HEAD 2>/dev/null)
    if [ -n "$LOCAL_HASH" ] && [ -n "$REMOTE_HASH" ] && [ "$LOCAL_HASH" != "$REMOTE_HASH" ] \
        && [ "$REMOTE_HASH" != "$(cat "$BLOCK_STATE_FILE" 2>/dev/null)" ] \
        && ! git merge-base --is-ancestor "$REMOTE_HASH" HEAD 2>/dev/null; then
        # 수집 cron과 같은 잠금: 수집 도중 reset --hard 로 그 회차 데이터를 지우지 않게
        ( flock 9 && check_remote ) 9>/tmp/cnh_git.lock || echo "[$(date '+%F %T')] 감시 회차 실패 (코드: $?)"
    fi

    sleep "$CHECK_INTERVAL"
done
