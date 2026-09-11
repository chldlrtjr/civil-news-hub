#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
포트폴리오 문서(NOTION_PORTFOLIO_GUIDE.md) 실시간 자동 동기화 데몬
파일이 수정/저장(Ctrl+S)되는 즉시:
1. 노션(Notion) 페이지 자동 최신화
2. GitHub로 자동 git commit & push
사용자가 직접 에디터에서 고치든, AI가 고치든 100% 무인 자동 반영됩니다.
"""

import os
import sys
import time
import subprocess

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
TARGET_FILE = os.path.join(WORKSPACE_DIR, "NOTION_PORTFOLIO_GUIDE.md")
SYNC_SCRIPT = os.path.join(WORKSPACE_DIR, "sync_to_notion.py")

def run_sync():
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 📝 NOTION_PORTFOLIO_GUIDE.md 변경 감지!")
    
    # 1. 노션 동기화 실행
    print("  🚀 노션 페이지 동기화 중...")
    notion_res = subprocess.run([sys.executable, SYNC_SCRIPT], cwd=WORKSPACE_DIR, capture_output=True, text=True)
    if notion_res.returncode == 0:
        print("  ✅ 노션 페이지 자동 업데이트 완료!")
    else:
        print(f"  ❌ 노션 동기화 오류:\n{notion_res.stderr}")

    # 2. 깃허브 커밋 & 푸시
    print("  🚀 GitHub 저장소로 자동 커밋 및 푸시 중...")
    subprocess.run(["git", "add", TARGET_FILE], cwd=WORKSPACE_DIR)
    diff_check = subprocess.run(["git", "diff", "--staged", "--quiet"], cwd=WORKSPACE_DIR)
    if diff_check.returncode != 0:
        commit_msg = f"docs: [auto-sync] 포트폴리오 문서 자동 갱신 ({time.strftime('%m-%d %H:%M')})"
        subprocess.run(["git", "commit", "-m", commit_msg], cwd=WORKSPACE_DIR)
        push_res = subprocess.run(["git", "push", "origin", "main"], cwd=WORKSPACE_DIR, capture_output=True, text=True)
        if push_res.returncode == 0:
            print("  ✅ GitHub 푸시 완료!")
        else:
            print(f"  ❌ GitHub 푸시 오류:\n{push_res.stderr}")
    else:
        print("  ℹ️ GitHub에 커밋할 변경사항 없음 (이미 최신)")

def main():
    print("=" * 60)
    print("👀 포트폴리오 실시간 자동 동기화 감시기(Watcher) 시작됨")
    print(f"📁 감시 대상: {TARGET_FILE}")
    print("=" * 60)

    if not os.path.exists(TARGET_FILE):
        print("❌ 감시 대상 파일이 존재하지 않습니다.")
        sys.exit(1)

    last_mtime = os.path.getmtime(TARGET_FILE)

    while True:
        try:
            time.sleep(2)
            if not os.path.exists(TARGET_FILE):
                continue
            curr_mtime = os.path.getmtime(TARGET_FILE)
            if curr_mtime > last_mtime:
                last_mtime = curr_mtime
                time.sleep(1) # 쓰기 작업 완료 대기
                run_sync()
        except KeyboardInterrupt:
            print("\n감시기를 종료합니다.")
            break
        except Exception as e:
            print(f"⚠️ 오류 발생: {e}")
            time.sleep(2)

if __name__ == "__main__":
    main()
