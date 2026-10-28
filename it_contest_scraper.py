#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Civil News Hub - 컴퓨터공학 분야 공모전·해커톤 수집기 (it_contest_scraper.py)
- 위비티 '웹/모바일/IT', '게임/소프트웨어', '과학/공학', '기획/아이디어' 접수중 목록에서 개발·AI·데이터·보안 공모전만 수집한다.
- 데브이벤트(brave-people/Dev-Event, GitHub README)에서 분류가 '대회'이거나 제목에 해커톤이 들어간 행사를 수집한다.
- 모든 항목은 track="it"으로 표시해 공모전 페이지에서 토목·건설 공모전과 다른 섹션에 모인다.
"""

import re
import hashlib
from datetime import date, datetime
import requests
import wevity_contest_scraper as wevity

DEVEVENT_README_URL = "https://raw.githubusercontent.com/brave-people/Dev-Event/master/README.md"

WEVITY_CATEGORIES = [
    (20, "웹/모바일/IT", 3),
    (21, "게임/소프트웨어", 3),
    (22, "과학/공학", 3),
    (1, "기획/아이디어", 10),
]

# 제목에 하나라도 있으면 컴공 취업에 도움 되는 공모전으로 본다
IT_KEYWORDS = re.compile(
    r"해커톤|hackathon|개발|코딩|프로그래밍|알고리즘|소프트웨어|\bSW\b|\bAI|인공지능|"
    r"머신\s*러닝|딥\s*러닝|LLM|에이전트|agent|데이터|data|분석\s*(?:대회|경진)|보안|해킹|CTF|버그\s*바운티|"
    r"클라우드|오픈\s*소스|블록체인|IoT|로봇|자율\s*주행|임베디드|앱|\bapp\b|ICT|정보\s*통신|양자",
    re.I,
)
# 키워드가 걸려도 개발 역량과 거리가 먼 공모전 (영상·디자인·글·홍보 등)
NON_IT_KEYWORDS = re.compile(
    r"영상|숏폼|UCC|사진|시나리오|그래픽|캐릭터|웹툰|일러스트|네이밍|슬로건|단편\s*영화|서포터즈|기자단|"
    r"마케팅|광고|수기|에세이|글짓기|콘텐츠|노래|음악|홍보|교정\s*서비스|이라면\?",
    re.I,
)


class DevEventFetchError(Exception):
    """데브이벤트 README를 읽지 못했거나 행사 목록 형식이 바뀌었을 때"""


def is_it(contest: dict) -> bool:
    title = contest.get("title", "")
    return bool(IT_KEYWORDS.search(title)) and not NON_IT_KEYWORDS.search(title)


def fetch_wevity_it_contests() -> list:
    """위비티 접수중 공모전 중 컴공 분야만 수집"""
    items = wevity.fetch_wevity(WEVITY_CATEGORIES, is_it, "컴퓨터공학", source="wevity_it")
    for c in items:
        c["track"] = "it"
    return items


SECTION_RE = re.compile(r"^##\s*`(\d{2})년\s*(\d{1,2})월`")
ITEM_RE = re.compile(r"^- __\[(.+)\]\((https?://[^)\s]+)\)__\s*$")
DATE_RE = re.compile(r"(\d{1,2})\.\s*(\d{1,2})\([^)]*\)(?:\s*(\d{1,2}:\d{2}))?")


def resolve_year(month: int, sec_year: int, sec_month: int) -> int:
    """섹션(YY년 MM월) 기준으로 월만 있는 날짜의 연도를 정한다 (12월 섹션의 1월 마감 → 다음 해)"""
    if month < sec_month and sec_month - month > 6:
        return sec_year + 1
    if month > sec_month and month - sec_month > 6:
        return sec_year - 1
    return sec_year


def devevent_deadline(apply_line: str, event_line: str, sec_year: int, sec_month: int):
    """'접수: A ~ B'면 B, 접수 기간이 없으면 행사 시작일을 마감으로 본다. 반환: (date, 'HH:MM') 또는 None"""
    if apply_line:
        matches = DATE_RE.findall(apply_line)
        if not matches:
            return None
        m, d, t = matches[-1]
        default_time = "23:59"
    elif event_line:
        matches = DATE_RE.findall(event_line)
        if not matches:
            return None
        m, d, t = matches[0]
        default_time = "00:00"
    else:
        return None
    month, day = int(m), int(d)
    try:
        deadline = date(resolve_year(month, sec_year, sec_month), month, day)
    except ValueError:
        return None
    return deadline, (t.zfill(5) if t else default_time)


def devevent_item(title, link, tags, organizer, apply_line, event_line, sec_year, sec_month):
    if not ("대회" in tags or re.search(r"해커톤|hackathon", title, re.I)):
        return None
    if NON_IT_KEYWORDS.search(title):
        return None
    found = devevent_deadline(apply_line, event_line, sec_year, sec_month)
    if not found:
        return None
    deadline, deadline_time = found

    # 위비티 공고를 그대로 옮긴 행사는 위비티 id를 써서 중복 제거되게 한다
    wevity_ix = re.search(r"wevity\.com/.*[?&]ix=(\d+)", link)
    cid = f"wevity-{wevity_ix.group(1)}" if wevity_ix else "devevent-" + hashlib.md5(link.encode("utf-8")).hexdigest()[:10]
    fields = [t for t in tags if t not in ("무료", "유료")]
    period = (f"~ {deadline.strftime('%Y.%m.%d')} 마감" if apply_line
              else f"{deadline.strftime('%Y.%m.%d')} 행사 시작 전 신청")
    return {
        "id": cid,
        "source": "devevent",
        "source_name": "데브이벤트",
        "track": "it",
        "title": title.strip(),
        "organizer": organizer,
        "category": "일반",
        "badge_color": "blue",
        "prize": "",
        "target": "",
        "status": "접수중",
        "status_color": "emerald",
        "period": period,
        "deadline_date": deadline.strftime("%Y-%m-%d"),
        "deadline_time": deadline_time,
        "fields": fields,
        "description": f"{organizer} 주최 · {', '.join(tags)}" if tags else f"{organizer} 주최",
        "link": link,
        "image": "",
        "is_active": True,
    }


def parse_devevent_readme(text: str) -> list:
    """README 마크다운 → 대회·해커톤 공모전 dict 목록. 월 섹션이 하나도 없으면 형식 변경으로 보고 None"""
    items = []
    sec = None
    cur = None
    found_section = False

    def flush():
        if cur and sec:
            c = devevent_item(cur["title"], cur["link"], cur["tags"], cur["organizer"],
                              cur["apply"], cur["event"], *sec)
            if c:
                items.append(c)

    for line in text.splitlines():
        m = SECTION_RE.match(line)
        if m:
            flush()
            cur = None
            sec = (2000 + int(m.group(1)), int(m.group(2)))
            found_section = True
            continue
        m = ITEM_RE.match(line.strip()) if line.startswith("- __[") else None
        if m:
            flush()
            cur = {"title": m.group(1), "link": m.group(2), "tags": [], "organizer": "", "apply": "", "event": ""}
            continue
        if cur is None:
            continue
        s = line.strip()
        if s.startswith("- 분류:"):
            cur["tags"] = re.findall(r"`([^`]+)`", s)
        elif s.startswith("- 주최:"):
            cur["organizer"] = s.split(":", 1)[1].strip()
        elif s.startswith("- 접수:"):
            cur["apply"] = s.split(":", 1)[1]
        elif s.startswith("- 일시:"):
            cur["event"] = s.split(":", 1)[1]
        elif s.startswith("## ") or s.startswith("<"):
            flush()
            cur = None
    flush()
    return items if found_section else None


def fetch_devevent_contests() -> list:
    """데브이벤트 README에서 대회·해커톤 수집. 읽지 못하면 DevEventFetchError"""
    print("\n" + "-" * 60)
    print("🌐 [DevEvent] 데브이벤트 개발자 대회·해커톤 수집 시작")
    print("-" * 60)
    try:
        r = requests.get(DEVEVENT_README_URL, headers=wevity.HEADERS, timeout=15)
        r.raise_for_status()
        r.encoding = "utf-8"
    except Exception as e:
        raise DevEventFetchError(f"README 요청 실패: {e}")
    items = parse_devevent_readme(r.text)
    if items is None:
        raise DevEventFetchError("월 섹션(## `YY년 MM월`)을 찾지 못함 — README 형식 변경 의심")

    today = datetime.now(wevity.KST).strftime("%Y-%m-%d")
    upcoming = [c for c in items if c["deadline_date"] >= today]
    print(f"🎯 [DevEvent] 대회·해커톤 {len(upcoming)}건 수집 (지난 행사 제외 전 {len(items)}건)")
    return upcoming


if __name__ == "__main__":
    for c in fetch_wevity_it_contests() + fetch_devevent_contests():
        print(f" - {c['deadline_date']} {c['deadline_time']} | {c['title']} | {c['organizer']} | {c['link']}")
