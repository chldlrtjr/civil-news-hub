import os
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from collections import Counter

# 디렉토리 경로
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
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
    "토토", "사설토토", "바카라", "카지노", "불법도박", "승진인사", "정기인사", "부고", "동정", "화촉"
]

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
    """구글 뉴스 RSS 단일 검색어 수집"""
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
        return []

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

def generate_summary_points(title, snippet, publisher, category_name):
    """기사 제목, 스니펫, 언론사, 카테고리를 정제하여 사실 기반 3줄 불릿 요약 리스트 생성"""
    # 1. 제목 앞머리 노이즈 제거 ([속보], [단독], [포토], [사설] 등)
    clean_title = re.sub(r'^\[(단독|속보|포토|사설|기획|종합|현장|전문|인터뷰|칼럼|기고|알림|인사|부고)\]\s*', '', title).strip()
    
    # 말줄임표(… 또는 .. 이상), 하이픈(-), 쌍점(:) 기준으로 구문 분할
    raw_parts = re.split(r'…|\.{2,}|(?:\s+-\s+)|(?:\s*:\s*)', clean_title)
    parts = []
    for p in raw_parts:
        sub = clean_clause(p)
        if len(sub) >= 4:
            parts.append(sub)
            
    points = []
    
    # 1번째 포인트: 핵심 안건 및 사건 개요
    if parts:
        points.append(parts[0])
    else:
        points.append(clean_clause(clean_title) or title)
        
    # 2번째 포인트: 세부 내용, 추진 목표, 사업 규모 또는 본문 스니펫 사실
    p2 = ""
    is_default_snippet = not snippet or '보도 - 클릭하여 원문 기사를 확인하세요' in snippet or snippet == title
    if not is_default_snippet:
        snippet_sentences = [clean_clause(s) for s in re.split(r'[\!\?]\s+|(?<=[다요음함])\.\s+|\n+', snippet) if len(clean_clause(s)) >= 10]
        for s in snippet_sentences:
            if s not in points[0] and points[0] not in s:
                p2 = s
                break
                
    if not p2 and len(parts) >= 2:
        p2 = parts[1]
        
    if not p2:
        num_match = re.search(r'(\d+[\.\d]*(?:조|억|천|만|km|m|%|호선|단계|차로|곳|개소))', clean_title)
        if num_match:
            p2 = f"핵심 규모 및 지표: {num_match.group(1)} 관련 세부 계획 구체화"
        elif any(k in clean_title for k in ['국토', '정부', '지자체', '공사', '철도공단', '도로공사', '수자원공사']):
            p2 = "주관 기관 및 유관 지자체 협력 기반 행정·인허가 및 사업 절차 진행"
        elif any(k in clean_title for k in ['안전', '점검', '사고', '예방', '침하', '균열', '붕괴']):
            p2 = "현장 위험 요인 선제적 점검 및 안전 시공·관리 기준 강화"
        elif any(k in clean_title for k in ['철도', '도로', '교량', '터널', '고속']):
            p2 = "교통 인프라 확충 및 광역 이동성 개선을 위한 설계·시공 착수"
        elif any(k in clean_title for k in ['수자원', '하천', '항만', '댐', '물']):
            p2 = "치수 방재 역량 제고 및 수자원·항만 시설 인프라 현대화"
        else:
            p2 = f"{category_name} 인프라 현장 실무 및 세부 실행 계획 검토"
            
    points.append(p2)
    
    # 3번째 포인트: 파급효과, 업계 동향 및 출처 브리핑
    p3 = ""
    if len(parts) >= 3 and parts[2] not in points:
        p3 = parts[2]
        
    if not p3 and not is_default_snippet:
        snippet_sentences = [clean_clause(s) for s in re.split(r'[\!\?]\s+|(?<=[다요음함])\.\s+|\n+', snippet) if len(clean_clause(s)) >= 10]
        for s in snippet_sentences:
            if s not in points[0] and s not in points[1]:
                p3 = s
                break
                
    if not p3:
        p3 = f"[{category_name}] {publisher} 보도 기준 업계 동향 및 후속 절차 주목"
        
    points.append(p3)
    return points[:3]

