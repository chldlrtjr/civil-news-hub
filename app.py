import os
import re
import json
import socket
import webbrowser
import subprocess
import threading
import requests
from flask import Flask, request, jsonify, send_from_directory, send_file, Response
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

PORT = int(os.environ.get("PORT", 5000))
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")


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

def get_gemini_api_key(custom_key=None):
    """우선순위: 요청에서 전달된 커스텀 키 > 서버 환경변수 GEMINI_API_KEY"""
    if custom_key and custom_key.strip():
        return custom_key.strip()
    return (os.environ.get("GEMINI_API_KEY") or "").strip()


# --- CORS 및 전역 헤더 처리 ---
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Gemini-Key"
    return response

# --- 페이지 라우트 ---
@app.route("/")
@app.route("/index.html")
def serve_index():
    index_path = os.path.join(BASE_DIR, "index.html")
    if not os.path.exists(index_path):
        index_path = os.path.join(STATIC_DIR, "index.html")
    return send_file(index_path)

@app.route("/jobs")
@app.route("/jobs.html")
@app.route("/recruit")
@app.route("/recruit.html")
def serve_jobs():
    jobs_path = os.path.join(BASE_DIR, "jobs.html")
    if not os.path.exists(jobs_path):
        jobs_path = os.path.join(STATIC_DIR, "jobs.html")
    return send_file(jobs_path)

@app.route("/contests")
@app.route("/contests.html")
@app.route("/contest")
@app.route("/contest.html")
def serve_contests():
    contests_path = os.path.join(BASE_DIR, "contests.html")
    if not os.path.exists(contests_path):
        contests_path = os.path.join(STATIC_DIR, "contests.html")
    return send_file(contests_path)

@app.route("/mobile")
@app.route("/mobile.html")
def serve_mobile():
    mobile_path = os.path.join(BASE_DIR, "mobile.html")
    if not os.path.exists(mobile_path):
        mobile_path = os.path.join(STATIC_DIR, "mobile.html")
    return send_file(mobile_path)

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
    m_path = os.path.join(BASE_DIR, "manifest.json")
    if not os.path.exists(m_path):
        m_path = os.path.join(STATIC_DIR, "manifest.json")
    return send_file(m_path, mimetype="application/manifest+json")

@app.route("/sw.js")
def serve_sw():
    sw_path = os.path.join(BASE_DIR, "sw.js")
    if not os.path.exists(sw_path):
        sw_path = os.path.join(STATIC_DIR, "sw.js")
    return send_file(sw_path, mimetype="application/javascript")

# --- 데이터 API ---
@app.route("/api/news")
@app.route("/data/news.json")
def get_news():
    if not os.path.exists(NEWS_JSON_PATH):
        scraper.scrape_civil_news()
    return send_file(NEWS_JSON_PATH, mimetype="application/json; charset=utf-8")

@app.route("/api/contests")
@app.route("/data/contests.json")
def get_contests():
    if not os.path.exists(CONTESTS_JSON_PATH):
        scraper.scrape_civil_contests()
    return send_file(CONTESTS_JSON_PATH, mimetype="application/json; charset=utf-8")

@app.route("/api/jobs")
@app.route("/data/jobs.json")
def get_jobs():
    if not os.path.exists(JOBS_JSON_PATH):
        job_scraper.scrape_civil_jobs()
    return send_file(JOBS_JSON_PATH, mimetype="application/json; charset=utf-8")

def get_live_tunnel_url():
    """Cloudflare Tunnel 로그에서 현재 활성화된 라이브 터널 URL 조회"""
    log_file = "/var/log/civil-tunnel.log"
    if os.path.exists(log_file):
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
            for line in reversed(lines):
                m = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
                if m:
                    return m.group(0)
        except Exception:
            pass
    return "https://diverse-tattoo-exterior-reporting.trycloudflare.com"

