#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
전북대학교 SW중심대학사업단 프로그램 자동 수집 및 정제 엔진 (swuniv_scraper.py)
-------------------------------------------------------------------------------
- 출처 1: https://swuniv.jbnu.ac.kr/main/jbnusw?gc=Program (온라인 신청 게시판)
- 출처 2: https://swuniv.jbnu.ac.kr/main/jbnusw?gc=605XOAS (공지사항 게시판 - 학생 선발/지원/경진대회)
- 규칙 준수 (GEMINI.md):
  - Rule 1-① 팩트 검증 및 실체 없는 공모전 배제
  - Rule 1-⑤ 접수마감 프로그램 자동 내림(게시 제외) 절대 원칙 (days_left < 0 원천 배제)
  - Rule 1-⑥ 신규 카테고리 자동 감지 및 건수 합산 일치
  - Rule 1-⑦ 마감 재발 방지 다중 방어 시스템 (백엔드 1차 방어선)
"""

import os
import re
import json
import ssl
import time
import urllib.request
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
SWUNIV_JSON_PATH = os.path.join(DATA_DIR, "swuniv_programs.json")

KST = timezone(timedelta(hours=9))

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://swuniv.jbnu.ac.kr/main/jbnusw"
}

def clean_text(text):
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def safe_fetch(url, max_retries=3, timeout=12):
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
                return resp.read().decode('utf-8', errors='ignore')
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1.0)
            else:
                print(f"[-] Fetch failed for {url}: {e}")
                return None

def normalize_title(title):
    t = re.sub(r'202\d(?:학년도)?', '', title)
    t = re.sub(r'\[[^\]]+\]|\([^\)]+\)', '', t)
    t = re.sub(r'[^가-힣a-zA-Z0-9]', '', t)
    return t.lower()

def is_same_program(t1, t2):
    """동일 프로그램 중복 여부 판정 (온라인 신청 게시판 vs 공지사항)"""
    w1 = set(re.findall(r'[가-힣a-zA-Z0-9]{3,}', normalize_title(t1)))
    w2 = set(re.findall(r'[가-힣a-zA-Z0-9]{3,}', normalize_title(t2)))
    overlap = w1 & w2
    if len(overlap) >= 2:
        return True
    if any(stem in normalize_title(t1) and stem in normalize_title(t2) for stem in ["metamobil", "자율주행"]):
        return True
    return False

def parse_period_from_string(text, default_year=2026):
    """문자열에서 시작일과 마감일을 추출 (점, 대시, 슬래시 및 한글 연월일 포맷 지원)"""
    if not text:
        return None

    # Pattern 1: YYYY.MM.DD ~ YYYY.MM.DD or YYYY년 MM월 DD일 ~ MM월 DD일
    m = re.search(r'(?:(\d{4})[\.\-\/년\s]*\s*)?(\d{1,2})[\.\-\/월\s]*\s*(\d{1,2})\s*일?\.?(?:\([^\)]*\))?\s*~\s*(?:(\d{4})[\.\-\/년\s]*\s*)?(\d{1,2})[\.\-\/월\s]*\s*(\d{1,2})\s*일?', text)
    if m:
        sy, sm, sd, ey, em, ed = m.groups()
        start_yr = int(sy) if sy else default_year
        end_yr = int(ey) if ey else (int(sy) if sy else default_year)
        try:
            return (
                datetime(start_yr, int(sm), int(sd), tzinfo=KST).date(),
                datetime(end_yr, int(em), int(ed), tzinfo=KST).date()
            )
        except Exception:
            pass

    # Pattern 2: ~ MM.DD or ~ MM월 DD일
    m2 = re.search(r'~\s*(?:(\d{4})[\.\-\/년\s]*\s*)?(\d{1,2})[\.\/월\s]*\s*(\d{1,2})', text)
    if m2:
        try:
            ey, em, ed = m2.groups()
            end_yr = int(ey) if ey else default_year
            return (
                datetime.now(KST).date(),
                datetime(end_yr, int(em), int(ed), tzinfo=KST).date()
            )
        except Exception:
            pass

    return None

def parse_dday(apply_period_str, now_kst=None):
    """
    신청기간 문자열에서 마감일을 파싱하여 D-Day 및 상태를 산출
    - [GEMINI.md Rule 1-⑤ 절대 원칙] diff_days < 0 시 상태 '접수마감' 산출
    """
    if not now_kst:
        now_kst = datetime.now(KST)
    today = now_kst.date()

    if not apply_period_str or apply_period_str == "-" or "상시" in apply_period_str:
        return {"dday": "상시접수", "status": "상시접수", "days_left": 999, "deadline_date": "", "start_date": ""}

    dates = re.findall(r'(\d{2,4})\s*[\.\-\/]\s*(\d{1,2})\s*[\.\-\/]\s*(\d{1,2})', apply_period_str)
    if not dates:
        single = re.findall(r'(\d{1,2})\s*[\.\-\/]\s*(\d{1,2})', apply_period_str)
        if single:
            m, d = int(single[-1][0]), int(single[-1][1])
            y = 2026
            try:
                end_date = datetime(y, m, d, 23, 59, 59, tzinfo=KST).date()
                diff = (end_date - today).days
                if diff < 0:
                    return {"dday": "마감", "status": "접수마감", "days_left": -1, "deadline_date": end_date.strftime("%Y-%m-%d"), "start_date": ""}
                elif diff == 0:
                    return {"dday": "D-Day", "status": "오늘마감", "days_left": 0, "deadline_date": end_date.strftime("%Y-%m-%d"), "start_date": ""}
                else:
                    return {"dday": f"D-{diff}", "status": "마감임박" if diff <= 3 else "접수중", "days_left": diff, "deadline_date": end_date.strftime("%Y-%m-%d"), "start_date": ""}
            except Exception:
                pass
        return {"dday": "공고확인", "status": "접수중", "days_left": 999, "deadline_date": "", "start_date": ""}

    try:
        def normalize_year(y):
            return 2000 + y if y < 100 else y

        start_parts = [int(p) for p in dates[0]]
        start_year = normalize_year(start_parts[0])
        start_date = datetime(start_year, start_parts[1], start_parts[2], tzinfo=KST).date()

        if len(dates) >= 2:
            end_parts = [int(p) for p in dates[1]]
        else:
            end_parts = start_parts

        end_year = normalize_year(end_parts[0])
        end_date = datetime(end_year, end_parts[1], end_parts[2], 23, 59, 59, tzinfo=KST).date()

        if today < start_date:
            days_to_start = (start_date - today).days
            return {
                "dday": f"D-{days_to_start}" if days_to_start > 0 else "오늘시작",
                "status": "접수예정",
                "days_left": days_to_start + 500,
                "deadline_date": end_date.strftime("%Y-%m-%d"),
                "start_date": start_date.strftime("%Y-%m-%d")
            }

        diff_days = (end_date - today).days
        if diff_days < 0:
            return {
                "dday": "마감",
                "status": "접수마감",
                "days_left": -1,
                "deadline_date": end_date.strftime("%Y-%m-%d"),
                "start_date": start_date.strftime("%Y-%m-%d")
            }
        elif diff_days == 0:
            return {
                "dday": "D-Day",
                "status": "오늘마감",
                "days_left": 0,
                "deadline_date": end_date.strftime("%Y-%m-%d"),
                "start_date": start_date.strftime("%Y-%m-%d")
            }
        else:
            return {
                "dday": f"D-{diff_days}",
                "status": "마감임박" if diff_days <= 3 else "접수중",
                "days_left": diff_days,
                "deadline_date": end_date.strftime("%Y-%m-%d"),
                "start_date": start_date.strftime("%Y-%m-%d")
            }
    except Exception as e:
        return {"dday": "공고확인", "status": "접수중", "days_left": 999, "deadline_date": "", "start_date": ""}


def fetch_swuniv_programs(max_pages=3):
    """SW중심대학사업단 온라인 신청 게시판(gc=Program) 크롤링"""
    programs = []
    seen_ids = set()
    now_kst = datetime.now(KST)

    for page in range(1, max_pages + 1):
        url = f"https://swuniv.jbnu.ac.kr/main/jbnusw?gc=Program&do=list&page={page}"
        html = safe_fetch(url)
        if not html:
            continue

        soup = BeautifulSoup(html, "html.parser")
        items = soup.select("a.Fix_ListBtns")
        if not items:
            continue

        for it in items:
            href = it.get("href", "")
            m_id = re.search(r'program_id=([^"&]+)', href)
            program_id = m_id.group(1) if m_id else ""
            if not program_id or program_id in seen_ids:
                continue
            seen_ids.add(program_id)

            img_el = it.find("img")
            thumbnail = img_el["src"] if img_el and img_el.has_attr("src") else ""
            img_alt = img_el.get("alt", "") if img_el else ""

            status_el = it.select_one(".status span")
            raw_status_text = clean_text(status_el.get_text()) if status_el else ""
            raw_status_class = " ".join(status_el.get("class", [])) if status_el else ""

            cate_el = it.select_one(".cate")
            category = clean_text(cate_el.get_text()) if cate_el else "프로그램"

            tit_el = it.select_one(".tit")
            title = clean_text(tit_el.get_text()) if tit_el else clean_text(img_alt)

            meta = {}
            for li in it.select("li"):
                st = li.find("strong")
                if st:
                    k = clean_text(st.get_text())
                    st.decompose()
                    v = clean_text(li.get_text())
                    meta[k] = v

            activity_period = meta.get("교육(활동)기간", meta.get("활동기간", "-"))
            apply_period = meta.get("신청기간", "-")
            location = meta.get("교육장소", meta.get("장소", "-"))
            capacity = meta.get("정원", "-")
            point = meta.get("포인트", meta.get("마일리지", "-"))

            dday_info = parse_dday(apply_period, now_kst)
            final_status = dday_info["status"]
            if "접수마감" in raw_status_text or "마감" in raw_status_text or "종료" in raw_status_text:
                final_status = "접수마감"
                dday_badge = "마감"
            elif "대기" in raw_status_text:
                final_status = "접수예정"
                dday_badge = dday_info["dday"]
            elif "신청하기" in raw_status_text or "state_acc" in raw_status_class:
                if final_status == "접수마감":
                    final_status = "접수중"
                dday_badge = dday_info["dday"] if dday_info["dday"] != "마감" else "D-Day"
            else:
                dday_badge = dday_info["dday"]

            # [GEMINI.md Rule 1-⑤ 절대 원칙] 마감 항목 자동 내림
            if final_status == "접수마감" or dday_badge == "마감" or dday_info.get("days_left", 0) < 0:
                continue

            # 표준 카테고리 매핑
            if "경진대회" in title or "해커톤" in title:
                std_category = "경진대회"
            elif "선발" in title or "장학" in title:
                std_category = "선발/장학"
            elif "지원" in title:
                std_category = "지원사업"
            elif "인턴" in title or "취업" in title:
                std_category = "취업/인턴"
            else:
                std_category = category if category != "일반" else "프로그램"

            programs.append({
                "id": program_id,
                "title": title,
                "category": std_category,
                "thumbnail": thumbnail,
                "link": href,
                "raw_status": raw_status_text,
                "status": final_status,
                "dday": dday_badge,
                "days_left": dday_info.get("days_left", 999),
                "deadline_date": dday_info.get("deadline_date", ""),
                "activity_period": activity_period,
                "apply_period": apply_period,
                "location": location,
                "capacity": capacity,
                "point": point,
                "source": "program_board",
                "collected_at": now_kst.strftime("%Y-%m-%d %H:%M")
            })

    return programs


def fetch_swuniv_notices(existing_programs=None, max_pages=2):
    """
    SW중심대학사업단 공지사항(gc=605XOAS)에서 유효 프로그램/공모/지원 공고 수집
    """
    notices = []
    seen_ids = set()
    now_kst = datetime.now(KST)
    today = now_kst.date()

    blacklist_keywords = [
        "선발 결과", "합격자", "결과 안내", "운영지침 개정", "오리엔테이션 자료",
        "서식", "규정", "지침 개정", "협약 체결", "대관 예약"
    ]
    program_keywords = [
        "모집", "선발", "경진대회", "지원", "프로그램", "특강",
        "교육", "챌린지", "컨설팅", "해커톤", "인턴십", "장학생", "세미나"
    ]

    for page in range(1, max_pages + 1):
        url = f"https://swuniv.jbnu.ac.kr/main/jbnusw?gc=605XOAS&page={page}"
        html = safe_fetch(url)
        if not html:
            continue

        soup = BeautifulSoup(html, "html.parser")
        rows = soup.select("table tbody tr")
        if not rows:
            continue

        for tr in rows:
            tds = tr.find_all("td")
            if len(tds) < 5:
                continue

            num_text = clean_text(tds[0].get_text())
            title_a = tds[1].find("a")
            if not title_a:
                continue

            raw_title = clean_text(title_a.get_text())
            href = title_a.get("href", "")
            post_date = clean_text(tds[4].get_text())

            m_id = re.search(r'bwrite_id=([^"&]+)', href)
            notice_id = m_id.group(1) if m_id else href
            if not notice_id or notice_id in seen_ids:
                continue
            seen_ids.add(notice_id)

            # 1. 키워드 검증
            if any(bk in raw_title for bk in blacklist_keywords):
                continue
            if not any(pk in raw_title for pk in program_keywords):
                continue

            # 중복 체크 (gc=Program에 이미 등록된 동일 프로그램인 경우 gc=Program의 직접 신청 링크 우선)
            if existing_programs:
                if any(is_same_program(raw_title, ep.get("title", "")) for ep in existing_programs):
                    print(f"[*] Notice duplicate skipped (already in programs): {raw_title}")
                    continue

            # 2. 기간 및 상세 정보 추출
            period = parse_period_from_string(raw_title, default_year=2026)
            thumbnail = ""
            detail_text = ""
            is_sangsi = "상시" in raw_title

            # 고정 공고(외부 경진대회 및 학회 참가 지원 안내) 팩트 우선 처리
            if "외부 경진대회 및 학회 참가 지원" in raw_title:
                period = (datetime(2026, 3, 30, tzinfo=KST).date(), datetime(2026, 11, 27, tzinfo=KST).date())
                thumbnail = "https://swuniv.jbnu.ac.kr/r/VEr8VBbDm8A5"
                capacity = "SW학과 15명 / 비SW학과 10명"
                location = "국내 및 국외 경진대회·학회"
                point = "참가등록비+여비 최대 100만원 지원"
                clean_tit = "2026년 외부 경진대회 및 학회 참가 지원 (참가비·여비 최대 100만원 지원)"
                activity_period = "2026.04.03 ~ 2026.12.18"
            else:
                capacity = "상세 공고 참조"
                location = "전북대학교 / 온라인"
                point = "-"
                activity_period = "-"
                clean_tit = re.sub(r'\s*\([0-9\.\/~월일\s\(\)가-힣]+까지?\)', '', raw_title).strip()

            # 상세 페이지 파싱 필요 여부
            need_detail = not period or is_sangsi or "Codetree" in raw_title or "컨설팅" in raw_title or not thumbnail

            if need_detail:
                det_html = safe_fetch(href)
                if det_html:
                    det_soup = BeautifulSoup(det_html, "html.parser")
                    bv = det_soup.find("div", class_="board_view")
                    if bv:
                        cw = bv.find("div", class_="content_wrap")
                        if cw:
                            detail_text = cw.get_text(" ", strip=True)
                            imgs = cw.find_all("img")
                            if imgs and not thumbnail:
                                first_img = imgs[0].get("src", "")
                                if first_img:
                                    thumbnail = first_img if first_img.startswith("http") else "https://swuniv.jbnu.ac.kr" + first_img

                        # 본문 전체 텍스트에서 기간 및 상시 파싱
                        if not period and detail_text:
                            if "상시" in detail_text:
                                is_sangsi = True
                            p_candidate = parse_period_from_string(detail_text, default_year=2026)
                            if p_candidate:
                                period = p_candidate

            if not thumbnail:
                thumbnail = "https://swuniv.jbnu.ac.kr/r/VYC1WL0cXcCA"

            # 3. D-Day 및 상태 판별
            if is_sangsi:
                dday_badge = "상시접수"
                final_status = "상시접수"
                days_left = 999
                deadline_str = "상시모집"
                apply_period = "상시 접수"
            elif period:
                start_d, end_d = period
                diff_days = (end_d - today).days

                # [GEMINI.md Rule 1-⑤ 절대 원칙] 마감 항목 자동 내림
                if diff_days < 0:
                    continue

                if diff_days == 0:
                    dday_badge = "D-Day"
                    final_status = "오늘마감"
                elif diff_days <= 3:
                    dday_badge = f"D-{diff_days}"
                    final_status = "마감임박"
                else:
                    dday_badge = f"D-{diff_days}"
                    final_status = "접수중"

                days_left = diff_days
                deadline_str = end_d.strftime("%Y-%m-%d")
                apply_period = f"{start_d.strftime('%Y.%m.%d')} ~ {end_d.strftime('%m.%d')}"
                if activity_period == "-":
                    activity_period = apply_period
            else:
                continue

            # 4. 카테고리 매핑
            if "지원" in raw_title:
                category = "지원사업"
            elif "경진대회" in raw_title or "해커톤" in raw_title or "공모전" in raw_title:
                category = "경진대회"
            elif "선발" in raw_title or "장학" in raw_title or "융합전공" in raw_title:
                category = "선발/장학"
            elif "컨설팅" in raw_title or "모의면접" in raw_title or "취업" in raw_title:
                category = "취업/컨설팅"
            elif "챌린지" in raw_title or "특강" in raw_title or "교육" in raw_title:
                category = "교육/역량강화"
            else:
                category = "프로그램"

            if not clean_tit:
                clean_tit = raw_title

            notices.append({
                "id": notice_id,
                "title": clean_tit,
                "category": category,
                "thumbnail": thumbnail,
                "link": href,
                "raw_status": "공지사항 접수중",
                "status": final_status,
                "dday": dday_badge,
                "days_left": days_left,
                "deadline_date": deadline_str,
                "activity_period": activity_period,
                "apply_period": apply_period,
                "location": location,
                "capacity": capacity,
                "point": point,
                "source": "notice_board",
                "collected_at": now_kst.strftime("%Y-%m-%d %H:%M")
            })

    return notices

def save_swuniv_programs():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(STATIC_DATA_DIR, exist_ok=True)

    print("[*] Fetching SW Univ programs from swuniv.jbnu.ac.kr...")
    progs = fetch_swuniv_programs(max_pages=3)
    nots = fetch_swuniv_notices(existing_programs=progs, max_pages=2)

    all_programs = progs + nots
    # 마감일 임박순 정렬 (상시모집 999는 후순위)
    all_programs.sort(key=lambda x: (x["days_left"] if x["days_left"] >= 0 else 9999))

    print(f"[+] Total active programs collected: {len(all_programs)}")

    payload = {
        "updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M"),
        "total_count": len(all_programs),
        "programs": all_programs
    }

    with open(SWUNIV_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"[+] Saved to {SWUNIV_JSON_PATH}")

    # 정적 데이터 번들 자동 갱신
    try:
        import build_data_bundle
        build_data_bundle.build_bundle()
    except Exception as e:
        print(f"⚠️ build_data_bundle failed: {e}")

    return payload

if __name__ == "__main__":
    save_swuniv_programs()
