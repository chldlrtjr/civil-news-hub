#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Civil News Hub - 공모전 포스터 판독기 (contest_poster_reader.py)
본문이 '붙임 포스터 참조' 수준이라 마감일을 못 찾은 공지의 포스터 이미지를 Gemini로 읽어
마감일·상금·참가대상을 뽑는다.

팩트 원칙 (GEMINI.md ①·④):
- Gemini에게 포스터 글자 전문(transcript)과 '마감일이 적힌 줄(evidence)'을 함께 받는다.
- evidence가 transcript에 그대로 있고, evidence 안에서 그 마감일이 실제로 읽혀야만 채택한다.
- evidence나 그 바로 위 2줄에 '접수/신청/모집/마감/제출…'이 있어야 한다 (행사·대회 기간 오인 방지).
- 게시일 이전이거나 게시일로부터 180일 넘게 떨어진 날짜는 버린다.
캐시: data/poster_ocr_cache.json (글 ID별, 포스터 URL이 바뀌면 다시 읽음).
      모델이 정상 응답한 결과만 저장하고 네트워크 오류·한도 초과는 저장하지 않아 다음 회차에 재시도한다.
"""

import base64
import json
import os
import re
import urllib.request
from datetime import date, timedelta

import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE = os.path.join(BASE_DIR, "data", "poster_ocr_cache.json")
# 챗봇(gemini-3.6-flash)과 무료 한도가 모델별로 따로 잡히도록 lite 모델 사용
POSTER_MODEL = os.environ.get("POSTER_MODEL", "gemini-3.5-flash-lite")
API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent"

PROMPT = """이 이미지는 공모전/경진대회 안내 포스터(또는 공문)입니다. 이미지에 실제로 적힌 글자만 근거로 아래 JSON을 작성하세요. 추측 금지, 없으면 null.
마감일 규칙: 새 참가자가 지원할 수 있는 마지막 날을 고르세요. '참가신청/접수/신청' 마감이 '작품 제출' 마감과 따로 있으면 참가신청·접수 마감을 고르세요. 심사·발표·시상·행사 날짜는 마감일이 아닙니다.
{"transcript": "이미지의 글자 전체를 줄 단위로 그대로 옮긴 것",
 "deadline_date": "YYYY-MM-DD 또는 null",
 "deadline_time": "HH:MM 또는 null",
 "deadline_evidence": "마감일이 적힌 줄을 transcript에서 글자 그대로 복사",
 "prize": "상금/훈격 요약 또는 null",
 "target": "참가 대상 요약 또는 null"}"""


class PosterQuotaError(Exception):
    """무료 한도 초과(429) — 이번 회차의 나머지 포스터는 건너뛴다"""


def load_api_key(name: str = "GEMINI_API_KEY") -> str:
    """환경변수 → .env 순으로 키 조회 (job_scraper.load_api_key와 같은 방식)"""
    key = os.environ.get(name, "").strip()
    if key:
        return key
    env_path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                if line.startswith(name + "="):
                    return line.split("=", 1)[1].strip()
    return ""


def load_cache() -> dict:
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_cache(cache: dict) -> None:
    tmp = CACHE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CACHE_FILE)


def ask_gemini(image: bytes, mime: str, api_key: str) -> dict:
    """포스터 1장 → Gemini JSON 응답 dict. 한도 초과는 PosterQuotaError, 그 밖의 실패는 예외"""
    resp = requests.post(
        API_URL.format(POSTER_MODEL),
        headers={"x-goog-api-key": api_key},
        json={
            "contents": [{"parts": [
                {"inline_data": {"mime_type": mime, "data": base64.b64encode(image).decode()}},
                {"text": PROMPT},
            ]}],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
                "thinkingConfig": {"thinkingLevel": "minimal"},
            },
        },
        timeout=90,
    )
    if resp.status_code == 429:
        raise PosterQuotaError(resp.text[:200])
    resp.raise_for_status()
    return json.loads(resp.json()["candidates"][0]["content"]["parts"][0]["text"])


# 근거 문장(또는 바로 위 2줄)에 접수 마감 맥락이 있어야 함 — '대회 일정 10.19 ~ 11.13' 같은 행사 기간 배제
_APPLY_KW = re.compile(r"접수|신청|모집|마감|제출|응모|기한|까지")


def _has_apply_context(evidence: str, transcript: str) -> bool:
    if _APPLY_KW.search(evidence):
        return True
    lines = [line.strip() for line in transcript.splitlines()]
    head = _norm(evidence)[:10]
    for i, line in enumerate(lines):
        if head and head in _norm(line):
            return any(_APPLY_KW.search(prev) for prev in lines[max(0, i - 2):i])
    return False


def _norm(s) -> str:
    return re.sub(r"\s+", "", str(s or ""))


def _short(s, limit: int = 100) -> str:
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= limit else s[:limit - 1] + "…"


def verify(raw: dict, posted: date, find_dates):
    """
    Gemini 응답 검증 → {'deadline', 'deadline_time', 'prize', 'target', 'transcript'} 또는 None
    find_dates: jbnu_contest_scraper._find_dates (근거 문장 속 날짜를 같은 규칙으로 다시 읽음)
    """
    try:
        deadline = date.fromisoformat(str(raw.get("deadline_date") or ""))
    except ValueError:
        return None
    evidence = raw.get("deadline_evidence") or ""
    if not evidence or _norm(evidence) not in _norm(raw.get("transcript")):
        return None
    if deadline not in [d for d, _ in find_dates(evidence, posted)]:
        return None
    if not _has_apply_context(evidence, raw.get("transcript") or ""):
        return None
    if not posted <= deadline <= posted + timedelta(days=180):
        return None
    t = str(raw.get("deadline_time") or "")
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", t)
    deadline_time = f"{int(m.group(1)):02d}:{m.group(2)}" if m and int(m.group(1)) <= 23 and int(m.group(2)) <= 59 else "23:59"
    return {
        "deadline": deadline,
        "deadline_time": deadline_time,
        "prize": _short(raw.get("prize")),
        "target": _short(raw.get("target")),
        "transcript": raw.get("transcript") or "",
    }


def read_poster(pst_id: str, poster_url: str, posted: date, find_dates, cache: dict, api_key: str):
    """
    포스터에서 검증된 마감 정보를 반환 (없으면 None). cache는 호출 측에서 save_cache로 저장
    한도 초과는 PosterQuotaError를 그대로 올려 호출 측이 이번 회차를 멈추게 한다
    """
    hit = cache.get(pst_id)
    if hit and hit.get("poster") == poster_url:
        raw = hit.get("raw")
    else:
        req = urllib.request.Request(poster_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            image, mime = r.read(), r.headers.get_content_type()
        raw = ask_gemini(image, mime, api_key)
        cache[pst_id] = {"poster": poster_url, "model": POSTER_MODEL, "raw": raw}
    return verify(raw or {}, posted, find_dates)
