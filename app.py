import os
import json
import webbrowser
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
        # 1. 루트 경로 요청 시 static/index.html 반환
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            with open(os.path.join(STATIC_DIR, "index.html"), "rb") as f:
                self.wfile.write(f.read())
            return

        # 2. 뉴스 데이터 API 요청
        if self.path == "/api/news":
            if not os.path.exists(NEWS_JSON_PATH):
                scraper.scrape_civil_news()
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            with open(NEWS_JSON_PATH, "rb") as f:
                self.wfile.write(f.read())
            return

        # 2-1. 공모전 데이터 API 요청
        if self.path == "/api/contests":
            if not os.path.exists(CONTESTS_JSON_PATH):
                scraper.scrape_civil_contests()
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            with open(CONTESTS_JSON_PATH, "rb") as f:
                self.wfile.write(f.read())
            return

        # 3. 정적 리소스 서빙 (CSS, JS 등)
        if self.path.startswith("/static/"):
            rel_path = self.path[8:]
            target_path = os.path.join(STATIC_DIR, rel_path)
            if os.path.exists(target_path) and os.path.isfile(target_path):
                self.send_response(200)
                if target_path.endswith(".css"):
                    self.send_header("Content-Type", "text/css; charset=utf-8")
                elif target_path.endswith(".js"):
                    self.send_header("Content-Type", "application/javascript; charset=utf-8")
                self.end_headers()
                with open(target_path, "rb") as f:
                    self.wfile.write(f.read())
                return

        super().do_GET()

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
