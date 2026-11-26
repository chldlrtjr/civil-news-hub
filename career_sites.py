#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
공채 API(잡알리오·고용24)에 안 올라오는 기관의 채용 공고를 공식 채용 페이지 목록에서 직접 가져와요.

정확성 원칙
- 목록에 글자로 적힌 제목·접수 기간·모집 상태만 써요 (포스터 이미지·첨부 파일은 해석하지 않음).
- 마감일은 날짜로 직접 비교해요. 사이트의 '진행중' 표시는 마감 뒤에도 남아 있는 경우가 있어요.
- 사이트가 '마감·완료'로 표시한 공고도 빼요. 날짜를 못 읽은 줄은 버려요.
- 페이지 구조가 바뀌어 못 읽으면(목록 자리가 없거나 줄은 있는데 하나도 못 읽음) ParseError →
  job_scraper 가 수집 실패로 처리해 이전 결과를 유지하고, 2회 연속이면 알림이 가요.
- 요청은 매시간 기관마다 목록 1번, robots.txt 가 허용한 경로만, 이름을 밝힌 User-Agent 로.
"""

import html
import re

import safe_http

YOOSHIN = "유신 채용 페이지"
KICT = "한국건설기술연구원 채용 페이지"

YOOSHIN_URL = "https://www.yooshin.com/career/opportunities"
KICT_URL = "https://www.kict.re.kr/announcementRecruitWeb/getAnnouncementRecruitList.es?mid=a10513030000"
KICT_VIEW = "https://www.kict.re.kr/announcementRecruitWeb/getAnnouncementRecruitView.es?mid=a10513030000&id={}"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; civil-news-hub/1.0)"}

# 토목 관련 부문·직무이거나 학생이 지원할 수 있는 채용(연수직·인턴·신입 공채)
CIVIL_RE = re.compile(r"토목|인프라|도로|교량|구조|토질|지반|터널|철도|항만|공항|수자원|댐|하천|상하수도|상수도|하수|단지|측량|교통"
                      r"|건설사업관리|CM|연수직|학생연구원|신진연구원|인턴|신입|공개채용|공채")
DATE = r"(\d{4})[./](\d{2})[./](\d{2})"
# job_scraper.JOB_CATEGORIES 와 같은 이름 (서로 import 하지 않게 여기 적고 테스트로 맞는지 확인)
CATEGORY_NAMES = {"public": "공기업·공공기관", "engineering": "설계·엔지니어링"}


class ParseError(Exception):
    """페이지 구조가 바뀌었거나 응답이 비정상이라 공고를 믿고 읽을 수 없음"""


def _text(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment or ""))).strip()


def _tag(name, block):
    m = re.search(rf"<{name}[^>]*>(.*?)</{name}>", block, re.S)
    return _text(m.group(1)) if m else ""


def _job(source, sn, company, category_id, title, start, end, link, career, fields=(), tags=(), company_type=""):
    return {
        "id": sn, "source": source, "company": company, "company_type": company_type,
        "category_id": category_id, "category_name": CATEGORY_NAMES[category_id],
        "title": title, "fields": list(fields), "career": career,
        "is_intern": career == "인턴", "intern_type": "",
        "location": "공고 원문 참조",
        "period": f"{start.replace('-', '.')} ~ {end.replace('-', '.') if end else '채용 시 마감'}",
        "deadline_date": end, "tags": list(tags), "link": link, "summary": "", "steps": [],
    }


def _get(url, host):
    r = safe_http.fetch(url, headers=HEADERS, hosts={host})
    if r.status_code != 200:
        raise ParseError(f"{url} 응답 {r.status_code}")
    return r.text


def parse_yooshin(text, today):
    """유신 채용공고 목록: 줄마다 구분(경력·신입·공채)·상태(모집중·마감)·부문·제목·접수 기간이 글자로 있어요"""
    box = re.search(r'<ul class="opportunities-list">(.*?)</ul>', text, re.S)
    if not box:
        raise ParseError("유신 채용공고 목록 자리를 못 찾았어요")
    rows = re.findall(r"<li onclick=\"link\('/career/opportunities/(\d+)'\);?\">(.*?)</li>", box.group(1), re.S)
    jobs, read = [], 0
    for sn, row in rows:
        kind, state, dept, title = _tag("h3", row), _tag("h4", row), _tag("h2", row), _tag("h1", row)
        m = re.search(DATE + r"\s*~\s*(?:" + DATE + r"|(채용\s*시\s*마감))", _tag("h5", row))
        if not (m and title):
            continue
        read += 1
        start, end = "-".join(m.group(1, 2, 3)), ("-".join(m.group(4, 5, 6)) if m.group(4) else "")
        if state != "모집중" or (end and end < today):
            continue
        if kind not in ("신입", "공채") and not CIVIL_RE.search(dept + " " + title):
            continue
        career = "신입" if kind in ("신입", "공채") else "경력"
        jobs.append(_job(YOOSHIN, f"yooshin-{sn}", "유신", "engineering", title, start, end,
                         f"https://www.yooshin.com/career/opportunities/{sn}", career,
                         fields=[dept] if dept else [], tags=[kind] if kind else [], company_type="설계·엔지니어링"))
    if rows and not read:
        raise ParseError("유신 공고 줄은 있는데 접수 기간을 하나도 못 읽었어요")
    return jobs


def parse_kict(text, today):
    """한국건설기술연구원 채용공고 목록: 제목·공고기간(YYYY/MM/DD ~ YYYY/MM/DD)·진행상태. 상세 주소는 RSS 와 같은 GET 주소"""
    start_at = text.find('id="listView"')
    if start_at < 0:
        raise ParseError("한국건설기술연구원 채용공고 목록 자리를 못 찾았어요")
    rows = re.findall(r"<ul[^>]*>(.*?)</ul>", text[start_at:], re.S)
    rows = [r for r in rows if "egov_recruit_detail" in r]
    jobs, read = [], 0
    for row in rows:
        sn = re.search(r"egov_recruit_detail\(this\.href,\s*'(\d+)'", row)
        title = re.search(r"egov_recruit_detail[^>]*>(.*?)</a>", row, re.S)
        period = re.search(r'aria-title="공고기간">(.*?)</li>', row, re.S)
        m = re.search(DATE + r"\s*~\s*" + DATE, period.group(1)) if period else None
        if not (sn and title and m):
            continue
        read += 1
        title = _text(title.group(1))
        start, end = "-".join(m.group(1, 2, 3)), "-".join(m.group(4, 5, 6))
        if 'class="state ing"' not in row or end < today or not CIVIL_RE.search(title):
            continue
        intern = bool(re.search(r"인턴|학생연구원", title))  # 석사후·박사후연구원(연수직)은 인턴이 아님
        jobs.append(_job(KICT, f"kict-{sn.group(1)}", "한국건설기술연구원", "public", title, start, end,
                         KICT_VIEW.format(sn.group(1)), "인턴" if intern else "신입·경력",
                         tags=["연수직"] if "연수직" in title else [], company_type="정부출연연구기관"))
    if rows and not read:
        raise ParseError("한국건설기술연구원 공고 줄은 있는데 공고기간을 하나도 못 읽었어요")
    return jobs


def collect_yooshin(today):
    return parse_yooshin(_get(YOOSHIN_URL, "www.yooshin.com"), today)


def collect_kict(today):
    return parse_kict(_get(KICT_URL, "www.kict.re.kr"), today)
