#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Civil News Hub - 토목 공모전 수집 파이프라인 (contest_scraper.py)
출처:
- manual : contest_notice_parser.MANUAL_CONTESTS (사람이 공식 공고를 보고 기재)
- wevity : wevity_contest_scraper (위비티 건축/건설 분야 접수중 목록)
- campus : jbnu_contest_scraper (전북대 교내·학생공지)
- devevent / wevity_it : it_contest_scraper (컴퓨터공학 공모전·해커톤, track="it"으로 따로 표시)
규칙 준수 (GEMINI.md):
1. contest_validator로 마감/과거/블랙리스트 항목 차단, 저장 직전 전수 재검증
2. 접수 마감된 공모전은 목록에서 즉시 제외 (Rule 1-⑤)
3. 카테고리 자동 감지 및 전체 건수 합산 일치 보장 (Rule 1-⑥)
4. 수집원 하나가 실패하면 그 수집원의 이전 데이터를 유지하고 exit 1 → cron 실패 알림
"""

import os
import re
import sys
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup
import contest_notice_parser
import contest_validator
import it_contest_scraper
import jbnu_contest_scraper
import wevity_contest_scraper

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
CONTESTS_JSON_PATH = os.path.join(DATA_DIR, "contests.json")
KST = timezone(timedelta(hours=9))

# 카테고리 기본 정의 (전북대 & 일반 2분류 원칙)
CONTEST_CATEGORIES = [
    "ALL",
    "전북대",
    "일반"
]

# (수집원 키, 이름, 수집 함수) — 앞에 있을수록 같은 공모전이 중복될 때 우선
SOURCES = [
    ("manual", "수동 등록", contest_notice_parser.get_manual_contests),
    ("campus", "전북대 공지", jbnu_contest_scraper.fetch_jbnu_contest_notices),
    ("wevity", "위비티", wevity_contest_scraper.fetch_wevity_contests),
    ("devevent", "데브이벤트", it_contest_scraper.fetch_devevent_contests),
    ("wevity_it", "위비티 IT", it_contest_scraper.fetch_wevity_it_contests),
]


def calculate_contest_dday(deadline_date_str: str, deadline_time_str: str = "18:00") -> dict:
    """
    공모전 마감 일시 기반 D-Day 및 마감 여부 판정
    - 마감 여부는 시·분 단위, D-n은 달력 날짜 차이 (내일 마감이면 시각과 무관하게 D-1)
    - 날짜를 해석할 수 없으면 마감으로 취급해 노출하지 않음
    """
    if not deadline_date_str or "상시" in str(deadline_date_str):
        return {"text": "상시접수", "days": 9999, "is_urgent": False, "is_closed": False}

    try:
        now_kst = datetime.now(KST)
        d_parts = [int(p) for p in deadline_date_str.strip().split("-")]
        t_parts = [int(p) for p in (deadline_time_str or "18:00").strip().split(":")]
        deadline_dt = datetime(d_parts[0], d_parts[1], d_parts[2], t_parts[0], t_parts[1], 0, tzinfo=KST)
    except Exception as e:
        print(f"⚠️ [D-Day] 마감일 해석 실패 ({deadline_date_str} {deadline_time_str}): {e}")
        return {"text": "접수마감", "days": -1, "is_urgent": False, "is_closed": True}

    if deadline_dt < now_kst:
        return {"text": "접수마감", "days": -1, "is_urgent": False, "is_closed": True}

    diff_days = (deadline_dt.date() - now_kst.date()).days
    if diff_days == 0:
        return {"text": "오늘마감", "days": 0, "is_urgent": True, "is_closed": False}
    return {"text": f"D-{diff_days}", "days": diff_days, "is_urgent": diff_days <= 3, "is_closed": False}


def extract_external_contest_image(link: str) -> str:
    """
    외부 공모전 공식 웹사이트의 og:image 태그 추출
    """
    if not link or link == "#":
        return ""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        req = urllib.request.Request(link, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            soup = BeautifulSoup(html, "html.parser")
            og = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "og:image"})
            if og and og.get("content"):
                c = og["content"].strip()
                if c.startswith("http"):
                    return c
                elif c.startswith("/"):
                    parsed = urllib.parse.urlparse(link)
                    return f"{parsed.scheme}://{parsed.netloc}{c}"
    except Exception as e:
        print(f"⚠️ [External Contest Image] {link} 이미지 추출 실패: {e}")
    return ""


def normalize_title(title: str) -> str:
    """중복 판정용 제목 정규화: 괄호류·기호·공백 제거, 소문자"""
    return re.sub(r"[^0-9a-z가-힣]", "", str(title).lower())


def source_of(contest: dict) -> str:
    """이전 contests.json 항목의 수집원 키 (source 필드가 없던 예전 수동 항목은 manual)"""
    src = contest.get("source")
    if src in ("campus", "wevity", "devevent", "wevity_it"):
        return src
    return "manual"


def is_duplicate_title(ntitle: str, seen_titles: set) -> bool:
    """정규화 제목이 같거나, 충분히 긴 제목이 다른 제목을 통째로 포함하면 같은 공모전으로 본다
    (예: '…앱 개발 공모전'과 '…앱 개발 공모전 (Code your App …)')"""
    if ntitle in seen_titles:
        return True
    return any(min(len(ntitle), len(t)) >= 12 and (ntitle in t or t in ntitle) for t in seen_titles)


def load_previous_contests() -> list:
    try:
        with open(CONTESTS_JSON_PATH, "r", encoding="utf-8") as f:
            return json.load(f).get("contests", [])
    except Exception:
        return []


def collect_raw_contests() -> tuple:
    """
    수집원별로 공모전을 모은다. 수집원이 실패하면 이전 데이터에서 그 수집원 항목을 이어 쓴다.
    반환: (raw_contests, failed_source_names)
    """
    previous = None
    raw = []
    failed = []
    for key, name, fetch in SOURCES:
        try:
            items = fetch()
        except Exception as e:
            print(f"❌ [{name}] 수집 실패: {e} → 이전 데이터 유지")
            failed.append(name)
            if previous is None:
                previous = load_previous_contests()
            items = [dict(c) for c in previous if source_of(c) == key]
        for c in items:
            c.setdefault("source", key)
        raw.extend(items)
    return raw, failed


def scrape_civil_contests():
    """
    토목 공모전 수집 및 정제 파이프라인
    - 수동 등록 + 전북대 공지 + 위비티 수집 → 중복 제거
    - contest_validator 무결성 검증으로 마감/과거/블랙리스트 항목 차단
    - 전체 건수 및 카테고리별 건수 동기화
    반환: (contests_data, failed_source_names)
    """
    print("\n" + "="*70)
    print("🚀 [Civil News Hub] 토목 공모전 수집 파이프라인 가동 (contest_scraper.py)")
    print("="*70)

    # 1. 수집 + 중복 제거 (id 또는 정규화 제목이 같으면 먼저 들어온 수집원 우선)
    collected, failed_sources = collect_raw_contests()
    raw_contests = []
    seen_ids = set()
    seen_titles = set()
    for c in collected:
        cid = c.get("id")
        ntitle = normalize_title(c.get("title", ""))
        if (cid and cid in seen_ids) or (ntitle and is_duplicate_title(ntitle, seen_titles)):
            continue
        if cid:
            seen_ids.add(cid)
        if ntitle:
            seen_titles.add(ntitle)
        raw_contests.append(c)

    # 2. 유효 공모전 검증 (Rule 1-①, 1-⑤, 1-⑦: 무결성 검증 게이트)
    active_contests = []
    for c in raw_contests:
        # [카테고리 2분류 정규화: 전북대 vs 일반]
        link = str(c.get("link", ""))
        source = str(c.get("source", ""))
        organizer = str(c.get("organizer", ""))
        title = str(c.get("title", ""))
        if source == "campus" or "jbnu.ac.kr" in link or "전북대" in organizer or "전북대" in title or "JBNU" in title:
            c["category"] = "전북대"
            c["badge_color"] = "teal"
        else:
            c["category"] = "일반"
            c["badge_color"] = "blue"
        # 공모전 페이지 섹션: civil(토목·건설) / it(컴퓨터공학 공모전·해커톤)
        c["track"] = "it" if c.get("track") == "it" else "civil"

        is_valid, reason = contest_validator.validate_contest(c)
        if not is_valid:
            print(f"⛔ [검증 엔진 차단] {c.get('title')} -> {reason}")
            continue

        dday_info = calculate_contest_dday(c.get("deadline_date", ""), c.get("deadline_time", "18:00"))
        if dday_info["is_closed"]:
            print(f"❌ [마감 내림] {c['title']} ({c.get('period', '')}) -> 접수 마감되어 목록 제외")
            continue

        c["dday_info"] = dday_info
        if c.get("status") != "접수예정" and c.get("status") != "상시접수":
            c["status"] = "접수중"
            c["status_color"] = "emerald"

        # [공모전 포스터/대표 이미지] 공식 홈페이지의 og:image만 사용
        # (위비티·전북대는 og:image가 사이트 공통 로고라 쓰지 않음, 전북대는 수집기가 포스터를 직접 추출)
        if not c.get("image"):
            c["image"] = extract_external_contest_image(c.get("link", "")) if c.get("source") == "manual" else ""

        active_contests.append(c)

    # [방어막] 수집 목록 일괄 무결성 재검증
    verified_contests, rejected = contest_validator.filter_and_validate_contests(active_contests)
    if rejected:
        print(f"⚠️ [비상 경보] 필터링 후 잔류한 부적격 공모전 {len(rejected)}건 발견:")
        for rej in rejected:
            print(f"   - {rej['contest'].get('title')}: {rej['reason']}")
        active_contests = verified_contests

    # 3. 카테고리 동적 감지 및 검증 (Rule 1-⑥)
    categories = list(CONTEST_CATEGORIES)
    for c in active_contests:
        cat = c.get("category", "일반")
        if cat and cat not in categories:
            categories.append(cat)

    # 4. 정렬 (마감 임박순 -> 상시접수/접수예정 순)
    def sort_key(item):
        d = item.get("dday_info", {}).get("days", 999)
        if item.get("status") == "상시접수":
            return 9999
        if item.get("status") == "접수예정":
            return 5000 + d
        return d

    active_contests.sort(key=sort_key)

    # 5. 카테고리별 건수 일치 교차 검증
    print("\n📊 [카테고리별 유효 공모전 건수 현황]:")
    cat_sum = 0
    for cat in categories:
        if cat == "ALL":
            continue
        cnt = len([c for c in active_contests if c.get("category") == cat])
        print(f"  • {cat}: {cnt}건")
        cat_sum += cnt

    it_cnt = len([c for c in active_contests if c.get("track") == "it"])
    print(f"  (섹션) 토목·건설 {len(active_contests) - it_cnt}건 / 컴퓨터공학·해커톤 {it_cnt}건")
    print(f"  -------------------------------------")
    print(f"  총 건수 [ALL]: {len(active_contests)}건 | 개별 카테고리 합계: {cat_sum}건")
    if len(active_contests) == cat_sum:
        print("  ✅ 전체 건수와 개별 카테고리 탭 건수 합산이 일치합니다 (Rule 1-⑥)")
    else:
        print(f"  ⚠️ [불일치 감지] 전체({len(active_contests)}) != 합계({cat_sum})")

    # 6. JSON 파일 저장
    now_kst = datetime.now(KST)
    contests_data = {
        "last_updated": now_kst.strftime("%Y-%m-%d %H:%M:%S"),
        "last_updated_display": now_kst.strftime("%m월 %d일 %H:%M"),
        "total_count": len(active_contests),
        "featured_count": len(active_contests),
        "categories": categories,
        "contests": active_contests
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    temp_path = CONTESTS_JSON_PATH + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(contests_data, f, ensure_ascii=False, indent=2)
    os.replace(temp_path, CONTESTS_JSON_PATH)

    print(f"\n✅ 검증 완료된 총 {len(active_contests)}건의 공모전 저장 완료! ({CONTESTS_JSON_PATH})")
    if failed_sources:
        print(f"⚠️ 수집 실패 수집원: {', '.join(failed_sources)} (해당 수집원은 이전 데이터로 유지됨)")
    return contests_data, failed_sources


if __name__ == "__main__":
    _, failed = scrape_civil_contests()
    # 실패한 수집원이 있으면 exit 1 → cron_scrape.sh가 카카오톡 실패 알림 발송
    sys.exit(1 if failed else 0)
