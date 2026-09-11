# Civil News Hub (토목 뉴스 브리핑 & 공모전 대시보드) 개발 및 크롤링 규칙

본 문서는 `civil-news-hub` 프로젝트의 데이터 수집(크롤링), 정제, UI 렌더링 시 반드시 준수해야 하는 운영 원칙을 정의합니다.

---

## 1. 공모전 데이터 수집 및 정제 절대 원칙 (Data Integrity)

### ① 당해 연도 미개최 / 실체 없는 공모전 원천 배제 원칙 (Fact Verification First)
- 과거에 연례로 개최되었더라도 **당해 연도(2026년 등)에 공식 공고가 실제로 게재되지 않았거나 미개최된 공모전은 절대로 임의 등록하지 않는다.**
- 검증 결과 실체가 없거나 이미 마감되어 영구 배제된 공모전 (Blacklist):
  - `LH 국토기술대전` (2026년 미개최)
  - `대한토목학회 토목의 날 경진대회` (2026년 해당 대회 미개최)
  - `건설·교통신기술 창작 공모전` (2026년 해당 대회 미개최)
  - `삼성 EPC 콘테크 공모전` (2026.09.04 마감 완료 -> 영구 배제)
  - `지하안전관리 우수사례 및 아이디어 공모전` (2025년 과거 공모전 / 2026년 공고 미게재 -> 영구 배제)
  - `코레일 차세대 KTX & 인프라 아이디어 공모전` (2026.07.30 마감 완료 -> 영구 배제)
  - `K-water 대국민 물 빅데이터 공모전` (2021년 과거 공모전 -> 영구 배제)
  - `2026 스마트건설 챌린지` (2026년 공식 신규 공고 확인 전까지 피드 노출 배제)
- 개최 여부가 불확실한 공모전은 주최 기관의 공식 공고 게시판을 확인하여 **공식 모집 요강 팩트가 확인된 경우에만** 등록한다.

### ② 유사 공모전 합성 금지 및 완전 분리 원칙
- 동일한 공공기관(예: 한국수자원공사, 국토교통부, LH 등)이 주최하더라도 **공모 목적, 접수 일정, 공식 접수 페이지가 다르면 절대로 하나로 묶지 않는다.**
- 분리 등록 예시:
  - `2026 대한민국 물산업 혁신 창업대전` (공식 접수처: K-water 물산업포털)
  - `K-water 대국민 물 빅데이터 공모전` (공식 접수처: 단비톡톡 전용 게시물)

### ③ 세부 공고문 전용 딥링크 우선 매핑 원칙
- 단순 기관 대표 홈페이지(루트 도메인, 예: `kr.or.kr`, `kwater.or.kr`)로 링크를 연결하지 않는다.
- 반드시 참가자가 요강을 확인하고 접수할 수 있는 **100% 팩트 검증된 실시간 활성 공모전 공식 전용 웹사이트 또는 상세 게시물 URL(딥링크)**을 우선 지정한다.
  - **도로경관디자인 대전**: `https://www.ex-contest.co.kr/design26`
  - **물산업 혁신 창업대전**: `https://www.kwater.or.kr/wis/wq/index.do?w2xPath=/wis/ui/index.xml&&ntfDivCd=PBLANC&&targetMenuId=WISWS02120701&&tabId=203030&&pbanno=WS260098`
  - **추락사고 예방 공모전**: `https://safecontest.kr/summary`
  - **SK에코플랜트 콘테크 미트업데이**: `https://innobranch.com/front/challenge/detail/1451`
  - **국가철도공단 철도 유휴부지 활용사업 공모**: `https://www.kr.or.kr/boardCnts/view.do?boardID=52&boardSeq=1122113`

