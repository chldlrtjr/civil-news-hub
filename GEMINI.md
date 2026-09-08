# Civil News Hub (토목 뉴스 브리핑 & 공모전 대시보드) 개발 및 크롤링 규칙

본 문서는 `civil-news-hub` 프로젝트의 데이터 수집(크롤링), 정제, UI 렌더링 시 반드시 준수해야 하는 운영 원칙을 정의합니다.

---

## 1. 공모전 데이터 수집 및 정제 원칙 (Data Integrity)

### ① 유사 공모전 합성 금지 및 완전 분리 원칙
- 동일한 공공기관(예: 한국수자원공사, 국토교통부, LH 등)이 주최하더라도 **공모 목적, 접수 일정, 공식 접수 페이지가 다르면 절대로 하나로 묶지 않는다.**
- 예: `K-water 대국민 물빅데이터 & 혁신 창업대전`처럼 합성하지 않고, 반드시 아래와 같이 분리:
  - `2026 대한민국 물산업 혁신 창업대전` (http://www.startupwater.net)
  - `K-water 대국민 물 빅데이터 공모전` (https://www.water.or.kr)

### ② 세부 공고문 전용 딥링크 우선 매핑 원칙
- 단순 기관 대표 홈페이지(루트 도메인)로 링크를 연결하지 않는다.
- 반드시 참가자가 요강을 확인하고 접수할 수 있는 **공식 전용 웹사이트 또는 상세 게시물 URL(딥링크)**을 우선 지정한다.
  - 도로경관디자인 대전: `https://www.ex-contest.co.kr/design26`
  - LH 국토기술대전: `https://lh.or.kr/land/intro.do`
  - 물산업 혁신 창업대전: `http://www.startupwater.net`
  - 추락사고 예방 공모전: `https://www.safecontest.kr/summary`

### ③ 팩트 기반 접수 기간 및 상금 명시
- `"공식 공고 확인"`, `"공고 확인 요망"` 등 모호하거나 불명확한 표현을 지양한다.
- 접수 기간은 반드시 **`YYYY.MM.DD ~ MM.DD (상세시간 마감)`** 형태로 명시한다.
- 상금 및 훈격(장관상, 사장상 등)을 팩트 기반으로 구체적으로 기재한다.

---

## 2. 웹 UI 및 레이아웃 준수 규칙

### ① 공모전 카드 상단 뱃지 배치
- **1행 (상단 헤더)**: 좌측에 `[카테고리 뱃지]`, **우측 최상단에 `[접수중 / 접수예정]` 상태 뱃지를 단단히 고정(`flex justify-between`)**한다.
- **2행 (접수 기간)**: `[📅 접수기간: YYYY.MM.DD ~ MM.DD]` 뱃지는 1행 아래에 독립적인 행으로 배치하여, 긴 기간 텍스트로 인해 상태 뱃지가 줄바꿈되거나 밀리지 않도록 한다.

### ② 브라우저 캐시 방지 (Cache Busting)
- 정적 배포(GitHub Pages) 환경이므로, 프론트엔드 코드나 데이터 수정 시:
  - `index.html` 스크립트 로드 시 `?v=YYYYMMDD_HHMM` 파라미터 갱신.
  - `app.js`에서 `news.json` 및 `contests.json` fetch 시 `?t=' + Date.now()` 유지.

---

## 3. 크롤러 및 배포 파이프라인 유지

- 새로운 공모전 출처나 키워드를 추가할 경우:
  - `scraper.py`의 `OFFICIAL_CONTEST_MAPPINGS`에 전용 URL 매핑 추가.
  - `extract_contest_prize()`, `extract_contest_period()` 함수에 정규식 및 팩트 우선 규칙 등록.
  - 데이터 갱신 후 GitHub 저장소 `main` 브랜치에 푸시하여 GitHub Pages 자동 배포 반영.
