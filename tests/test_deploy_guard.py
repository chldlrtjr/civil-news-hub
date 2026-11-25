"""서버 배포 잠금(server/deploy_guard.sh, deploy.sh)을 임시 git 저장소로 확인해요.
데이터만 바뀐 커밋은 받고, 코드가 바뀐 커밋은 승인 전까지 막고 한 번만 알리는지."""
import os
import re
import shutil
import subprocess

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASH = shutil.which("bash")
pytestmark = pytest.mark.skipif(not BASH, reason="bash 필요")

GIT_ENV = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True,
                          env={**os.environ, **GIT_ENV}).stdout.strip()


def write(repo, path, text):
    full = os.path.join(repo, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def commit_push(pc, files, msg):
    for path, text in files.items():
        write(pc, path, text)
    git(pc, "add", "-A")
    git(pc, "commit", "-q", "-m", msg)
    git(pc, "push", "-q", "origin", "HEAD:main")
    return git(pc, "rev-parse", "HEAD")


@pytest.fixture
def repos(tmp_path):
    origin, pc, server = (str(tmp_path / n) for n in ("origin.git", "pc", "server"))
    git(str(tmp_path), "init", "-q", "--bare", "-b", "main", origin)
    git(str(tmp_path), "clone", "-q", origin, pc)
    git(pc, "checkout", "-q", "-b", "main")
    for name in ("deploy.sh", "server/deploy_guard.sh"):
        with open(os.path.join(ROOT, name), encoding="utf-8") as f:
            write(pc, name, f.read().replace("\r\n", "\n"))
    commit_push(pc, {"data/news.json": "[]", "app.py": "print(1)\n", "static/cnh_data_bundle.js": "x"}, "init")
    git(str(tmp_path), "clone", "-q", origin, server)
    env = {**os.environ, **GIT_ENV,
           "CNH_APPROVED_FILE": str(tmp_path / "approved"),
           "CNH_BLOCK_STATE_FILE": str(tmp_path / "block_state"),
           "CNH_NOTIFY_CMD": "echo"}
    return pc, server, env, tmp_path


def guard(server, env, *args):
    return subprocess.run([BASH, "server/deploy_guard.sh", *args], cwd=server, env=env,
                          capture_output=True, text=True, encoding="utf-8")


def test_data_only_commit_deploys(repos):
    pc, server, env, _ = repos
    sha = commit_push(pc, {"data/news.json": "[1]", "static/cnh_data_bundle.js": "y"}, "data")
    r = guard(server, env, "check_remote")
    assert r.returncode == 0, r.stderr
    assert git(server, "rev-parse", "HEAD") == sha


def test_code_commit_blocked_and_alerted_once(repos):
    pc, server, env, _ = repos
    before = git(server, "rev-parse", "HEAD")
    sha = commit_push(pc, {"app.py": "import os; os.system('curl evil')\n", "data/news.json": "[2]"}, "evil")
    first = guard(server, env, "check_remote")
    assert git(server, "rev-parse", "HEAD") == before
    assert sha in first.stdout and "app.py" in first.stdout
    second = guard(server, env, "check_remote")
    assert second.returncode == 0 and "approve_deploy" not in second.stdout  # 같은 해시는 다시 알리지 않아요


def test_code_change_hidden_behind_later_data_commit_still_blocked(repos):
    pc, server, env, _ = repos
    before = git(server, "rev-parse", "HEAD")
    commit_push(pc, {"server/crontab.txt": "* * * * * evil\n"}, "evil")
    commit_push(pc, {"data/news.json": "[3]"}, "data on top")
    guard(server, env, "check_remote")
    assert git(server, "rev-parse", "HEAD") == before


def test_symlink_in_data_blocked(repos):
    pc, server, env, _ = repos
    blob = subprocess.run(["git", "hash-object", "-w", "--stdin"], cwd=pc, input="../.env",
                          capture_output=True, text=True, check=True).stdout.strip()
    git(pc, "update-index", "--add", "--cacheinfo", f"120000,{blob},data/contests.json")
    git(pc, "commit", "-q", "-m", "link")
    git(pc, "push", "-q", "origin", "HEAD:main")
    sha = git(pc, "rev-parse", "HEAD")
    git(server, "fetch", "-q", "origin", "main")
    assert guard(server, env, "may_deploy", sha).returncode != 0


def test_deploy_sh_needs_approval_for_code_and_resets_to_exact_hash(repos):
    pc, server, env, tmp_path = repos
    code = commit_push(pc, {"app.py": "print(2)\n"}, "my change")
    later = commit_push(pc, {"app.py": "print('later, unchecked')\n"}, "pushed after the check")
    git(server, "fetch", "-q", "origin", "main")
    deploy = lambda sha: subprocess.run([BASH, "deploy.sh", sha], cwd=server, env=env, capture_output=True, text=True)
    assert deploy(code).returncode == 3  # 승인 전
    assert deploy("").returncode == 2    # 해시 없이 부르면 거절
    (tmp_path / "approved").write_text(code + "\n")
    r = deploy(code)
    assert r.returncode == 0, r.stdout + r.stderr
    assert git(server, "rev-parse", "HEAD") == code != later  # origin/main 이 아니라 검사한 그 해시
    # 승인한 코드 위의 데이터 커밋은 다시 자동으로 받아요
    data = commit_push(pc, {"app.py": "print(2)\n", "data/news.json": "[4]"}, "data after approval")
    guard(server, env, "check_remote")
    assert git(server, "rev-parse", "HEAD") == data


def test_collect_commits_only_touch_data_paths():
    # cron_scrape.sh 와 비상 수집(daily_crawl.yml)이 올리는 파일이 감시기의 '데이터' 범위 안이어야 자동으로 받아요
    rule = re.compile(r"^(data/.+|static/cnh_data_bundle\.js)$")
    for name in ("cron_scrape.sh", ".github/workflows/daily_crawl.yml", "build_digest.sh"):
        with open(os.path.join(ROOT, name), encoding="utf-8") as f:
            adds = re.findall(r"git add ([^\n>]+)", f.read())
        paths = [p for line in adds for p in line.split()]
        assert paths and all(rule.match(p) for p in paths), (name, paths)
