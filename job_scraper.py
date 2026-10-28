#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Civil News Hub - 토목 채용 공고 자동 수집 스크립트 (job_scraper.py)

수집 출처 1: 잡알리오 '재정경제부 공공기관 채용정보 조회서비스' (data.go.kr)
  - 진행 중 공고 전체를 한 번에 받아 지원자격·우대·전형 설명에 '토목'이 있으면 '토목 명시',
    NCS '건설' 분야이면서 제목이 토목 관련이거나 청년인턴이면 '건설 분야 · 공고문 확인'으로 수집합니다.
    (모집분야 상세는 첨부 공고문에만 있고 첨부파일은 API로 내려받을 수 없음)

수집 출처 2: 고용24 Open API '공채속보' (개인회원 이용 가능)
  - 목록(210L21)으로 진행 중 공채를 모두 받고, 상세(210D21)의 모집분야·지원자격에서
    '토목'이 확인되는 공고만 남깁니다. (제목만으로는 토목직 포함 여부를 알 수 없음)
  - 상세 조회 결과는 공고 번호별로 캐시(data/work24_cache.json)해서 새 공고만 조회합니다.
  - 인턴(체험형/채용형)은 제목·경력구분·고용형태로 판별합니다.

규칙 준수 (GEMINI.md):
1. 팩트 기반: API에서 받은 실제 공고만 게시 (임의 작성 공고 없음)
2. 공식 지원 페이지 딥링크 사용
3. 접수 마감된 공고는 자동 제외
"""

import os
import re
import sys
import json
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
JOBS_JSON_PATH = os.path.join(DATA_DIR, "jobs.json")
CACHE_PATH = os.path.join(DATA_DIR, "work24_cache.json")

WORK24_BASE = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo{}.do"
LIST_PAGE_SIZE = 100
CIVIL_KEYWORD = "토목"
# 목록 지문: 이 값이 바뀌면 공고가 수정된 것으로 보고 상세를 다시 조회
LIST_FINGERPRINT_TAGS = ("empWantedTitle", "empWantedStdt", "empWantedEndt", "empWantedTypeNm", "empWantedHomepgDetail")

JOBALIO_LIST_URL = "https://apis.data.go.kr/1051000/recruitment/list"
JOBALIO_PAGE_SIZE = 1000
JOBALIO_NCS_CONSTRUCTION = "R600014"  # NCS 대분류 '건설' (토목·건축 구분 없음)
# '건설' 분야 공고 중 제목으로 토목 관련성을 판단하는 단어
JOBALIO_CIVIL_HINT_RE = re.compile(r"건설사업|현장|감독|공사원가|매입기술|상수관망|하수|도로|철도|교량|터널|항만|댐|하천|지반|측량|시설관리|토지")
# 본문에서 '직무(분야)' 형태로 지정된 모집 분야. 토목 자격으로 지원 가능한 분야가 하나도 없으면 제외
# 직무명 바로 뒤 괄호만 모집 분야로 봄: '감독(전기)', '매입기술역(건축/기계/전기)', '촉탁나급(토목)'
# ('해당분야(건설·전기…) 실무경력' 같은 경력 조건 괄호는 제외)
FIELD_PAREN_RE = re.compile(r"(?:역|감독|직|급|원|시설|기술)\(([가-힣/·,\s]+)\)")
KNOWN_FIELDS = {"토목", "건설", "건축", "조경", "측량", "안전", "건설안전", "전기", "기계", "통신", "정보통신", "소방", "전자", "화학", "환경"}
CIVIL_COMPATIBLE_FIELDS = {"토목", "건설", "조경", "측량", "안전", "건설안전"}

# 카테고리 정의
JOB_CATEGORIES = [
    {"id": "all", "name": "전체"},
    {"id": "public", "name": "공기업·공공기관"},
    {"id": "builder", "name": "건설·민간기업"},
    {"id": "engineering", "name": "설계·엔지니어링"}
]
CATEGORY_NAMES = {c["id"]: c["name"] for c in JOB_CATEGORIES}

PUBLIC_CO_TYPES = ("공기업", "공공기관")
PUBLIC_NAME_RE = re.compile(r"공사|공단|연구원|진흥원|공항|관리원|재단")
ENGINEERING_NAME_RE = re.compile(r"엔지니어링|기술공단|기술단|건축사사무소|설계|컨설턴트")

# 공채속보에 잘 올라오지 않는 주요 기관·기업의 공식 채용 페이지 (공고 내용은 만들지 않고 링크만 제공)
CAREER_PAGES = [
    {"company": "한국도로공사", "category_id": "public", "link": "https://www.ex.co.kr"},
    {"company": "한국수자원공사", "category_id": "public", "link": "https://www.kwater.or.kr/kor/sub01/sub04/sub01/list.do?s_mid=108"},
    {"company": "국가철도공단", "category_id": "public", "link": "https://www.kr.or.kr/boardCnts/list.do?boardID=72"},
    {"company": "한국토지주택공사", "category_id": "public", "link": "https://www.lh.or.kr/board.es?mid=a10602040000&bid=0035"},
    {"company": "한국건설기술연구원", "category_id": "public", "link": "https://www.kict.re.kr/announcementRecruitWeb/getAnnouncementRecruitList.es?mid=a10513030000"},
    {"company": "현대건설", "category_id": "builder", "link": "https://recruit.hdec.co.kr/"},
    {"company": "대우건설", "category_id": "builder", "link": "https://recruit.daewooenc.com/"},
    {"company": "DL이앤씨", "category_id": "builder", "link": "https://dlenc.recruiter.co.kr/career/Main"},
    {"company": "GS건설", "category_id": "builder", "link": "https://gsenc.recruiter.co.kr/career/home"},
    {"company": "포스코이앤씨", "category_id": "builder", "link": "https://recruit.posco.com"},
    {"company": "유신", "category_id": "engineering", "link": "https://www.yooshin.com/career/career_opportunities"},
    {"company": "삼안", "category_id": "engineering", "link": "https://samaneng.com/board/recruit2/index.html"},
    # 동명기술공단(dmec.co.kr)은 구형 DHE 암호화만 지원해 최신 브라우저에서 접속 불가 → 제외 (2026-10)
    {"company": "도화엔지니어링", "category_id": "engineering", "link": "https://dohwa.recruiter.co.kr/career/home"},
    {"company": "한국종합기술", "category_id": "engineering", "link": "https://recruit.kecc.co.kr/"}
]


def load_api_key(name):
    """환경변수 → .env 순으로 인증키 조회 (Actions 러너에는 python-dotenv가 없어서 직접 파싱)"""
    key = os.environ.get(name, "").strip()
    if key:
        return key
    env_path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                if line.startswith(name + "="):
                    return line.split("=", 1)[1].strip()
    return ""


def call_work24(code, params):
    """고용24 Open API 호출 후 XML 루트 반환"""
    url = WORK24_BASE.format(code) + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as response:
        root = ET.fromstring(response.read())
    error = root.findtext("error") or root.findtext(".//errMsg")
    if error:
        raise RuntimeError(f"고용24 API 오류({code}): {error}")
    return root


def fetch_open_list(api_key):
    """공채속보 목록 전체 조회 (empSeqno 순서 유지)"""
    items = []
    page = 1
    while True:
        root = call_work24("210L21", {
            "authKey": api_key, "callTp": "L", "returnType": "XML",
            "startPage": page, "display": LIST_PAGE_SIZE
        })
        batch = root.findall("dhsOpenEmpInfo")
        items.extend(batch)
        total = int(root.findtext("total") or 0)
        if not batch or page * LIST_PAGE_SIZE >= total:
            break
        page += 1
    return items


def fetch_detail(api_key, seq):
    return call_work24("210D21", {
        "authKey": api_key, "callTp": "D", "returnType": "XML", "empSeqno": seq
    })


def clean_text(text):
    return re.sub(r"\s+", " ", (text or "").replace("&#xd;", " ")).strip()


def fmt_date(yyyymmdd):
    """20261109 → 2026-11-09"""
    if not yyyymmdd or len(yyyymmdd) != 8:
        return ""
    return f"{yyyymmdd[:4]}-{yyyymmdd[4:6]}-{yyyymmdd[6:]}"


def classify_category(company, co_type):
    if co_type in PUBLIC_CO_TYPES or PUBLIC_NAME_RE.search(company):
        return "public"
    if ENGINEERING_NAME_RE.search(company):
        return "engineering"
    return "builder"


def parse_civil_job(root):
    """상세 XML에서 토목 공고를 정제. 모집분야·지원자격·제목 어디에도 '토목'이 없으면 None"""
    title = clean_text(root.findtext("empWantedTitle"))
    recruits = root.findall(".//empRecrListInfo")
    recruit_texts = [
        " ".join(clean_text(r.findtext(tag)) for tag in ("empRecrNm", "jobCont", "sptCertEtc"))
        for r in recruits
    ]
    if CIVIL_KEYWORD not in title and not any(CIVIL_KEYWORD in t for t in recruit_texts):
        return None

    seq = root.findtext("empSeqno")
    company = clean_text(root.findtext("empBusiNm"))
    co_type = clean_text(root.findtext("coClcdNm"))
    hire_types = [t for t in (root.findtext("empWantedTypeNm") or "").split("|") if t and t != "기타"]

    careers = set()
    for r in recruits:
        careers.update(c for c in (r.findtext("empWantedCareerNm") or "").split("|") if c)
    is_intern = "인턴" in title or "인턴" in careers
    if re.search(r"채용형|전환형|채용연계", title) or "정규직전환형" in hire_types:
        intern_type = "채용형"
    elif "체험형" in title:
        intern_type = "체험형"
    else:
        intern_type = ""

    if is_intern:
        career = "인턴"
    elif "신입" in careers and "경력" in careers:
        career = "신입·경력"
    elif "경력" in careers:
        career = "경력"
    elif "신입" in careers:
        career = "신입"
    else:
        career = "신입·경력"  # 경력 구분이 없으면 누구나 지원 가능

    # 토목이 언급된 모집분야를 우선 요약으로 사용
    civil_recruits = [r for r, t in zip(recruits, recruit_texts) if CIVIL_KEYWORD in t] or recruits
    fields = [clean_text(r.findtext("empRecrNm")) for r in civil_recruits if r.findtext("empRecrNm")]
    regions = []
    for r in recruits:
        region = clean_text(r.findtext("workRegionNm"))
        if region and region not in regions:
            regions.append(region)
    summary = " / ".join(
        clean_text(r.findtext("sptCertEtc")) or clean_text(r.findtext("jobCont")) for r in civil_recruits
    )[:400]

    steps = [clean_text(s.findtext("selsNm")) for s in root.findall(".//empSelsListInfo")]
    steps = [s for s in steps if s and s != "기타"]

    tags = []
    if is_intern:
        tags.append(f"{intern_type} 인턴" if intern_type else "인턴")
    tags += [t for t in hire_types if t != "정규직전환형" or not is_intern]
    if co_type:
        tags.append(co_type)

    category_id = classify_category(company, co_type)
    start = fmt_date(root.findtext("empWantedStdt"))
    end = fmt_date(root.findtext("empWantedEndt"))
    link = (root.findtext("empWantedHomepgDetail") or root.findtext("empWantedHomepg") or "").strip()

    return {
        "id": f"w24-{seq}",
        "source": "고용24 공채속보",
        "company": company,
        "company_type": co_type,
        "category_id": category_id,
        "category_name": CATEGORY_NAMES[category_id],
        "title": title,
        "fields": fields,
        "career": career,
        "is_intern": is_intern,
        "intern_type": intern_type,
        "location": ", ".join(regions) or "공고 원문 참조",
        "period": f"{start.replace('-', '.')} ~ {end.replace('-', '.')}",
        "deadline_date": end,
        "tags": tags,
        "link": link or "https://www.work24.go.kr",
        "summary": summary,
        "steps": steps
    }


def is_job_expired(job, now_kst):
    """마감일 당일까지는 게시 (공채속보는 마감 시각을 제공하지 않음)"""
    deadline = job.get("deadline_date", "")
    if not deadline:
        return False
    return deadline < now_kst.strftime("%Y-%m-%d")


def load_cache():
    try:
        with open(CACHE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def write_json_atomic(path, data):
    temp_path = path + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(temp_path, path)


def list_fingerprint(item):
    """목록에서 보이는 항목으로 만든 지문. 마감 연장·제목 수정 등이 있으면 값이 바뀜"""
    return "|".join((item.findtext(tag) or "").strip() for tag in LIST_FINGERPRINT_TAGS)


def collect_work24_jobs(api_key):
    """공채속보 → 토목 공고 리스트.
    캐시: {empSeqno: {"fp": 목록 지문, "fetched_at": 조회 시각, "job": 정제된 공고 | null(토목 아님)}}
    상세 재조회 조건: ① 캐시에 없음 ② 목록 지문 변경 ③ 토목 공고(게시 대상)는 매 실행마다
    토목이 아닌 공고는 목록 지문이 바뀔 때만 다시 확인 (게시 대상의 정확성을 우선하고 호출량을 줄임)
    """
    cache = load_cache()
    listing = fetch_open_list(api_key)
    print(f"  [i] 고용24 공채속보 진행 중 공고 {len(listing)}건")

    now = datetime.now(timezone.utc)
    to_fetch = {}
    for item in listing:
        seq = item.findtext("empSeqno")
        fp = list_fingerprint(item)
        if seq not in cache:
            to_fetch[seq] = "신규"
            continue
        entry = cache[seq]
        if not isinstance(entry, dict) or "fp" not in entry:
            # 구버전 캐시(정제된 공고만 저장)는 현재 지문을 붙여 이전
            entry = cache[seq] = {"fp": fp, "fetched_at": "", "job": entry}
        if entry["fp"] != fp:
            to_fetch[seq] = "수정"
        elif entry.get("job"):
            to_fetch[seq] = "갱신"

    new_cache, counts, failed = {}, {"신규": 0, "수정": 0, "갱신": 0}, 0
    for item in listing:
        seq = item.findtext("empSeqno")
        old = cache.get(seq)
        if seq not in to_fetch:
            new_cache[seq] = old
            continue
        try:
            job = parse_civil_job(fetch_detail(api_key, seq))
            new_cache[seq] = {"fp": list_fingerprint(item), "fetched_at": now.isoformat(), "job": job}
            counts[to_fetch[seq]] += 1
            if to_fetch[seq] == "수정" and job:
                print(f"  [~] 수정된 공고 반영: [{job['company']}] {job['title']}")
        except Exception as e:
            failed += 1
            print(f"  [!] 상세 조회 실패 (empSeqno={seq}): {e}")
            if isinstance(old, dict) and "fp" in old:
                new_cache[seq] = old  # 이전 정보 유지, 지문이 그대로라 다음 실행 때 재시도 대상
        time.sleep(0.15)
    print(f"  [i] 상세 조회 신규 {counts['신규']}건 · 수정 {counts['수정']}건 · 토목 재확인 {counts['갱신']}건, 실패 {failed}건")

    os.makedirs(DATA_DIR, exist_ok=True)
    write_json_atomic(CACHE_PATH, new_cache)  # 목록에서 내려간 공고는 캐시에서도 제거
    return [e["job"] for e in new_cache.values() if e and e.get("job")]


def fetch_jobalio_ongoing(api_key):
    """잡알리오 진행 중 채용공시 전체 조회. 목록에 지원자격·우대·전형 설명이 모두 있어 상세 호출 불필요"""
    items, page = [], 1
    while True:
        url = JOBALIO_LIST_URL + "?" + urllib.parse.urlencode({
            "serviceKey": api_key, "resultType": "json", "ongoingYn": "Y",
            "numOfRows": JOBALIO_PAGE_SIZE, "pageNo": page
        })
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read())
        if data.get("resultCode") != 200:
            raise RuntimeError(f"잡알리오 API 오류: {data.get('resultMsg')}")
        batch = data.get("result") or []
        items.extend(batch)
        if not batch or page * JOBALIO_PAGE_SIZE >= int(data.get("totalCount") or 0):
            break
        page += 1
    return items


def extract_steps(text):
    """'1. 1차 서류전형 ... 2. 2차 종합면접' 같은 전형 설명에서 단계 이름만 순서대로 추출"""
    steps, seen = [], set()
    for m in re.finditer(r"(?:(\d)차\s*)?([가-힣·]*)(전형|면접|시험|검사)", text or ""):
        order, name, kind = m.groups()
        if len(name) == 1 or (not name and not order):  # '독자전형'의 '자전형' 같은 조각, 단독 '전형' 제외
            continue
        key = (name + kind) if name else (order + kind)  # '1차 전형'과 '1차전형', '2차 종합면접'과 '종합면접'을 같은 단계로 봄
        if key in seen:
            continue
        seen.add(key)
        steps.append(f"{order}차 {name}{kind}" if order and name else (f"{order}차 {kind}" if order else name + kind))
    return steps[:6]


def is_non_civil_only(text):
    """'현장보조감독(전기)'처럼 모집 분야가 괄호로 지정됐는데 전부 토목과 무관한 분야면 True"""
    fields = set()
    for group in FIELD_PAREN_RE.findall(text):
        fields.update(f.strip() for f in re.split(r"[/·,]", group) if f.strip() in KNOWN_FIELDS)
    return bool(fields) and not (fields & CIVIL_COMPATIBLE_FIELDS)


def parse_jobalio_job(item):
    """잡알리오 공고를 정제. 토목 명시 공고와 '건설' 분야 중 토목 관련 공고만 남기고 나머지는 None"""
    title = clean_text(item.get("recrutPbancTtl"))
    body = " ".join(clean_text(item.get(k)) for k in ("aplyQlfcCn", "prefCn", "prefCondCn", "scrnprcdrMthdExpln"))
    hire_types = [t for t in (item.get("hireTypeNmLst") or "").split(",") if t]
    is_intern = any("청년인턴" in t for t in hire_types) or "인턴" in title
    is_construction = JOBALIO_NCS_CONSTRUCTION in (item.get("ncsCdLst") or "")

    if CIVIL_KEYWORD in title + body:
        match_tag = "토목 명시"
    elif is_construction and (JOBALIO_CIVIL_HINT_RE.search(title) or is_intern) and not is_non_civil_only(body):
        match_tag = "건설 분야 · 공고문 확인"  # 모집분야는 첨부 공고문에만 있어 토목 포함 여부 확인 필요
    else:
        return None

    if "청년인턴(채용형)" in hire_types:
        intern_type = "채용형"
    elif "청년인턴(체험형)" in hire_types or "체험형" in title:
        intern_type = "체험형"
    else:
        intern_type = ""
    recrut_se = item.get("recrutSeNm") or ""
    if is_intern:
        career = "인턴"
    elif recrut_se in ("신입", "경력"):
        career = recrut_se
    else:
        career = "신입·경력"

    regions = [r for r in (item.get("workRgnNmLst") or "").split(",") if r]
    sn = item.get("recrutPblntSn")
    start = fmt_date(item.get("pbancBgngYmd"))
    end = fmt_date(item.get("pbancEndYmd"))

    tags = []
    if is_intern:
        tags.append(f"{intern_type} 인턴" if intern_type else "인턴")
    tags.append(match_tag)  # 카드에는 앞 2개 태그만 보이므로 확인 필요 여부를 앞쪽에 둠
    tags += [t for t in hire_types if "청년인턴" not in t]
    if item.get("recrutNope"):
        tags.append(f"{item['recrutNope']}명")

    return {
        "id": f"alio-{sn}",
        "source": "잡알리오",
        "company": clean_text(item.get("instNm")),
        "company_type": "공공기관",
        "category_id": "public",
        "category_name": CATEGORY_NAMES["public"],
        "title": title,
        "fields": [f for f in (item.get("ncsCdNmLst") or "").split(",") if f],
        "career": career,
        "is_intern": is_intern,
        "intern_type": intern_type,
        "civil_match": match_tag,
        "location": "전국" if len(regions) >= 8 else (", ".join(regions) or "공고 원문 참조"),
        "period": f"{start.replace('-', '.')} ~ {end.replace('-', '.')}",
        "deadline_date": end,
        "tags": tags,
        "link": (item.get("srcUrl") or "").strip() or f"https://job.alio.go.kr/recruitview.do?idx={sn}",
        "summary": clean_text(item.get("aplyQlfcCn"))[:400],
        "steps": extract_steps(item.get("scrnprcdrMthdExpln"))
    }


def collect_jobalio_jobs(api_key):
    items = fetch_jobalio_ongoing(api_key)
    jobs = [job for job in map(parse_jobalio_job, items) if job]
    explicit = sum(1 for j in jobs if j["civil_match"] == "토목 명시")
    print(f"  [i] 잡알리오 진행 중 공고 {len(items)}건 → 토목 명시 {explicit}건 · 건설 분야 {len(jobs) - explicit}건")
    return jobs


def normalize_company(name):
    return re.sub(r"\(주\)|주식회사|\s", "", name or "")


def load_previous_jobs(source):
    try:
        with open(JOBS_JSON_PATH, encoding="utf-8") as f:
            return [j for j in json.load(f).get("jobs", []) if j.get("source") == source]
    except (OSError, ValueError):
        return []


def collect_source(name, key_name, collector):
    """출처별 수집 → (공고 목록, 실패 여부). 키가 없거나 실패하면 해당 출처의 이전 수집 결과를 유지"""
    api_key = load_api_key(key_name)
    if not api_key:
        print(f"  [!] {key_name}가 없어 {name} 이전 수집 결과를 유지합니다.")
    else:
        try:
            return collector(api_key), False
        except Exception as e:
            print(f"  [!] {name} 수집 실패, 이전 수집 결과를 유지합니다: {e}")
    return load_previous_jobs(name), True


def scrape_civil_jobs():
    """토목 채용 공고 수집 및 마감 필터링"""
    print("=" * 60)
    print("💼 [토목 채용 공고 수집기] 잡알리오·고용24 공채속보에서 토목 공고를 수집합니다...")
    print("=" * 60)

    kst = timezone(timedelta(hours=9))
    now_kst = datetime.now(kst)

    alio_jobs, alio_failed = collect_source("잡알리오", "JOBALIO_API_KEY", collect_jobalio_jobs)
    work24_jobs, work24_failed = collect_source("고용24 공채속보", "WORK24_API_KEY", collect_work24_jobs)
    failed_sources = [name for name, failed in (("잡알리오", alio_failed), ("고용24 공채속보", work24_failed)) if failed]

    # 같은 공고가 양쪽에 올라온 경우(기관명+마감일 일치) 정보가 많은 잡알리오 쪽을 사용
    alio_keys = {(normalize_company(j["company"]), j["deadline_date"]) for j in alio_jobs}
    duplicates = [j for j in work24_jobs if (normalize_company(j["company"]), j["deadline_date"]) in alio_keys]
    if duplicates:
        print(f"  [i] 중복 공고 {len(duplicates)}건은 잡알리오 정보로 표시")
    jobs = alio_jobs + [j for j in work24_jobs if j not in duplicates]

    collected_jobs = []
    for job in jobs:
        if is_job_expired(job, now_kst):
            print(f"  [-] 접수마감 공고 제외: [{job['company']}] {job['title']}")
            continue
        collected_jobs.append(job)
    collected_jobs.sort(key=lambda j: j.get("deadline_date") or "9999")

    intern_count = sum(1 for j in collected_jobs if j.get("is_intern"))
    print(f"  [+] 토목 채용 공고 {len(collected_jobs)}건 (인턴 {intern_count}건)")

    jobs_data = {
        "last_updated": now_kst.strftime("%Y-%m-%d %H:%M"),
        "last_updated_display": now_kst.strftime("%Y년 %m월 %d일 %H:%M"),
        "source": "잡알리오(공공기관 채용정보) · 고용24 공채속보 Open API",
        "total_count": len(collected_jobs),
        "failed_sources": failed_sources,
        "categories": JOB_CATEGORIES,
        "jobs": collected_jobs,
        "career_pages": CAREER_PAGES
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    write_json_atomic(JOBS_JSON_PATH, jobs_data)

    print(f"  [✓] 채용 데이터베이스 저장 완료: {JOBS_JSON_PATH}")
    if failed_sources:
        print(f"  [!] 수집 실패 출처: {', '.join(failed_sources)} (이전 수집 결과로 유지됨)")
    print("=" * 60)
    return jobs_data


if __name__ == "__main__":
    # 출처 하나라도 실패하면(키 누락·만료, API 오류) exit 1 → cron_scrape.sh가 카카오톡 실패 알림 발송
    sys.exit(1 if scrape_civil_jobs()["failed_sources"] else 0)
