#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Civil News Hub - 위비티(wevity.com) 토목 분야 공모전 수집기 (wevity_contest_scraper.py)
- 위비티 '건축/건설/인테리어', '과학/공학', '기획/아이디어' 분야의 접수중 목록에서 토목 관련 공모전만 수집한다.
- 마감일은 위비티 목록에 표시된 D-day(위비티가 공고 원문 기준으로 계산한 값)로부터 날짜를 환산한다.
- 상세 페이지 본문은 봇 요청에 내용을 주지 않아서 상금·참가대상은 수집하지 않는다 (카드에 '위비티에서 모집'으로 표시).
"""

import re
from datetime import datetime, timezone, timedelta
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.wevity.com/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
}
KST = timezone(timedelta(hours=9))

# (cidx, 분야명, 최대 페이지) — 접수중(mode=ing) 목록만 본다. 접수예정 목록의 D-day는 접수 시작일 기준이라 마감일로 쓸 수 없음
# 어느 분야든 is_civil()을 통과한 토목 관련 공모전만 남긴다
CATEGORIES = [
    (24, "건축/건설/인테리어", 3),
    (22, "과학/공학", 3),
    (1, "기획/아이디어", 10),
]

# 제목에 하나라도 있으면 토목 관련으로 본다 ('도시공사'의 '시공'은 제외)
CIVIL_KEYWORDS = re.compile(
    r"토목|건설|(?<!도)시공|인프라|도로|교량|터널|철도|지하철|항만|수자원|하천|댐|상하수도|상수도|하수도|"
    r"지반|측량|교통|방재|재난|경관|BIM|스마트\s*(?:시티|도시)|도시\s*(?:계획|재생|설계)|국토|"
    r"토지주택|주택도시|농어촌공사|K-?water",
    re.I,
)
# 주최기관은 기관명 일부만 겹쳐도 걸리므로(부산항만공사의 창업 공모전 등) 토목 기관 목록과 맞을 때만 인정
CIVIL_ORGANIZERS = re.compile(
    r"한국도로공사|국토안전관리원|국가철도공단|한국철도|코레일|수자원공사|K-?water|토지주택공사|\bLH\b|"
    r"국토교통부|국토연구원|건설기술연구원|철도기술연구원|대한토목학회|농어촌공사|건설기술인협회|대한건설협회",
    re.I,
)
# 키워드가 걸려도 토목과 거리가 먼 공모전 (실내건축, 관광 콘텐츠 등)
NON_CIVIL_KEYWORDS = re.compile(r"인테리어|실내|관광|여행|스토리텔링")


def is_civil(contest: dict) -> bool:
    title = contest.get("title", "")
    matched = CIVIL_KEYWORDS.search(title) or CIVIL_ORGANIZERS.search(contest.get("organizer", ""))
    return bool(matched) and not NON_CIVIL_KEYWORDS.search(title)


class WevityFetchError(Exception):
    """위비티 목록을 하나도 읽지 못했을 때 (네트워크 오류 또는 페이지 구조 변경)"""


def parse_dday(text: str):
    """'D-12' → 12, 'D-day'/'D-0'/'오늘마감' → 0, 그 외 None"""
    m = re.search(r"D\s*-\s*(\d+)", text, re.I)
    if m:
        return int(m.group(1))
    if re.search(r"D\s*-\s*day|오늘", text, re.I):
        return 0
    return None


def parse_list_page(html: str, today: datetime, cidx: int) -> list:
    """목록 HTML → 공모전 dict 목록. 목록 영역(ul.list)이 없으면 구조 변경으로 보고 None 반환"""
    soup = BeautifulSoup(html, "html.parser")
    ul = soup.select_one("ul.list")
    if ul is None:
        return None

    items = []
    for li in ul.find_all("li", recursive=False):
        if "top" in (li.get("class") or []):
            continue  # 표 머리글
        a = li.select_one("div.tit > a")
        if not a:
            continue
        m = re.search(r"ix=(\d+)", a.get("href", ""))
        if not m:
            continue
        ix = m.group(1)

        # 제목 뒤에 붙는 '신규'·'SPECIAL' 뱃지(span) 제외
        title = " ".join(t.strip() for t in a.find_all(string=True, recursive=False) if t.strip())
        organizer = li.select_one("div.organ")
        organizer = organizer.get_text(strip=True) if organizer else ""
        day_div = li.select_one("div.day")
        day_text = day_div.get_text(" ", strip=True) if day_div else ""
        status_span = day_div.select_one("span.dday") if day_div else None
        status_text = status_span.get_text(strip=True) if status_span else ""
        sub = li.select_one("div.sub-tit")
        fields = []
        if sub:
            fields = [f.strip() for f in sub.get_text(strip=True).replace("분야 :", "").split(",") if f.strip()]

        if "접수중" not in status_text:
            continue
        days = parse_dday(day_text)
        if days is None or not title:
            continue

        deadline = (today + timedelta(days=days)).date()
        items.append({
            "id": f"wevity-{ix}",
            "source": "wevity",
            "source_name": "위비티",
            "title": title,
            "organizer": organizer,
            "category": "일반",
            "badge_color": "blue",
            "prize": "",
            "target": "",
            "status": "접수중",
            "status_color": "emerald",
            "period": f"~ {deadline.strftime('%Y.%m.%d')} 마감",
            "deadline_date": deadline.strftime("%Y-%m-%d"),
            "deadline_time": "23:59",
            "fields": fields,
            "description": f"{organizer} 주최 · 분야: {', '.join(fields)}" if fields else f"{organizer} 주최",
            "link": f"{BASE_URL}?c=find&s=1&gub=1&cidx={cidx}&gbn=view&ix={ix}",
            "image": "",
            "is_active": True,
        })
    return items


def fetch_wevity(categories, keep, label: str, source: str = "wevity") -> list:
    """위비티 접수중 공모전 중 keep(contest)을 통과한 것만 수집. 모든 요청이 실패하면 WevityFetchError"""
    print("\n" + "-" * 60)
    print(f"🌐 [Wevity] 위비티 {label} 분야 접수중 공모전 수집 시작")
    print("-" * 60)

    today = datetime.now(KST)
    results = []
    seen = set()
    ok_pages = 0
    errors = []

    for cidx, cat_label, max_pages in categories:
        seen_in_category = set()
        kept_count = 0
        for page in range(1, max_pages + 1):
            url = f"{BASE_URL}?c=find&s=1&gub=1&cidx={cidx}&mode=ing&gp={page}"
            try:
                r = requests.get(url, headers=HEADERS, timeout=10)
                r.raise_for_status()
                r.encoding = "utf-8"
            except Exception as e:
                errors.append(f"{cat_label} p{page}: {e}")
                break
            items = parse_list_page(r.text, today, cidx)
            if items is None:
                errors.append(f"{cat_label} p{page}: 목록 영역(ul.list)을 찾지 못함 — 페이지 구조 변경 의심")
                break
            ok_pages += 1
            new = [c for c in items if c["id"] not in seen_in_category]
            if not new:
                break  # 마지막 페이지를 넘기면 빈 목록이거나 같은 목록이 반복됨
            for c in new:
                seen_in_category.add(c["id"])
                if c["id"] in seen or not keep(c):
                    continue
                seen.add(c["id"])
                c["source"] = source
                results.append(c)
                kept_count += 1
        print(f"  • {cat_label}: {label} 관련 {kept_count}건 (전체 {len(seen_in_category)}건 중)")

    for e in errors:
        print(f"  ⚠️ [Wevity] {e}")
    if ok_pages == 0:
        raise WevityFetchError("; ".join(errors) or "목록 페이지를 하나도 읽지 못함")

    print(f"🎯 [Wevity] {label} 접수중 공모전 총 {len(results)}건 수집")
    return results


def fetch_wevity_contests() -> list:
    """위비티 접수중 공모전 중 토목 관련만 수집"""
    return fetch_wevity(CATEGORIES, is_civil, "토목")


if __name__ == "__main__":
    for c in fetch_wevity_contests():
        print(f" - {c['deadline_date']} | {c['title']} | {c['organizer']} | {c['link']}")
