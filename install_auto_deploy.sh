#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=================================================================="
echo "🚀 [Install] Civil News Hub 실시간 자동 배포 데몬 등록 시작"
echo "=================================================================="

# 1. 실행 권한 부여
chmod +x auto_deploy_watcher.sh deploy.sh

# 2. systemd 서비스 유닛 복사
echo "📦 1. systemd 서비스 유닛(/etc/systemd/system/) 등록 중..."
sudo cp "$SCRIPT_DIR/civil-auto-deploy.service" /etc/systemd/system/

# 3. 데몬 리로드 및 활성화
echo "🔄 2. systemd 데몬 리로드 및 자동 시작 활성화 중..."
sudo systemctl daemon-reload
sudo systemctl enable civil-auto-deploy.service
sudo systemctl restart civil-auto-deploy.service

echo ""
echo "=================================================================="
echo "✅ [성공] 실시간 자동 배포 데몬(civil-auto-deploy.service)이 가동되었습니다!"
echo "   이제 PC에서 'git push origin main'을 실행하면"
echo "   30초 이내에 서버가 자동으로 변경사항을 당겨와 배포합니다."
echo "   - 로그 실시간 확인: tail -f /home/ubuntu/workspace/auto_deploy.log"
echo "=================================================================="
echo ""

systemctl status civil-auto-deploy.service --no-pager -n 5
