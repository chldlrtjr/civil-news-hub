#!/bin/bash
set -e

echo "🚀 [Kakao Notifier] 카카오톡 서버 주소 자동 알리미 설치를 시작합니다..."

WORKSPACE="/home/ubuntu/workspace"
SERVICE_NAME="civil-kakao-notifier.service"

cd "$WORKSPACE"

# 0. 토큰 파일 존재 여부 확인
if [ ! -f "$WORKSPACE/kakao_token.json" ]; then
    echo "⚠️ [Warning] kakao_token.json 파일이 존재하지 않습니다!"
    echo "토큰 파일이 없으면 카카오톡 알림을 발송할 수 없습니다."
    echo "아래 명령어를 실행하여 토큰을 먼저 생성해 주세요:"
    echo "cat << 'EOF' > $WORKSPACE/kakao_token.json"
    echo "{ ... }"
    echo "EOF"
fi

# 1. 파이썬 의존성 확인 (requests, python-dotenv)
echo "📦 1. 파이썬 의존성을 확인합니다..."
if [ -f "$WORKSPACE/venv/bin/pip" ]; then
    "$WORKSPACE/venv/bin/pip" install -q requests python-dotenv
fi


# 2. 서비스 파일 복사 및 권한 설정
echo "⚙️ 2. systemd 서비스를 등록합니다..."
sudo cp "$WORKSPACE/$SERVICE_NAME" /etc/systemd/system/
sudo systemctl daemon-reload

# 3. 서비스 활성화 및 시작
echo "🔄 3. 서비스를 활성화하고 시작합니다..."
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo ""
echo "✅ [Kakao Notifier] 설치 및 가동이 완료되었습니다!"
systemctl status "$SERVICE_NAME" --no-pager -n 5
