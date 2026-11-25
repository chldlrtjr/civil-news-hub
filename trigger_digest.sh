#!/bin/bash
# 매일 09:00 KST(crontab) 아침 다이제스트 워크플로를 실행해요.
# GitHub 예약 실행은 4~5시간씩 밀려서, 제시간에 도는 jcloud cron이 대신 깨워요.
# 토큰은 push에 쓰는 origin URL의 것을 그대로 써요(fine-grained PAT, 이 저장소만 Contents·Actions 쓰기).
# 서버에 토큰은 이 한 곳에만 둬요(~/.git-credentials 없음). curl 에는 명령행 대신 stdin(-K -)으로 넘겨 ps 에 보이지 않게 해요
cd /home/ubuntu/workspace || exit 1
token=$(git remote get-url origin | sed -E 's#https://([^@]*)@.*#\1#; s#^[^:]*:##')
for i in 1 2 3; do
  code=$(printf 'header = "Authorization: Bearer %s"\n' "$token" | curl -sS -K - -m 20 -o /dev/null -w '%{http_code}' -X POST \
    -H "Accept: application/vnd.github+json" \
    https://api.github.com/repos/chldlrtjr/civil-news-hub/actions/workflows/daily_digest.yml/dispatches \
    -d '{"ref":"main"}')
  [ "$code" = 204 ] && exit 0
  sleep 30
done
echo "$(date '+%F %T') 다이제스트 실행 요청 실패 (HTTP $code)" >> /home/ubuntu/workspace/cron_scrape.log
exit 1
