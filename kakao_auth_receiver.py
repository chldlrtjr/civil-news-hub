import http.server
import socketserver
import urllib.parse
import requests
import json
import os
import sys
import webbrowser
import threading

PORT = 5000
REST_API_KEY = "7412ad09c20b5373e35dae2239931cbd"
CLIENT_SECRET = "3C0yV1xn3uxMwEv1xkGW7FFgxsTdtCWk"
REDIRECT_URI = "http://localhost:5000"

TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kakao_token.json")

server_instance = None

class OAuthHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if "code" in params:
            code = params["code"][0]
            print(f"[+] 인가 코드(code) 수신 완료: {code[:10]}...")

            token_url = "https://kauth.kakao.com/oauth/token"
            data = {
                "grant_type": "authorization_code",
                "client_id": REST_API_KEY,
                "client_secret": CLIENT_SECRET,
                "redirect_uri": REDIRECT_URI,
                "code": code
            }
            res = requests.post(token_url, data=data)
            token_json = res.json()

            if "access_token" in token_json:
                with open(TOKEN_FILE, "w", encoding="utf-8") as f:
                    json.dump(token_json, f, indent=2, ensure_ascii=False)
                print(f"[+] 카카오 토큰 저장 완료 -> {TOKEN_FILE}")

                # 테스트 메시지 전송
                headers = {"Authorization": f"Bearer {token_json.get('access_token')}"}
                msg_payload = {
                    "template_object": json.dumps({
                        "object_type": "text",
                        "text": "🎉 [Civil News Hub] 카카오톡 서버 알림 연동이 성공했습니다!\n\n앞으로 우분투 서버가 재시작되어 주소가 변경되면 이 채팅방으로 새 주소 링크가 자동 전송됩니다.",
                        "link": {
                            "web_url": "https://chldlrtjr.github.io/civil-news-hub/",
                            "mobile_web_url": "https://chldlrtjr.github.io/civil-news-hub/"
                        },
                        "button_title": "허브 바로가기"
                    }, ensure_ascii=False)
                }
                send_res = requests.post("https://kapi.kakao.com/v2/api/talk/memo/default/send", headers=headers, data=msg_payload)
                print(f"[+] 테스트 메시지 전송 응답: {send_res.status_code} {send_res.text}")

                self.send_response(200)
                self.send_header("Content-type", "text/html; charset=utf-8")
                self.end_headers()
                html = """
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>카카오톡 연동 완료</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8fafc; }
                        .card { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); text-align: center; max-width: 480px; }
                        h1 { color: #0284c7; margin-bottom: 12px; font-size: 24px; }
                        p { color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
                        .badge { display: inline-block; background: #fee500; color: #191919; font-weight: bold; padding: 10px 20px; border-radius: 12px; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>🎉 카카오톡 연동 완료!</h1>
                        <div class="badge">💬 나와의 채팅방으로 테스트 메시지 발송됨</div>
                        <p style="margin-top: 20px;">인증 토큰이 성공적으로 발급되었습니다.<br>지금 카카오톡을 확인해 보세요!<br><br><b>이 브라우저 창은 닫으셔도 됩니다.</b></p>
                    </div>
                </body>
                </html>
                """
                self.wfile.write(html.encode("utf-8"))

                # 1초 뒤 서버 정상 종료
                def stop():
                    import time
                    time.sleep(1)
                    if server_instance:
                        server_instance.shutdown()
                threading.Thread(target=stop, daemon=True).start()

            else:
                self.send_response(500)
                self.send_header("Content-type", "text/html; charset=utf-8")
                self.end_headers()
                err_msg = token_json.get("error_description", str(token_json))
                self.wfile.write(f"<h1>토큰 발급 실패</h1><p>{err_msg}</p>".encode("utf-8"))
        else:
            self.send_response(400)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("<h1>오류: 인가 코드가 없습니다.</h1>".encode("utf-8"))

    def log_message(self, format, *args):
        pass

def main():
    global server_instance
    with socketserver.TCPServer(("", PORT), OAuthHandler) as httpd:
        server_instance = httpd
        print(f"[*] 로컬 인증 수신 서버 가동 중 (포트 {PORT})...")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        print("[*] 인증 서버가 정상 종료되었습니다.")

if __name__ == "__main__":
    main()
