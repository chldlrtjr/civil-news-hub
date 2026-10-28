#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
전북대학교 아르바이트 게시판 자동 수집 및 정제 엔진 (jbnu_scraper.py)
- 출처: https://www.jbnu.ac.kr/web/unvrslife/square/sub02/1.do
- 디자인 3: 핀터레스트형 워커스 매소너리 보드 및 스마트 월 수입 자동 계산기 지원
"""

import os
import re
import sys
import json
import urllib.request
from datetime import datetime, timezone, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
JBNU_JSON_PATH = os.path.join(DATA_DIR, "jbnu_albas.json")

# 카테고리 매핑 및 이모지/색상 정의
CATEGORY_MAP = {
    "교육": {"name": "학원·과외", "emoji": "📚", "badge_color": "blue"},
    "사무": {"name": "사무·행정", "emoji": "💼", "badge_color": "purple"},
    "제조": {"name": "제조·물류", "emoji": "🏭", "badge_color": "amber"},
    "외식": {"name": "카페·식당", "emoji": "☕", "badge_color": "emerald"},
    "매장": {"name": "매장·서비스", "emoji": "🏬", "badge_color": "rose"},
    "기타": {"name": "일반·기타", "emoji": "✨", "badge_color": "slate"}
}

def clean_text(text):
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

WEEKDAYS = "월화수목금토일"
# 요일 묶음: '월~금', '월-토', '월수금', '화,수,목', '토, 일', '월요일, 수요일' (숫자 뒤 '10월'·'31일', '월급' 같은 단어는 제외)
_DAY = r'[월화수목금토일](?:요일)?'
DAY_RANGE_RE = re.compile(r'(?<![\d가-힣])([월화수목금토일])(?:요일)?\s*[~\-]\s*([월화수목금토일])(?:요일)?(?![가-힣])')
DAY_LIST_RE = re.compile(r'(?<![\d가-힣])(' + _DAY + r'(?:\s*[,·\s]?\s*' + _DAY + r')*)(?![가-힣])')
DAY_WORD_RE = re.compile(r'평일|주말|매일|주\s*(\d)\s*(?:일|회)')
# 시각: '16:30', '3시 50분', '4시30', '9시반', '오후 2', '9:00AM'
_TIME = r'(?:(오전|오후|저녁|새벽|밤)\s*)?(\d{1,2})(?:\s*[:시]\s*(\d{1,2}|반)?\s*분?)?\s*(AM|PM|am|pm)?'
TIME_RANGE_RE = re.compile(r'(?<![\d/.])' + _TIME + r'\s*(?:~|-|–|부터)\s*' + _TIME + r'\s*시?(?!\s*(?:간|회|일|명|만|원|\d))')
# 선택지·범위가 있어 주 근무시간을 하나로 정할 수 없는 표현
AMBIGUOUS_RE = re.compile(r'[A-C]\s*조|\d\s*팀|또는|혹은|\bor\b|사이|주\s*\d\s*[~\-]\s*\d|선택')
SPECIFIC_DATE_RE = re.compile(r'\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}/\d{1,2}')


def _to_hours(ampm, h, m, suffix):
    h = int(h)
    m = 30 if m == "반" else int(m or 0)
    if h > 24 or m > 59:
        return None
    if ampm in ("오후", "저녁", "밤") or (suffix or "").lower() == "pm":
        if h < 12:
            h += 12
    return (h % 24) + m / 60


def _range_hours(match):
    """시각 범위 → 근무시간(시간). 끝이 시작보다 이르면 오후(+12) 또는 다음 날(+24)로 해석"""
    a1, h1, m1, s1, a2, h2, m2, s2 = match.groups()
    start = _to_hours(a1, h1, m1, s1)
    end = _to_hours(a2, h2, m2, s2)
    if start is None or end is None:
        return None
    if end <= start:
        end = end + 12 if end + 12 > start else end + 24
    hours = end - start
    return hours if 0.5 <= hours <= 14 else None


def _day_count(token):
    """요일 표현 → 주당 근무 일수"""
    if token.startswith("평일"):
        return 5
    if token.startswith("주말"):
        return 2
    if token.startswith("매일"):
        return 7
    m = re.match(r'주\s*(\d)', token)
    if m:
        return int(m.group(1))
    m = DAY_RANGE_RE.fullmatch(token)
    if m:
        a, b = WEEKDAYS.index(m.group(1)), WEEKDAYS.index(m.group(2))
        return (b - a) % 7 + 1  # '일 - 목'처럼 주를 넘어가는 범위 포함
    return len(set(re.findall(r'[월화수목금토일](?!요)', token.replace("요일", ""))))


def parse_weekly_hours(work_time):
    """
    근무시간 원문 → 주 근무시간(시간) 또는 None
    - 요일과 하루 근무시간이 모두 명확할 때만 계산 ('월~금 16:00-22:00' → 30)
    - 요일마다 시간이 따로 적히면 합산 ('평일 16:30~20:30 / 토요일 09:00~13:00' → 24)
    - 선택지·범위(A조/B조, 또는, 주 2~3회), 특정 날짜 단발 근무, 요일이나 시간이 빠진 경우는 None
    - 계산 결과가 주 84시간(하루 12시간 × 7일)을 넘으면 영업시간을 적은 것으로 보고 None
    """
    t = clean_text(work_time)
    if not t or AMBIGUOUS_RE.search(t) or SPECIFIC_DATE_RE.search(t):
        return None

    events = []  # (위치, 'days', 일수) / (위치, 'time', 시간)
    taken = []
    for m in TIME_RANGE_RE.finditer(t):
        hours = _range_hours(m)
        if hours is None:
            return None
        events.append((m.start(), "time", hours))
        taken.append((m.start(), m.end()))
    for regex in (DAY_RANGE_RE, DAY_WORD_RE, DAY_LIST_RE):
        for m in regex.finditer(t):
            if any(a <= m.start() < b for a, b in taken):
                continue
            count = _day_count(m.group(0))
            if not count:
                return None
            events.append((m.start(), "days", count))
            taken.append((m.start(), m.end()))
    events.sort()

    times = [e for e in events if e[1] == "time"]
    days = [e for e in events if e[1] == "days"]
    if not times or not days:
        return None

    if len(times) == 1 and len(days) == 1:
        weekly = times[0][2] * days[0][2]
    else:
        # 요일-시간 쌍: 각 시간 범위 바로 앞에 그 범위만의 요일 표현이 있어야 함
        weekly, pending = 0, None
        for _, kind, value in events:
            if kind == "days":
                if pending is not None:
                    return None  # 요일만 연달아 나오고 시간이 없음
                pending = value
            else:
                if pending is None:
                    return None  # 요일 없이 시간만 → 선택지로 봄
                weekly += pending * value
                pending = None
        if pending is not None:
            return None
    return round(weekly, 1) if 1 <= weekly <= 84 else None  # 84 = 하루 12시간 × 7일 (영업시간을 적은 경우 등 배제)


def parse_wage_and_work_condition(company, title, wage_str, work_time_str):
    """
    공고 원본 급여와 근무 조건, 제목, 상호명을 종합 분석하여
    실제 구인 성격(단기·일급 / 시급제 / 월급제 / 협의)에 맞는 정확한 급여 정보 생성.
    - 억지로 일급/단기 알바를 월급으로 환산하거나 부풀리지 않고, 공고 사실 그대로 정직하게 제공.
    """
    t = clean_text(title)
    w = clean_text(wage_str)
    tm = clean_text(work_time_str)
    # hourly_wage: 공고에 시급이 적힌 경우에만 값이 있고, 일급·월급·협의는 0 (임의 환산 금지)

    # 1. 명시적 일급/일당
    daily_m = re.search(r'(?:일급|일당)\s*([\d,]+)\s*(만)?원?', w + " " + t)
    if daily_m:
        amt = int(daily_m.group(1).replace(',', ''))
        if daily_m.group(2) == '만' or amt < 1000:
            amt *= 10000
        return {
            "wage_type": "daily",
            "wage_display": f"일급 {amt:,}원",
            "pay_badge": "⚡ 단기·일급",
            "pay_highlight": f"일급 {amt:,}원",
            "pay_subtext": f"근무시간: {tm}" if tm and tm not in [".", "0"] else "단기 일정 근무",
            "sort_wage": amt,
            "hourly_wage": 0
        }

    # 2. 금액만 적힌 단기 행사형: 5만~30만원 + 근무시간에 특정 날짜('10월31일', '11/3')가 있으면 일급으로 판단
    plain_m = re.fullmatch(r'([\d,]{5,9})\s*원?', w)
    if plain_m and re.search(r'\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}/\d{1,2}', tm):
        amt = int(plain_m.group(1).replace(',', ''))
        if 50000 <= amt <= 300000:
            return {
                "wage_type": "daily",
                "wage_display": f"일급 {amt:,}원",
                "pay_badge": "⚡ 단기·일급",
                "pay_highlight": f"일급 {amt:,}원",
                "pay_subtext": f"근무일시: {tm}",
                "sort_wage": amt,
                "hourly_wage": 0
            }

    # 3. 월급제 (월 150만원, 120만원, 2800000, 1,500,000, 월 220부터, 전임 300만원 등)
    if plain_m and int(plain_m.group(1).replace(',', '')) >= 1000000:
        val = int(plain_m.group(1).replace(',', ''))
        return {
            "wage_type": "monthly",
            "wage_display": f"월 {val:,}원",
            "pay_badge": "💼 전임·월급제",
            "pay_highlight": f"월 {val:,}원",
            "pay_subtext": f"근무시간: {tm}" if tm and tm not in [".", "0"] else "근무시간 협의",
            "sort_wage": val,
            "hourly_wage": 0
        }

    monthly_man_m = re.search(r'(?:월\s*|월급\s*|전임\s*)?([\d,]+)\s*만\s*원?', w)
    if not monthly_man_m and any(k in w for k in ["월", "전임", "150만원", "120만원"]):
        monthly_man_m = re.search(r'([\d,]+)\s*만\s*원?', w)

    if monthly_man_m and int(monthly_man_m.group(1).replace(',', '')) >= 50:
        val = int(monthly_man_m.group(1).replace(',', '')) * 10000
        suffix = " 이상" if "이상" in w else ""
        return {
            "wage_type": "monthly",
            "wage_display": f"월 {val:,}원{suffix}",
            "pay_badge": "💼 전임·월급제",
            "pay_highlight": f"월 {val:,}원{suffix}",
            "pay_subtext": f"근무시간: {tm}" if tm and tm not in [".", "0"] else "근무시간 협의",
            "sort_wage": val,
            "hourly_wage": 0
        }

    # 월 220부터 등
    monthly_start_m = re.search(r'월\s*([\d,]+)(?:만)?\s*(?:원)?\s*부터', w)
    if monthly_start_m:
        raw_num = int(monthly_start_m.group(1))
        val = raw_num * 10000 if raw_num < 1000 else raw_num
        return {
            "wage_type": "monthly",
            "wage_display": f"월 {val:,}원부터",
            "pay_badge": "💼 전임·월급제",
            "pay_highlight": f"월 {val:,}원부터",
            "pay_subtext": "경력 및 능력에 따라 조정 협의",
            "sort_wage": val,
            "hourly_wage": 0
        }

    # 6. 시급제
    # 범위 시급: 10500~13000, 11000, 13000, 15000~17000
    range_m = re.search(r'([\d,]{4,6})\s*[~,]\s*([\d,]{4,6})', w)
    if range_m:
        min_v = int(range_m.group(1).replace(',', ''))
        max_v = int(range_m.group(2).replace(',', ''))
        sub = f"근무시간: {tm}" if tm and tm not in [".", "0"] else "파트타임 알바"
        return {
            "wage_type": "hourly",
            "wage_display": f"시급 {min_v:,}원 ~ {max_v:,}원",
            "pay_badge": "⏱️ 시급제 알바",
            "pay_highlight": f"시급 {min_v:,}~{max_v:,}원",
            "pay_subtext": sub,
            "sort_wage": min_v,
            "hourly_wage": min_v
        }

    # 점 표기 시급: 시급 13.000부터
    dot_hourly_m = re.search(r'시급\s*([\d.]+)', w)
    if dot_hourly_m:
        cleaned_num = dot_hourly_m.group(1).replace('.', '')
        if cleaned_num.isdigit() and 9000 <= int(cleaned_num) <= 50000:
            val = int(cleaned_num)
            suffix = "부터" if "부터" in w else ""
            sub = f"근무시간: {tm}" if tm and tm not in [".", "0"] else "파트타임 알바"
            return {
                "wage_type": "hourly",
                "wage_display": f"시급 {val:,}원{suffix}",
                "pay_badge": "⏱️ 시급제 알바",
                "pay_highlight": f"시급 {val:,}원{suffix}",
                "pay_subtext": sub,
                "sort_wage": val,
                "hourly_wage": val
            }

    # 단일 시급: 시급 13000원, 10302 원, 10400, 12,000 등
    hourly_m = re.search(r'(?:시급\s*)?([\d,]{4,6})\s*원?', w)
    if hourly_m:
        val = int(hourly_m.group(1).replace(',', ''))
        if 9000 <= val <= 50000:
            sub = f"근무시간: {tm}" if tm and tm not in [".", "0"] else "파트타임 알바"
            if "주25시간" in w:
                sub = "주 25시간 근무 (주 375,000원)"
            return {
                "wage_type": "hourly",
                "wage_display": f"시급 {val:,}원",
                "pay_badge": "⏱️ 시급제 알바",
                "pay_highlight": f"시급 {val:,}원",
                "pay_subtext": sub,
                "sort_wage": val,
                "hourly_wage": val
            }

    # 7. 협의 또는 면접 후 결정
    clean_w = w if w and w not in [".", "-", "0", "111", "협의"] else "면접 후 협의"
    if clean_w == "차등지급":
        clean_w = "경력별 차등지급"
    return {
        "wage_type": "negotiable",
        "wage_display": clean_w,
        "pay_badge": "🤝 급여 협의",
        "pay_highlight": clean_w,
        "pay_subtext": f"근무시간: {tm}" if tm and tm not in [".", "0"] else "면접 시 일정 및 급여 협의",
        "sort_wage": 0,
        "hourly_wage": 0
    }

class AlbaFetchError(Exception):
    """아르바이트 게시판을 한 페이지도 읽지 못했을 때 (기존 데이터 유지)"""


def deadline_from_dday(dday, today):
    """게시판 D-day는 '오늘' 기준 남은 일수 → 마감일 = 오늘 + n (등록일 기준이 아님)"""
    if dday in ("D-day", "D-0", "D-Day"):
        return today.strftime("%Y-%m-%d")
    m = re.fullmatch(r'D-(\d+)', dday)
    if m:
        return (today + timedelta(days=int(m.group(1)))).strftime("%Y-%m-%d")
    return None


def infer_work_date(month, day, reg_dt):
    """연도 없는 근무일(10월 31일) → 등록일 기준 연도, 등록일보다 2달 넘게 이전이면 다음 해"""
    d = datetime(reg_dt.year, month, day)
    if d < reg_dt - timedelta(days=60):
        d = datetime(reg_dt.year + 1, month, day)
    return d


def scrape_jbnu_albas(max_pages=2):
    """전북대 아르바이트 게시판 크롤링 및 데이터 정제 (한 페이지도 못 읽으면 AlbaFetchError)"""
    base_url = "https://www.jbnu.ac.kr/web/unvrslife/square/sub02/1.do"
    kst = timezone(timedelta(hours=9))
    today = datetime.now(kst).date()

    all_jobs = []
    seen_ids = set()
    ok_pages = 0
    closed_count = 0

    for page in range(1, max_pages + 1):
        url = f"{base_url}?pageIndex={page}"
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
        except Exception as e:
            print(f"⚠️ [JBNU Alba] 페이지 {page} 수집 실패: {e}")
            break
        ok_pages += 1

        table_m = re.findall(r'<table.*?</table>', html, re.DOTALL)
        if not table_m:
            continue

        trs = re.findall(r'<tr class="tr-normal".*?</tr>', table_m[0], re.DOTALL)
        for tr in trs:
            # 고유 번호
            pst_m = re.search(r'pf_DetailMove\(\'(\d+)\'\)', tr)
            if not pst_m:
                continue
            pst_id = pst_m.group(1)
            if pst_id in seen_ids:
                continue
            seen_ids.add(pst_id)

            # 상호명
            company_m = re.search(r'<td class="td-type-01">(.*?)</td>', tr, re.DOTALL)
            company = clean_text(company_m.group(1)) if company_m else "전북대 인근"

            # 제목
            title_m = re.search(r'<font style="display:inline-block;">(.*?)</font>', tr, re.DOTALL)
            if not title_m:
                title_m = re.search(r'<a href="javascript:;" class="title"[^>]*>(.*?)</a>', tr, re.DOTALL)
            title = clean_text(title_m.group(1)) if title_m else "아르바이트 구인"
            title = re.sub(r'D-\s*\d+', '', title).strip()

            # 마감 D-day
            dday_m = re.search(r'<div class="dday">\s*(.*?)\s*</div>', tr, re.DOTALL)
            dday = clean_text(dday_m.group(1)) if dday_m else "접수중"
            dday = re.sub(r'\s+', '', dday)

            # 카테고리
            cat_m = re.search(r'<div class="type-01">\s*<dt>(.*?)</dt>', tr, re.DOTALL)
            raw_cat = clean_text(cat_m.group(1)) if cat_m else "기타"
            
            # 카테고리 세분화
            category_info = CATEGORY_MAP.get(raw_cat, CATEGORY_MAP["기타"])
            if "어학원" in company or "학원" in company or "과외" in title or "수학" in title or "영어" in title:
                category_info = CATEGORY_MAP["교육"]
            elif "카페" in company or "바리스타" in title or "홀" in title:
                category_info = CATEGORY_MAP["외식"]
            elif "센터" in company or "산학" in company or "연구" in title or "행정" in title:
                category_info = CATEGORY_MAP["사무"]
            elif "공장" in title or "식품" in company or "제조" in raw_cat:
                category_info = CATEGORY_MAP["제조"]

            # 급여
            wage_m = re.search(r'<div class="type-01">.*?<dd>(.*?)</dd>', tr, re.DOTALL)
            raw_wage = clean_text(wage_m.group(1)) if wage_m else "시급 협의"

            # 근무시간
            time_m = re.search(r'<dl class="list">.*?<div>\s*<dt></dt>\s*<dd>(.*?)</dd>', tr, re.DOTALL)
            work_time = clean_text(time_m.group(1)) if time_m else "시간 협의"

            # 모집인원
            person_m = re.search(r'<dt>모집인원</dt>\s*<dd>(.*?)</dd>', tr, re.DOTALL)
            person = clean_text(person_m.group(1)) if person_m else "1"
            if not person.endswith("명") and person.isdigit():
                person = f"{person}명"

            # 조회수
            view_m = re.search(r'<dt>조회수</dt>\s*<dd>(.*?)</dd>', tr, re.DOTALL)
            views = clean_text(view_m.group(1)) if view_m else "0"

            # 등록일
            date_m = re.search(r'<div class="deadline">\s*(.*?)\s*</div>', tr, re.DOTALL)
            reg_date = clean_text(date_m.group(1)) if date_m else today.strftime("%Y-%m-%d")

            # 접수 마감된 공고는 저장하지 않음 (프론트가 D-day를 해석 못 하면 기본값으로 노출되던 문제 방지)
            if "마감" in dday:
                closed_count += 1
                continue

            # 공고 팩트 기반 급여 및 근무 형태 정밀 분석
            calc = parse_wage_and_work_condition(company, title, raw_wage, work_time)

            # 캘린더용 접수 마감일(deadline_date) 및 단기/행사 근무일(work_dates) 산출
            deadline_date = deadline_from_dday(dday, today)

            try:
                reg_dt = datetime.strptime(reg_date, "%Y-%m-%d")
            except ValueError:
                reg_dt = datetime.combine(today, datetime.min.time())

            work_dates = []
            full_txt = title + " " + work_time
            range_m = re.search(r'(\d{1,2})[/\.월]\s*(\d{1,2})일?\s*[~-]\s*(\d{1,2})[/\.월]\s*(\d{1,2})일?', full_txt)
            if range_m:
                m1, d1, m2, d2 = (int(g) for g in range_m.groups())
                try:
                    start_d = infer_work_date(m1, d1, reg_dt)
                    end_d = infer_work_date(m2, d2, reg_dt)
                    if 0 <= (end_d - start_d).days <= 31:
                        cur = start_d
                        while cur <= end_d:
                            work_dates.append(cur.strftime("%Y-%m-%d"))
                            cur += timedelta(days=1)
                except ValueError:
                    pass

            for sm in re.finditer(r'(\d{1,2})월\s*(\d{1,2})일', full_txt):
                try:
                    w_d = infer_work_date(int(sm.group(1)), int(sm.group(2)), reg_dt).strftime("%Y-%m-%d")
                except ValueError:
                    continue
                if w_d not in work_dates:
                    work_dates.append(w_d)

            # 상세 링크 (전북대 공식 공고 직결)
            official_link = f"https://www.jbnu.ac.kr/web/Board/{pst_id}/detailView.do"

            job_entry = {
                "id": pst_id,
                "company": company,
                "title": title,
                "category_id": raw_cat,
                "category_name": category_info["name"],
                "category_emoji": category_info["emoji"],
                "badge_color": category_info["badge_color"],
                "wage_raw": raw_wage,
                "wage_display": calc["wage_display"],
                "wage_type": calc["wage_type"],
                "pay_badge": calc["pay_badge"],
                "pay_highlight": calc["pay_highlight"],
                "pay_subtext": calc["pay_subtext"],
                "sort_wage": calc["sort_wage"],
                "hourly_wage": calc["hourly_wage"],
                # 하위 호환성 필드 (구버전 스크립트/캐시 대비)
                "monthly_estimate": calc["pay_highlight"],
                "estimate_subtext": calc["pay_subtext"],
                "estimate_amt": calc["sort_wage"],
                "work_time": work_time,
                # 근무시간 원문에서 요일·시간이 모두 명확할 때만 계산한 주 근무시간 (없으면 None → 월 수입 추정 안 함)
                "weekly_hours": parse_weekly_hours(work_time) if calc["wage_type"] == "hourly" else None,
                "person": person,
                "views": views,
                "dday": dday,
                "reg_date": reg_date,
                "deadline_date": deadline_date,
                "work_dates": work_dates,
                "link": official_link,
                "is_urgent": bool(re.search(r'^D-[0-3]$', dday)) or dday in ("D-day", "D-Day", "D-0"),
                "is_active": True
            }
            all_jobs.append(job_entry)

    # 게시판을 한 페이지도 못 읽었으면 기존 데이터 유지 + 실패 처리 (cron 알림)
    if ok_pages == 0:
        raise AlbaFetchError("전북대 아르바이트 게시판에 접속하지 못했습니다 — 기존 데이터를 유지합니다")
    if closed_count:
        print(f"  [-] 접수 마감 공고 {closed_count}건 제외")

    os.makedirs(DATA_DIR, exist_ok=True)
    payload = {
        "updated_at": datetime.now(kst).strftime("%Y-%m-%d %H:%M:%S KST"),
        "total_count": len(all_jobs),
        "jobs": all_jobs
    }
    temp_path = JBNU_JSON_PATH + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(temp_path, JBNU_JSON_PATH)

    print(f"✅ [JBNU Alba] 전북대 아르바이트 {len(all_jobs)}건 수집 및 정제 완료 -> {JBNU_JSON_PATH}")
    return payload

if __name__ == "__main__":
    try:
        scrape_jbnu_albas()
    except AlbaFetchError as e:
        print(f"❌ [JBNU Alba] {e}")
        sys.exit(1)  # cron_scrape.sh가 카카오톡 실패 알림 발송
