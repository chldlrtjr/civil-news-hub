import os
import sys
import json
import re
import hashlib
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from collections import Counter
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup

# 구글 뉴스 링크 → 원문 URL 디코더. 의존성(selectolax 등) 문제로 import가 깨져도
# 구글이 아닌 기사의 사진 추출은 계속되도록 따로 불러오고, 실패 사유는 수집 로그에 남긴다
try:
    import googlenewsdecoder
    GNEWS_DECODER_ERROR = ""
except Exception as e:
    googlenewsdecoder = None
    GNEWS_DECODER_ERROR = f"{type(e).__name__}: {e}"

# 디렉토리 경로
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# .env 로드 (존재 시)
load_dotenv(os.path.join(BASE_DIR, ".env"))

DATA_DIR = os.path.join(BASE_DIR, "data")
NEWS_JSON_PATH = os.path.join(DATA_DIR, "news.json")

# 토목 전문 분야 및 정밀 검색어 그룹
CATEGORIES = [
    {
        "id": "general",
        "name": "토목 종합",
        "queries": ["토목공사", "토목사업", "토목현장", "토목설계", "토목 엔지니어링", "토목학회"],
        "badge_color": "blue"
    },
    {
        "id": "road_rail",
        "name": "도로·교량·철도",
        "queries": ["도로공사", "교량공사", "철도건설", "지하철공사", "고속도로건설", "국가철도망"],
        "badge_color": "emerald"
    },
    {
        "id": "water_port",
        "name": "수자원·하천·항만",
        "queries": ["하천정비", "댐건설", "항만공사", "수자원개발", "방파제 공사", "치수 대책"],
        "badge_color": "cyan"
    },
    {
        "id": "tunnel_geo",
        "name": "터널·지반·안전",
        "queries": ["터널공사", "지반침하", "지하안전평가", "싱크홀 공사", "사면안정", "연약지반 시공"],
        "badge_color": "amber"
    },
    {
        "id": "smart_policy",
        "name": "스마트건설·정책",
        "queries": ["스마트건설 국토교통부", "국토교통부 SOC", "국토교통부 도로", "국토교통부 철도", "스마트 토목", "건설신기술 국토교통부"],
        "badge_color": "indigo"
    }
]

# 필수 토목 연관 키워드 (제목이나 내용에 최소 1개 이상 반드시 포함되어야 함)
CIVIL_MUST_HAVE = [
    "토목", "시공", "도로", "교량", "철도", "터널", "지반", "하천", "항만", 
    "수자원", "SOC", "국토부", "국토교통부", "지하안전", "공사", "준공", "착공", 
    "엔지니어링", "교통망", "포장", "상하수도", "방파제", "댐", "싱크홀", 
    "인프라", "고속철", "지하철", "고속도로", "안전진단", "건설기술", "교량안전"
]

# 제외할 무관한 노이즈 키워드 (주식, IT, 코인, 외신 번역, 잡담)
EXCLUDE_KEYWORDS = [
    # 주식/증시/재테크
    "반도체", "메모리", "삼전", "하이닉스", "주가", "코스피", "코스닥", "증시", 
    "목표가", "매수의견", "특징주", "급등주", "증권사",
    # IT / 가상화폐
    "비트코인", "가상화폐", "암호화폐", "코인", "이더리움", "솔라나", "블록체인",
    "데이터센터", "클라우드", "GPU", "엔비디아", "AGI", "AI 인프라", "초거대 AI",
    # 외신 번역 및 무관 이슈
    "vietnam.vn", "VND", "베트남", "인민위원회", "미 육군", "차관보", "사관학교", "육·해·공", "육해공",
    # 사건사고 및 잡담 (단순 교통사고, 화재속보 등)
    "화재사고", "추돌사고", "교통사고", "단순사고", "시위", "집회", "시식", "맛집",
    # 노이즈 / 도박 / 단순 인사
    "토토", "사설토토", "바카라", "카지노", "불법도박", "승진인사", "정기인사", "부고", "동정", "화촉",
    # 공기업 사회공헌·스포츠단 (예: '한국도로공사 ○○본부, 성금 기탁', 도로공사 배구단)
    "기탁", "성금", "후원금", "봉사활동", "배구", "V리그", "축구대회"
]

# 이보다 오래된 기사는 수집하지 않음 (구글 RSS는 when:3d로 이미 제한, 네이버 직접 수집의 과거 기사 차단용)
MAX_ARTICLE_AGE_DAYS = 7

def clean_html(raw_html):
    """HTML 태그 제거 및 특수문자 변환"""
    if not raw_html:
        return ""
    clean_text = re.sub(r'<.*?>', '', raw_html)
    clean_text = clean_text.replace("&quot;", '"').replace("&amp;", '&').replace("&lt;", '<').replace("&gt;", '>')
    clean_text = clean_text.replace("&#39;", "'").replace("&nbsp;", ' ')
    return clean_text.strip()

def format_relative_time(dt_kst):
    """KST 기준 상대적 시간 표시"""
    kst = timezone(timedelta(hours=9))
    now = datetime.now(kst)
    diff = now - dt_kst
    
    seconds = int(diff.total_seconds())
    if seconds < 0:
        return "방금 전"
    if seconds < 60:
        return f"{seconds}초 전"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}분 전"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}시간 전"
    days = hours // 24
    if days == 1:
        return "어제"
    if days < 7:
        return f"{days}일 전"
    return dt_kst.strftime("%Y.%m.%d")

def fetch_rss_for_term(term, when="3d"):
    """구글 뉴스 RSS 단일 검색어 수집 (요청 실패 시 None — 결과 0건과 구분)"""
    encoded_q = urllib.parse.quote(f'{term} when:{when}')
    url = f"https://news.google.com/rss/search?q={encoded_q}&hl=ko&gl=KR&ceid=KR:ko"
    
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            content = response.read()
            root = ET.fromstring(content)
            return root.findall("./channel/item")
    except Exception as e:
        print(f"    [RSS 수집 에러 ({term})]: {e}")
        return None

