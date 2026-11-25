#!/bin/bash
# 서버 배포 잠금: main 에 올라온 커밋 중 데이터만 바뀐 것은 자동으로 받고,
# 코드가 바뀐 것은 사람이 승인(server/approve_deploy.sh)한 해시까지만 받아요.
# (서버 토큰이 새서 main 이 오염돼도 그 코드가 서버에서 실행되지 않게)
# auto_deploy_watcher.sh·deploy.sh·build_digest.sh 가 source 해서 쓰고, 작업 폴더(저장소 맨 위)에서 불러야 해요.
# 직접 실행: bash server/deploy_guard.sh <함수> <인자...>   테스트: tests/test_deploy_guard.py

APPROVED_FILE="${CNH_APPROVED_FILE:-$HOME/.cnh_approved_sha}"        # 사람이 수동 배포할 때만 기록 (600)
BLOCK_STATE_FILE="${CNH_BLOCK_STATE_FILE:-$HOME/.cnh_deploy_block_state}"  # 같은 해시로 알림을 반복하지 않게

# <from> 에서 <to> 로 바뀐 파일이 모두 수집 데이터(data/**, static/cnh_data_bundle.js)이고
# 일반 파일(100644)이거나 지워진 것뿐이면 0. 심볼릭 링크·실행 파일, git 이 따옴표로 감싼 이상한 이름은 막아요
only_data_changed() {
  local raw
  raw="$(git diff-tree -r --no-renames "$1" "$2" 2>/dev/null)" || return 1
  [ -z "$raw" ] && return 0
  printf '%s\n' "$raw" | awk -F'\t' '
    { split($1, f, " "); mode = f[2]; path = $2
      if (path !~ /^data\// && path != "static/cnh_data_bundle.js") exit 1
      if (mode != "100644" && mode != "000000") exit 1 }'
}

# <대상 커밋> 으로 reset 해도 되면 0: 지금 HEAD 나 승인 해시와 비교해 코드가 같을 때만.
# 커밋 하나하나가 아니라 결과 트리를 비교해서 merge 커밋·되돌리기로 끼워 넣는 것도 걸러요
may_deploy() {
  local target="$1" approved
  git cat-file -e "$target^{commit}" 2>/dev/null || return 1
  only_data_changed HEAD "$target" && return 0
  approved="$(cat "$APPROVED_FILE" 2>/dev/null)"
  [ -n "$approved" ] && git merge-base --is-ancestor "$approved" "$target" 2>/dev/null \
    && only_data_changed "$approved" "$target"
}

notify() {
  if [ -n "$CNH_NOTIFY_CMD" ]; then "$CNH_NOTIFY_CMD" "$1"; else venv/bin/python3 kakao_notifier.py --message "$1"; fi
}

# 감시기 한 회차(cnh_git.lock 을 쥔 채로 불러요): 원격 main 을 받아 보고 배포하거나, 막고 카카오로 알려요
check_remote() {
  local target changed
  git fetch -q origin main || return 1
  target="$(git rev-parse FETCH_HEAD)" || return 1
  # 이미 있거나 로컬이 앞섬(수집 커밋 push 대기·재시도 중): reset 하면 못 올린 수집 커밋이 지워져요
  git merge-base --is-ancestor "$target" HEAD && return 0
  if may_deploy "$target"; then
    bash ./deploy.sh "$target"
    return
  fi
  [ "$(cat "$BLOCK_STATE_FILE" 2>/dev/null)" = "$target" ] && return 0
  changed="$(git diff-tree -r --no-renames --name-only HEAD "$target" | grep -v '^data/' | head -5 | tr '\n' ' ')"
  echo "[$(date '+%F %T')] 코드가 바뀐 커밋 ${target}: 승인 전이라 배포하지 않아요 (${changed})"
  if notify "[Civil News Hub] main 에 코드가 바뀐 커밋이 올라왔어요. 서버는 받지 않았어요.

커밋: ${target:0:12}
바뀐 파일: ${changed}

직접 올린 게 맞으면 PC 에서:
ssh jcloud ~/workspace/server/approve_deploy.sh ${target}
모르는 커밋이면 GitHub 에서 바로 확인하세요. 그동안 수집 데이터 push 도 멈춰요."; then
    (umask 077; echo "$target" > "$BLOCK_STATE_FILE")  # 보내기에 성공했을 때만: 실패하면 다음 회차에 다시 보내요
  fi
  return 0
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  "$@"
fi
