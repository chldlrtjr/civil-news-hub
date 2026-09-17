#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
전북대학교 SW중심대학사업단 프로그램 자동 수집 및 정제 엔진 (swuniv_scraper.py)
- 출처: https://swuniv.jbnu.ac.kr/main/jbnusw?gc=Program&do=list&page=1
"""

import os
import re
import json
import ssl
import urllib.request
from datetime import datetime, timezone, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
SWUNIV_JSON_PATH = os.path.join(DATA_DIR, "swuniv_programs.json")
STATIC_DATA_DIR = os.path.join(BASE_DIR, "static", "data")
STATIC_SWUNIV_JSON_PATH = os.path.join(STATIC_DATA_DIR, "swuniv_programs.json")

KST = timezone(timedelta(hours=9))

def clean_text(text):
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def parse_dday(apply_period_str, now_kst=None):
    """
    신청기간(예: 26.09.15(화) ~ 26.09.22(화))에서
    마감일을 파싱하여 D-Day 및 상태(접수중, 마감임박, 오늘마감, 접수마감, 접수예정)를 산출.
    """
    if not now_kst:
        now_kst = datetime.now(KST)

    today_date = now_kst.date()

    if not apply_period_str or apply_period_str == "-":
        return {"dday": "상시접수", "status": "상시접수", "days_left": 999, "deadline_date": ""}

    dates = re.findall(r'(\d{2,4})\s*[\.\-\/]\s*(\d{1,2})\s*[\.\-\/]\s*(\d{1,2})', apply_period_str)
    if not dates:
        return {"dday": "공고확인", "status": "접수중", "days_left": 999, "deadline_date": ""}

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

        # 접수예정 (오늘 이전 시작)
        if today_date < start_date:
            days_to_start = (start_date - today_date).days
            return {
                "dday": f"D-{days_to_start}" if days_to_start > 0 else "오늘시작",
                "status": "접수예정",
                "days_left": days_to_start + 500,
                "deadline_date": end_date.strftime("%Y-%m-%d"),
                "start_date": start_date.strftime("%Y-%m-%d")
            }

        diff_days = (end_date - today_date).days

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
        return {"dday": "공고확인", "status": "접수중", "days_left": 999, "deadline_date": ""}

def fetch_swuniv_programs(max_pages=4):
    """
    SW중심대학사업단 프로그램 게시판에서 프로그램 목록 수집
    """
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    programs = []
    seen_ids = set()
    now_kst = datetime.now(KST)

    pattern = re.compile(
        r'<a\s+href="([^"]*program_id=([^"&]+)[^"]*)"\s+class="Fix_ListBtns">(.*?)</a>\s*</li>',
        re.DOTALL
    )

    for page in range(1, max_pages + 1):
        url = f"https://swuniv.jbnu.ac.kr/main/jbnusw?gc=Program&do=list&page={page}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                "Referer": "https://swuniv.jbnu.ac.kr/main/jbnusw"
            }
        )

        try:
            with urllib.request.urlopen(req, context=ctx, timeout=12) as resp:
                html = resp.read().decode('utf-8', errors='ignore')
        except Exception as e:
            print(f"[-] Page {page} fetch error: {e}")
            continue

        matches = list(pattern.finditer(html))
        if not matches:
            print(f"[-] Page {page}: No program blocks matched")
            continue

        for m in matches:
            link = m.group(1)
            program_id = m.group(2)
            body = m.group(3)

            if program_id in seen_ids:
                continue
            seen_ids.add(program_id)

            # Thumbnail
            img_m = re.search(r'<img\s+src="([^"]+)"(?:\s+alt="([^"]*)")?', body)
            thumbnail = img_m.group(1) if img_m else ""
            img_alt = img_m.group(2) if img_m and img_m.group(2) else ""

            # Raw Status
            status_m = re.search(r'<div class="status">\s*<span\s+class="([^"]*)">([^<]+)</span>', body)
            raw_status_class = status_m.group(1) if status_m else ""
            raw_status_text = clean_text(status_m.group(2)) if status_m else ""

            # Category
            cate_m = re.search(r'<p class="cate">([^<]+)</p>', body)
            category = clean_text(cate_m.group(1)) if cate_m else "일반"

            # Title
            tit_m = re.search(r'<div class="tit">([^<]+)</div>', body)
            title = clean_text(tit_m.group(1)) if tit_m else clean_text(img_alt)

            # Meta dictionary
            meta = {}
            for li_m in re.finditer(r'<li>\s*<strong>([^<]+)</strong>\s*([^<]*)</li>', body):
                k = clean_text(li_m.group(1))
                v = clean_text(li_m.group(2))
                meta[k] = v

            activity_period = meta.get("교육(활동)기간", meta.get("활동기간", "-"))
            apply_period = meta.get("신청기간", "-")
            location = meta.get("교육장소", meta.get("장소", "-"))
            capacity = meta.get("정원", "-")
            point = meta.get("포인트", meta.get("마일리지", "-"))

            # Calculate D-Day
            dday_info = parse_dday(apply_period, now_kst)

            # Final status & dday
            final_status = dday_info["status"]
            if "접수마감" in raw_status_text or "마감" in raw_status_text:
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

            # [GEMINI.md Rule 1-⑤ 절대 원칙] 마감 항목 자동 내림(게시 제외)
            # 모집 기간이 종료된(접수마감/days_left < 0/dday='마감') 프로그램은 원천 배제하여 유효 프로그램만 수집 및 노출
            if final_status == "접수마감" or dday_badge == "마감" or dday_info.get("days_left", 0) < 0 or "마감" in raw_status_text:
                continue

            program_obj = {
                "id": program_id,
                "title": title,
                "category": category,
                "thumbnail": thumbnail,
                "link": link,
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
                "collected_at": now_kst.strftime("%Y-%m-%d %H:%M")
            }
            programs.append(program_obj)

    return programs

def save_swuniv_programs():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(STATIC_DATA_DIR, exist_ok=True)

    print("[*] Fetching SW Univ programs from swuniv.jbnu.ac.kr...")
    programs = fetch_swuniv_programs(max_pages=4)
    print(f"[+] Total collected: {len(programs)} programs")

    payload = {
        "updated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M"),
        "total_count": len(programs),
        "programs": programs
    }

    with open(SWUNIV_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    with open(STATIC_SWUNIV_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"[+] Saved to {SWUNIV_JSON_PATH} and {STATIC_SWUNIV_JSON_PATH}")
    return payload

if __name__ == "__main__":
    save_swuniv_programs()
