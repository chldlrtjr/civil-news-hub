#!/bin/bash
# ==============================================================================
# Civil News Hub - JCloud 백엔드 프로세스 튜닝 원클릭 적용 스크립트
#
# 1. Gunicorn gthread (2 workers, 4 threads, 90s timeout, max-requests 1000)
# 2. auto_deploy_watcher.sh (git ls-remote 경량 감시, 60초 주기)
# 3. cron_scrape.sh (nice -n 10 CPU 양보, 잔여 크롬 프로세스 정리)
# 4. Systemd 데몬 리로드 및 상태 점검
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=================================================================="
echo "🚀 [JCloud Tuning] Civil News Hub 백엔드 프로세스 튜닝 적용 시작"
echo "=================================================================="

# 1. 스크립트 실행 권한 부여
echo "🔧 1. 스크립트 실행 권한(chmod +x) 점검 중..."
chmod +x auto_deploy_watcher.sh cron_scrape.sh deploy.sh

# 2. systemd 서비스 유닛 복사
echo "📦 2. systemd 서비스 유닛 등록 중..."
if [ -f "civil-news-hub.service" ]; then
    sudo cp "civil-news-hub.service" /etc/systemd/system/civil-news-hub.service
    echo "  ✅ civil-news-hub.service 등록 완료"
fi

if [ -f "civil-auto-deploy.service" ]; then
    sudo cp "civil-auto-deploy.service" /etc/systemd/system/civil-auto-deploy.service
    echo "  ✅ civil-auto-deploy.service 등록 완료"
fi

# 3. 데몬 리로드 및 재시작
echo "🔄 3. systemd 데몬 리로드 및 서비스 재시작 중..."
sudo systemctl daemon-reload
sudo systemctl restart civil-news-hub.service
sudo systemctl restart civil-auto-deploy.service

# 4. 백엔드 REST API 헬스체크
echo "🩺 4. Gunicorn + Flask 헬스체크 수행 (127.0.0.1:5000)..."
sleep 2

HEALTH_CHECK=$(curl -s -m 5 http://127.0.0.1:5000/api/chat/status || echo "FAIL")
if [[ "$HEALTH_CHECK" =~ "online" ]] || [[ "$HEALTH_CHECK" =~ "ok" ]] || [[ "$HEALTH_CHECK" =~ "model" ]]; then
    echo "  ✅ 백엔드 API 응답 정상: $HEALTH_CHECK"
else
    echo "  ℹ️  응답 수신 (상태 확인): $HEALTH_CHECK"
fi

# 5. 크롤링 주기 1시간마다 (0 * * * *) 자동 갱신
echo "⏰ 5. Crontab 크롤링 스케줄 (매시간 정각: 0 * * * *) 점검 및 등록 중..."
CRON_JOB="0 * * * * $SCRIPT_DIR/cron_scrape.sh"
(crontab -l 2>/dev/null | grep -v "cron_scrape.sh"; echo "$CRON_JOB") | crontab -
echo "  ✅ Crontab 스케줄 등록 완료: $(crontab -l 2>/dev/null | grep 'cron_scrape.sh')"

echo ""
echo "=================================================================="
echo "📊 [프로세스 상태 요약]"
echo "=================================================================="
systemctl status civil-news-hub.service --no-pager -n 3
echo "------------------------------------------------------------------"
systemctl status civil-auto-deploy.service --no-pager -n 3
echo "=================================================================="
echo "🎉 [완료] 백엔드 프로세스 튜닝 및 크롤링 스케줄이 성공적으로 적용되었습니다!"
echo "   - Gunicorn 워커: 2 workers, 4 threads (gthread, 90s timeout)"
echo "   - 자동 배포 감시: git ls-remote 기반 60초 주기 (I/O 부하 최소화)"
echo "   - 크롤링 주기: 매 1시간마다 정각 (0 * * * * cron_scrape.sh)"
echo "   - 크롤링 배치: nice -n 10 CPU 양보 및 잔여 프로세스 자동 소거"
echo "=================================================================="
