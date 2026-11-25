# 토목 뉴스 브리핑 (Civil News Hub)

토목 전공 학생을 위한 정보 모음 사이트예요. 토목 뉴스, 공모전, 채용, 교내 알바를 매시간 모아서 한 화면에 보여 줘요.

- 사이트: https://civil-news-hub.vercel.app (PC와 모바일은 따로 만든 화면, 스마트폰이나 창 너비 600px 이하가 모바일, 태블릿은 PC)
- Notion 포트폴리오: [토목 뉴스 & 공모전 자동화 브리핑 허브](https://app.notion.com/p/3d5009a14e198038ba3ff62b74d18e03)

---

## 주요 기능

- **뉴스**: 토목 종합, 도로·교량·철도, 터널·지반·안전, 수자원·하천·항만, 스마트건설·정책으로 나눠 모아요. 같은 소식을 다룬 기사는 묶어 보여 줘요.
- **공모전**: 위비티·데브이벤트·전북대 공지 등 여러 곳에서 모아 마감일을 서로 대조하고, 시작일·결과 발표일까지 찾아 둬요.
- **채용·알바**: 공기업·건설사·설계사 채용 공고와 전북대 교내 알바·SW사업단 프로그램.
- **내 페이지**: Google 로그인(Supabase)으로 저장한 항목과 진행 카드(시작→마감→결과)를 PC·휴대폰에서 함께 봐요. 로그인하지 않으면 이 브라우저에만 저장돼요.
- **아침 다이제스트**: 매일 09:00(KST) 텔레그램으로 전날 많이 보도된 토목 뉴스 Top 5를 보내요.

---

## 구조

```
jcloud 서버 (cron)                    GitHub                         방문자
매시 정각 cron_scrape.sh  ──push──>  main 저장소  ──자동 배포──>  Vercel (정적 사이트)
 - 수집기 실행, data/*.json 저장                                     index.html + static/
 - 공모전 무결성 검사                                                Supabase (로그인·저장 목록)
 - static/cnh_data_bundle.js 생성
```

- **수집은 jcloud가 해요.** `server/crontab.txt`가 일정을 정하고 `deploy.sh`가 서버에 설치해요. git을 만지는 작업은 `flock /tmp/cnh_git.lock`으로 차례대로 돌아요.
  - 매시 정각: `cron_scrape.sh` (`scraper.py` 뉴스, `contest_scraper.py` 공모전, `job_scraper.py` 채용, `jbnu_scraper.py`·`swuniv_scraper.py` 교내 공고 → `build_data_bundle.py`)
  - 04:30 `backup_server.sh` (암호화해서 Google Drive에 보관, 14일치)
  - 08:40 `build_digest.sh` (다이제스트 요약을 만들어 `data/digest.json`으로 push)
  - 09:00 `trigger_digest.sh` (GitHub Actions의 다이제스트 발송을 실행)
  - 월요일 05:10 카카오 토큰 갱신 (수집 실패 알림용)
- **사이트는 정적 파일이에요.** 화면은 `static/cnh_data_bundle.js` 번들만 읽고 서버 API는 없어요. `.vercelignore`가 허용 목록이라 새 사이트 파일은 거기에 추가해야 배포돼요. 보안·캐시 헤더는 `vercel.json`에 있어요.
- **GitHub Actions** (`.github/workflows/`)
  - `watchdog.yml` (매시 30분): 번들이 3시간 넘게 안 바뀌면 텔레그램으로 알리고 비상 수집을 실행해요. Supabase가 잠들지 않게 깨우는 일도 해요.
  - `daily_crawl.yml` (비상 수집): 예약 없이 watchdog이나 손으로만 실행해요. jcloud가 멈췄을 때 Actions에서 같은 수집을 돌려 push해요.
  - `daily_digest.yml`: jcloud가 만든 `data/digest.json`을 카드 이미지로 그려 텔레그램으로 보내요. jcloud에서는 텔레그램 주소가 막혀 있어서 발송만 여기서 해요. 같은 날 두 번 보내지 않아요.
  - `tests.yml`: 코드가 바뀐 push마다 테스트를 돌려요(데이터만 바뀐 매시 커밋은 건너뜀).
  - `sync_notion.yml`: `NOTION_PORTFOLIO_GUIDE.md`가 바뀌면 Notion 포트폴리오에 반영해요.

### 주요 파일

| 파일 | 하는 일 |
|---|---|
| `index.html` | 사이트 본체 (PC `#v2pc`, 모바일 `#v2m`) |
| `static/v2_core.js`, `static/v2_pages.js`, `static/v2_state.js` | 화면 계산, 페이지 이동·상세, 로그인·저장 동기화 |
| `static/tracker_core.js` | 진행 카드 규칙 |
| `static/vendor/` | 직접 제공하는 Pretendard 글꼴과 supabase-js (1년 캐시라 바꿀 땐 파일 이름도 바꿈) |
| `contests.html`, `jobs.html`, `mobile.html`, `v2.html` | 예전 주소에서 새 주소로 넘겨주는 페이지 |
| `privacy.html`, `terms.html` | 개인정보 처리방침, 이용약관 |
| `supabase/schema.sql` | 저장 목록 테이블과 권한(RLS) |
| `GEMINI.md` | 수집 데이터 규칙 (수집기 주석이 근거로 인용) |

---

## 로컬에서 실행하기

사이트는 정적 파일이라 서버 없이 데이터 번들만으로 열려요.

```bash
python -m http.server 8000 --bind 127.0.0.1
```

브라우저에서 `http://localhost:8000`으로 접속해요. Google 로그인은 운영 주소에서만 돼요.

### 테스트

```bash
pip install -r requirements.txt   # 해시 고정이라 pip가 해시까지 검사해요
pip install pytest
python -m pytest -q tests
node --test tests/*.test.js
python test_contests_integrity.py
```

---

## 뉴스 키워드 바꾸기

`scraper.py` 위쪽의 `CATEGORIES`에서 분류별 검색어를 고치면 다음 정시 수집부터 반영돼요.

```python
CATEGORIES = [
    {
        "id": "road_rail",
        "name": "도로·교량·철도",
        "queries": ["도로공사", "교량공사", "철도건설", "지하철공사", "고속도로건설", "국가철도망", "원하는키워드추가"],
        "badge_color": "emerald"
    },
    ...
]
```