# 네이버 뉴스 언론사 코드 매핑
NAVER_PRESS_CODES = {
    "001": "연합뉴스", "003": "뉴시스", "421": "뉴스1", "015": "한국경제", "009": "매일경제",
    "011": "서울경제", "014": "파이낸셜뉴스", "018": "이데일리", "277": "아시아경제", "008": "머니투데이",
    "025": "중앙일보", "020": "동아일보", "023": "조선일보", "032": "경향신문", "028": "한겨레",
    "081": "서울신문", "022": "세계일보", "005": "국민일보", "056": "KBS", "214": "MBC",
    "055": "SBS", "057": "MBN", "448": "TV조선", "449": "채널A", "437": "JTBC",
    "052": "YTN", "422": "연합뉴스TV", "374": "SBS Biz", "079": "노컷뉴스", "215": "한국경제TV",
    "092": "ZDNet Korea", "138": "디지털데일리", "029": "디지털타임스", "030": "전자신문", "016": "헤럴드경제",
    "629": "더팩트", "119": "데일리안", "031": "아이뉴스24", "417": "머니S", "293": "블로터",
    "366": "조선비즈", "123": "조세일보"
}

# 네이버 뉴스 원문 도메인별 언론사 매핑 (토목/건설 전문지 우선 지원)
NAVER_DOMAIN_PRESS = {
    "cnews.co.kr": "대한경제", "dnews.co.kr": "대한경제", "ikld.kr": "국토일보", "cenews.co.kr": "토목신문",
    "electimes.com": "전기신문", "engdaily.com": "엔지니어링데일리", "mcnews.co.kr": "매일건설신문",
    "kukinews.com": "쿠키뉴스", "newspim.com": "뉴스핌", "dailian.co.kr": "데일리안", "inews24.com": "아이뉴스24",
    "etoday.co.kr": "이투데이", "businesspost.co.kr": "비즈니스포스트", "yna.co.kr": "연합뉴스",
    "newsis.com": "뉴시스", "news1.kr": "뉴스1", "hankyung.com": "한국경제", "mk.co.kr": "매일경제",
    "sedaily.com": "서울경제", "fnnews.com": "파이낸셜뉴스", "edaily.co.kr": "이데일리", "asiae.co.kr": "아시아경제",
    "mt.co.kr": "머니투데이", "chosun.com": "조선일보", "donga.com": "동아일보", "joongang.co.kr": "중앙일보",
    "khan.co.kr": "경향신문", "hani.co.kr": "한겨레", "kmib.co.kr": "국민일보", "segye.com": "세계일보",
    "seoul.co.kr": "서울신문", "ytn.co.kr": "YTN", "nocutnews.co.kr": "노컷뉴스", "kbs.co.kr": "KBS",
    "imbc.com": "MBC", "sbs.co.kr": "SBS"
}

def extract_naver_publisher(link, originallink, title):
    """네이버 기사 링크 및 원문 링크로부터 언론사명 식별"""
    # 1. 네이버 뉴스 링크의 언론사 식별 코드 확인 (article/001/... 또는 oid=001)
    if link:
        m = re.search(r'/(?:article|read\.nhn(?:\?|.*&)oid=)/?(\d{3})', link)
        if m:
            code = m.group(1)
            if code in NAVER_PRESS_CODES:
                return NAVER_PRESS_CODES[code]
    
    # 2. 원문 링크의 도메인 매핑
    if originallink:
        try:
            domain = urllib.parse.urlparse(originallink).netloc.lower()
            for d, press in NAVER_DOMAIN_PRESS.items():
                if d in domain:
                    return press
        except Exception:
            pass

    # 3. 제목 뒤 [언론사] 또는 - 언론사 패턴
    clean_t = clean_html(title)
    if " - " in clean_t:
        return clean_t.rsplit(" - ", 1)[1].strip()
    m_bracket = re.search(r'\[([가-힣A-Za-z0-9\s]{2,10})\]\s*$', clean_t)
    if m_bracket:
        return m_bracket.group(1).strip()

    return "네이버뉴스"

