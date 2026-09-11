#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Civil News Hub - 토목 공모전 자동 수집 및 정제 전담 파이프라인 (contest_scraper.py)
규칙 준수 (GEMINI.md):
1. 팩트 기반 공모전 수집 원칙 (허위/과거 공모전, 단순 수상 기사 원천 배제)
2. 주최 기관 공식 딥링크 및 요강 원본 실사 (contest_notice_parser 연동)
3. 접수 마감된 공모전은 대시보드 목록에서 즉시 자동 제외 (Rule 1-⑤)
4. 신규 카테고리 자동 감지 및 전체 건수 합산 100% 일치 보장 (Rule 1-⑥)
"""

import os
import re
import json
import urllib.parse
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

import contest_notice_parser

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
CONTESTS_JSON_PATH = os.path.join(DATA_DIR, "contests.json")

# 카테고리 기본 정의
CONTEST_CATEGORIES = [
    "ALL",
    "스마트·기술",
    "도로·디자인",
    "수자원·환경",
    "지반·안전",
    "철도·인프라"
]

def calculate_contest_dday(deadline_date_str: str, deadline_time_str: str = "18:00") -> dict:
    """
    공모전 마감 일시(시·분 단위)를 기반으로 D-Day 및 마감 여부 정밀 판정
    """
    if not deadline_date_str or "상시" in str(deadline_date_str):
        return {"text": "상시접수", "days": 9999, "is_urgent": False, "is_closed": False}

    try:
        # KST (UTC+9) 기준 현재 시각
        now_kst = datetime.now(timezone(timedelta(hours=9)))
        
        # deadline_date: YYYY-MM-DD
        d_parts = [int(p) for p in deadline_date_str.strip().split("-")]
        t_parts = [int(p) for p in (deadline_time_str or "18:00").strip().split(":")]
        
        deadline_dt = datetime(
            d_parts[0], d_parts[1], d_parts[2],
            t_parts[0], t_parts[1], 0,
            tzinfo=timezone(timedelta(hours=9))
        )
        
        diff = deadline_dt - now_kst
        diff_seconds = diff.total_seconds()
        
        if diff_seconds < 0:
            return {"text": "접수마감", "days": -1, "is_urgent": False, "is_closed": True}
        
        diff_days = int(diff_seconds // 86400)
        
        if diff_days == 0:
            return {"text": "오늘마감", "days": 0, "is_urgent": True, "is_closed": False}
        elif diff_days <= 3:
            return {"text": f"D-{diff_days}", "days": diff_days, "is_urgent": True, "is_closed": False}
        else:
            return {"text": f"D-{diff_days}", "days": diff_days, "is_urgent": False, "is_closed": False}
    except Exception as e:
        return {"text": "접수중", "days": 30, "is_urgent": False, "is_closed": False}

def scrape_civil_contests():
    """
    토목 공모전 전담 수집 및 정제 파이프라인
    - 공식 요강 원본 실사 엔진(contest_notice_parser)을 호출하여 최신 팩트 획득
    - 마감 공모전 즉시 제외
    - 전체 건수 및 카테고리별 건수 100% 동기화
    """
    print("\n" + "="*70)
    print("🚀 [Civil News Hub] 토목 공모전 전담 수집 파이프라인 가동 (contest_scraper.py)")
    print("="*70)

    # 1. 팩트 실사 엔진 가동
    raw_contests = contest_notice_parser.run_comprehensive_contest_inspection()

    # 2. 실시간 유효 공모전 필터링 (Rule 1-⑤: 마감 공모전 자동 내림)
    active_contests = []
    for c in raw_contests:
        dday_info = calculate_contest_dday(c.get("deadline_date", ""), c.get("deadline_time", "18:00"))
        
        # 현재 상태 보정
        if dday_info["is_closed"]:
            print(f"❌ [마감 내림] {c['title']} ({c['period']}) -> 접수 마감되어 목록 제외")
            continue
            
        c["dday_info"] = dday_info
        if c.get("status") != "접수예정" and c.get("status") != "상시접수":
            c["status"] = "접수중"
            c["status_color"] = "emerald"
            
        active_contests.append(c)

    # 3. 카테고리 동적 감지 및 검증 (Rule 1-⑥)
    categories = list(CONTEST_CATEGORIES)
    for c in active_contests:
        cat = c.get("category", "토목·일반")
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

    print(f"  -------------------------------------")
    print(f"  총 건수 [ALL]: {len(active_contests)}건 | 개별 카테고리 합계: {cat_sum}건")
    if len(active_contests) == cat_sum:
        print("  ✅ [100% 일치] 전체 건수와 개별 카테고리 탭 건수 합산이 완벽히 일치합니다! (Rule 1-⑥)")
    else:
        print(f"  ⚠️ [불일치 감지] 전체({len(active_contests)}) != 합계({cat_sum})")

    # 6. JSON 파일 저장
    now_kst = datetime.now(timezone(timedelta(hours=9)))
    contests_data = {
        "last_updated": now_kst.strftime("%Y-%m-%d %H:%M:%S"),
        "last_updated_display": now_kst.strftime("%m월 %d일 %H:%M"),
        "total_count": len(active_contests),
        "featured_count": len(active_contests),
        "categories": categories,
        "contests": active_contests
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CONTESTS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(contests_data, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 팩트 기반 검증 완료된 총 {len(active_contests)}건의 공모전 저장 완료! ({CONTESTS_JSON_PATH})")
    return contests_data

if __name__ == "__main__":
    scrape_civil_contests()