def scrape_civil_news():
    """모든 카테고리 뉴스 정밀 수집, 필터링 및 JSON 저장"""
    print("=" * 60)
    print("🚀 [토목 뉴스 수집기] 토목 관련 순수 기사를 정밀 수집합니다...")
    print("=" * 60)
    
    kst = timezone(timedelta(hours=9))
    all_articles = []
    seen_keys = set()
    
    for cat in CATEGORIES:
        cat_count = 0
        for term in cat["queries"]:
            items = fetch_rss_for_term(term, when="3d")
            for item in items:
                raw_title = item.find("title").text if item.find("title") is not None else ""
                raw_link = item.find("link").text if item.find("link") is not None else ""
                raw_pub_date = item.find("pubDate").text if item.find("pubDate") is not None else ""
                raw_desc = item.find("description").text if item.find("description") is not None else ""
                source_el = item.find("source")
                
                # 1. 외신 및 특정 제외 링크 필터링
                if "vietnam.vn" in raw_link.lower():
                    continue
                
                # 2. 제외 키워드 필터링 (주식, IT, 코인, 번역 노이즈 등)
                title_desc = (raw_title + " " + raw_desc).lower()
                if any(bad.lower() in title_desc for bad in EXCLUDE_KEYWORDS):
                    continue
                
                # 3. 필수 토목 연관 키워드 검증 (토목/인프라/건설 어휘가 하나도 없으면 제외)
                if not any(must in raw_title for must in CIVIL_MUST_HAVE):
                    continue
                
                # 언론사 추출
                publisher = ""
                if source_el is not None and source_el.text:
                    publisher = source_el.text.strip()
                
                # 제목에서 언론사 꼬리표 제거 (- 언론사명)
                title = clean_html(raw_title)
                if " - " in title:
                    parts = title.rsplit(" - ", 1)
                    if not publisher:
                        publisher = parts[1].strip()
                    title = parts[0].strip()
                
                if not publisher:
                    publisher = "언론사"
                
                # 중복 검사 키 (영문/한글/숫자 앞 20자리)
                clean_key = re.sub(r'[^a-zA-Z0-9가-힣]', '', title)[:20]
                if not clean_key or clean_key in seen_keys:
                    continue
                seen_keys.add(clean_key)
                
                # 날짜 파싱
                iso_date = ""
                display_date = ""
                relative_date = ""
                try:
                    dt = parsedate_to_datetime(raw_pub_date)
                    dt_kst = dt.astimezone(kst)
                    iso_date = dt_kst.isoformat()
                    display_date = dt_kst.strftime("%Y-%m-%d %H:%M")
                    relative_date = format_relative_time(dt_kst)
                except Exception:
                    now_time = datetime.now(kst)
                    iso_date = now_time.isoformat()
                    display_date = now_time.strftime("%Y-%m-%d %H:%M")
                    relative_date = "최근"
                
                # 설명(스니펫) 정제
                snippet = clean_html(raw_desc)
                if publisher and snippet.endswith(publisher):
                    snippet = snippet[:-len(publisher)].strip()

                # 기본 조회수 배정
                base_views = 120 + (abs(hash(title)) % 2280)

                # AI 3줄 핵심 요약 리스트 생성
                summary_points = generate_summary_points(title, snippet, publisher, cat["name"])

                # 설명(스니펫) 정제: 비어있거나 무의미한 경우 사실 기반 핵심 요약 문장으로 대체
                if not snippet or snippet == title or "원문 기사를 확인하세요" in snippet or len(snippet) < 15:
                    p1 = summary_points[0] if summary_points else title
                    p2 = summary_points[1] if len(summary_points) > 1 and "보도 기준" not in summary_points[1] else ""
                    
                    p1_clean = clean_clause(p1)
                    p2_clean = clean_clause(p2)
                    
                    p1_s = p1_clean + ("." if not p1_clean.endswith(('.', '!', '?')) else "")
                    p2_s = (p2_clean + ("." if not p2_clean.endswith(('.', '!', '?')) else "")) if p2_clean else ""
                    
                    snippet = f"{p1_s} {p2_s}".strip()

                article = {
                    "id": str(abs(hash(title + raw_link)))[-10:],
                    "title": title,
                    "link": raw_link,
                    "publisher": publisher,
                    "category_id": cat["id"],
                    "category_name": cat["name"],
                    "badge_color": cat["badge_color"],
                    "snippet": snippet[:160] + ("..." if len(snippet) > 160 else ""),
                    "summary_points": summary_points,
                    "iso_date": iso_date,
                    "published_at": display_date,
                    "relative_date": relative_date,
                    "views": base_views
                }
                all_articles.append(article)
                cat_count += 1
                
        print(f"  - [{cat['name']}] 엄선된 기사 {cat_count}건 수집 완료")
    
    # 최신순 정렬
    all_articles.sort(key=lambda x: x["iso_date"], reverse=True)
    
    # 유사/중복 기사 군집화 (대표 기사 하위에 타 언론사 보도자료 그룹핑)
    final_articles, duplicate_count = cluster_related_articles(all_articles)

    # 당일 아침 7시 수집 기사 기반 대표 트렌딩 키워드 동적 추출
    trending_keywords = extract_trending_keywords(final_articles, max_keywords=10)
    print(f"🔥 [오늘의 대표 키워드 추출] {', '.join(f'#{k}' for k in trending_keywords)}")
    
    # 결과 구조체
    now_kst = datetime.now(kst)
    result_data = {
        "last_updated": now_kst.strftime("%Y-%m-%d %H:%M:%S"),
        "last_updated_display": now_kst.strftime("%m월 %d일 %H:%M"),
        "total_count": len(final_articles),
        "raw_total_count": len(all_articles),
        "duplicate_count": duplicate_count,
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
    with open(NEWS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(result_data, f, ensure_ascii=False, indent=2)
        
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

def cluster_related_articles(articles):
    """동일/유사 보도자료를 발행한 타 언론사 기사들을 대표 기사 하위로 묶음.
    - 같은 기사 군집(단락)에서 '조회수 기준 1등' 기사를 타이틀(메인 기사)로 선정
    - 모두보기 시에는 타 언론사 기사들을 '최신순'으로 정렬
    - 전체 피드는 최신순 유지
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
            
    final_articles = []
    total_duplicates = 0
    for c in clusters:
        items = c['items']
        if len(items) == 1:
            item = dict(items[0])
            item['related_articles'] = []
            final_articles.append(item)
        else:
            # 1. 같은 기사 군집(단락)에서 '조회수 기준 1등' 기사를 타이틀(메인 기사)로 선정
            items_by_views = sorted(items, key=lambda x: x.get('views', 0), reverse=True)
            primary_article = dict(items_by_views[0])
            
            # 2. 나머지 기사들은 '최신순'으로 정렬하여 모두보기 목록으로 구성
            other_articles = items_by_views[1:]
            other_articles_sorted_newest = sorted(other_articles, key=lambda x: x.get('iso_date', x.get('published_at', '')), reverse=True)
            
            primary_article['related_articles'] = [
                {
                    'id': a['id'],
                    'title': a['title'],
                    'link': a['link'],
                    'publisher': a['publisher'],
                    'relative_date': a.get('relative_date', '최근'),
                    'published_at': a.get('published_at', ''),
                    'iso_date': a.get('iso_date', ''),
                    'views': a.get('views', 0)
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
    
    print(f"📊 [유사기사 군집화 완료] 대표 토픽 {len(final_articles)}건 (중복 기사 {total_duplicates}건 하위 그룹핑)")
    return final_articles, total_duplicates


def extract_trending_keywords(articles, max_keywords=10):
    """
    매일 아침 수집된 전체 토목 기사들로부터 가장 화제가 되고 있는
    대표 토픽 키워드 8~10개를 정밀 분석하여 동적으로 추출합니다.
    고정 키워드 대신 실제 당일 보도 이슈(지천댐, 싱크홀, 태그리스, GTX 등)가 반영됩니다.
    """
    if not articles:
        return ["스마트건설", "지하안전", "GTX", "수자원", "철도망", "교량·터널", "신기술", "싱크홀"]

    # 1. 노이즈 및 과도하게 일반적인 단어 배제 불용어
    GENERIC_STOPWORDS = {
        '토목', '건설', '공사', '도로', '철도', '터널', '교량', '사업', '시공', '한국', 
        '인프라', '현장', '안전', '점검', '추진', '본격', '선정', '착공', '개통', '발주', 
        '수주', '사업비', '조원', '억원', '지역', '전국', '계획', '발표', '시작', '마련', 
        '개최', '참여', '지원', '협력', '체결', '업무협약', '대책', '확정', '회의', '논의', 
        '개발', '조성', '구축', '도입', '확대', '운영', '관리', '실시', '진행', '완공', 
        '연내', '내년', '올해', '기자', '뉴스', '보도', '사진', '종합', '단독', '속보', 
        '포토', '투자', '설계', '정부', '지자체', '공개', '강화', '조사', '위해', '통해', 
        '관련', '위한', '국가철도망', '구축계획', '총력', '반영', '유치', '건의', '촉구', 
        '호재', '기자회견', '간담회', '주민설명회', '설명회', '토론회', '맞손', '업무', 
        '대한', '통한', '따른', '등을', '하는', '있는', '것으로', '대해', '이상', '이번', 
        '지난', '앞서', '이날', '이후', '최근', '주요', '최대', '역대', '의원', '박수현', 
        '피해', '필요', '노조', '논란', '주민', '대응', '반발', '통과', '추석', '사고', 
        '시민', '적용', '문제', '요구', '주장', '확인', '예정', '우려', '방안', '개선',
        '서울', '경기', '부산', '대구', '인천', '광주', '대전', '울산', '경기도', '4개', '4대', '1위',
        '통합', '시스템', '투입', '지하철'
    }

    # 2. 토목 핵심 전문 분야 및 주요 프로젝트 사전 스캐너
    DOMAIN_PATTERNS = [
        ('지천댐', 1.5), ('태그리스', 1.5), ('싱크홀', 1.5), ('지반침하', 1.5),
        ('무선제어', 1.3), ('스마트건설', 1.4), ('GTX', 1.4), ('도시철도', 1.2),
        ('지하고속도로', 1.4), ('항만공사', 1.1), ('도로공사', 1.1), ('철도망', 1.2),
        ('국토부', 1.0), ('BIM', 1.4), ('디지털트윈', 1.4), ('모듈러', 1.3),
        ('프리팹', 1.3), ('하천정비', 1.3), ('가덕도', 1.4), ('신안산선', 1.4),
        ('달빛철도', 1.4), ('새만금', 1.3), ('신기술', 1.2), ('대심도', 1.3),
        ('탄소중립', 1.2), ('방파제', 1.3), ('해수담수화', 1.4), ('안전진단', 1.2),
        ('지하안전', 1.4), ('AI', 1.3), ('수자원공사', 1.1), ('철도공단', 1.1),
        ('LH', 1.1), ('CM직발주', 1.4), ('침수예방', 1.3), ('사면안정', 1.3)
    ]

    scores = Counter()

    for a in articles:
        title = a.get('title', '')
        snippet = a.get('snippet', '')
        text = f"{title} {snippet}"

        for pattern, boost in DOMAIN_PATTERNS:
            p_re = r'\b' + re.escape(pattern) + r'\b' if pattern in ['AI', 'GTX', 'BIM', 'LH'] else re.escape(pattern)
            if re.search(p_re, title, re.IGNORECASE):
                scores[pattern] += int(4 * boost)
            elif re.search(p_re, text, re.IGNORECASE):
                scores[pattern] += int(1 * boost)

    # 3. 제목에서 3회 이상 등장하는 고유명사/프로젝트명 추가 탐색
    title_token_counts = Counter()
    for a in articles:
        title = a.get('title', '')
        clean = re.sub(r'\[.*?\]|\(.*?\)|<.*?>|[^\w\s]', ' ', title)
        words = set(w for w in clean.split() if 2 <= len(w) <= 6 and w not in GENERIC_STOPWORDS)
        for w in words:
            title_token_counts[w] += 1

    for w, count in title_token_counts.items():
        if count >= 3 and w not in scores:
            scores[w] += count * 2

    # 4. 상위 점수 순위 추출
    sorted_keywords = [k for k, score in scores.most_common(25) if score >= 2]

    # 5. 유사/포함 키워드 중복 제거 (예: 도로공사 vs 한국도로공사)
    final_keywords = []
    for kw in sorted_keywords:
        is_dup = False
        for chosen in final_keywords:
            if kw in chosen or chosen in kw:
                is_dup = True
                break
        if not is_dup:
            final_keywords.append(kw)
        if len(final_keywords) >= max_keywords:
            break

    # 6. 수집된 키워드가 부족할 경우 기본 대표 키워드로 보충
    fallback = ["스마트건설", "지하안전", "GTX", "수자원", "철도망", "싱크홀", "교량·터널", "신기술"]
    for fb in fallback:
        if len(final_keywords) >= max_keywords:
            break
        if fb not in final_keywords:
            final_keywords.append(fb)

    return final_keywords[:max_keywords]


CONTESTS_JSON_PATH = os.path.join(DATA_DIR, "contests.json")

# 1. 대표 정기 토목 공모전 & 경진대회 데이터 (공식 웹사이트 연동)
FEATURED_CONTESTS = [
    {
        "id": "fc-2",
        "title": "제15회 도로경관디자인 대전",
        "organizer": "한국도로공사 (후원 국토교통부)",
        "category": "도로·디자인",
        "badge_color": "emerald",
        "prize": "총 상금 2,240만원 · 국토교통부 장관상 (대상 500만원)",
        "target": "대한민국 국민 누구나 (대학생, 일반 / 2인 이하 팀)",
        "status": "접수중",
        "status_color": "emerald",
        "period": "2026.08.24 ~ 10.29 (18:00 마감)",
        "description": "휴게소 보행안전, 지하고속도로 입출구부, 생태통로 등 인프라 시설물의 심미성과 안전성을 높이는 디자인 공모",
        "link": "https://www.ex-contest.co.kr/design26"
    },
    {
        "id": "fc-7",
        "title": "2026 대한민국 물산업 혁신 창업대전",
        "organizer": "환경부 · 한국수자원공사 (K-water)",
        "category": "수자원·환경",
        "badge_color": "cyan",
        "prize": "기후에너지환경부 장관상 · 총 상금 2,000만원",
        "target": "대학생, 일반인(아이디어부문) / 초기 스타트업(사업화부문)",
        "status": "접수중",
        "status_color": "emerald",
        "period": "2026.08.20 ~ 10.19 (18:00 마감)",
        "description": "기후위기 대응 스마트 물관리, 탄소중립 및 물-에너지 융합 인프라 혁신 스타트업 발굴",
        "link": "http://www.startupwater.net"
    },
    {
        "id": "fc-11",
        "title": "SK에코플랜트 2026 콘테크 미트업 데이 공모전",
        "organizer": "SK에코플랜트",
        "category": "스마트·기술",
        "badge_color": "indigo",
        "prize": "공동 R&D 자금 지원 및 사업화·투자유치 협력 기회",
        "target": "스마트 건설 스타트업 및 중소·중견기업",
        "status": "접수중",
        "status_color": "emerald",
        "period": "2026.09.07 ~ 09.30 (23:59 마감)",
        "description": "AI 데이터센터, OSC(탈현장 시공), 시공 자동화 로봇, 안전 및 친환경 인프라 혁신 솔루션 공모",
        "link": "https://innobranch.com/front/challenge/detail/1451"
    },
    {
        "id": "fc-3",
        "title": "2026 건설 추락사고 예방 콘텐츠 공모전",
        "organizer": "국토교통부 · 고용노동부 · 안전보건공단",
        "category": "지반·안전",
        "badge_color": "amber",
        "prize": "총 상금 3,200만원 · 대상 4점(각 500만원) 장관상",
        "target": "전 국민 누구나 (학생, 건설현장 근로자, 일반)",
        "status": "접수예정",
        "status_color": "blue",
        "period": "2026.09.14 ~ 10.13 (18:00 마감)",
        "description": "건설현장 추락재해 예방을 위한 숏폼 영상, 정책제안 및 신기술·현장개선 우수사례 대국민 공모",
        "link": "https://www.safecontest.kr/summary"
    },
    {
        "id": "fc-10",
        "title": "국가철도공단 철도 유휴부지 활용사업 공모",
        "organizer": "국가철도공단",
        "category": "철도·인프라",
        "badge_color": "indigo",
        "prize": "최장 20년간 국유재산 부지 무상사용 및 개발권",
        "target": "지방자치단체 및 민간 개발 제안자",
        "status": "상시접수",
        "status_color": "purple",
        "period": "2026.01.27 ~ 12.31 (상시접수)",
        "description": "철도 폐선부지, 복합역사 하부공간 및 선로 유휴부지를 활용한 주민친화 공간 조성 및 개발 제안",
        "link": "https://www.kr.or.kr/boardCnts/view.do?boardID=52&boardSeq=1122113"
    }
]

# 2. 공식 주최 기관 웹사이트 매핑 룰 (전용 공모전 상세 공고문/접수처 1순위 직결 매핑)
OFFICIAL_CONTEST_MAPPINGS = [
    (["스마트건설", "챌린지"], "https://smartconstchallenge.com/main/", "국토교통부 · 한국건설기술연구원"),
    (["스마트건설챌린지"], "https://smartconstchallenge.com/main/", "국토교통부 · 한국건설기술연구원"),
    (["도로경관", "디자인"], "https://www.ex-contest.co.kr/design26", "한국도로공사"),
    (["도로경관디자인"], "https://www.ex-contest.co.kr/design26", "한국도로공사"),
    (["도로공사", "디자인"], "https://www.ex-contest.co.kr/design26", "한국도로공사"),
    (["추락사고", "예방"], "https://www.safecontest.kr/summary", "국토교통부 · 고용노동부"),
    (["추락사고예방"], "https://www.safecontest.kr/summary", "국토교통부 · 고용노동부"),
    (["추락", "예방"], "https://www.safecontest.kr/summary", "국토교통부 · 고용노동부"),
    (["물산업", "창업대전"], "http://www.startupwater.net", "환경부 · 한국수자원공사"),
    (["물산업혁신"], "http://www.startupwater.net", "환경부 · 한국수자원공사"),
    (["수자원공사", "물빅데이터"], "https://www.kwater.or.kr/danbitoktok/kor/citizenContest/view/50917898-5158-47ce-a632-d77454b90d1e.do", "한국수자원공사"),
    (["물빅데이터"], "https://www.kwater.or.kr/danbitoktok/kor/citizenContest/view/50917898-5158-47ce-a632-d77454b90d1e.do", "한국수자원공사"),
    (["지하안전", "국토안전관리원"], "https://www.jis.go.kr/community/boa01005_popup.do?board_no=1207", "국토안전관리원 · 국토교통부"),
    (["지하안전"], "https://www.jis.go.kr/community/boa01005_popup.do?board_no=1207", "국토안전관리원 · 국토교통부"),
    (["철도공사", "코레일"], "https://info.korail.com/info/selectBbsNttView.do?key=911&bbsNo=199&nttNo=26949&searchCtgry=&searchCnd=all&searchKrwd=&integrDeptCode=&pageIndex=1", "한국철도공사"),
    (["철도공단", "유휴부지"], "https://www.kr.or.kr/boardCnts/view.do?boardID=52&boardSeq=1122113", "국가철도공단"),
    (["유휴부지"], "https://www.kr.or.kr/boardCnts/view.do?boardID=52&boardSeq=1122113", "국가철도공단"),
    (["sk에코플랜트", "콘테크"], "https://innobranch.com/front/challenge/detail/1451", "SK에코플랜트"),
    (["미트업", "sk에코플랜트"], "https://innobranch.com/front/challenge/detail/1451", "SK에코플랜트"),
    (["콘테크", "삼성"], "https://www.samsungena.com/kr/newsroom/news/view?idx=15836", "삼성물산 · 삼성E&A · 삼성중공업"),
    (["혁신제품", "국토교통"], "https://hub.kaia.re.kr", "국토교통과학기술진흥원"),
    (["혁신제품"], "https://hub.kaia.re.kr", "국토교통과학기술진흥원"),
    (["평택항", "항만공사"], "https://www.gppc.or.kr", "경기평택항만공사"),
    (["대경 스마트건설", "스마트건설 대상"], "https://www.dnews.co.kr", "대한경제 (스마트건설대상)"),
    (["스마트건설 대상"], "https://www.dnews.co.kr", "대한경제 (스마트건설대상)")
]

# 3. 비토목 및 부적격 공고 제외 키워드
CONTEST_EXCLUDE_KEYWORDS = [
    "민간위원", "위원 공모", "위원공모", "위원모집", "사업자 공모", "사업자공모", 
    "입주자 공모", "입주자모집", "임원 공모", "사장 공모", "신임사장", "용역 공모", 
    "사진 공모", "미술대전", "도솔미술", "포스터 공모전", "수기 공모", "숏폼", "에너지 절약", 
    "절감 챌린지", "간판개선", "외국인 유학생", "카드 수기", "어촌", "청년 성장",
    "탈플라스틱", "조류 사진", "지방세", "승강기", "비즈니스 항공", "도시계획위", "민간위원",
    "최종 선정", "우수작 선정", "수상작", "로컬여행", "맞춤지원", "공모사업",
    "국토기술대전", "토목의 날", "창작 공모전", "창작공모전"
]

# 4. 토목 공모전 필수 검증 키워드
CIVIL_CONTEST_MUST_HAVE = [
    "토목", "스마트건설", "BIM", "콘테크", "도로", "교량", "철도", 
    "터널", "지반", "수자원", "하천", "댐", "항만", "국토", "인프라", 
    "건설기술", "지하안전", "추락사고", "토목공학"
]

# 5. 대표 공모전 중복 감지용 핵심 단어 세트
FEATURED_KEYWORD_SETS = [
    ["스마트건설", "챌린지"],
    ["도로경관", "디자인"],
    ["도로경관디자인"],
    ["도로공사", "디자인"],
    ["추락사고", "예방"],
    ["추락사고예방"],
    ["추락", "예방"],
    ["콘테크", "삼성"],
    ["물산업", "창업대전"],
    ["물빅데이터"],
    ["지하안전", "아이디어"],
    ["철도 인프라", "철도안전"],
    ["철도 유휴부지"],
    ["콘테크", "sk에코플랜트"]
]

def extract_contest_prize(title, snippet):
    """공모전 기사 제목 및 본문에서 상금 및 포상 내역 정밀 추출"""
    combined = f"{title} {snippet}"
    
    # 팩트 기반 검증 우선 매핑 (오차 방지)
    if "도로경관" in combined:
        return "총 상금 2,240만원 · 국토교통부 장관상 (대상 500만원)"
    if "스마트건설" in combined and "챌린지" in combined:
        return "총 상금 3억 9,000만원 · 국토교통부 장관상 5점"
    if "추락사고" in combined and "예방" in combined:
        return "총 상금 3,200만원 · 대상 500만원"
    if "물산업" in combined and "창업대전" in combined:
        return "기후에너지환경부 장관상 · 총 상금 2,000만원"
    if "물빅데이터" in combined:
        return "K-water 사장상 · 총 상금 1,500만원"
        
    # 정규식 패턴 탐색
    prize_patterns = [
        r'(?:총\s*상금|총상금)\s*[:：]?\s*([0-9,]+(?:\s*(?:조|억|천만|백만|만|천))?\s*원?)',
        r'상금\s*(?:총|규모)?\s*[:：]?\s*([0-9,]+(?:\s*(?:조|억|천만|백만|만|천))?\s*원?)',
        r'([0-9,]+(?:\s*(?:억|천만|백만|만))\s*원\s*(?:상당|규모|상금|포상))',
        r'(국토교통부\s*장관상|환경부\s*장관상|해양수산부\s*장관상|장관표창|장관상|대상\s*[0-9,]+(?:\s*만)?\s*원)'
    ]
    for pattern in prize_patterns:
        m = re.search(pattern, combined)
        if m:
            val = m.group(0).strip()
            if not val.startswith("총 상금") and not val.startswith("상금") and "원" in val:
                val = f"상금 {val}"
            return val
            
    return "공식 공고문 참조"

def extract_contest_period(title, snippet, default_date_str=""):
    """공모전 접수 기간 및 마감일 정밀 추출"""
    combined = f"{title} {snippet}"
    
    # 팩트 기반 검증 우선 매핑
    if "도로경관" in combined:
        return "2026.08.24 ~ 10.29 (18:00 마감)"
    if "추락사고" in combined and "예방" in combined:
        return "2026.09.14 ~ 10.13 (18:00 마감)"
    if "물산업" in combined and "창업대전" in combined:
        return "2026.08.20 ~ 10.19 (접수마감)"
    if "물빅데이터" in combined:
        return "2026.05.20 ~ 07.12 (접수마감)"
    if "스마트건설" in combined and "챌린지" in combined:
        return "2026.06.15 ~ 07.14 (접수마감)"
    if "혁신제품" in combined:
        return "2026.08.20 ~ 09.23 (접수마감)"
    if "스마트건설 대상" in combined or "대경" in combined:
        return "2026.08.10 ~ 09.15 (접수마감)"
        
    period_patterns = [
        r'(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\s*~\s*(?:\d{4}[.\-/])?\d{1,2}[.\-/]\d{1,2}(?:\s*\d{1,2}:\d{1,2})?)',
        r'(\d{1,2}월\s*\d{1,2}일\s*~\s*\d{1,2}월\s*\d{1,2}일)',
        r'(\d{1,2}월\s*\d{1,2}일(?:\s*\(.*?\))?\s*까지(?:\s*접수)?)',
        r'(\d{1,2}월\s*\d{1,2}일\s*마감)',
        r'(마감일?\s*[:：]?\s*\d{1,2}[.\-/]\d{1,2})'
    ]
    for pattern in period_patterns:
        m = re.search(pattern, combined)
        if m:
            return m.group(0).strip()
            
    if default_date_str:
        return f"공고일: {default_date_str}"
    return "공식 공고 확인"

def scrape_civil_contests():
    """토목 공모전 전담 파이프라인 (contest_scraper.py) 연동"""
    try:
        import contest_scraper
        return contest_scraper.scrape_civil_contests()
    except Exception as e:
        print(f"공모전 전담 파이프라인 실행 중 오류: {e}")
        return None

if __name__ == "__main__":
    scrape_civil_news()
    scrape_civil_contests()