def fetch_naver_news_for_term(term, client_id, client_secret, display=15):
    """
    네이버 뉴스 검색 API 수집 (요청 실패 시 None)
    - 2026년 검색 API가 개발자센터(openapi.naver.com)에서 네이버 클라우드 NAVER API HUB로 이관됨
      → 키는 NCP 콘솔 > NAVER API HUB > Application의 인증 정보 (개발자센터 키는 사용 불가)
    - API HUB는 한시적 무료, 유료 전환 시 사전 공지 예정
    """
    if not client_id or not client_secret:
        return []

    encoded_q = urllib.parse.quote(term)
    url = f"https://naverapihub.apigw.ntruss.com/search/v1/news?query={encoded_q}&display={display}&sort=date"

    req = urllib.request.Request(
        url,
        headers={
            "X-NCP-APIGW-API-KEY-ID": client_id,
            "X-NCP-APIGW-API-KEY": client_secret,
            "User-Agent": "CivilNewsHub/1.0"
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=6) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                return data.get("items", [])
    except Exception as e:
        print(f"    [네이버 뉴스 수집 에러 ({term})]: {e}")
        return None
    return None

def scrape_naver_news_direct(term, max_items=10, now_kst=None):
    """네이버 웹 검색을 통한 실시간 뉴스 직접 수집 (API 키 불필요 모드, 요청 실패 시 None)"""
    kst = timezone(timedelta(hours=9))
    if not now_kst or not isinstance(now_kst, datetime):
        now_kst = datetime.now(kst)
        
    encoded_q = urllib.parse.quote(term)
    url = f"https://search.naver.com/search.naver?where=news&query={encoded_q}&sort=1"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }
    
    try:
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code != 200:
            print(f"    [네이버 직접 수집 에러 ({term})]: HTTP {resp.status_code}")
            return None
        soup = BeautifulSoup(resp.text, "html.parser")
        
        articles = []
        seen_links = set()
        
        def find_article_container(span):
            curr = span
            best = None
            while curr and curr.name not in ["section", "body", "ul"]:
                if curr.select_one("span[class*='body1']"):
                    if len(curr.select("span[class*='headline1']")) == 1:
                        best = curr
                    else:
                        break
                curr = curr.parent
            return best or span.parent.parent.parent.parent

        spans = soup.select("span[class*='headline1']")
        for span in spans:
            title = span.get_text(strip=True).replace("새 창 열림", "").strip()
            title_a = span.find_parent("a") or span.find_previous("a")
            if not title_a or not title_a.get("href"):
                continue
            orig_link = title_a["href"]
            if orig_link in seen_links:
                continue
            seen_links.add(orig_link)
            
            card = find_article_container(span)
            
            # 언론사명 식별 (이미지 alt -> 링크 텍스트 -> 도메인 매핑)
            press = ""
            press_img = card.select_one("img[alt*='프로필 이미지']")
            if press_img and press_img.get("alt"):
                press = press_img["alt"].replace("의 프로필 이미지", "").strip()
            if not press:
                press_el = card.select_one("a[href*='media.naver.com/press'], span[class*='profile-info-title-text']")
                if press_el:
                    press = press_el.get_text(strip=True).replace("새 창 열림", "").strip()
            if not press or press == "네이버뉴스":
                press = extract_naver_publisher(orig_link, orig_link, title)

            # 상대 시간 추출
            rel_date = "최근"
            for s in card.select("span[class*='profile-info-subtext']"):
                txt = s.get_text(strip=True).replace("새 창 열림", "")
                if any(u in txt for u in ["분 전", "시간 전", "일 전", "어제", "방금"]):
                    rel_date = txt
                    break
                elif re.match(r'^\d{4}\.\d{2}\.\d{2}', txt):
                    rel_date = txt
                    break

            # 요약문 (스니펫)
            body = card.select_one("span[class*='body1']")
            snippet = body.get_text(strip=True).replace("새 창 열림", "").strip() if body else ""

            # 네이버 인링크(n.news.naver.com) 우선 매핑
            nv_a = card.select_one("a[href*='n.news.naver.com/mnews/article'], a[href*='news.naver.com/main/read']")
            final_link = nv_a["href"] if nv_a and nv_a.get("href") else orig_link

            # 날짜 계산 (해석할 수 없으면 빈 값 → process_candidate_article에서 제외)
            dt = None
            m_abs = re.match(r'^(\d{4})\.(\d{1,2})\.(\d{1,2})', rel_date)
            if m_abs:
                dt = datetime(int(m_abs.group(1)), int(m_abs.group(2)), int(m_abs.group(3)), tzinfo=kst)
            elif "방금" in rel_date:
                dt = now_kst
            else:
                for pattern, unit in [(r'(\d+)\s*분\s*전', "minutes"), (r'(\d+)\s*시간\s*전', "hours"), (r'(\d+)\s*일\s*전', "days")]:
                    m = re.search(pattern, rel_date)
                    if m:
                        dt = now_kst - timedelta(**{unit: int(m.group(1))})
                        break
                else:
                    if "어제" in rel_date:
                        dt = now_kst - timedelta(days=1)

            pub_date_str = dt.strftime("%a, %d %b %Y %H:%M:%S +0900") if dt else ""

            articles.append({
                "title": title,
                "link": final_link,
                "originallink": orig_link,
                "publisher": press or "네이버뉴스",
                "pubDate": pub_date_str,
                "description": snippet
            })
            if len(articles) >= max_items:
                break
                
        return articles
    except Exception as e:
        print(f"    [네이버 직접 수집 에러 ({term})]: {e}")
        return None


def clean_clause(text):
    """문장/구문 양 끝의 특수문자 및 따옴표 정제"""
    if not text:
        return ""
    t = text.strip(" \t\n·-:,~")
    quote_pairs = [('"', '"'), ("'", "'"), ('“', '”'), ('‘', '’'), ('[', ']'), ('(', ')')]
    for q_open, q_close in quote_pairs:
        if t.startswith(q_open) and t.endswith(q_close):
            t = t[len(q_open):-len(q_close)].strip()
    return t

def process_candidate_article(raw_title, raw_link, raw_pub_date, raw_desc, publisher, cat, kst, seen_keys):
    """공통 기사 필터링, 정제, 메타데이터 생성 및 중복 검증"""
    if not raw_link or "vietnam.vn" in raw_link.lower():
        return None
    
    # 제외 키워드 필터링 (주식, IT, 코인, 번역 노이즈 등)
    title_desc = (raw_title + " " + raw_desc).lower()
    if any(bad.lower() in title_desc for bad in EXCLUDE_KEYWORDS):
        return None
    
    # 필수 토목 연관 키워드 검증
    clean_t = clean_html(raw_title)
    if not any(must in clean_t for must in CIVIL_MUST_HAVE):
        return None
    
    # 제목에서 언론사 꼬리표 제거 (- 언론사명)
    title = clean_t
    if " - " in title:
        parts = title.rsplit(" - ", 1)
        if not publisher or publisher == "네이버뉴스":
            publisher = parts[1].strip()
        title = parts[0].strip()
    
    # 접두사 머리말 정제
    title = re.sub(r'^\[(단독|속보|포토|사설|기획|종합|현장|전문|인터뷰|칼럼|기고|알림|인사|부고)\]\s*', '', title).strip()

    if not publisher:
        publisher = "언론사"
    
    # 날짜 파싱 (발행일을 알 수 없거나 너무 오래된 기사는 제외 — 수집 시각으로 대체하면 옛 기사가 최신처럼 보임)
    try:
        dt_kst = parsedate_to_datetime(raw_pub_date).astimezone(kst)
    except Exception:
        return None
    if datetime.now(kst) - dt_kst > timedelta(days=MAX_ARTICLE_AGE_DAYS):
        return None
    iso_date = dt_kst.isoformat()
    display_date = dt_kst.strftime("%Y-%m-%d %H:%M")
    relative_date = format_relative_time(dt_kst)

    # 중복 검사 키 (영문/한글/숫자만 남긴 제목 전체)
    clean_key = re.sub(r'[^a-zA-Z0-9가-힣]', '', title)
    if not clean_key or clean_key in seen_keys:
        return None
    seen_keys.add(clean_key)

    # 설명(스니펫) 정제
    snippet = clean_html(raw_desc)
    if publisher and snippet.endswith(publisher):
        snippet = snippet[:-len(publisher)].strip()

    # 설명(스니펫) 정제: 비어있거나 무의미한 경우 기사 제목 기반 보완
    if not snippet or snippet == title or "원문 기사를 확인하세요" in snippet or len(snippet) < 15:
        snippet = f"{title}. {cat['name']} 분야 최신 인프라 동향 및 사업 세부 내용을 확인하세요."

    return {
        # 링크 기반 고정 ID (내장 hash()는 실행마다 값이 바뀌어 북마크가 매시간 끊어졌음)
        "id": hashlib.sha1(raw_link.encode("utf-8")).hexdigest()[:12],
        "title": title,
        "link": raw_link,
        "publisher": publisher,
        "category_id": cat["id"],
        "category_name": cat["name"],
        "badge_color": cat["badge_color"],
        "snippet": snippet[:180].strip(),
        "iso_date": iso_date,
        "published_at": display_date,
        "relative_date": relative_date
    }