### ④ 팩트 기반 접수 기간, 상금 및 마감일 상태(`Status`) 동기화
- `"공식 공고 확인"`, `"공고 확인 요망"` 등 모호하거나 불명확한 표현을 지양한다.
- 접수 기간은 반드시 **`YYYY.MM.DD ~ MM.DD (상세시간 마감)`** 형태로 명시한다.
- 상금 및 훈격(장관상, 사장상 등)을 팩트 기반으로 구체적으로 기재한다.
### ⑤ 접수마감 공모전 자동 내림(게시 제외) 절대 원칙
- 모집 기간이 종료된(`접수마감`) 공모전은 사용자에게 불필요한 혼선과 피로감을 주지 않도록 **대시보드 목록에서 즉시 내림(제외) 처리**한다.
- 항상 실제 참가 접수가 가능한 유효 공모전(`접수중`, `접수예정`, `상시접수`)만 유지한다.
### ⑥ 신규 카테고리 자동 감지 및 전체 건수 합산 일치 절대 원칙 (Dynamic Category Auto-sync)
- **신규 카테고리 발생 시 자동 탭 등록 원칙**:
  - 토목 뉴스, 채용 공고, 공모전 3개 전체 탭에서 크롤링 또는 데이터 추가로 새로운 분야/카테고리가 등장할 경우, 하드코딩된 정적 탭에 의존하지 않고 수집기(`scraper.py`, `job_scraper.py`) 및 프론트엔드(`app.js`, `jobs.js`, `contests.js`)에서 **신규 카테고리를 실시간 자동 감지하여 카테고리 탭 목록에 즉각 동적으로 추가**한다.
- **전체 건수와 카테고리별 건수 합산 100% 일치 보장**:
  - 모든 게시글(기사, 공고문, 공모전)은 예외 없이 유효한 카테고리 탭에 소속되어야 하며, **`[전체]` 탭의 총 건수와 `[개별 카테고리 탭들의 건수 합계]`는 항상 단 1건의 오차도 없이 100% 일치**해야 한다.
  - 임의의 미분류 데이터가 발생하지 않도록 기본 정규화(Normalization)와 폴백을 항시 유지한다.

### ⑦ 마감 및 과거 공모전 재발 방지 다중 방어 시스템 의무화 원칙 (Zero-Tolerance Multi-Layer Integrity Shield)
- **발생 원인 및 재발 방지 목적**:
  - 공식 웹사이트 요강 실사 없이 임의로 마감일을 추정하거나 마감된 과거 URL을 방치하여 허위/마감 데이터가 표출되는 사고를 원천 차단한다.
- **4중 방어 검증 시스템 상시 가동**:
  1. **백엔드 무결성 검증 엔진 (`contest_validator.py`)**:
     - 시·분 단위 마감 시간 경과(`deadline_dt < now_kst`), 과거 연도(2018~2025년) 텍스트, 영구 배제 블랙리스트 키워드, `is_active: False` 또는 `status: 접수마감` 항목 발견 시 즉시 예외 없이 자동 탈락(DROP).
  2. **수집 파이프라인 검증 게이트 (`contest_scraper.py`, `contest_notice_parser.py`)**:
     - 공식 요강 파싱 시 `contest_validator.validate_contest()`를 필수 통과해야만 수집 목록에 편입되며, 최종 파일 저장 직전 전수 재검증 수행.
  3. **프론트엔드 브라우저 런타임 3차 방어선 (`static/contests.js`)**:
     - 클라이언트 로딩 시 `isContestBanned()` 및 `parseDdayFromPeriod()`를 통해 브라우저 시각 기준 마감 여부를 실시간 재연산.
     - 캐시나 비정상 데이터가 유입되더라도 화면 렌더링 직전에 메모리에서 즉시 영구 필터링 제거하여 0.001초도 화면에 노출되지 않도록 보장.
  4. **자동화 무결성 테스트 의무 실행 (`test_contests_integrity.py`)**:
     - 매일 아침 Cron(`cron_scrape.sh`) 및 CI 파이프라인에서 데이터 저장 직후 `test_contests_integrity.py`를 자동 실행하여 단 1건의 위반이라도 감지되면 exit 1로 프로세스를 즉각 중단하고 에러 경보 송출.

---

## 2. 웹 UI 및 레이아웃 준수 규칙

### ① 공모전 카드 뱃지 배치 및 레이아웃 규격
- **1행 (상단 헤더)**: 좌측에 `[카테고리 뱃지]`만 단독 배치하고, **우측 최상단에는 상태 뱃지(`[접수중]`)를 배제한 직관적인 D-Day 뱃지(`[D-Day]`, `[접수예정]`, `[상시접수]`) 단독 배치(`flex justify-between`)**하여 상단 헤더의 시각적 군더더기를 없앤다.
- **제목 직결 레이아웃**: 과거 2행에 위치하던 마감 일정(접수기간) 뱃지를 배제하여 상단 헤더 바로 아래에 공모전 헤드라인 제목이 시원하게 직결되도록 한다.
- **하단 푸터 참가대상 뱃지 배치**: 기존의 길고 말줄임되던 상금 뱃지를 배제하고, 해당 자리에 깔끔한 **`[참가대상 뱃지]`(`🎓 대학(원)생`, `🚀 스타트업·기업`, `👥 전 국민 누구나` 등)**를 배치하여 하단 액션 버튼과의 여백과 모바일 최적화를 완성한다.

