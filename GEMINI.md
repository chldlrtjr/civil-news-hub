# Civil News Hub (토목 뉴스 브리핑 & 공모전 대시보드) 개발 및 크롤링 규칙

본 문서는 `civil-news-hub` 프로젝트의 데이터 수집(크롤링), 정제, UI 렌더링 시 반드시 준수해야 하는 운영 원칙을 정의합니다.

---

## 1. 공모전 데이터 수집 및 정제 절대 원칙 (Data Integrity)

### ① 당해 연도 미개최 / 실체 없는 공모전 원천 배제 원칙 (Fact Verification First)
- 과거에 연례로 개최되었더라도 **당해 연도(2026년 등)에 공식 공고가 실제로 게재되지 않았거나 미개최된 공모전은 절대로 임의 등록하지 않는다.**
- 검증 결과 실체가 없어 영구 배제된 공모전:
  - `LH 국토기술대전` (2026년 미개최)
  - `대한토목학회 토목의 날 경진대회` (2026년 해당 대회 미개최)
  - `건설·교통신기술 창작 공모전` (2026년 해당 대회 미개최)
- 개최 여부가 불확실한 공모전은 주최 기관의 공식 공고 게시판을 확인하여 **공식 모집 요강 팩트가 확인된 경우에만** 등록한다.

### ② 유사 공모전 합성 금지 및 완전 분리 원칙
- 동일한 공공기관(예: 한국수자원공사, 국토교통부, LH 등)이 주최하더라도 **공모 목적, 접수 일정, 공식 접수 페이지가 다르면 절대로 하나로 묶지 않는다.**
- 분리 등록 예시:
  - `2026 대한민국 물산업 혁신 창업대전` (공식 접수처: http://www.startupwater.net)
  - `K-water 대국민 물 빅데이터 공모전` (공식 접수처: 단비톡톡 전용 게시물)

### ③ 세부 공고문 전용 딥링크 우선 매핑 원칙
- 단순 기관 대표 홈페이지(루트 도메인, 예: `kr.or.kr`, `kwater.or.kr`)로 링크를 연결하지 않는다.
- 반드시 참가자가 요강을 확인하고 접수할 수 있는 **공식 전용 웹사이트 또는 상세 게시물 URL(딥링크)**을 우선 지정한다.
  - **도로경관디자인 대전**: `https://www.ex-contest.co.kr/design26`
  - **물산업 혁신 창업대전**: `http://www.startupwater.net`
  - **추락사고 예방 공모전**: `https://www.safecontest.kr/summary`
  - **SK에코플랜트 콘테크 미트업데이**: `https://innobranch.com/front/challenge/detail/1451`
  - **국가철도공단 철도 유휴부지 활용사업 공모**: `https://www.kr.or.kr/boardCnts/view.do?boardID=52&boardSeq=1122113`
  - **2026 스마트건설 챌린지**: `https://smartconstchallenge.com/main/`
  - **K-water 대국민 물 빅데이터 공모전**: `https://www.kwater.or.kr/danbitoktok/kor/citizenContest/view/50917898-5158-47ce-a632-d77454b90d1e.do`
  - **지하안전관리 우수사례 및 아이디어 공모전**: `https://www.jis.go.kr/community/boa01005_popup.do?board_no=1207`
  - **코레일 차세대 KTX & 인프라 아이디어 공모전**: `https://info.korail.com/info/selectBbsNttView.do?key=911&bbsNo=199&nttNo=26949&searchCtgry=&searchCnd=all&searchKrwd=&integrDeptCode=&pageIndex=1`
  - **삼성 EPC 콘테크 공모전**: `https://www.samsungena.com/kr/newsroom/news/view?idx=15836`
  - **국토교통부 혁신제품 지정 공모**: `https://hub.kaia.re.kr`

### ④ 팩트 기반 접수 기간, 상금 및 마감일 상태(`Status`) 동기화
- `"공식 공고 확인"`, `"공고 확인 요망"` 등 모호하거나 불명확한 표현을 지양한다.
- 접수 기간은 반드시 **`YYYY.MM.DD ~ MM.DD (상세시간 마감)`** 형태로 명시한다.
- 상금 및 훈격(장관상, 사장상 등)을 팩트 기반으로 구체적으로 기재한다.
- 마감일자 경과 여부에 따라 상태를 정밀 동기화한다:
  - 마감일 경과 시: `접수마감` (`status_color: slate`)
  - 접수 시작 전: `접수예정` (`status_color: blue`)
  - 접수 진행 중: `접수중` (`status_color: emerald`)
  - 연중 상시: `상시접수` (`status_color: purple`)

---

## 2. 웹 UI 및 레이아웃 준수 규칙

### ① 공모전 카드 상단 뱃지 배치
- **1행 (상단 헤더)**: 좌측에 `[카테고리 뱃지]`, **우측 최상단에 상태 뱃지(`[접수중]`, `[접수예정]`, `[상시접수]`, `[접수마감]`)를 단단히 고정(`flex justify-between`)**한다.
- **2행 (접수 기간)**: `[📅 접수기간: YYYY.MM.DD ~ MM.DD]` 뱃지는 1행 아래에 독립적인 행으로 배치하여, 긴 기간 텍스트로 인해 상태 뱃지가 줄바꿈되거나 밀리지 않도록 한다.

### ② 브라우저 캐시 방지 (Cache Busting)
- 정적 배포(GitHub Pages) 환경이므로, 프론트엔드 코드나 데이터 수정 시:
  - `index.html` 및 `static/index.html`의 스크립트 로드 파라미터 갱신 (`?v=YYYYMMDD_HHMM`).
  - `app.js`에서 `news.json` 및 `contests.json` fetch 시 `?t=' + Date.now()` 유지.

---

## 3. 크롤러 및 배포 파이프라인 유지

- 새로운 공모전 출처나 키워드를 추가/변경할 경우:
  - `scraper.py`의 `OFFICIAL_CONTEST_MAPPINGS`에 전용 딥링크 URL 매핑 등록.
  - `extract_contest_prize()`, `extract_contest_period()` 함수에 팩트 우선 규칙 등록.
  - 마감일 상태 판별 로직(접수마감/접수예정/상시접수/접수중) 확인.
  - 데이터 갱신 후 반드시 GitHub 저장소 `main` 브랜치에 `commit & push`하여 GitHub Pages 자동 배포 반영.