class NewsFetchError(Exception):
    """수집된 기사가 하나도 없을 때 (기존 news.json 유지)"""


def scrape_civil_news():
    """
    모든 카테고리 뉴스 정밀 수집, 필터링 및 JSON 저장 (구글 뉴스 RSS + 네이버 하이브리드)
    - 한 수집원이 전부 실패하면 나머지로 저장하고 결과의 failed_sources에 기록
    - 기사가 0건이면 저장하지 않고 NewsFetchError
    """
    print("=" * 60)
    print("🚀 [토목 뉴스 수집기] 토목 관련 순수 기사를 정밀 수집합니다...")
    print("=" * 60)
    
    kst = timezone(timedelta(hours=9))
    all_articles = []
    seen_keys = set()
    
    naver_client_id = os.environ.get("NAVER_CLIENT_ID", "").strip()
    naver_client_secret = os.environ.get("NAVER_CLIENT_SECRET", "").strip()
    has_naver_api = bool(naver_client_id and naver_client_secret)
    
    if has_naver_api:
        print("🔑 [네이버 뉴스] NAVER API HUB 연동 모드로 수집합니다. (실패 시 직접 수집으로 전환)")
    else:
        print("🌐 [네이버 뉴스] 직접 웹 스크래핑 엔진 가동 (API 키 불필요: 구글 + 네이버 하이브리드 수집)")
    if GNEWS_DECODER_ERROR:
        print(f"⚠️ [News Image] googlenewsdecoder 불러오기 실패 → 구글 뉴스 기사 사진 추출 불가: {GNEWS_DECODER_ERROR}")

    # 수집원별 요청 성공/실패 횟수 (검색어 전부 실패한 수집원은 실패로 보고 exit 1 → cron 알림)
    # API HUB가 전부 실패하면(유료 전환·키 만료·한도 초과 등) 직접 수집으로 기사는 채우되 실패로 기록해 알림을 받는다
    request_stats = {"구글 뉴스 RSS": [0, 0], "네이버 뉴스": [0, 0]}
    if has_naver_api:
        request_stats["네이버 API HUB"] = [0, 0]

    for cat in CATEGORIES:
        cat_count = 0
        for term in cat["queries"]:
            # 1. 구글 뉴스 RSS 수집
            rss_items = fetch_rss_for_term(term, when="3d")
            request_stats["구글 뉴스 RSS"][0 if rss_items is not None else 1] += 1
            for item in rss_items or []:
                raw_title = item.find("title").text if item.find("title") is not None else ""
                raw_link = item.find("link").text if item.find("link") is not None else ""
                raw_pub_date = item.find("pubDate").text if item.find("pubDate") is not None else ""
                raw_desc = item.find("description").text if item.find("description") is not None else ""
                source_el = item.find("source")
                publisher = source_el.text.strip() if source_el is not None and source_el.text else ""
                
                article = process_candidate_article(raw_title, raw_link, raw_pub_date, raw_desc, publisher, cat, kst, seen_keys)
                if article:
                    all_articles.append(article)
                    cat_count += 1
            
            # 2. 네이버 뉴스 수집 (API 키가 있으면 API HUB, 없거나 실패하면 직접 웹 스크래핑)
            naver_items = None
            if has_naver_api:
                naver_items = fetch_naver_news_for_term(term, naver_client_id, naver_client_secret, display=15)
                request_stats["네이버 API HUB"][0 if naver_items is not None else 1] += 1
            if naver_items is None:
                naver_items = scrape_naver_news_direct(term, max_items=10, now_kst=datetime.now(kst))
            request_stats["네이버 뉴스"][0 if naver_items is not None else 1] += 1

            for n_item in naver_items or []:
                raw_title = n_item.get("title", "")
                raw_link = n_item.get("originallink") or n_item.get("link", "")
                raw_pub_date = n_item.get("pubDate", "")
                raw_desc = n_item.get("description", "")
                publisher = n_item.get("publisher") or extract_naver_publisher(n_item.get("link", ""), n_item.get("originallink", ""), raw_title)
                
                article = process_candidate_article(raw_title, raw_link, raw_pub_date, raw_desc, publisher, cat, kst, seen_keys)
                if article:
                    all_articles.append(article)
                    cat_count += 1
                
        print(f"  - [{cat['name']}] 엄선된 기사 {cat_count}건 수집 완료")

    failed_sources = [name for name, (ok, fail) in request_stats.items() if ok == 0 and fail > 0]
    for name in failed_sources:
        print(f"❌ [{name}] 검색어 {request_stats[name][1]}개 요청이 모두 실패했습니다")

    # 기사가 하나도 없으면 기존 news.json을 덮어쓰지 않음 (빈 피드 배포 방지)
    if not all_articles:
        raise NewsFetchError("수집된 기사가 0건입니다 — 기존 news.json을 유지합니다")

    # 유사/중복 기사 군집화 & 사진 우선 대표 선발 (최신순으로 내려가며 사진 있는 기사 우선 대표 승격)
    resolve_unknown_publishers(all_articles)
    final_articles, duplicate_count = cluster_related_articles(all_articles)

    # 사진이 없는 기사는 큐레이션 예시 사진 대신 언론사(회사) 이름을 썸네일로 표출합니다.

    # 수집 기사 기반 대표 트렌딩 키워드 동적 추출 (8대 전문 분야 1-Keyword-Per-Domain)
    trending_keywords = extract_trending_keywords(final_articles, max_keywords=8)
    print(f"🔥 [오늘의 대표 키워드 추출] {', '.join(f'#{k}' for k in trending_keywords)}")
    
    # 결과 구조체
    now_kst = datetime.now(kst)
    result_data = {
        "last_updated": now_kst.strftime("%Y-%m-%d %H:%M:%S"),
        "last_updated_display": now_kst.strftime("%m월 %d일 %H:%M"),
        "total_count": len(final_articles),
        "raw_total_count": len(all_articles),
        "duplicate_count": duplicate_count,
        "failed_sources": failed_sources,
        "trending_keywords": trending_keywords,
        "categories": (lambda: [
            *([{"id": c["id"], "name": c["name"], "badge_color": c["badge_color"]} for c in CATEGORIES]),
            *([
                {"id": a["category_id"], "name": a.get("category_name", a["category_id"]), "badge_color": a.get("badge_color", "blue")}
                for a in final_articles
                if a.get("category_id") and a["category_id"] not in {c["id"] for c in CATEGORIES}
            ])
        ])(),
        "articles": final_articles
    }
    
    os.makedirs(DATA_DIR, exist_ok=True)
    temp_path = NEWS_JSON_PATH + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(result_data, f, ensure_ascii=False, indent=2)
    os.replace(temp_path, NEWS_JSON_PATH)
        
    print(f"✅ 총 {len(final_articles)}건의 토픽 기사 (중복 {duplicate_count}건 묶음, 키워드 {len(trending_keywords)}개) 저장 완료! ({NEWS_JSON_PATH})")
    return result_data

