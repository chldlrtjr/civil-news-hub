import os
import json
import socket
import webbrowser
import subprocess
import threading
from flask import Flask, request, jsonify, send_from_directory, send_file, Response, redirect
from dotenv import load_dotenv

import scraper
import job_scraper

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# .env 로드 (존재 시)
load_dotenv(os.path.join(BASE_DIR, ".env"))

STATIC_DIR = os.path.join(BASE_DIR, "static")
DATA_DIR = os.path.join(BASE_DIR, "data")
NEWS_JSON_PATH = os.path.join(DATA_DIR, "news.json")
CONTESTS_JSON_PATH = os.path.join(DATA_DIR, "contests.json")
JOBS_JSON_PATH = os.path.join(DATA_DIR, "jobs.json")
JBNU_JSON_PATH = os.path.join(DATA_DIR, "jbnu_albas.json")
SWUNIV_JSON_PATH = os.path.join(DATA_DIR, "swuniv_programs.json")

PORT = int(os.environ.get("PORT", 8000))


app = Flask(__name__, static_folder=None)

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

# --- CORS 및 전역 헤더 처리 ---
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    # HTML 및 JSON, JS에 대한 브라우저 캐시 방지 강제 (항상 최신 로컬 및 크롤링 팩트 데이터 즉시 반영)
    if response.mimetype in ["text/html", "application/json", "application/javascript"]:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# --- 페이지 라우트 ---
@app.route("/")
@app.route("/index.html")
def serve_index():
    return send_file(os.path.join(BASE_DIR, "index.html"))

@app.route("/jobs")
@app.route("/jobs.html")
@app.route("/recruit")
@app.route("/recruit.html")
def serve_jobs():
    return redirect("/#jobs")

@app.route("/contests")
@app.route("/contests.html")
@app.route("/contest")
@app.route("/contest.html")
def serve_contests():
    return redirect("/#contests")

@app.route("/mobile")
@app.route("/mobile.html")
def serve_mobile():
    return redirect("/#news")

# --- 파비콘 / 매니페스트 / 서비스워커 ---
@app.route("/favicon.ico")
@app.route("/favicon.svg")
def serve_favicon():
    fav_path = os.path.join(STATIC_DIR, "favicon.svg")
    if not os.path.exists(fav_path):
        fav_path = os.path.join(BASE_DIR, "favicon.svg")
    if os.path.exists(fav_path):
        return send_file(fav_path, mimetype="image/svg+xml")
    return ("", 204)

@app.route("/manifest.json")
def serve_manifest():
    return send_file(os.path.join(BASE_DIR, "manifest.json"), mimetype="application/manifest+json")

@app.route("/sw.js")
def serve_sw():
    return send_file(os.path.join(BASE_DIR, "sw.js"), mimetype="application/javascript")

@app.route("/api/news")
@app.route("/data/news.json")
def get_news():
    if not os.path.exists(NEWS_JSON_PATH):
        scraper.scrape_civil_news()
    resp = send_file(NEWS_JSON_PATH, mimetype="application/json; charset=utf-8")
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

@app.route("/api/contests")
@app.route("/data/contests.json")
def get_contests():
    if not os.path.exists(CONTESTS_JSON_PATH):
        try:
            import contest_scraper
            contest_scraper.scrape_civil_contests()
        except Exception:
            scraper.scrape_civil_contests()
    return send_file(CONTESTS_JSON_PATH, mimetype="application/json; charset=utf-8")

@app.route("/api/jobs")
@app.route("/data/jobs.json")
def get_jobs():
    if not os.path.exists(JOBS_JSON_PATH):
        job_scraper.scrape_civil_jobs()
    return send_file(JOBS_JSON_PATH, mimetype="application/json; charset=utf-8")

@app.route("/api/jbnu-albas")
@app.route("/api/albas")
@app.route("/data/jbnu_albas.json")
def get_jbnu_albas():
    if not os.path.exists(JBNU_JSON_PATH):
        try:
            import jbnu_scraper
            jbnu_scraper.scrape_jbnu_albas()
        except Exception:
            pass
    resp = send_file(JBNU_JSON_PATH, mimetype="application/json; charset=utf-8")
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

@app.route("/api/swuniv-programs")
@app.route("/api/swuniv")
@app.route("/data/swuniv_programs.json")
def get_swuniv_programs():
    refresh_req = request.args.get("refresh") == "1"
    if refresh_req or not os.path.exists(SWUNIV_JSON_PATH):
        try:
            import swuniv_scraper
            swuniv_scraper.save_swuniv_programs()
        except Exception as e:
            print(f"[-] swuniv scrape error: {e}")
    resp = send_file(SWUNIV_JSON_PATH, mimetype="application/json; charset=utf-8")
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

@app.route("/api/refresh", methods=["POST"])
def refresh_data():
    try:
        updated_data = scraper.scrape_civil_news()
        return jsonify({
            "success": True,
            "message": "최신 기사가 성공적으로 업데이트되었습니다.",
            "data": updated_data
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# --- 정적 자산 라우트 ---
@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory(STATIC_DIR, filename)

@app.route("/<path:filename>")
def serve_root_files(filename):
    # 정적 파일 우선 확인 (static 또는 BASE_DIR)
    file_in_static = os.path.join(STATIC_DIR, filename)
    if os.path.isfile(file_in_static):
        return send_file(file_in_static)
    file_in_base = os.path.join(BASE_DIR, filename)
    if os.path.isfile(file_in_base):
        return send_file(file_in_base)
    return ("File not found", 404)


def open_in_browser(url):
    """오르카(Orca) 브라우저를 우선 탐색하여 새 탭 생성 또는 실행, 실패 시 기본 브라우저 오픈"""
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    user_profile = os.environ.get("USERPROFILE", "")
    
    # 1. 오르카 CLI 도구 우선 시도 (이미 실행 중인 오르카에 single-instance 에러 없이 새 탭 생성)
    orca_cli_candidates = [
        os.path.join(local_app_data, r"Programs\orca\resources\bin\orca.exe"),
        os.path.join(user_profile, r"AppData\Local\Programs\orca\resources\bin\orca.exe"),
    ]

    create_no_window = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0

    for cli in orca_cli_candidates:
        if cli and os.path.isfile(cli):
            try:
                res = subprocess.run([cli, "tab", "create", "--url", url], capture_output=True, text=True, timeout=5, creationflags=create_no_window)
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
                subprocess.Popen([candidate, url], creationflags=create_no_window)
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

    local_ip = get_local_ip()
    local_url = f"http://localhost:{PORT}/#news"
    mobile_url = f"http://{local_ip}:{PORT}/#news"
    
    print("\n" + "=" * 65)
    print(f"🏗️  [Civil News Hub Flask 웹 서버가 정상 실행되었습니다!]")
    print(f"🌐  PC 브라우저 접속:       {local_url}")
    print(f"📱  스마트폰(모바일) 접속:   {mobile_url}")
    print(f"📌  종료하려면 터미널에서 Ctrl + C 를 누르세요.")
    print("=" * 65 + "\n")
    
    # 데스크탑 GUI 환경일 때만 브라우저 자동 오픈
    if os.name == "nt" or os.environ.get("DISPLAY"):
        threading.Timer(0.5, open_in_browser, args=[local_url]).start()
        
    app.run(host="0.0.0.0", port=PORT, debug=False)

if __name__ == "__main__":
    start_server()

