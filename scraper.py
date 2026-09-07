import os
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

# 디렉토리 경로
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
NEWS_JSON_PATH = os.path.join(DATA_DIR, "news.json")

# 수집 카테고리 및 검색어 그룹
CATEGORIES = [
    {
        "id": "general",
        "name": "토목 종합",
        "queries": ["토목", "토목공학", "토목건설", "인프라 구축"],
        "badge_color": "blue"
    },
    {
        "id": "road_rail",
        "name": "도로·교량·철도",
        "queries": ["도로공사", "교량공사", "철도건설", "지하철공사", "고속도로건설", "GTX 착공"],
        "badge_color": "emerald"
    },
    {
        "id": "tunnel_geo",
        "name": "터널·지반·안전",
        "queries": ["터널공사", "지반침하", "지하안전평가", "싱크홀", "사면안정", "연약지반"],
        "badge_color": "amber"
    },
    {
        "id": "water_port",
        "name": "수자원·하천·항만",
        "queries": ["하천정비", "댐건설", "항만공사", "수자원개발", "방파제 공사", "치수 대책"],
        "badge_color": "cyan"
    },
    {
        "id": "smart_policy",
        "name": "스마트건설·정책",
        "queries": ["스마트건설", "건설신기술", "국토교통부 SOC", "토목 BIM", "인프라 투자"],
        "badge_color": "indigo"
    }
]

# 제외할 불필요한 노이즈 단어
EXCLUDE_KEYWORDS = [
    "토토", "사설토토", "바카라", "카지노", "불법도박", "승진인사", "부고", "동정"
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

def fetch_rss_for_term(term, when="2d"):
    """구글 뉴스 RSS 단일 검색어 수집"""
    encoded_q = urllib.parse.quote(f'"{term}" when:{when}')
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

def scrape_civil_news():
    """모든 카테고리 뉴스 수집, 정제 및 JSON 저장"""
    print("=" * 60)
    print("🚀 [토목 뉴스 수집기] 최신 토목 기사를 수집합니다...")
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
                
                # 노이즈 필터링
                if any(bad in raw_title for bad in EXCLUDE_KEYWORDS):
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
                if not snippet or snippet == title:
                    snippet = f"{publisher} 보도 - 클릭하여 원문 기사를 확인하세요."
                
                # 기본 조회수 (해시 기반 현실적인 초기 조회수 120~2,400 사이 배정)
                base_views = 120 + (abs(hash(title)) % 2280)

                article = {
                    "id": str(abs(hash(title + raw_link)))[-10:],
                    "title": title,
                    "link": raw_link,
                    "publisher": publisher,
                    "category_id": cat["id"],
                    "category_name": cat["name"],
                    "badge_color": cat["badge_color"],
                    "snippet": snippet[:160] + ("..." if len(snippet) > 160 else ""),
                    "iso_date": iso_date,
                    "published_at": display_date,
                    "relative_date": relative_date,
                    "views": base_views
                }
                all_articles.append(article)
                cat_count += 1
                
        print(f"  - [{cat['name']}] 고유 기사 {cat_count}건 수집 완료")
    
    # 최신순 정렬
    all_articles.sort(key=lambda x: x["iso_date"], reverse=True)
    
    # 결과 구조체
    now_kst = datetime.now(kst)
    result_data = {
        "last_updated": now_kst.strftime("%Y-%m-%d %H:%M:%S"),
        "last_updated_display": now_kst.strftime("%m월 %d일 %H:%M"),
        "total_count": len(all_articles),
        "categories": [
            {"id": "all", "name": "전체 보기", "badge_color": "slate"}
        ] + [
            {"id": c["id"], "name": c["name"], "badge_color": c["badge_color"]} for c in CATEGORIES
        ],
        "articles": all_articles
    }
    
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(NEWS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(result_data, f, ensure_ascii=False, indent=2)
        
    print(f"✅ 총 {len(all_articles)}건의 토목 기사가 최종 정리되었습니다. ({NEWS_JSON_PATH})")
    return result_data

if __name__ == "__main__":
    scrape_civil_news()