CLUSTER_STOPWORDS = {
    '토목', '건설', '공사', '도로', '철도', '터널', '교량', '사업', '시공', '한국', 
    '고속도로', '지하철', '인프라', '국토부', '국토교통부', '현장', '안전', '점검', 
    '추진', '본격', '선정', '착공', '개통', '발주', '수주', '사업비', '조원', '억원', 
    '지역', '전국', '계획', '발표', '시작', '마련', '개최', '참여', '지원', '협력', 
    '체결', '업무협약', '대책', '확정', '회의', '논의', '개발', '조성', '구축', 
    '도입', '확대', '운영', '관리', '실시', '진행', '완공', '연내', '내년', '올해', 
    '기자', '뉴스', '보도', '사진', '종합', '단독', '속보', '포토', '투자', '설계',
    '정부', '지자체', '공개', '강화', '조사', '위해', '통해', '관련', '위한',
    '국가철도망', '구축계획', '총력', '반영', '유치', '건의', '촉구', '호재',
    '기자회견', '간담회', '주민설명회', '설명회', '토론회', '맞손', '업무'
}

CLUSTER_BROAD_WORDS = {'서울', '경기', '부산', '대구', '인천', '광주', '대전', '울산', '스마트', '기술', '친환경', '시스템'}

def extract_article_keywords(title):
    t = re.sub(r'\[.*?\]|\(.*?\)|<.*?>', ' ', title)
    t = re.sub(r'[^a-zA-Z0-9가-힣]', ' ', t)
    raw_words = t.split()
    tokens = set()
    for w in raw_words:
        w_lower = w.lower()
        if len(w) >= 2 and w not in CLUSTER_STOPWORDS and w_lower not in CLUSTER_STOPWORDS:
            tokens.add(w)
    return tokens

def is_similar_article(title_a, tokens_a, title_b, tokens_b):
    if not tokens_a or not tokens_b:
        return False
    inter = tokens_a & tokens_b
    if not inter:
        return False
    non_broad = [w for w in inter if w not in CLUSTER_BROAD_WORDS]
    if not non_broad:
        return False
        
    dice = (2 * len(inter)) / (len(tokens_a) + len(tokens_b))
    
    # 조건 1: 구체적인 공통 키워드가 2개 이상이고 Dice 계수 0.28 이상
    if len(non_broad) >= 2 and dice >= 0.28:
        return True
        
    # 조건 2: 4글자 이상의 고유 프로젝트/지명 키워드 일치 & Dice 0.35 이상
    if len(non_broad) >= 1:
        long_kw = [w for w in non_broad if len(w) >= 4]
        if long_kw and dice >= 0.35:
            return True
        if len(inter) >= 2 and dice >= 0.38:
            return True
            
    # 조건 3: 특수문자 제거 후 앞 14글자가 일치하는 경우
    clean_a = re.sub(r'[^가-힣0-9]', '', title_a)[:14]
    clean_b = re.sub(r'[^가-힣0-9]', '', title_b)[:14]
    if len(clean_a) >= 10 and clean_a == clean_b:
        return True
        
    return False