### ② 브라우저 캐시 방지 (Cache Busting)
- 정적 배포(GitHub Pages) 환경이므로, 프론트엔드 코드나 데이터 수정 시:
  - `index.html` 및 `static/index.html`의 스크립트 로드 파라미터 갱신 (`?v=YYYYMMDD_HHMM`).
  - `mobile.html` 및 `static/mobile.html`의 iframe `src` 파라미터 갱신.
  - `app.js`에서 `news.json` 및 `contests.json` fetch 시 `?t=' + Date.now()` 유지.

### ③ 카테고리 탭 디자인 절대 원칙 (미니멀 언더라인 & 글씨 늘어남 원천 차단 규격)
- **적용 범위**: 토목 뉴스(`newsCategoryTabs`), 채용 공고(`jobCategoryTabs`), 공모전(`contestCategoryTabs`) 등 사이트 내 **모든 카테고리 탭 네비게이션에 100% 동일하게 무조건 고정 적용**한다.
- **스타일 규격 (시안 B 기반 미니멀 언더라인)**:
  - 둔탁하고 두꺼운 통짜 알약 배경(Pill box)을 일절 사용하지 않는다.
  - 바닥 베이스 라인(`border-b border-slate-200/80 dark:border-slate-800`)과 `-mb-px`로 완벽하게 맞물리는 **선명한 2px 언더라인 바(`border-b-2`)**를 사용한다.
  - **좌우 이동 및 스와이프 시 글씨 늘어남(자폭 변동 & 오버스크롤 스트레치) 원천 차단 절대 원칙**:
    - 탭 활성화/비활성화 시 글자 폭이 늘어나거나 줄어드는 이질감("글씨가 늘어나는 현상")을 완벽히 방지하기 위해 **활성/비활성 탭 모두 동일한 `font-semibold` 및 뱃지 `font-semibold`로 자폭을 100% 고정**한다 (`style.css`에서 `font-weight: 600 !important;` 강제).
    - 모바일 수평 스크롤 시 화면 끝에서 글씨가 고무줄처럼 늘어나는 브라우저 스트레치 현상을 차단하기 위해 **수평 스크롤 컨테이너에 `overscroll-behavior: none !important; overscroll-behavior-x: none !important;`를 필수 적용**한다.
  - **활성화 탭 (Active)**:
    - 뉴스 & 채용: `border-b-2 border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 font-semibold` + 블루 틴트 건수 뱃지(`bg-blue-100 text-blue-700 font-semibold`)
    - 공모전: `border-b-2 border-amber-500 text-amber-600 dark:text-amber-400 font-semibold` + 앰버 틴트 건수 뱃지(`bg-amber-100 text-amber-700 font-semibold`)
  - **비활성화 탭 (Inactive)**:
    - 투명 언더라인(`border-b-2 border-transparent`) + 차분한 슬레이트 텍스트(`text-slate-500 hover:text-slate-800 font-semibold`) + 기본 건수 뱃지(`bg-slate-100 text-slate-500 font-semibold`)

### ④ 모바일 기사 화면 무경계(Borderless) 및 대형 카드화 절대 원칙
- 모바일 환경에서 각 카테고리 기사들을 가두던 **답답한 외곽 테두리 박스(`border border-slate-200`)나 불필요한 중첩 패딩을 전면 배제(`border-0 bg-transparent p-0`)**하여 끊김 없이 스크롤할 수 있는 쾌적한 피드를 유지한다.
- 기사 헤드라인 제목은 모바일 한 손 스크롤 시에도 시원하게 읽히도록 **18~20px 엑스트라 볼드(`text-lg sm:text-xl font-extrabold tracking-tight`)** 크기를 무조건 고정 유지한다.
- 3줄 핵심 AI 요약 브리핑은 **블루 도트 불릿과 넉넉한 줄간격(`leading-relaxed space-y-2`) 및 13~14px 폰트 크기**를 유지한다.

### ⑤ 북마크 아이콘 및 위치 표준화 원칙
- 모든 카드(뉴스, 채용, 공모전)의 북마크 아이콘은 별표(`star`)가 아닌 **북마크 리본 아이콘(`<i data-lucide="bookmark"></i>`)**으로 100% 통일한다.
- 활성화 시 선명한 호박색(`fill-amber-500 text-amber-500`)으로 채워진다.
- 공모전 카드를 포함한 모든 카드의 북마크 버튼은 카드 하단 푸터 영역의 **`[공유하기]` 버튼 바로 옆**에 나란히 배치한다.

