import os
import json
import socket
import webbrowser
import urllib.parse
import subprocess
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import scraper
import job_scraper

def get_local_ip():
    """스마트폰 등 로컬 네트워크 기기 접속을 위한 LAN IPv4 자동 조회"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DATA_DIR = os.path.join(BASE_DIR, "data")
NEWS_JSON_PATH = os.path.join(DATA_DIR, "news.json")
CONTESTS_JSON_PATH = os.path.join(DATA_DIR, "contests.json")
JOBS_JSON_PATH = os.path.join(DATA_DIR, "jobs.json")

class CivilNewsHandler(SimpleHTTPRequestHandler):
    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def finish(self):
        try:
            super().finish()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def send_bytes_response(self, content_bytes: bytes, content_type: str, status: int = 200):
        """Content-Length 헤더를 정확히 포함하여 브라우저의 무한 로딩 및 대기 현상 방지"""
        try:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content_bytes)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            self.wfile.write(content_bytes)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def do_GET(self):
        try:
            self._handle_get()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            # 사용자가 브라우저 창을 닫거나 빠르게 새로고침할 때 발생하는 클라이언트 소켓 단절 무시
            pass

    def _handle_get(self):
        # URL에서 쿼리스트링(?v=... 등)을 분리하여 순수 경로(clean_path) 추출
        parsed_url = urllib.parse.urlparse(self.path)
        clean_path = parsed_url.path

        # 0. 파비콘 요청 처리 (브라우저 기본 요청 대응)
        if clean_path in ["/favicon.ico", "/favicon.svg"]:
            fav_path = os.path.join(STATIC_DIR, "favicon.svg")
            if not os.path.exists(fav_path):
                fav_path = os.path.join(BASE_DIR, "favicon.svg")
            if os.path.exists(fav_path):
                with open(fav_path, "rb") as f:
                    self.send_bytes_response(f.read(), "image/svg+xml")
            else:
                self.send_response(204)
                self.send_header("Content-Length", "0")
                self.end_headers()
            return

        # 1. 루트 경로 요청 시 index.html 반환
        if clean_path in ["", "/", "/index.html"]:
            # root index.html 우선 (없으면 static/index.html)
            index_path = os.path.join(BASE_DIR, "index.html")
            if not os.path.exists(index_path):
                index_path = os.path.join(STATIC_DIR, "index.html")
            with open(index_path, "rb") as f:
                self.send_bytes_response(f.read(), "text/html; charset=utf-8")
            return

        # 1-1. 채용 공고문 페이지 요청
        if clean_path in ["/jobs", "/jobs.html", "/recruit", "/recruit.html"]:
            jobs_path = os.path.join(BASE_DIR, "jobs.html")
            if not os.path.exists(jobs_path):
                jobs_path = os.path.join(STATIC_DIR, "jobs.html")
            with open(jobs_path, "rb") as f:
                self.send_bytes_response(f.read(), "text/html; charset=utf-8")
            return

        # 1-2. 공모전 페이지 요청
        if clean_path in ["/contests", "/contests.html", "/contest", "/contest.html"]:
            contests_path = os.path.join(BASE_DIR, "contests.html")
            if not os.path.exists(contests_path):
                contests_path = os.path.join(STATIC_DIR, "contests.html")
            with open(contests_path, "rb") as f:
                self.send_bytes_response(f.read(), "text/html; charset=utf-8")
            return

        # 1-3. 모바일 뷰 시뮬레이터 페이지 요청
        if clean_path in ["/mobile", "/mobile.html"]:
            mobile_path = os.path.join(BASE_DIR, "mobile.html")
            if not os.path.exists(mobile_path):
                mobile_path = os.path.join(STATIC_DIR, "mobile.html")
            with open(mobile_path, "rb") as f:
                self.send_bytes_response(f.read(), "text/html; charset=utf-8")
            return

        # 2. 뉴스 데이터 API 요청
        if clean_path in ["/api/news", "/data/news.json"]:
            if not os.path.exists(NEWS_JSON_PATH):
                scraper.scrape_civil_news()
            with open(NEWS_JSON_PATH, "rb") as f:
                self.send_bytes_response(f.read(), "application/json; charset=utf-8")
            return

        # 2-1. 공모전 데이터 API 요청
        if clean_path in ["/api/contests", "/data/contests.json"]:
            if not os.path.exists(CONTESTS_JSON_PATH):
                scraper.scrape_civil_contests()
            with open(CONTESTS_JSON_PATH, "rb") as f:
                self.send_bytes_response(f.read(), "application/json; charset=utf-8")
            return

        # 2-2. 채용 공고 데이터 API 요청
        if clean_path in ["/api/jobs", "/data/jobs.json"]:
            if not os.path.exists(JOBS_JSON_PATH):
                job_scraper.scrape_civil_jobs()
            with open(JOBS_JSON_PATH, "rb") as f:
                self.send_bytes_response(f.read(), "application/json; charset=utf-8")
            return

        # 2-3. 네트워크 정보 API (스마트폰 모바일 접속용 IP 안내)
        if clean_path == "/api/network-info":
            local_ip = get_local_ip()
            info_bytes = json.dumps({
                "local_ip": local_ip,
                "port": PORT,
                "local_url": f"http://localhost:{PORT}/#news",
                "mobile_url": f"http://{local_ip}:{PORT}/#news",
                "mobile_simulator_url": f"http://{local_ip}:{PORT}/mobile#news",
                "github_pages_url": "https://chldlrtjr.github.io/civil-news-hub/#news"
            }, ensure_ascii=False).encode("utf-8")
            self.send_bytes_response(info_bytes, "application/json; charset=utf-8")
            return

        # 3. 정적 리소스 서빙 (/static/ 또는 루트 경로 파일)
        if clean_path.startswith("/static/"):
            rel_path = clean_path[8:]
            target_path = os.path.join(STATIC_DIR, rel_path)
        elif clean_path in ["/app.js", "/style.css", "/jobs.js", "/contests.js"]:
            target_path = os.path.join(STATIC_DIR, clean_path[1:])
        else:
            target_path = os.path.join(BASE_DIR, clean_path.lstrip("/"))

        if os.path.exists(target_path) and os.path.isfile(target_path):
            with open(target_path, "rb") as f:
                content = f.read()
            mime = "text/plain; charset=utf-8"
            if target_path.endswith(".css"):
                mime = "text/css; charset=utf-8"
            elif target_path.endswith(".js"):
                mime = "application/javascript; charset=utf-8"
            elif target_path.endswith(".json"):
                mime = "application/json; charset=utf-8"
            elif target_path.endswith(".html"):
                mime = "text/html; charset=utf-8"
            elif target_path.endswith((".png", ".jpg", ".jpeg", ".ico", ".svg")):
                ext = target_path.rsplit(".", 1)[-1].lower()
                mime = "image/svg+xml" if ext == "svg" else f"image/{ext}"
            self.send_bytes_response(content, mime)
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
                self.send_bytes_response(response_bytes, "application/json; charset=utf-8")
            except Exception as e:
                err_bytes = json.dumps({
                    "success": False,
                    "error": str(e)
                }, ensure_ascii=False).encode("utf-8")
                self.send_bytes_response(err_bytes, "application/json; charset=utf-8", status=500)
            return

        self.send_error(404, "Endpoint not found")

def open_in_browser(url):
    """오르카(Orca) 브라우저를 우선 탐색하여 새 탭 생성 또는 실행, 실패 시 기본 브라우저 오픈"""
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    user_profile = os.environ.get("USERPROFILE", "")
    
    # 1. 오르카 CLI 도구 우선 시도 (이미 실행 중인 오르카에 single-instance 에러 없이 새 탭 생성)
    orca_cli_candidates = [
        os.path.join(local_app_data, r"Programs\orca\resources\bin\orca.exe"),
        os.path.join(user_profile, r"AppData\Local\Programs\orca\resources\bin\orca.exe"),
    ]

    for cli in orca_cli_candidates:
        if cli and os.path.isfile(cli):
            try:
                res = subprocess.run([cli, "tab", "create", "--url", url], capture_output=True, text=True, timeout=5)
                if res.returncode == 0:
                    print(f"🐬 [오르카 브라우저] 실행 중인 오르카 창에 새 탭을 열었습니다: {url}")
                    return
            except Exception:
                pass

    # 2. 오르카 메인 GUI 실행 파일 (오르카가 아직 켜져 있지 않은 경우 직접 실행)
    orca_gui_candidates = [
        os.path.join(local_app_data, r"Programs\orca\Orca.exe"),
        os.path.join(user_profile, r"AppData\Local\Programs\orca\Orca.exe"),
        r"C:\Program Files\orca\Orca.exe",
        r"C:\Program Files (x86)\orca\Orca.exe",
    ]

    for candidate in orca_gui_candidates:
        if candidate and os.path.isfile(candidate):
            try:
                subprocess.Popen([candidate, url])
                print(f"🐬 [오르카 브라우저]를 실행하여 사이트를 엽니다: {candidate}")
                return
            except Exception as e:
                print(f"⚠️ 오르카 브라우저 실행 시도 중 오류: {e}")
                break

    # 3. 오르카 브라우저가 없는 환경일 경우 시스템 기본 웹 브라우저로 오픈
    try:
        webbrowser.open(url)
    except Exception:
        pass

def start_server():
    # 데이터 디렉토리가 없거나 news.json이 없으면 최초 1회 수집
    if not os.path.exists(NEWS_JSON_PATH):
        print("💡 초기 뉴스 데이터를 수집합니다...")
        scraper.scrape_civil_news()

    server_address = ("", PORT)
    httpd = ThreadingHTTPServer(server_address, CivilNewsHandler)
    local_ip = get_local_ip()
    local_url = f"http://localhost:{PORT}/#news"
    mobile_url = f"http://{local_ip}:{PORT}/#news"
    
    print("\n" + "=" * 65)
    print(f"🏗️  [Civil News Hub 웹 서버가 정상 실행되었습니다!]")
    print(f"🌐  PC 브라우저 접속:       {local_url}")
    print(f"📱  스마트폰(모바일) 접속:   {mobile_url}")
    print(f"📌  종료하려면 터미널에서 Ctrl + C 를 누르세요.")
    print("=" * 65 + "\n")
    
    # 서버 준비 후 0.5초 뒤 브라우저 비동기 자동 오픈 (오르카 브라우저 우선)
    threading.Timer(0.5, open_in_browser, args=[local_url]).start()
        
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 서버를 안전하게 종료합니다.")
        httpd.server_close()

if __name__ == "__main__":
    start_server()
