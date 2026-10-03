#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Civil News Hub - 카카오톡 서버 주소 변경 자동 알리미
우분투 서버 재부팅 또는 터널 재시작으로 새 주소가 발급되면,
카카오톡 '나와의 채팅방'으로 새 URL을 자동 전송합니다.
"""

import os
import re
import sys
import json
import time
import argparse
import requests
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

TOKEN_FILE = os.path.join(BASE_DIR, "kakao_token.json")
LAST_URL_FILE = os.path.join(BASE_DIR, "data", "last_tunnel_url.txt")
TUNNEL_LOG_FILE = os.environ.get("TUNNEL_LOG_PATH", "/var/log/civil-tunnel.log")

REST_API_KEY = os.environ.get("KAKAO_REST_API_KEY", "7412ad09c20b5373e35dae2239931cbd")
CLIENT_SECRET = os.environ.get("KAKAO_CLIENT_SECRET", "3C0yV1xn3uxMwEv1xkGW7FFgxsTdtCWk")

def load_tokens():
    if not os.path.exists(TOKEN_FILE):
        print(f"[-] 토큰 파일이 존재하지 않습니다: {TOKEN_FILE}")
        return None
    try:
        with open(TOKEN_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[-] 토큰 파일 로드 실패: {e}")
        return None

def save_tokens(tokens):
    temp_file = TOKEN_FILE + ".tmp"
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(tokens, f, indent=2, ensure_ascii=False)
    os.replace(temp_file, TOKEN_FILE)

def refresh_access_token(tokens):
    """refresh_token을 사용하여 access_token을 새로 갱신 (영구 자동 연장)"""
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        print("[-] refresh_token이 없습니다.")
        return None

    url = "https://kauth.kakao.com/oauth/token"
    data = {
        "grant_type": "refresh_token",
        "client_id": REST_API_KEY,
        "client_secret": CLIENT_SECRET,
        "refresh_token": refresh_token
    }
    try:
        res = requests.post(url, data=data, timeout=10)
        new_data = res.json()
        if "access_token" in new_data:
            tokens["access_token"] = new_data["access_token"]
            # 리프레시 토큰의 만료일이 1개월 미만으로 남은 시점에 갱신 요청 시 신규 리프레시 토큰 발급됨
            if "refresh_token" in new_data:
                tokens["refresh_token"] = new_data["refresh_token"]
            if "expires_in" in new_data:
                tokens["expires_in"] = new_data["expires_in"]
            if "refresh_token_expires_in" in new_data:
                tokens["refresh_token_expires_in"] = new_data["refresh_token_expires_in"]
            save_tokens(tokens)
            print("[+] 카카오 토큰 자동 갱신 완료!")
            return tokens
        else:
            print(f"[-] 토큰 갱신 실패 응답: {new_data}")
            return None
    except Exception as e:
        print(f"[-] 토큰 갱신 네트워크 에러: {e}")
        return None

def get_current_tunnel_url():
    """터널 로그 파일에서 최신 trycloudflare URL 조회"""
    if not os.path.exists(TUNNEL_LOG_FILE):
        return None
    try:
        with open(TUNNEL_LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
        for line in reversed(lines):
            m = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
            if m:
                return m.group(0)
    except Exception as e:
        print(f"[-] 터널 로그 파싱 실패: {e}")
    return None

def send_kakao_notice(tunnel_url, force=False):
    """카카오톡 '나와의 채팅방'으로 새 주소 알림 발송"""
    if not tunnel_url:
        print("[-] 발송할 유효한 터널 URL이 없습니다.")
        return False

    os.makedirs(os.path.dirname(LAST_URL_FILE), exist_ok=True)
    last_url = ""
    if os.path.exists(LAST_URL_FILE):
        try:
            with open(LAST_URL_FILE, "r", encoding="utf-8") as f:
                last_url = f.read().strip()
        except Exception:
            pass

    if not force and last_url == tunnel_url:
        print(f"[*] 이전 전송 주소와 동일하여 건너뜁니다. ({tunnel_url})")
        return True

    tokens = load_tokens()
    if not tokens:
        print("[-] 유효한 kakao_token.json이 없습니다.")
        return False

    access_token = tokens.get("access_token")
    headers = {"Authorization": f"Bearer {access_token}"}

    template_payload = {
        "template_object": json.dumps({
            "object_type": "text",
            "text": (
                "🔔 [Civil News Hub] 우분투 서버 새 주소 발급\n\n"
                "우분투 서버 재시작으로 새로운 접속 주소가 생성되었습니다.\n\n"
                f"🌐 모바일 웹: {tunnel_url}/#news\n"
                f"📱 시뮬레이터: {tunnel_url}/mobile#news\n\n"
                "언제 어디서든 위 링크를 누르면 즉시 접속됩니다!"
            ),
            "link": {
                "web_url": f"{tunnel_url}/#news",
                "mobile_web_url": f"{tunnel_url}/#news"
            },
            "button_title": "허브 바로가기"
        }, ensure_ascii=False)
    }

    send_url = "https://kapi.kakao.com/v2/api/talk/memo/default/send"
    res = requests.post(send_url, headers=headers, data=template_payload, timeout=10)

    # 401 Unauthorized (토큰 만료) 감지 시 자동 갱신 후 재전송
    if res.status_code == 401 or res.json().get("code") == -401:
        print("[!] 액세스 토큰 만료 감지. 토큰 자동 갱신 시도...")
        tokens = refresh_access_token(tokens)
        if tokens:
            headers = {"Authorization": f"Bearer {tokens['access_token']}"}
            res = requests.post(send_url, headers=headers, data=template_payload, timeout=10)

    if res.status_code == 200 and res.json().get("result_code") == 0:
        print(f"[+] 카카오톡 새 주소 발송 성공! URL: {tunnel_url}")
        with open(LAST_URL_FILE, "w", encoding="utf-8") as f:
            f.write(tunnel_url)
        return True
    else:
        print(f"[-] 카카오톡 메시지 발송 실패: {res.status_code} {res.text}")
        return False

def watch_loop(interval=15):
    """터널 로그를 지속 감시하며 주소 변경 시 즉각 전송"""
    print(f"[*] 카카오톡 터널 감시자 시작됨 (감시 간격: {interval}초, 로그: {TUNNEL_LOG_FILE})")
    while True:
        try:
            url = get_current_tunnel_url()
            if url:
                send_kakao_notice(url, force=False)
        except Exception as e:
            print(f"[-] 감시 루프 오류: {e}")
        time.sleep(interval)

def main():
    parser = argparse.ArgumentParser(description="Civil News Hub 카카오톡 주소 알리미")
    parser.add_argument("--watch", action="store_true", help="지속 감시 데몬 모드 실행")
    parser.add_argument("--force", action="store_true", help="주소 변경 여부 무관 강제 발송")
    parser.add_argument("--url", type=str, help="지정한 URL로 직접 발송")
    parser.add_argument("--refresh", action="store_true", help="토큰 갱신 테스트")
    parser.add_argument("--interval", type=int, default=15, help="감시 간격 (초, 기본: 15초)")
    args = parser.parse_args()

    if args.refresh:
        tokens = load_tokens()
        if tokens:
            refresh_access_token(tokens)
        return

    if args.url:
        send_kakao_notice(args.url, force=True)
        return

    if args.watch:
        watch_loop(args.interval)
        return

    # 기본 모드: 1회 검사 및 전송
    url = get_current_tunnel_url()
    if url:
        print(f"[*] 현재 감지된 터널 URL: {url}")
        send_kakao_notice(url, force=args.force)
    else:
        print(f"[-] 터널 로그({TUNNEL_LOG_FILE})에서 URL을 찾을 수 없습니다.")

if __name__ == "__main__":
    main()
