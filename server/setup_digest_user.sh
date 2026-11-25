#!/bin/bash
# 아침 요약용 Codex 를 비밀 파일(.env·토큰·git 설정)을 못 읽는 별도 OS 사용자 digest 로 격리해요.
# root 로 한 번 실행(다시 돌려도 같은 결과):  sudo bash ~/workspace/server/setup_digest_user.sh
#  - digest: 시스템 사용자, 로그인 셸 없음, sudo 그룹 아님, 홈 700, 빈 작업 폴더 /home/digest/work
#  - /etc/sudoers.d/cnh-digest: ubuntu 는 digest 로 codex 만 비밀번호 없이 실행(visudo 검사 통과 뒤에만 설치)
#  - ubuntu 의 Codex 로그인(auth.json)을 digest 로 복사(처음 한 번만, 내용은 출력하지 않아요), 웹 검색·도구 끄기
#  - /home/ubuntu 700: digest 가 ubuntu 의 파일을 못 읽게
# 되돌리기: rm /etc/sudoers.d/cnh-digest; userdel -r digest; chmod 755 /home/ubuntu
# Codex 재로그인(이제 digest 쪽): ssh -t jcloud sudo -u digest -H codex login --device-auth
set -euo pipefail

U=digest
OWNER=ubuntu
OWNER_HOME=/home/$OWNER
CODEX_BIN=/usr/bin/codex  # daily_digest.py 의 CODEX_BIN 과 같아야 해요
SUDOERS_FILE=/etc/sudoers.d/cnh-digest

[ "$(id -u)" = 0 ] || { echo "root 로 실행하세요: sudo bash $0"; exit 1; }
[ -x "$CODEX_BIN" ] || { echo "$CODEX_BIN 이 없어요"; exit 1; }

# 1. 사용자와 빈 작업 폴더
id "$U" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/home/$U" --shell /usr/sbin/nologin "$U"
if id -nG "$U" | tr ' ' '\n' | grep -qx sudo; then gpasswd -d "$U" sudo; fi
chmod 700 "/home/$U"
install -d -m 700 -o "$U" -g "$U" "/home/$U/work" "/home/$U/.codex"
find "/home/$U/work" -mindepth 1 -delete

# 2. Codex 로그인: 처음 한 번만 복사(재로그인한 digest 쪽 로그인을 덮어쓰지 않게)
if [ ! -s "/home/$U/.codex/auth.json" ]; then
  install -m 600 -o "$U" -g "$U" "$OWNER_HOME/.codex/auth.json" "/home/$U/.codex/auth.json"
fi
# 글을 글로 바꾸는 일만 하니 웹 검색과 도구를 꺼요(codex-cli 0.169: web_search 값은 disabled|cached|indexed|live)
cat > "/home/$U/.codex/config.toml" <<'TOML'
web_search = "disabled"

[features]
shell_tool = false
apps = false
plugins = false
browser_use = false
browser_use_external = false
computer_use = false
image_generation = false
multi_agent = false
memories = false
TOML
chown "$U:$U" "/home/$U/.codex/config.toml"
chmod 600 "/home/$U/.codex/config.toml"

# 3. sudoers 한 줄: 검사를 통과한 파일만 설치
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
echo "$OWNER ALL=($U) NOPASSWD: $CODEX_BIN" > "$tmp"
chmod 440 "$tmp"
visudo -cf "$tmp" >/dev/null
install -m 440 -o root -g root "$tmp" "$SUDOERS_FILE"
# 전체 설정이 깨지면 sudo 를 아예 못 쓰게 되니, 그때는 방금 넣은 파일을 바로 빼요
visudo -c >/dev/null || { rm -f "$SUDOERS_FILE"; echo "sudoers 전체 검사 실패: $SUDOERS_FILE 를 다시 뺐어요"; exit 1; }

# 4. ubuntu 홈 잠그기 (지금 755)
chmod 700 "$OWNER_HOME"

echo "digest 사용자 준비 완료: $(id "$U"), 홈 $(stat -c %a "/home/$U"), $OWNER 홈 $(stat -c %a "$OWNER_HOME"), $SUDOERS_FILE $(stat -c %a "$SUDOERS_FILE")"