def cluster_related_articles(articles, max_workers=15):
    """동일/유사 보도자료를 발행한 타 언론사 기사들을 대표 기사 하위로 묶음.
    [원칙]:
    1. 같은 기사 군집(단락)에서 기본적으로 '최신순'으로 정렬 (실제 조회수 데이터는 없음).
    2. 메인 대표 기사(Lead) 선정 시:
       - 가장 최신 기사에 사진(image)이 있다면 그대로 대표 기사로 선정.
       - 가장 최신 기사에 사진이 없다면, 최신순으로 내려가며 사진이 있는 기사를 우선 대표 기사로 승격.
       - 군집 내 모든 기사에 사진이 아예 없는 경우는 가장 최신 기사를 유지 (언론사 썸네일 표출).
    3. 모두보기(관련 기사) 목록은 최신순 정렬.
    4. 전체 피드는 클러스터 내 가장 최신 기사 일시 기준 최신순 정렬 유지.
    """
    clusters = []
    for art in articles:
        tokens = extract_article_keywords(art['title'])
        placed = False
        for cluster in clusters:
            primary = cluster['items'][0]
            if is_similar_article(primary['title'], cluster['tokens'], art['title'], tokens):
                cluster['items'].append(art)
                placed = True
                break
        if not placed:
            clusters.append({
                'tokens': tokens,
                'items': [art]
            })

    # 각 클러스터 내 기사들을 최신순으로 사전 정렬
    for c in clusters:
        c['items'].sort(key=lambda x: x.get('iso_date', ''), reverse=True)

    # 1단계: 모든 클러스터의 '가장 최신 기사'들의 이미지 병렬 추출
    phase1_candidates = [c['items'][0] for c in clusters]
    print(f"\n🖼️ [News Image] 1단계: {len(phase1_candidates)}개 대표 후보 기사 대표 사진(og:image) 병렬 추출...")
    extract_images_for_article_list(phase1_candidates, max_workers=max_workers)

    # 2단계: 다중 기사 군집 중 1위 기사에 사진이 없는 군집 선별 -> 하위 기사(2위~최대 4위) 이미지 병렬 추출
    phase2_candidates = []
    for c in clusters:
        if len(c['items']) > 1 and not c['items'][0].get('image'):
            # 하위 기사들 중 상위 3개(2위, 3위, 4위)를 후보로 추가
            phase2_candidates.extend(c['items'][1:4])

    if phase2_candidates:
        print(f"🖼️ [News Image] 2단계: 사진 부재 군집 {len(phase2_candidates)}개 후속 기사 사진 병렬 추출 (사진 우선 대표 승격)...")
        extract_images_for_article_list(phase2_candidates, max_workers=max_workers)

    final_articles = []
    total_duplicates = 0
    promoted_count = 0

    for c in clusters:
        items = c['items']
        if len(items) == 1:
            item = dict(items[0])
            item['related_articles'] = []
            final_articles.append(item)
        else:
            # 대표 기사 선정: 최신순으로 내려가면서 사진이 있는 기사를 우선 선정
            primary_idx = 0
            found_photo = False
            for idx, cand in enumerate(items):
                if cand.get('image'):
                    primary_idx = idx
                    found_photo = True
                    break

            if found_photo and primary_idx > 0:
                promoted_count += 1

            primary_article = dict(items[primary_idx])

            # 나머지 기사들은 '최신순'으로 정렬하여 모두보기 목록으로 구성
            other_articles = [it for idx, it in enumerate(items) if idx != primary_idx]
            other_articles_sorted_newest = sorted(
                other_articles,
                key=lambda x: x.get('iso_date', x.get('published_at', '')),
                reverse=True
            )

            primary_article['related_articles'] = [
                {
                    'id': a['id'],
                    'title': a['title'],
                    'link': a['link'],
                    'publisher': a['publisher'],
                    'relative_date': a.get('relative_date', '최근'),
                    'published_at': a.get('published_at', ''),
                    'iso_date': a.get('iso_date', ''),
                    'image': a.get('image', '')
                }
                for a in other_articles_sorted_newest
            ]
            total_duplicates += len(other_articles)

            # 클러스터 대표 일시는 가장 최신 기사의 일시를 보존하여 최신 피드에 올바르게 배치
            latest_iso = max(a.get('iso_date', '') for a in items)
            if latest_iso:
                primary_article['latest_iso_date'] = latest_iso

            final_articles.append(primary_article)

    # 전체 피드는 최신순(newest)으로 정렬하여 가장 최근 기사들이 상단에 뜨도록 유지
    final_articles.sort(key=lambda x: x.get('latest_iso_date', x.get('iso_date', '')), reverse=True)

    found_photos_cnt = sum(1 for a in final_articles if a.get('image'))
    print(f"📊 [유사기사 군집화 & 사진 우선 대표 선발 완료] 대표 토픽 {len(final_articles)}건 (중복 {total_duplicates}건, 사진 우선 승격 {promoted_count}건, 대표 사진 확보 {found_photos_cnt}건)")
    return final_articles, total_duplicates


def upgrade_to_high_res_image(url: str) -> str:
    """
    언론사 CMS(NDSoft 등)의 초저화질 썸네일(_v150.jpg 등)을 감지하여 고화질 원본 사진 URL로 변환
    """
    if not url:
        return ""
    # 1. NDSoft CMS: /thumbnail/ -> /photo/, _v150 제거
    if '/thumbnail/' in url and re.search(r'_v\d+\.(jpg|jpeg|png|webp)', url, re.I):
        return re.sub(r'_v\d+\.(jpg|jpeg|png|webp)', r'.\1', url.replace('/thumbnail/', '/photo/'), flags=re.I)
    # 2. Daum CDN: ?fname= 파라미터에서 원본 주소 복원
    if 'daumcdn.net/thumb/' in url and 'fname=' in url:
        m = re.search(r'fname=([^&]+)', url)
        if m:
            raw = urllib.parse.unquote(m.group(1))
            if raw.startswith('http'):
                return raw
    # 3. Naver news / pstatic: 작은 썸네일 해상도 제거 및 원본 치환
    if 'pstatic.net' in url and '?type=' in url:
        return re.sub(r'\?type=[^&]+', '?type=w800', url)
    # 4. _thumb / _small 패턴 제거
    if re.search(r'_(thumb|small)\.(jpg|jpeg|png)', url, re.I):
        return re.sub(r'_(thumb|small)\.(jpg|jpeg|png)', r'.\2', url, flags=re.I)
    return url

