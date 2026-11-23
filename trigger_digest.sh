#!/bin/bash
# 매일 09:00 KST(crontab) 아침 다이제스트 워크플로를 실행해요.
# GitHub 예약 실행은 4~5시간씩 밀려서, 제시간에 도는 jcloud cron이 대신 깨워요.
# 토큰은 push에 쓰는 origin URL의 것을 그대로 써요(classic PAT, repo 권한).
cd /home/ubuntu/workspace || exit 1
token=$(git remote get-url origin | sed -E 's#https://([^@]*)@.*#\1#; s#^[^:]*:##')
for i in 1 2 3; do
  code=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" \
    https://api.github.com/repos/chldlrtjr/civil-news-hub/actions/workflows/daily_digest.yml/dispatches \
    -d '{"ref":"main"}')
  [ "$code" = 204 ] && exit 0
  sleep 30
done
echo "$(date '+%F %T') 다이제스트 실행 요청 실패 (HTTP $code)" >> /home/ubuntu/workspace/cron_scrape.log
exit 1
