import os
import json
import webbrowser
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import scraper

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DATA_DIR = os.path.join(BASE_DIR, "data")
NEWS_JSON_PATH = os.path.join(DATA_DIR, "news.json")

CONTESTS_JSON_PATH = os.path.join(DATA_DIR, "contests.json")

class CivilNewsHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # UTF-8 및 캐시 방지 헤더 추가
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        # URL에서 쿼리스트링(?v=... 등)을 분리하여 순수 경로(clean_path) 추출
        parsed_url = urllib.parse.urlparse(self.path)
        clean_path = parsed_url.path

        # 1. 루트 경로 요청 시 index.html 반환
        if clean_path in ["", "/", "/index.html"]:
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            # root index.html 우선 (없으면 static/index.html)
            index_path = os.path.join(BASE_DIR, "index.html")
            if not os.path.exists(index_path):
                index_path = os.path.join(STATIC_DIR, "index.html")
            with open(index_path, "rb") as f:
                self.wfile.write(f.read())
            return

        # 2. 뉴스 데이터 API 요청
        if clean_path in ["/api/news", "/data/news.json"]:
            if not os.path.exists(NEWS_JSON_PATH):
                scraper.scrape_civil_news()
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            with open(NEWS_JSON_PATH, "rb") as f:
                self.wfile.write(f.read())
            return

        # 2-1. 공모전 데이터 API 요청
        if clean_path in ["/api/contests", "/data/contests.json"]:
            if not os.path.exists(CONTESTS_JSON_PATH):
                scraper.scrape_civil_contests()
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            with open(CONTESTS_JSON_PATH, "rb") as f:
                self.wfile.write(f.read())
            return

        # 3. 정적 리소스 서빙 (/static/ 또는 루트 경로 파일)
        if clean_path.startswith("/static/"):
            rel_path = clean_path[8:]
            target_path = os.path.join(STATIC_DIR, rel_path)
        elif clean_path in ["/app.js", "/style.css"]:
            target_path = os.path.join(STATIC_DIR, clean_path[1:])
        else:
            target_path = os.path.join(BASE_DIR, clean_path.lstrip("/"))

        if os.path.exists(target_path) and os.path.isfile(target_path):
            self.send_response(200)
            if target_path.endswith(".css"):
                self.send_header("Content-Type", "text/css; charset=utf-8")
            elif target_path.endswith(".js"):
                self.send_header("Content-Type", "application/javascript; charset=utf-8")
            elif target_path.endswith(".json"):
                self.send_header("Content-Type", "application/json; charset=utf-8")
            elif target_path.endswith(".html"):
                self.send_header("Content-Type", "text/html; charset=utf-8")
            elif target_path.endswith((".png", ".jpg", ".jpeg", ".ico", ".svg")):
                ext = target_path.rsplit(".", 1)[-1].lower()
                mime = "image/svg+xml" if ext == "svg" else f"image/{ext}"
                self.send_header("Content-Type", mime)
            self.end_headers()
            with open(target_path, "rb") as f:
                self.wfile.write(f.read())
            return

        self.send_error(404, "File not found")

    def do_POST(self):
        # 최신 기사 즉시 새로고침(재수집) API
        if self.path == "/api/refresh":
            try:
                updated_data = scraper.scrape_civil_news()
                response_bytes = json.dumps({
                    "success": True,
                    "message": "최신 기사가 성공적으로 업데이트되었습니다.",
                    "data": updated_data
                }, ensure_ascii=False).encode("utf-8")
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(response_bytes)
            except Exception as e:
                err_bytes = json.dumps({
                    "success": False,
                    "error": str(e)
                }, ensure_ascii=False).encode("utf-8")
                
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(err_bytes)
            return

        self.send_error(404, "Endpoint not found")

def start_server():
    # 데이터 디렉토리가 없거나 news.json이 없으면 최초 1회 수집
    if not os.path.exists(NEWS_JSON_PATH):
        print("💡 초기 뉴스 데이터를 수집합니다...")
        scraper.scrape_civil_news()

    server_address = ("", PORT)
    httpd = HTTPServer(server_address, CivilNewsHandler)
    url = f"http://localhost:{PORT}"
    
    print("\n" + "=" * 60)
    print(f"🏗️  [토목 뉴스 대시보드 웹 서버가 실행되었습니다!]")
    print(f"🌐  접속 주소: {url}")
    print(f"📌  종료하려면 터미널에서 Ctrl + C 를 누르세요.")
    print("=" * 60 + "\n")
    
    # 웹 브라우저 자동 오픈
    try:
        webbrowser.open(url)
    except Exception:
        pass
        
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 서버를 안전하게 종료합니다.")
        httpd.server_close()

if __name__ == "__main__":
    start_server()
