"""jcloud 서버 보호 훅: 서버 자체를 바꾸는 명령은 막고, 작업 폴더 안의 평소 일은 허용"""
import importlib.util
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOOK = os.path.join(ROOT, ".claude", "hooks", "jcloud_guard.py")
spec = importlib.util.spec_from_file_location("jcloud_guard", HOOK)
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

BLOCKED = [
    "ssh jcloud 'sudo -n true'",
    "ssh -t jcloud sudo passwd ubuntu",
    'ssh jcloud "sudo systemctl stop civil-auto-deploy"',
    "ssh jcloud 'systemctl --user restart foo'",
    "ssh jcloud apt-get install bubblewrap",
    "ssh jcloud 'npm install -g @openai/codex'",
    "ssh jcloud 'useradd digest'",
    "ssh jcloud 'echo x > /etc/sudoers.d/a'",
    "ssh jcloud 'cp a /usr/local/bin/b'",
    "ssh jcloud 'chmod 700 /home/ubuntu'",
    "ssh jcloud 'chmod 755 ~'",
    "ssh jcloud 'chown root /var/log/x'",
    "ssh jcloud reboot",
]
ALLOWED = [
    "ssh jcloud 'cd ~/workspace && git log --oneline -3'",
    "ssh jcloud ~/workspace/server/approve_deploy.sh 24e08eb4d34da7170b004f33b311c088b783154a",
    "ssh jcloud 'tail -5 ~/workspace/cron_scrape.log; cat /etc/os-release'",
    "ssh jcloud 'cd ~/workspace && crontab server/crontab.txt && venv/bin/pip install -r requirements.txt'",
    "ssh jcloud 'systemctl status civil-auto-deploy; systemctl is-active civil-auto-deploy'",
    "ssh jcloud 'chmod 600 ~/workspace/.env'",
    "ssh jcloud 'chmod 600 /home/ubuntu/workspace/kakao_token.json'",
    "ssh -t jcloud codex login --device-auth",
    "sudo apt install x",  # jcloud 가 아닌 명령은 이 훅 대상 아님
    "git push origin main",
]


def test_blocks_server_level_commands():
    for c in BLOCKED:
        assert g.verdict(c), c


def test_allows_workspace_commands():
    for c in ALLOWED:
        assert g.verdict(c) is None, c


def test_hook_outputs_deny_json_only_when_blocked():
    def run(cmd):
        p = subprocess.run([sys.executable, HOOK], input=json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}}),
                           capture_output=True, text=True, encoding="utf-8")
        assert p.returncode == 0
        return p.stdout.strip()
    out = json.loads(run("ssh jcloud 'sudo -n true'"))
    assert out["hookSpecificOutput"]["permissionDecision"] == "deny"
    assert run("ssh jcloud 'cd ~/workspace && git status'") == ""
