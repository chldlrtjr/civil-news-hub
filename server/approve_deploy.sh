#!/bin/bash
# 코드 배포는 사람이 이 명령으로만 해요 (서버 감시기는 데이터만 바뀐 커밋만 자동으로 받아요).
# PC 에서 push 한 뒤:  ssh jcloud ~/workspace/server/approve_deploy.sh $(git rev-parse HEAD)
# 해시가 origin/main 에 있는지 확인 → 승인 해시 기록(~/.cnh_approved_sha, 600) → deploy.sh <해시>
set -e
cd "$(dirname "$0")/.."
source server/deploy_guard.sh

SHA="$1"
if ! [[ "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "40자리 전체 커밋 해시를 주세요 (PC 에서 git rev-parse HEAD)"
  exit 2
fi

exec 9>/tmp/cnh_git.lock
flock -w 3000 9  # 수집·요약 push 와 차례대로

git fetch -q origin main
if ! git merge-base --is-ancestor "$SHA" FETCH_HEAD; then
  echo "그 해시는 origin/main 에 없어요. PC 에서 push 했는지 확인하세요"
  exit 3
fi

echo "배포할 커밋:"
git log --oneline -1 "$SHA"
(umask 077; echo "$SHA" > "$APPROVED_FILE")
rm -f "$BLOCK_STATE_FILE"
bash deploy.sh "$SHA"
