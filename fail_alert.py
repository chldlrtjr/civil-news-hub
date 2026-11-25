"""cron_scrape.sh 실패 알림 판정.

규칙: 같은 실패 목록이 2회 연속이면 알림 1번(목록이 바뀌면 새 목록으로 다시 2회 연속일 때),
알림을 보낸 실패가 모두 풀리면 복구 알림 1번. 한 번만 실패하고 풀린 일시 장애는 알리지 않아요.

상태 파일 두 줄: 지난 회차 실패 목록 / 마지막으로 알린 실패 목록.
(예전 한 줄 형식은 '그 목록을 이미 알렸다'로 읽어요)

사용: python fail_alert.py check STATE "실패 목록"  → fail / recover / 빈 줄 출력
      python fail_alert.py sent STATE "실패 목록"   → 알림 발송 성공 기록
"""
import sys


def _read(path):
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
    except FileNotFoundError:
        return "", ""
    seen = lines[0] if lines else ""
    return seen, lines[1] if len(lines) > 1 else seen


def _write(path, seen, alerted):
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"{seen}\n{alerted}\n")


def check(path, current):
    seen, alerted = _read(path)
    _write(path, current, alerted)
    if current and current == seen and current != alerted:
        return "fail"
    if not current and alerted:
        return "recover"
    return ""


def mark_sent(path, current):
    _write(path, _read(path)[0], current)


if __name__ == "__main__":
    cmd, state, current = sys.argv[1], sys.argv[2], sys.argv[3]
    if cmd == "check":
        print(check(state, current))
    elif cmd == "sent":
        mark_sent(state, current)
    else:
        sys.exit(f"unknown command: {cmd}")