### ⑥ 전 페이지 좌우 너비 및 레이아웃 규격 통일 절대 원칙 (토목 뉴스 표준 고정)
- **적용 범위**: 토목 뉴스(`tabPanelNews`), 채용 공고(`tabPanelJobs`), 공모전(`tabPanelContests`) 등 사이트 내 **모든 탭 화면에 100% 동일하게 무조건 고정 적용**한다.
- **최외곽 컨테이너 규격**: `max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6`으로 100% 통일.
- **검색창 전면 제거 및 미니멀 피드 레이아웃**: 토목 뉴스, 채용 공고, 공모전 3개 전체 탭에서 검색창을 일괄 제거하여 상단 타이틀에서 카테고리 탭/피드로 시원하게 직결되는 쾌적한 피드를 유지한다.
- **상단 카테고리 탭 스티키 바**: 화면 좌우 끝까지 뻗는 풀 블리드 음수 마진(`sticky top-0 sm:top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-0 mt-0 mb-4 sm:my-4 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 shadow-xs`)과 내부 `max-w-7xl mx-auto category-scroll-container` 구조를 3개 탭 모두에 100% 동일하게 고정.
- **필터 및 정렬 컨트롤 바**: 카테고리 탭 바로 아래 `flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 mb-4 px-1`로 통일 (좌측 건수 안내, 우측 필터/정렬 버튼군).
- **카드 그리드 반응형 컬럼**: 모바일 1열, 태블릿 및 데스크탑 2열(`grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6`)로 모든 카드 그리드를 동일하게 통일 (2열 와이드 배치에 맞추어 카드 패딩 `p-5 sm:p-7`, 헤드라인 `text-lg sm:text-xl`~`text-xl sm:text-2xl`, 배지 및 버튼 여백을 비례 확대 적용).
- **스크롤바 유무에 따른 너비 출렁임(Layout Shift) 원천 방지**: 페이지별 콘텐츠 높이 차이로 인해 세로 스크롤바가 생성/소멸되며 화면 전체 너비와 중앙 정렬이 15~17px 순간 이동하는 현상을 방지하기 위해, `html`에 `overflow-y: scroll; scrollbar-gutter: stable;`을 영구 고정한다.

---

## 3. 크롤러 및 배포 파이프라인 유지

- 새로운 공모전 출처나 키워드를 추가/변경할 경우:
  - `scraper.py`의 `OFFICIAL_CONTEST_MAPPINGS`에 전용 딥링크 URL 매핑 등록.
  - `extract_contest_prize()`, `extract_contest_period()` 함수에 팩트 우선 규칙 등록.
  - 마감일 상태 판별 로직(접수마감/접수예정/상시접수/접수중) 확인.
  - 데이터 갱신 후 반드시 GitHub 저장소 `main` 브랜치에 `commit & push`하여 GitHub Pages 자동 배포 반영.

---

## 4. 프로젝트 내부 버전 관리 절대 원칙 (Internal Versioning Rules)

### ① 웹 화면 비노출 원칙 (Silent Internal Versioning)
- 프론트엔드 웹 UI(DOM 화면)에는 버전을 직접 표기하지 않는다. 사용자에게 불필요한 시각적 노이즈를 주지 않고 내부적으로 체계적인 개발 추적을 진행한다.

### ② 버전 체계 및 자동 증가 규격 (Semantic Patch Auto-increment)
- **현재 기준 버전**: **`v1.0.45`** (2026.09.12 기준 / 사용자 누적 수정 45회 반영)
- **패치 버전 (+0.0.1) 자동 증가**:
  - 사용자가 페이지 기능 수정, UI/스타일 변경, 버그 패치, 신규 기능 업그레이드 등을 요청하여 작업을 완료할 때마다 **패치 버전을 자동으로 `+0.0.1`씩 증가**시킨다 (예: 1.0.13 → 1.0.14 → 1.0.15 ...).
  - 작업 완료 시 커밋 메시지, 진행 현황 문서(`PROJECT_SUMMARY.md`) 및 응답에 현재 적용된 버전을 투명하게 명시한다.
- **메이저(X.0.0) 및 마이너(0.X.0) 수동 고정 원칙**:
  - 메이저 버전(예: `v2.0.0`) 및 마이너 버전(예: `v1.1.0`) 증가는 **반드시 사용자가 직접 명시적으로 지시할 때만** 증가시킨다.