def extract_news_og_image(link: str) -> str:
    """
    구글 뉴스 RSS 링크로부터 원문 주소를 디코딩하고, 기사 원문 페이지의 og:image 태그 URL을 추출
    규칙:
    - googlenewsdecoder를 사용하여 원문 URL 디코딩
    - 원문 페이지에서 meta property='og:image' 추출
    - 사진 파일을 서버에 내려받지 않고 URL 주소만 저장
    - 실패 시 빈 문자열 "" 반환
    """
    if not link:
        return ""
    try:
        if "news.google.com" in link:
            if googlenewsdecoder is None:
                return ""
            dec = googlenewsdecoder.gnewsdecoder(link)
            if not dec or not dec.get("success"):
                return ""
            orig_url = dec.get("decoded_url", "")
        else:
            orig_url = link

        if not orig_url:
            return ""

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        r = requests.get(orig_url, headers=headers, timeout=4)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, "html.parser")
            og = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "og:image"})
            if og and og.get("content"):
                img = og["content"].strip()
                if img.startswith("/"):
                    parsed = urllib.parse.urlparse(orig_url)
                    img = f"{parsed.scheme}://{parsed.netloc}{img}"

                # 규칙 2: logo, snslogo, oglogo, default, noimage가 들어간 URL은 기사 사진이 아니므로 제외
                img_lower = img.lower()
                if any(bad in img_lower for bad in ['logo', 'snslogo', 'oglogo', 'default', 'noimage']):
                    return ""

                # CMS 고화질 원본 자동 복원
                cand = upgrade_to_high_res_image(img)
                if cand != img:
                    try:
                        v_res = requests.head(cand, headers=headers, timeout=2.5, allow_redirects=True)
                        if v_res.status_code == 200:
                            img = cand
                    except Exception:
                        pass

                # 규칙 1: http:// 주소는 https://로 변환하여 접근 가능할 때만 저장, 실패 시 제외
                if img.startswith("http://"):
                    https_img = "https://" + img[7:]
                    try:
                        res = requests.get(https_img, headers=headers, timeout=3, stream=True)
                        if 200 <= res.status_code < 400:
                            return https_img
                        return ""
                    except Exception:
                        return ""
                elif img.startswith("https://"):
                    return img
    except Exception as e:
        print(f"    [News Image] {link[:80]} 사진 추출 실패: {type(e).__name__}: {e}")
    return ""

UNKNOWN_PUBLISHERS = {"", "네이버뉴스", "언론사"}


def clean_site_name(name: str) -> str:
    """'울산매일 - 울산최초, 최고의 조간신문' → '울산매일', '컨슈머타임스(Consumertimes)' → '컨슈머타임스'"""
    name = re.split(r"\s+[-|:]\s+|\s*\(", name.strip())[0].strip()
    return name[:20]


def fetch_site_name(url: str) -> str:
    """기사 원문 페이지의 og:site_name (없거나 실패하면 '')"""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
    try:
        r = requests.get(url, headers=headers, timeout=4)
        if r.status_code != 200:
            return ""
        if r.encoding in (None, "ISO-8859-1"):
            r.encoding = r.apparent_encoding
        meta = BeautifulSoup(r.text, "html.parser").find("meta", property="og:site_name")
        if meta and meta.get("content"):
            return clean_site_name(meta["content"])
    except Exception:
        pass
    return ""


def resolve_unknown_publishers(articles, max_workers=15):
    """
    언론사명을 모르는 기사(네이버 API 응답엔 언론사명이 없음)를 원문 og:site_name으로 채움.
    같은 도메인은 한 번만 조회하고, 끝내 모르면 도메인(예: jtv.co.kr)을 표시.
    """
    from concurrent.futures import ThreadPoolExecutor

    by_domain = {}
    for a in articles:
        link = a.get("link", "")
        if a.get("publisher", "") in UNKNOWN_PUBLISHERS and link.startswith("http") and "news.google.com" not in link:
            domain = urllib.parse.urlparse(link).netloc.lower()
            by_domain.setdefault(domain, []).append(a)
    if not by_domain:
        return

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        names = dict(zip(by_domain, executor.map(lambda d: fetch_site_name(by_domain[d][0]["link"]), by_domain)))

    for domain, arts in by_domain.items():
        name = names.get(domain) or re.sub(r"^www\.", "", domain)
        for a in arts:
            a["publisher"] = name
    print(f"📰 [언론사명 보완] 원문 사이트 {len(by_domain)}곳 조회 → 기사 {sum(len(v) for v in by_domain.values())}건 언론사명 채움")


def extract_images_for_article_list(articles, max_workers=15):
    """기사 목록에 대해 병렬로 og:image를 추출하여 기사 객체에 image 필드 세팅"""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    targets = [a for a in articles if not a.get("image")]
    if not targets:
        return
    targets_by_id = {a["id"]: a for a in targets}

    def fetch_img(a):
        return a["id"], extract_news_og_image(a.get("link", ""))

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_img, a): a for a in targets}
        for f in as_completed(futures):
            try:
                aid, img = f.result()
                if aid in targets_by_id:
                    targets_by_id[aid]["image"] = img
            except Exception:
                pass