@app.route("/api/network-info")
def network_info():
    tunnel_url = get_live_tunnel_url()
    local_ip = get_local_ip()
    host = request.host
    scheme = request.headers.get("X-Forwarded-Proto", "http")
    return jsonify({
        "local_ip": local_ip,
        "port": PORT,
        "server_url": f"{scheme}://{host}/#news",
        "local_url": f"http://localhost:{PORT}/#news",
        "mobile_url": f"{tunnel_url}/#news",
        "tunnel_url": f"{tunnel_url}/#news",
        "mobile_simulator_url": f"{tunnel_url}/mobile#news",
        "github_pages_url": "https://chldlrtjr.github.io/civil-news-hub/#news"
    })


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

# --- Gemini 1.5 Flash API 프록시 ---
@app.route("/api/chat/status", methods=["GET"])
def chat_status():
    server_key = get_gemini_api_key()
    return jsonify({
        "success": True,
        "has_server_key": bool(server_key),
        "model": GEMINI_MODEL
    })

@app.route("/api/chat", methods=["POST", "OPTIONS"])
@app.route("/api/gemini/chat", methods=["POST", "OPTIONS"])
def gemini_chat():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}
    query = data.get("query", "").strip()
    custom_key = data.get("customApiKey", "").strip()

    # Header Authorization: Bearer <key> 또는 X-Gemini-Key 지원
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        if token:
            custom_key = token
    header_key = request.headers.get("X-Gemini-Key", "").strip()
    if header_key:
        custom_key = header_key

    api_key = get_gemini_api_key(custom_key)
    if not api_key:
        return jsonify({
            "success": False,
            "error": "KEY_MISSING",
            "message": "서버에 등록된 GEMINI_API_KEY가 없습니다. 서버의 .env 설정 파일에 키를 입력하거나, 챗봇 상단 🔑 설정 버튼을 눌러 개인 API 키를 입력해 주세요."
        }), 400

    if not query:
        return jsonify({
            "success": False,
            "error": "EMPTY_QUERY",
            "message": "질문 내용을 입력해 주세요."
        }), 400

    relevant_articles = data.get("relevantArticles", [])
    custom_prompt = data.get("prompt", "")

    if custom_prompt:
        prompt_text = custom_prompt
    else:
        if relevant_articles:
            art_snippets = []
            for idx, art in enumerate(relevant_articles[:4]):
                summary_raw = art.get("summary", "")
                if isinstance(summary_raw, list):
                    sum_text = "\n• ".join(summary_raw)
                else:
                    sum_text = str(summary_raw)
                art_snippets.append(
                    f"[기사 {idx + 1}]\n"
                    f"- 제목: {art.get('title', '')}\n"
                    f"- 매체/일시: {art.get('media', '언론사')} ({art.get('published_at') or art.get('date') or ''})\n"
                    f"- 주요 내용:\n• {sum_text}"
                )
            context_text = "\n\n".join(art_snippets)
        else:
            context_text = '직접 관련된 최신 기사를 찾지 못했습니다. 일반 토목·인프라 공학 및 건설 지식을 바탕으로 설명하되, "제공된 기사 데이터베이스에는 직접 언급되지 않았습니다"라는 점을 먼저 명시하세요.'

        system_prompt = (
            "당신은 대한민국 토목·인프라 및 건설 엔지니어링 분야 전문 AI 연구원입니다.\n"
            "사용자의 질문에 대해 아래 제공된 [참고 기사 데이터]를 바탕으로 팩트에 입각하여 친절하고 전문적으로 답변하세요.\n\n"
            "답변 지침:\n"
            "1. 기사에 나온 구체적인 수치(사업비, 공사비, 노선 길이, 완공/착공 연도 등)가 있다면 명확히 밝히세요.\n"
            "2. 읽기 편하게 불릿 기호(•)와 굵은 글씨(**)를 사용하여 핵심 위주로 일목요연하게 작성하세요.\n"
            "3. 기사에 없는 내용은 허구로 꾸며내지 말고 솔직하게 밝히세요.\n"
            "4. 한국어로 정중하고 격식 있는 어조(~합니다, ~입니다)로 답변하세요."
        )

        prompt_text = f"{system_prompt}\n\n[참고 기사 데이터]\n{context_text}\n\n[사용자 질문]\n{query}"

    model_candidates = [GEMINI_MODEL, "gemini-3.6-flash", "gemini-flash-latest"]
    seen = set()
    model_list = [m for m in model_candidates if m and not (m in seen or seen.add(m))]

    last_resp = None
    for current_model in model_list:
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{current_model}:generateContent?key={api_key}"
        try:
            resp = requests.post(
                endpoint,
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [
                        {
                            "role": "user",
                            "parts": [{"text": prompt_text}]
                        }
                    ],
                    "generationConfig": {
                        "temperature": 0.2,
                        "maxOutputTokens": 1200
                    }
                },
                timeout=30
            )
            last_resp = resp

            if resp.ok:
                res_json = resp.json()
                candidates = res_json.get("candidates", [])
                if candidates:
                    answer_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    if answer_text:
                        return jsonify({
                            "success": True,
                            "answer": answer_text,
                            "model": current_model
                        })
            elif resp.status_code == 404:
                # 모델명 변경/단종 시 다음 후보로 자동 전환
                continue
            else:
                break
        except requests.exceptions.Timeout:
            return jsonify({
                "success": False,
                "error": "TIMEOUT",
                "message": "Gemini API 응답 시간이 초과되었습니다(30초). 잠시 후 다시 시도해 주세요."
            }), 504
        except Exception as e:
            return jsonify({
                "success": False,
                "error": "SERVER_ERROR",
                "message": f"서버 내부 오류: {str(e)}"
            }), 500

    # 모든 모델 후보 호출 실패 시 오류 처리
    if last_resp is not None:
        try:
            err_data = last_resp.json()
            err_msg = err_data.get("error", {}).get("message", last_resp.text)
        except Exception:
            err_msg = f"HTTP {last_resp.status_code}"

        if last_resp.status_code in (400, 403):
            return jsonify({
                "success": False,
                "error": "INVALID_API_KEY",
                "message": f"Gemini API 키 인증 실패 ({err_msg}). 올바른 키인지 확인해 주세요."
            }), 400
        elif last_resp.status_code == 429:
            return jsonify({
                "success": False,
                "error": "RATE_LIMIT_EXCEEDED",
                "message": "Gemini API 무료 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
            }), 429
        return jsonify({
            "success": False,
            "error": f"API_ERROR_{last_resp.status_code}",
            "message": f"Gemini API 호출 실패: {err_msg}"
        }), last_resp.status_code

    return jsonify({
        "success": False,
        "error": "NO_CANDIDATE",
        "message": "AI 응답을 생성하지 못했습니다."
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

    local_ip = get_local_ip()
    local_url = f"http://localhost:{PORT}/#news"
    mobile_url = f"http://{local_ip}:{PORT}/#news"
    
    print("\n" + "=" * 65)
    print(f"🏗️  [Civil News Hub Flask 웹 서버가 정상 실행되었습니다!]")
    print(f"🌐  PC 브라우저 접속:       {local_url}")
    print(f"📱  스마트폰(모바일) 접속:   {mobile_url}")
    print(f"🤖  Gemini AI 프록시:      활성화 ({GEMINI_MODEL})")
    print(f"📌  종료하려면 터미널에서 Ctrl + C 를 누르세요.")
    print("=" * 65 + "\n")
    
    # 데스크탑 GUI 환경일 때만 브라우저 자동 오픈
    if os.name == "nt" or os.environ.get("DISPLAY"):
        threading.Timer(0.5, open_in_browser, args=[local_url]).start()
        
    app.run(host="0.0.0.0", port=PORT, debug=False)

if __name__ == "__main__":
    start_server()

