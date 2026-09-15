#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
전북대학교 아르바이트 게시판 자동 수집 및 정제 엔진 (jbnu_scraper.py)
- 출처: https://www.jbnu.ac.kr/web/unvrslife/square/sub02/1.do
- 디자인 3: 핀터레스트형 워커스 매소너리 보드 및 스마트 월 수입 자동 계산기 지원
"""

import os
import re
import json
import ssl
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

def parse_wage_and_work_condition(company, title, wage_str, work_time_str):
    """
    공고 원본 급여와 근무 조건, 제목, 상호명을 종합 분석하여
    실제 구인 성격(단기·일급 / 시급제 / 월급제 / 협의)에 맞는 정확한 급여 정보 생성.
    - 억지로 일급/단기 알바를 월급으로 환산하거나 부풀리지 않고, 공고 사실 그대로 정직하게 제공.
    """
    c = clean_text(company)
    t = clean_text(title)
    w = clean_text(wage_str)
    tm = clean_text(work_time_str)
    combined = f"{c} {t} {w} {tm}"

    # 1. 특수 케이스: JTV 페스티벌 20만원(10만원*2일)
    if "10만원*2일" in w or ("페스티벌" in combined and re.search(r'(?<!\d)20\s*만', w)):
        return {
            "wage_type": "daily",
            "wage_display": "총 20만원 (10만원 × 2일)",
            "pay_badge": "⚡ 단기 행사 (2일)",
            "pay_highlight": "총 200,000원 (2일간)",
            "pay_subtext": "1일 10만원 × 2일 단기 페스티벌 스태프",
            "sort_wage": 200000,
            "hourly_wage": 14285
        }

    # 2. 다복솔식품 일당 18만원 (9/15~9/23 단기 식품공장)
    if "18만원" in w or "18만원" in t:
        return {
            "wage_type": "daily",
            "wage_display": "일당 180,000원",
            "pay_badge": "⚡ 단기 집중 (야간)",
            "pay_highlight": "일당 180,000원",
            "pay_subtext": "9/15~9/23 단기 야간 근무 (주휴수당 별도)",
            "sort_wage": 180000,
            "hourly_wage": 15000
        }

    # 3. 홈경기 스태프 (NCS, 일꾸미 등) -> 일급 8만원 / 80,000
    if any(k in combined for k in ["전북현대", "홈경기", "홈 경기", "경기 진행스탭", "경기스태프"]):
        if any(k in w for k in ["80,000", "80000", "8만원"]):
            return {
                "wage_type": "daily",
                "wage_display": "일급 80,000원",
                "pay_badge": "⚡ 경기 당일 단기 스태프",
                "pay_highlight": "일급 80,000원",
                "pay_subtext": "홈경기 당일 일정 진행스태프 (시간당 약 11,400원)",
                "sort_wage": 80000,
                "hourly_wage": 11428
            }

    # 4. 명시적 일급/일당
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
            "hourly_wage": amt // 8
        }

    # 5. 월급제 (월 150만원, 120만원, 2800000, 월 220부터, 전임 300만원 등)
    if "2800000" in w:
        return {
            "wage_type": "monthly",
            "wage_display": "월 2,800,000원",
            "pay_badge": "💼 전임·월급제",
            "pay_highlight": "월 2,800,000원",
            "pay_subtext": f"근무시간: {tm}" if tm and tm not in [".", "0"] else "전임 전담 강사",
            "sort_wage": 2800000,
            "hourly_wage": 2800000 // 209
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
            "pay_subtext": f"근무시간: {tm}" if tm and tm not in [".", "0"] else "전임 전담 강사",
            "sort_wage": val,
            "hourly_wage": val // 209
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
            "hourly_wage": val // 209
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
        "hourly_wage": 10030
    }

def scrape_jbnu_albas(max_pages=2):
    """전북대 아르바이트 게시판 크롤링 및 데이터 정제"""
    base_url = "https://www.jbnu.ac.kr/web/unvrslife/square/sub02/1.do"
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    all_jobs = []
    seen_ids = set()

    for page in range(1, max_pages + 1):
        url = f"{base_url}?pageIndex={page}"
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=12) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
        except Exception as e:
            print(f"⚠️ [JBNU Alba] 페이지 {page} 수집 실패: {e}")
            break

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
            reg_date = clean_text(date_m.group(1)) if date_m else datetime.now().strftime("%Y-%m-%d")

            # 공고 팩트 기반 급여 및 근무 형태 정밀 분석
            calc = parse_wage_and_work_condition(company, title, raw_wage, work_time)

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
                "person": person,
                "views": views,
                "dday": dday,
                "reg_date": reg_date,
                "link": official_link,
                "is_urgent": bool(re.search(r'^D-[0-3]$', dday)),
                "is_active": (dday != "접수마감")
            }
            all_jobs.append(job_entry)

    # 데이터 저장
    os.makedirs(DATA_DIR, exist_ok=True)
    payload = {
        "updated_at": datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M:%S KST"),
        "total_count": len(all_jobs),
        "jobs": all_jobs
    }
    with open(JBNU_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"✅ [JBNU Alba] 전북대 아르바이트 {len(all_jobs)}건 수집 및 정제 완료 -> {JBNU_JSON_PATH}")
    return payload

if __name__ == "__main__":
    scrape_jbnu_albas()
