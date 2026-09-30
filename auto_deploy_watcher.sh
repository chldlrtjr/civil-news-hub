#!/bin/bash
# ==============================================================================
# Civil News Hub - GitHub main 브랜치 실시간 감시기 (Auto Deploy Watcher)
# 
# 30초마다 GitHub origin/main의 변경 사항을 체크하여,
# 새로운 커밋이 감지되면 자동으로 deploy.sh를 실행하여 무인 자동 배포합니다.
# 학교 방화벽 및 Cloudflare 터널 만료에 구애받지 않는 100% 안전한 아웃바운드 방식.
# ==============================================================================

WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$WORKSPACE_DIR"

DEPLOY_SCRIPT="$WORKSPACE_DIR/deploy.sh"
LOG_FILE="$WORKSPACE_DIR/auto_deploy.log"
CHECK_INTERVAL=60  # 체크 주기 (초) - 디스크 I/O 절감

echo "=================================================================="
echo "👀 [Auto Deploy Watcher] 실시간 자동 배포 감시기가 가동되었습니다."
echo "📂 감시 경로: $WORKSPACE_DIR (브랜치: main)"
echo "⏱️  체크 주기: ${CHECK_INTERVAL}초 (git ls-remote 경량 감시)"
echo "=================================================================="

# 로그 파일 크기 제한 (5MB 초과 시 백업 순환)
rotate_log_if_needed() {
    if [ -f "$LOG_FILE" ]; then
        LOG_SIZE=$(stat -c%s "$LOG_FILE" 2>/dev/null || stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)
        if [ "$LOG_SIZE" -gt 5242880 ]; then
            mv "$LOG_FILE" "${LOG_FILE}.old"
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🔄 로그 파일이 5MB를 초과하여 ${LOG_FILE}.old 로 순환되었습니다." >> "$LOG_FILE"
        fi
    fi
}

while true; do
    rotate_log_if_needed

    # 1. GitHub 원격 브랜치 최신 커밋 해시 경량 조회 (git ls-remote: 객체 다운로드 및 디스크 쓰기 없는 초경량 문자열 조회)
    REMOTE_HASH=$(git ls-remote origin refs/heads/main 2>/dev/null | awk '{print $1}')
    LOCAL_HASH=$(git rev-parse HEAD 2>/dev/null)

    # 2. 로컬과 원격의 최신 커밋 해시 비교
    if [ -n "$LOCAL_HASH" ] && [ -n "$REMOTE_HASH" ] && [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
        NOW=$(date '+%Y-%m-%d %H:%M:%S')

        echo ""
        echo "------------------------------------------------------------------"
        echo "[$NOW] 🚀 [신규 커밋 감지] GitHub에 새로운 변경사항이 있습니다!"
        echo "🔄 로컬: $LOCAL_HASH ➔ 원격: $REMOTE_HASH"
        echo "------------------------------------------------------------------"

        # 3. 배포 스크립트 실행 (deploy.sh 내에서 git fetch & reset 수행)
        if [ -x "$DEPLOY_SCRIPT" ] || [ -f "$DEPLOY_SCRIPT" ]; then
            bash "$DEPLOY_SCRIPT"
            DEPLOY_RESULT=$?
            if [ $DEPLOY_RESULT -eq 0 ]; then
                echo "[$NOW] ✅ 자동 배포가 성공적으로 완료되었습니다!"
            else
                echo "[$NOW] ⚠️ 자동 배포 중 오류가 발생했습니다 (코드: $DEPLOY_RESULT)."
            fi
        else
            echo "[$NOW] ❌ deploy.sh 스크립트를 찾을 수 없습니다: $DEPLOY_SCRIPT"
        fi
        echo "------------------------------------------------------------------"
        echo ""
    fi

    # 지정된 주기만큼 대기
    sleep "$CHECK_INTERVAL"
done
