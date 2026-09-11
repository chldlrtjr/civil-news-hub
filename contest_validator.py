#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Civil News Hub - 토목 공모전 데이터 무결성 검증 엔진 (contest_validator.py)
역할:
1. 마감된 공모전(시·분 단위 마감 시각 경과) 원천 차단
2. 과거 연도(2021~2025 등) 공모전 및 실체 없는 가상 공모전 원천 차단
3. 영구 배제(Blacklist) 대상 공모전 자동 탐지 및 배제
4. 카테고리 건수 100% 합산 일치 검증
5. GEMINI.md Rule 1-①, 1-⑤, 1-⑥, 1-⑦ 준수
"""

import re
from datetime import datetime, timezone, timedelta

# 영구 배제(Blacklist) 공모전 키워드 시그니처
# (실제 미개최, 당해 연도 공고 미오픈, 이미 마감된 과거 공모전 등)
PERMANENT_BANNED_SIGNATURES = [
    {"keyword": "삼성 epc", "reason": "2026.09.04 접수 마감 완료 (영구 배제)"},
    {"keyword": "삼성epc", "reason": "2026.09.04 접수 마감 완료 (영구 배제)"},
    {"keyword": "지하안전관리", "reason": "2025년 과거 공모전 / 2026년 공고 미게재 (영구 배제)"},
    {"keyword": "지하안전", "reason": "2025년 과거 공모전 / 2026년 공고 미게재 (영구 배제)"},
    {"keyword": "물 빅데이터", "reason": "2021년 과거 공모전 (영구 배제)"},
    {"keyword": "물빅데이터", "reason": "2021년 과거 공모전 (영구 배제)"},
    {"keyword": "ktx & 인프라", "reason": "2026.07.30 접수 마감 완료 (영구 배제)"},
    {"keyword": "차세대 ktx", "reason": "2026.07.30 접수 마감 완료 (영구 배제)"},
    {"keyword": "국토기술대전", "reason": "당해 연도 미개최 (영구 배제)"},
    {"keyword": "토목의 날 경진대회", "reason": "당해 연도 미개최 (영구 배제)"},
    {"keyword": "건설·교통신기술 창작", "reason": "당해 연도 미개최 (영구 배제)"},
    {"keyword": "스마트건설 챌린지", "reason": "2026년 공식 신규 모집 요강 미발표 (공식 공고 확인 전 노출 금지)"},
    {"keyword": "스마트건설챌린지", "reason": "2026년 공식 신규 모집 요강 미발표 (공식 공고 확인 전 노출 금지)"}
]

# 허용되는 유효 상태 목록 (GEMINI.md Rule 1-⑤: 접수마감 항목 절대 불허)
VALID_STATUSES = {"접수중", "접수예정", "상시접수"}

# 필수 기본 카테고리 목록
VALID_CATEGORIES = {
    "스마트·기술",
    "도로·디자인",
    "수자원·환경",
    "지반·안전",
    "철도·인프라",
    "토목·일반"
}

def get_current_kst() -> datetime:
    """현재 한국 표준시 (KST, UTC+9) 반환"""
    return datetime.now(timezone(timedelta(hours=9)))

def validate_contest(contest: dict, current_time: datetime = None) -> tuple[bool, str]:
    """
    단일 공모전 객체에 대한 철저한 무결성 검증 (Fail-Safe Hard Gate)
    반환값: (is_valid: bool, reason: str)
    """
    if not contest:
        return False, "EMPTY_CONTEST: 공모전 데이터가 비어있습니다."

    now_kst = current_time or get_current_kst()
    current_year = now_kst.year

    title = str(contest.get("title", "")).strip()
    if not title:
        return False, "MISSING_TITLE: 공모전 제목이 누락되었습니다."

    # 1. 영구 배제 블랙리스트 검사
    title_lower = title.lower()
    for item in PERMANENT_BANNED_SIGNATURES:
        if item["keyword"].lower() in title_lower:
            return False, f"BANNED_SIGNATURE: '{item['keyword']}' 포함됨 - {item['reason']}"

    # 2. is_active 플래그 검사
    if contest.get("is_active") is False:
        return False, f"INACTIVE_FLAG: is_active가 False입니다. ({contest.get('reason', '비활성 상태')})"

    # 3. status 상태 검사
    status = contest.get("status", "").strip()
    if status == "접수마감" or "마감" in status:
        return False, f"CLOSED_STATUS: 접수마감된 공모전입니다. (status='{status}')"

    if status not in VALID_STATUSES:
        return False, f"INVALID_STATUS: 허용되지 않은 상태값입니다. (status='{status}')"

    # 4. 과거 연도(Past Years) 탐지 (period 및 deadline_date)
    period = str(contest.get("period", "")).strip()
    for past_year in range(2018, current_year):
        year_str = str(past_year)
        if year_str in period:
            if str(current_year) not in period or "과거" in period or "개최" in period:
                return False, f"PAST_YEAR_DETECTED: 과거 {past_year}년도 공모전 텍스트 감지 (period='{period}')"

    # 5. 마감 일시 정밀 검증 (시·분 단위)
    deadline_date = str(contest.get("deadline_date", "")).strip()
    deadline_time = str(contest.get("deadline_time", "18:00")).strip()

    if deadline_date and "상시" not in deadline_date and status != "상시접수":
        try:
            d_parts = [int(p) for p in deadline_date.split("-")]
            if len(d_parts) != 3:
                return False, f"INVALID_DATE_FORMAT: 올바른 YYYY-MM-DD 형식이 아닙니다. ('{deadline_date}')"

            d_year, d_month, d_day = d_parts[0], d_parts[1], d_parts[2]

            # 마감 연도가 현재 연도보다 이전인 경우
            if d_year < current_year:
                return False, f"PAST_DEADLINE_YEAR: 마감 연도({d_year})가 현재 연도({current_year}) 이전입니다."

            t_parts = [int(p) for p in deadline_time.split(":")]
            t_hour = t_parts[0] if len(t_parts) >= 1 else 18
            t_min = t_parts[1] if len(t_parts) >= 2 else 0

            deadline_dt = datetime(
                d_year, d_month, d_day,
                t_hour, t_min, 0,
                tzinfo=timezone(timedelta(hours=9))
            )

            # 이미 마감 시각이 지난 경우
            if deadline_dt < now_kst:
                diff_sec = (now_kst - deadline_dt).total_seconds()
                hours_past = int(diff_sec // 3600)
                return False, f"DEADLINE_EXPIRED: 접수 마감 시각 경과 ({deadline_dt.strftime('%Y-%m-%d %H:%M')} KST, {hours_past}시간 전 마감됨)"

        except Exception as e:
            return False, f"DATE_PARSE_ERROR: 마감일시 파싱 중 예외 발생 - {e}"

    # 6. 필수 필드 검사
    link = str(contest.get("link", "")).strip()
    if not link or not (link.startswith("http://") or link.startswith("https://")):
        return False, f"INVALID_URL: 유효한 웹 URL이 아닙니다. ('{link}')"

    category = str(contest.get("category", "")).strip()
    if not category:
        return False, "MISSING_CATEGORY: 카테고리가 지정되지 않았습니다."

    return True, "VALID"

def filter_and_validate_contests(contests_list: list, current_time: datetime = None) -> tuple[list, list]:
    """
    공모전 목록 전체에 대한 일괄 검증 및 필터링
    반환값: (valid_contests: list, rejected_contests: list)
    rejected_contests 항목: {"contest": c, "reason": reason}
    """
    valid_contests = []
    rejected_contests = []

    for c in contests_list:
        is_valid, reason = validate_contest(c, current_time=current_time)
        if is_valid:
            valid_contests.append(c)
        else:
            rejected_contests.append({"contest": c, "reason": reason})

    return valid_contests, rejected_contests

def check_category_count_consistency(contests_list: list, categories: list) -> bool:
    """
    GEMINI.md Rule 1-⑥: 전체 건수와 개별 카테고리 합산 100% 일치 검증
    """
    total = len(contests_list)
    cat_sum = 0
    for cat in categories:
        if cat == "ALL":
            continue
        cnt = len([c for c in contests_list if c.get("category") == cat])
        cat_sum += cnt

    return total == cat_sum
