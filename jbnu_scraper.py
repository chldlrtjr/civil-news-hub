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

def parse_wage_and_estimate(wage_str, work_time_str):
    """급여 문자열과 근무시간을 분석하여 스마트 월 예상 수입 계산"""
    wage_str = clean_text(wage_str)
    work_time_str = clean_text(work_time_str)

    # 1. 일당인 경우
    daily_m = re.search(r'일당\s*([\d,]+)\s*원?', wage_str)
    if daily_m:
        daily_amt = int(daily_m.group(1).replace(',', ''))
        # 단기 일수 추정
        days_m = re.search(r'(\d+)\s*일', work_time_str + " " + wage_str)
        days = int(days_m.group(1)) if days_m else 5
        total_amt = daily_amt * days
        return {
            "wage_display": f"일당 {daily_amt:,}원",
            "wage_type": "daily",
            "hourly_wage": daily_amt // 8,
            "monthly_estimate": f"단기 예상 총 {total_amt:,}원",
            "estimate_subtext": f"({days}일 집중 근무 기준)",
            "estimate_amt": total_amt
        }

    # 2. 월급인 경우
    monthly_m = re.search(r'(?:월급|전임)\s*([\d,]+)\s*만?원?', wage_str)
    if monthly_m:
        val_str = monthly_m.group(1).replace(',', '')
        val = int(val_str)
        if val < 1000:  # 단위가 만원인 경우 (예: 300)
            val = val * 10000
        return {
            "wage_display": f"월 {val:,}원",
            "wage_type": "monthly",
            "hourly_wage": val // 209,
            "monthly_estimate": f"월 {val:,}원",
            "estimate_subtext": "(전임/정규 파트 기준)",
            "estimate_amt": val
        }

    # 3. 회당 과외비
    per_time_m = re.search(r'(?:회당|건당)\s*([\d,]+)\s*원?', wage_str)
    if per_time_m:
        per_amt = int(per_time_m.group(1).replace(',', ''))
        monthly_amt = per_amt * 8  # 주 2회 기준 월 8회
        return {
            "wage_display": f"회당 {per_amt:,}원",
            "wage_type": "per_class",
            "hourly_wage": per_amt // 2,
            "monthly_estimate": f"월 약 {monthly_amt:,}원",
            "estimate_subtext": "(주 2회 × 4주 기준)",
            "estimate_amt": monthly_amt
        }

    # 4. 시급인 경우
    hourly_m = re.search(r'(?:시급\s*)?([\d,]+)\s*원?', wage_str)
    if hourly_m and len(hourly_m.group(1).replace(',', '')) >= 4:
        hourly_amt = int(hourly_m.group(1).replace(',', ''))
        if 9000 <= hourly_amt <= 100000:
            # 주당 시간 추정
            days_count = 3
            if any(k in work_time_str for k in ["월~금", "평일", "월화수목금"]):
                days_count = 5
            elif any(k in work_time_str for k in ["주말", "토일", "토·일"]):
                days_count = 2
            elif any(k in work_time_str for k in ["화목금", "월수금", "화·목·금"]):
                days_count = 3
            elif any(k in work_time_str for k in ["화목", "월수", "월목"]):
                days_count = 2
            elif "목" in work_time_str and "화" not in work_time_str:
                days_count = 1

            hours_per_day = 4
            if any(k in work_time_str for k in ["3시간", "3시~6시", "16~19"]):
                hours_per_day = 3
            elif any(k in work_time_str for k in ["2시간", "19:30~21:30"]):
                hours_per_day = 2
            elif any(k in work_time_str for k in ["6시간", "09:00~15:00"]):
                hours_per_day = 6

            weekly_hours = days_count * hours_per_day
            monthly_amt = weekly_hours * 4 * hourly_amt
            return {
                "wage_display": f"시급 {hourly_amt:,}원",
                "wage_type": "hourly",
                "hourly_wage": hourly_amt,
                "monthly_estimate": f"월 약 {monthly_amt:,}원",
                "estimate_subtext": f"(주 {weekly_hours}시간 × 4주 기준)",
                "estimate_amt": monthly_amt
            }

    # 협의 또는 미상
    clean_w = wage_str if wage_str and wage_str not in [".", "-", "0", "111", "협의"] else "시급 협의"
    return {
        "wage_display": clean_w,
        "wage_type": "negotiable",
        "hourly_wage": 10030,  # 2025 최저시급 기준
        "monthly_estimate": "면접 후 협의 결정",
        "estimate_subtext": "(근무시간 및 경력 연동)",
        "estimate_amt": 0
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

            # 스마트 월 수입 추정 계산
            calc = parse_wage_and_estimate(raw_wage, work_time)

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
                "hourly_wage": calc["hourly_wage"],
                "monthly_estimate": calc["monthly_estimate"],
                "estimate_subtext": calc["estimate_subtext"],
                "estimate_amt": calc["estimate_amt"],
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
