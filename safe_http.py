#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Civil News Hub - 외부 주소 안전 조회 (safe_http.py)
수집기가 기사 원문·학교 공지·포스터처럼 남이 정한 주소를 열 때 쓰는 공용 함수.
- http/https 만 연다 (file:// 등은 거부)
- 요청 전과 리다이렉트마다(직접 최대 3번) 호스트를 풀어 나온 IP 가 모두 공인 주소일 때만 연다
  (127.0.0.1, 10.x, 169.254.169.254 같은 서버 내부 주소로 끌려가지 않게)
- 본문은 조금씩 읽어 크기 상한(HTML 2MB 는 잘라 냄, 이미지 10MB 는 포기)과 한 건 전체 시간 한도를 지킨다
"""

import ipaddress
import re
import socket
import time
import urllib.parse

import requests
import urllib3.util

HTML_MAX = 2 * 1024 * 1024
IMAGE_MAX = 10 * 1024 * 1024
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_REDIRECTS = 3
# 전북대 공지 상세·포스터, SW사업단 게시판 (코드에 쓰는 실제 도메인)
JBNU_HOSTS = {"www.jbnu.ac.kr", "swuniv.jbnu.ac.kr"}


class BlockedError(Exception):
    """안전 규칙(스킴·주소·허용 호스트·크기·형식·시간)에 걸려 조회를 거부함"""


_ODD_CHARS = re.compile(r"[\\\x00-\x20\x7f]")


def allowed(url, hosts=None) -> bool:
    """스킴이 http(s)이고, hosts 가 있으면 그 목록 안의 호스트인지 (DNS 확인은 안 함)
    백슬래시·공백·제어문자·userinfo(@)가 든 주소는 거부하고, requests 가 쓰는 urllib3 파서로도 읽어
    스킴·호스트·포트가 같을 때만 허용 (http://127.0.0.1\\@www.jbnu.ac.kr/ 처럼 두 파서가 다른 곳을 가리키는 주소 차단)"""
    if not isinstance(url, str) or _ODD_CHARS.search(url):
        return False
    try:
        p, u = urllib.parse.urlsplit(url), urllib3.util.parse_url(url)
        if p.scheme not in ("http", "https") or not p.hostname or "@" in p.netloc or u.auth is not None:
            return False
        # 한글 도메인은 requests 처럼 xn-- 로 바꿔 비교. 잘못된 포트·IDNA·urllib3 파싱 오류는 모두 ValueError
        same = (u.scheme, (u.host or "").strip("[]"), u.port) == (p.scheme, p.hostname.encode("idna").decode("ascii"), p.port)
    except ValueError:
        return False
    return same and (hosts is None or p.hostname in hosts)


def _check(url, hosts):
    if not allowed(url, hosts):
        raise BlockedError(f"허용되지 않는 주소: {url[:100]}")
    p = urllib.parse.urlsplit(url)
    # shortcut: 검사 뒤 requests 가 DNS 를 다시 풀어서 그 사이 답이 바뀌는 공격(DNS rebinding)은 못 막음, IP 고정 연결이 필요해지면 그때
    for *_, sockaddr in socket.getaddrinfo(p.hostname, p.port or (443 if p.scheme == "https" else 80), type=socket.SOCK_STREAM):
        ip = ipaddress.ip_address(sockaddr[0].split("%")[0])
        ip = getattr(ip, "ipv4_mapped", None) or ip  # ::ffff:127.0.0.1 같은 IPv4 매핑 주소
        # NAT64(64:ff9b::)·::ffff:0:a.b.c.d·::a.b.c.d 는 is_reserved, 멀티캐스트는 is_multicast 라 is_global 만으론 통과해요
        if (not ip.is_global or ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_multicast or ip.is_reserved or ip.is_unspecified):
            raise BlockedError(f"내부 주소로 가는 요청 거부: {p.hostname} → {ip}")


def fetch(url, headers=None, timeout=4, deadline=10, image=False, hosts=None) -> requests.Response:
    """
    GET 후 본문을 다 읽고 닫은 requests.Response (r.status_code, r.content, r.text, r.encoding 그대로 사용).
    image=True 면 Content-Type 이 png·jpeg·webp·gif 일 때만, 10MB 를 넘으면 포기. 아니면 2MB 에서 잘라 냄.
    timeout 은 요청 한 번의 연결·읽기 한도, deadline 은 리다이렉트·본문 읽기까지 한 건 전체 한도(초).
    안전 규칙에 걸리면 BlockedError, 네트워크 오류는 requests 예외 그대로.
    """
    start = time.monotonic()

    def left():
        rest = deadline - (time.monotonic() - start)
        if rest <= 0:
            raise BlockedError(f"전체 시간 한도 {deadline}초 초과: {url[:100]}")
        return rest

    limit = IMAGE_MAX if image else HTML_MAX
    for _ in range(MAX_REDIRECTS + 1):
        _check(url, hosts)
        r = requests.get(url, headers=headers, timeout=min(timeout, left()), stream=True, allow_redirects=False)
        r.url = url
        if not r.is_redirect:
            break
        r.close()
        url = urllib.parse.urljoin(url, r.headers["Location"])
    else:
        raise BlockedError(f"리다이렉트 {MAX_REDIRECTS}번 초과: {url[:100]}")

    try:
        ctype = r.headers.get("Content-Type", "").split(";")[0].strip().lower()
        if image and ctype not in IMAGE_TYPES:
            raise BlockedError(f"이미지 형식 아님({ctype or '없음'}): {url[:100]}")
        try:
            declared = int(r.headers.get("Content-Length") or 0)
        except ValueError:  # '10, 10' 같은 비정상 헤더는 없는 셈 치고 아래에서 읽으며 잼
            declared = 0
        # HTML 은 미리 거절하지 않고 2MB 까지 읽고 자름, 이미지만 선언 크기로 바로 포기
        if image and declared > limit:
            raise BlockedError(f"응답이 {limit // 1024 // 1024}MB 초과: {url[:100]}")
        body = bytearray()
        while len(body) <= limit:
            left()
            # read1 은 소켓을 한 번만 기다려서, 조금씩 흘려 보내도 전체 시간 한도가 지켜짐 (압축도 풀린 크기 기준)
            chunk = r.raw.read1(64 * 1024, decode_content=True)
            if not chunk:
                break
            body += chunk
        if len(body) > limit:
            if image:
                raise BlockedError(f"이미지가 {limit // 1024 // 1024}MB 초과: {url[:100]}")
            del body[limit:]
    finally:
        r.close()
    # 잘라 낸 본문만 남겨 r.text·r.apparent_encoding(문자셋 추정)이 이 범위에서만 돌게 함
    r._content = bytes(body)
    return r