def extract_trending_keywords(articles, max_keywords=8):
    """
    매일 아침 수집된 전체 토목 기사들로부터 가장 화제가 되고 있는
    대표 토픽 키워드 8개를 정밀 분석하여 동적으로 추출합니다.
    동일 키워드 완전 중복 및 어근/형태소(철도, 도로 등)가 겹치는 유사 키워드의 중복 생성을 원천 차단합니다.
    """
    if not articles:
        return []

    # 2. 토목 8대 세부 전문 도메인 사전 패턴 (도메인당 1개만 선정하여 '2개씩 생기는 현상' 원천 차단)
    DOMAIN_PATTERNS = [
        # 1. smart_tech (스마트건설 / AI / BIM)
        ('스마트건설', 'smart_tech', 1.5), ('AI', 'smart_tech', 1.4), ('BIM', 'smart_tech', 1.4), 
        ('디지털트윈', 'smart_tech', 1.4), ('태그리스', 'smart_tech', 1.5), ('무선제어', 'smart_tech', 1.3),
        # 2. safety_ground (지반 / 지하안전 / 싱크홀)
        ('싱크홀', 'safety_ground', 1.5), ('지반침하', 'safety_ground', 1.5), ('지하안전', 'safety_ground', 1.4), 
        ('사면안정', 'safety_ground', 1.3), ('안전진단', 'safety_ground', 1.2),
        # 3. water_env (수자원 / 댐 / 하천)
        ('지천댐', 'water_env', 1.6), ('하천정비', 'water_env', 1.4), ('해수담수화', 'water_env', 1.4), 
        ('방파제', 'water_env', 1.3), ('침수예방', 'water_env', 1.3), ('탄소중립', 'water_env', 1.2),
        # 4. railway (철도 / 광역교통)
        ('철도망', 'railway', 1.4), ('GTX', 'railway', 1.3), ('도시철도', 'railway', 1.3), 
        ('달빛철도', 'railway', 1.4), ('신안산선', 'railway', 1.4),
        # 5. road (도로 / 고속도로 / 대심도)
        ('고속도로', 'road', 1.4), ('지하고속도로', 'road', 1.3), ('대심도', 'road', 1.3), ('교량', 'road', 1.2),
        # 6. port_infra (항만 / 공항 / 해양)
        ('항만공사', 'port_infra', 1.2), ('가덕도', 'port_infra', 1.4), ('새만금', 'port_infra', 1.3),
        # 7. policy_gov (정책 / 정부기관)
        ('국토부', 'policy_gov', 1.2), ('수자원공사', 'policy_gov', 1.1), 
        ('철도공단', 'policy_gov', 1.1), ('도로공사', 'policy_gov', 1.1), ('LH', 'policy_gov', 1.1),
        # 8. construction_method (신기술 / 특수공법)
        ('신기술', 'construction_method', 1.3), ('모듈러', 'construction_method', 1.3), ('프리팹', 'construction_method', 1.3)
    ]

    scores = Counter()
    kw_group = {}

    for a in articles:
        title = a.get('title', '')
        snippet = a.get('snippet', '')
        text = f"{title} {snippet}"

        for pattern, group, boost in DOMAIN_PATTERNS:
            kw_group[pattern] = group
            p_re = r'\b' + re.escape(pattern) + r'\b' if pattern in ['AI', 'GTX', 'BIM', 'LH'] else re.escape(pattern)
            if re.search(p_re, title, re.IGNORECASE):
                scores[pattern] += int(5 * boost)
            elif re.search(p_re, text, re.IGNORECASE):
                scores[pattern] += int(1 * boost)

    # 4. 키워드 상호 겹침(어근/형태소 중복) 판별기
    def is_overlapping(k1, k2):
        if k1 == k2 or k1 in k2 or k2 in k1:
            return True
        ignored_stems = {'공사', '공단', '개발', '기술', '사업', '추진', '혁신'}
        for i in range(len(k1) - 1):
            bi = k1[i:i+2]
            if bi in ignored_stems:
                continue
            if bi in k2:
                return True
        return False

    # 5. 상위 점수 순위 추출
    sorted_candidates = [k for k, score in scores.most_common(50) if score >= 2]

    # 6. 도메인당 무조건 딱 1개만 선정 (1-Keyword-Per-Domain 절대 원칙: 2개씩 짝지어 생기는 현상 원천 차단)
    final_keywords = []
    used_groups = set()

    for cand in sorted_candidates:
        cand_group = kw_group[cand]
        # 동일 도메인 중복 선택 금지
        if cand_group in used_groups:
            continue

        # 이미 선정된 키워드와 어근/부분문자열 겹침 여부 확인
        overlap = False
        for chosen in final_keywords:
            if is_overlapping(cand, chosen):
                overlap = True
                break
            # 접미사 '공사'도 중복 방지 (항만공사 vs 수자원공사 중복 차단)
            if cand.endswith('공사') and chosen.endswith('공사'):
                overlap = True
                break
        if not overlap:
            final_keywords.append(cand)
            used_groups.add(cand_group)
        if len(final_keywords) >= 8:
            break

    # 7. 부족할 경우 분야별 대표 fallback 키워드로 중복 없이 1개씩 보충
    #    (단, 오늘 기사에 실제로 등장한 키워드만 — 기사 0건인 키워드를 '대표 키워드'로 내보내지 않음)
    all_text = " ".join(f"{a.get('title', '')} {a.get('snippet', '')}" for a in articles)
    fallback_by_group = [
        ('smart_tech', '스마트건설'),
        ('safety_ground', '싱크홀'),
        ('water_env', '지천댐'),
        ('railway', '철도망'),
        ('road', '고속도로'),
        ('port_infra', '항만'),
        ('policy_gov', '국토부'),
        ('construction_method', '신기술')
    ]

    for group, fb in fallback_by_group:
        if len(final_keywords) >= 8:
            break
        if group in used_groups or fb not in all_text:
            continue
        overlap = False
        for chosen in final_keywords:
            if is_overlapping(fb, chosen):
                overlap = True
                break
        if not overlap:
            final_keywords.append(fb)
            used_groups.add(group)

    # 8. 최종 안전 중복 제거 및 최대 8개 순수 독립 키워드 반환
    unique_final = list(dict.fromkeys(final_keywords))[:8]
    return unique_final

def scrape_civil_contests():
    """토목 공모전 전담 파이프라인 (contest_scraper.py) 연동"""
    try:
        import contest_scraper
        return contest_scraper.scrape_civil_contests()
    except Exception as e:
        print(f"공모전 전담 파이프라인 실행 중 오류: {e}")
        return None

if __name__ == "__main__":
    # 0건이거나 수집원 하나가 전부 실패하면 exit 1 → cron_scrape.sh가 카카오톡 실패 알림 발송
    try:
        result = scrape_civil_news()
    except NewsFetchError as e:
        print(f"❌ {e}")
        sys.exit(1)
    sys.exit(1 if result["failed_sources"] else 0)
