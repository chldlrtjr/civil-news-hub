"""PreToolUse 훅: jcloud 는 학교에서 빌린 서버라 서버 자체(계정·sudo·시스템 서비스·패키지·/etc)를 바꾸는 명령을 막아요.
우리 작업 폴더 안의 평소 일(git, approve_deploy.sh, 로그 읽기, 우리 crontab, venv 의 pip)은 그대로 허용해요.
입력: stdin 의 훅 JSON. 막을 때만 permissionDecision=deny 를 출력해요."""
import json
import re
import sys

SSH_JCLOUD = re.compile(r"\b(ssh|scp|rsync)\b[^\n]*\bjcloud\b")
FORBIDDEN = [
    (r"\bsudo\b|\bsu\s+-|\bdoas\b|\bpkexec\b", "관리자 권한(sudo)"),
    (r"\bsystemctl\s+(?:--\S+\s+)*(start|stop|restart|reload|enable|disable|mask|unmask|edit|kill|daemon-reload|set-property|link|preset)\b", "시스템 서비스 변경"),
    (r"\b(apt|apt-get|dpkg|snap|yum|dnf)\b", "시스템 패키지"),
    (r"\bnpm\s+(?:\S+\s+)*(-g|--global)\b|\bnpm\s+(?:i|install|rm|uninstall|update)\b[^\n]*\s(-g|--global)\b", "전역 npm 패키지"),
    (r"\b(useradd|userdel|usermod|adduser|deluser|groupadd|groupdel|gpasswd|passwd|chpasswd|chsh|visudo)\b", "계정·비밀번호"),
    (r"\b(reboot|shutdown|poweroff|halt|init\s+[06]|timedatectl|hostnamectl|ufw|iptables|nft|mount|umount|sysctl|modprobe)\b", "시스템 설정"),
    (r"(>\s*|\btee\b[^\n|;&]*\s|\b(cp|mv|rm|ln|install|sed\s+-i|truncate|touch)\b[^\n|;&]*\s)/(etc|usr|opt|var|boot|root|lib|bin|sbin|srv)/", "시스템 폴더 쓰기"),
    (r"\b(chmod|chown|chgrp|setfacl)\b[^\n|;&]*\s/(?!home/ubuntu/)\S", "작업 폴더 밖 권한 변경"),
    (r"\bchmod\b[^\n|;&]*\s(/home/ubuntu|~)/?(\s|$|['\"])", "홈 폴더 자체 권한 변경"),
]


def verdict(command):
    """막을 이유(한국어) 또는 None"""
    if not command or not SSH_JCLOUD.search(command):
        return None
    for pattern, why in FORBIDDEN:
        if re.search(pattern, command):
            return why
    return None


def main():
    try:
        data = json.load(sys.stdin)
    except (ValueError, OSError):
        return 0
    why = verdict(str((data.get("tool_input") or {}).get("command") or ""))
    if why:
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": f"jcloud 는 학교에서 빌린 서버라 서버 자체를 바꾸는 명령({why})은 막혀 있어요. "
                                        "작업 폴더 안의 일(git, approve_deploy.sh, 로그 읽기)만 해요. 꼭 필요하면 사용자에게 직접 하도록 안내하세요.",
        }}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
