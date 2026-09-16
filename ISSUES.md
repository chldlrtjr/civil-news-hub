# 📋 Civil News Hub: 트러블슈팅 및 이슈 해결 기록부 (ISSUES.md)

> **프로젝트**: Civil News Hub (토목 뉴스 브리핑 & 채용·공모전 허브)  
> **현재 버전**: `v1.1.6` (이슈 관리 체계 신설 및 네트워크 진단 내역 반영)  
> **운영 목적**: 개발 및 운영 과정에서 발생한 문제, 버그, 장애, 성능 이슈와 그에 대한 원인 분석 및 해결 과정을 투명하고 체계적으로 누적 기록합니다.

---

## 📑 목차

1. [이슈 작성 템플릿 규격](#1-이슈-작성-템플릿-규격)
2. [해결 완료된 핵심 이슈 목록 (Resolved Issues)](#2-해결-완료된-핵심-이슈-목록-resolved-issues)
   - [ISSUE-001: 학내망 외부 접속 차단(Connection Refused) 및 호스팅 아키텍처](#issue-001-학내망-외부-접속-차단connection-refused-및-호스팅-아키텍처)
   - [ISSUE-002: 마감 및 과거 공모전 표출 방지 4중 무결성 방어막 구축](#issue-002-마감-및-과거-공모전-표출-방지-4중-무결성-방어막-구축)
   - [ISSUE-003: 모바일 카테고리 탭 글씨 늘어남(자폭 변동 및 오버스크롤) 버그](#issue-003-모바일-카테고리-탭-글씨-늘어남자폭-변동-및-오버스크롤-버그)
   - [ISSUE-004: 페이지 이동/콘텐츠 높이에 따른 세로 스크롤바 레이아웃 흔들림(Layout Shift)](#issue-004-페이지-이동콘텐츠-높이에-따른-세로-스크롤바-레이아웃-흔들림layout-shift)
   - [ISSUE-005: 전북대학교 아르바이트 캘린더 날짜 클릭 필터링 기능 탑재](#issue-005-전북대학교-아르바이트-캘린더-날짜-클릭-필터링-기능-탑재)
   - [ISSUE-006: 2GB 저용량 RAM 서버 메모리 고갈(RAM Full) 및 OOM 방지 최적화](#issue-006-2gb-저용량-ram-서버-메모리-고갈ram-full-및-oom-방지-최적화)
   - [ISSUE-007: 루트 디스크 10GB 용량 고갈(Disk Full) 위기 극복 및 10GB 보조 디스크(/dev/vdb) 영구 마운트 확장](#issue-007-루트-디스크-10gb-용량-고갈disk-full-위기-극복-및-10gb-보조-디스크devvdb-영구-마운트-확장)
   - [ISSUE-008: 크롤링 중 디스크 일시 고갈로 인한 data/news.json 절단 손상 및 원자적 쓰기(Atomic Write) 도입](#issue-008-크롤링-중-디스크-일시-고갈로-인한-datanewsjson-절단-손상-및-원자적-쓰기atomic-write-도입)
3. [진행 중 / 검토 대상 이슈 (Open Issues)](#3-진행-중--검토-대상-이슈-open-issues)

---

## 1. 이슈 작성 템플릿 규격

모든 신규 이슈는 다음 규격에 맞추어 기록합니다:

```markdown
### [ISSUE-XXX] 이슈 제목 요약
- **발생 일시**: YYYY-MM-DD
- **관련 파일/모듈**: `경로/파일명`
- **상태**: 🟢 해결 완료 (Resolved) / 🟡 진행 중 (In Progress) / 🔴 조사 중 (Investigating)
- **증상 및 문제 (Problem)**: 어떤 문제가 발생했는가?
- **원인 분석 (Root Cause)**: 왜 문제가 발생했는가?
- **해결 방법 및 조치 (Resolution)**: 구체적으로 어떻게 코드를 수정하거나 환경을 변경했는가?
- **재발 방지 대책 (Prevention)**: 향후 동일한 문제가 발생하지 않도록 적용한 규칙이나 테스트.
```

---

## 2. 해결 완료된 핵심 이슈 목록 (Resolved Issues)

---

### [ISSUE-001] 학내망 외부 접속 차단(Connection Refused) 및 호스팅 아키텍처
- **발생 일시**: 2026-09-16
- **관련 파일/모듈**: Nginx, Cloudflare Tunnel (`civil-tunnel.service`), 네트워크 환경
- **상태**: 🟢 원인 규명 및 해결 방안 수립 완료 (Resolved)
- **증상 및 문제 (Problem)**:
  - 서버 IP(`113.198.66.75:80`)로 외부(스마트폰 LTE, 외부 PC)에서 다이렉트 접속 시 `Connection Refused (접속 거절)` 오류 발생.
  - 외부 중계 도구 없이 자체적으로 웹사이트를 외부로 띄울 수 있는지 검증 필요.
- **원인 분석 (Root Cause)**:
  - 서버의 공인 IP(`113.198.66.75`)가 전북대학교 학내 전산망(AS7560 Jeonbuk National University) 소속임.
  - 서버 내부(`10.0.0.131`)에서는 Nginx가 200 OK로 정상 응답하나, 학교 정보전산원 상위 보안 방화벽에서 외부에서 학교 안으로 들어오는 인바운드 웹 포트(80, 443)를 원천 차단하고 있음.
  - 과거에 Cloudflare Tunnel을 사용했던 이유가 바로 이 학교 인바운드 방화벽을 아웃바운드 터널로 우회하기 위함이었음.
- **해결 방법 및 조치 (Resolution)**:
  - 1안(고정 도메인 + Cloudflare 고정 터널): 임시 URL이 아닌 나만의 공식 도메인을 고정 터널에 연결하여 영구 주소화.
  - 2안(학내 전산원 방화벽 포트포워딩 신청): 서버 IP에 대해 80/443 외부 개방 공식 신청.
  - 3안(무료 클라우드 VPS 이전): 학교망 종속성을 탈피하여 100% 독립 가상 서버로 이전.
- **재발 방지 대책 (Prevention)**:
  - 본 `ISSUES.md`에 네트워크 특성을 문서화하여 불필요한 포트 설정 혼선 방지.

---

### [ISSUE-002] 마감 및 과거 공모전 표출 방지 4중 무결성 방어막 구축
- **발생 일시**: 2026-09-14
- **관련 파일/모듈**: `contest_validator.py`, `contest_scraper.py`, `static/contests.js`, `test_contests_integrity.py`, `GEMINI.md`
- **상태**: 🟢 해결 완료 (Resolved)
- **증상 및 문제 (Problem)**:
  - 수집 데이터 중 이미 마감되었거나 과거 연도(2021~2025)에 개최된 공모전이 대시보드에 간헐적으로 노출되는 현상 발생.
- **원인 분석 (Root Cause)**:
  - 웹상에 과거 공모전 요강 페이지가 남아있는 상태에서 날짜 파싱이 느슨하게 적용되어 마감된 공모전이 `접수중`으로 오분류됨.
- **해결 방법 및 조치 (Resolution)**:
  1. `contest_validator.py`: 마감 시점(`deadline_dt < now_kst`), 과거 연도 텍스트, 블랙리스트 키워드 영구 DROP 처리.
  2. `contests.js`: 브라우저 렌더링 직전 실시간 시각 기준 재연산 필터링 (0.001초도 노출 차단).
  3. `test_contests_integrity.py`: 데이터 수집 후 자동 검증 스크립트 실행하여 위반 시 즉각 중단.
  4. `GEMINI.md`에 무결성 절대 원칙 제정.
- **재발 방지 대책 (Prevention)**:
  - 매일 아침 크롤링 후 자동 무결성 테스트 실행 강제화.

---

### [ISSUE-003] 모바일 카테고리 탭 글씨 늘어남(자폭 변동 및 오버스크롤) 버그
- **발생 일시**: 2026-09-15
- **관련 파일/모듈**: `static/style.css`, `static/app.js`, `static/jobs.js`, `static/contests.js`
- **상태**: 🟢 해결 완료 (Resolved)
- **증상 및 문제 (Problem)**:
  - 모바일에서 카테고리 탭을 좌우로 스와이프하거나 탭 클릭 전환 시 폰트가 옆으로 늘어나거나 출렁이는 시각적 버그 발생.
  - 스크롤 끝에서 당길 때 고무줄처럼 텍스트가 늘어나는 브라우저 스트레치 현상 발생.
- **원인 분석 (Root Cause)**:
  - 활성 탭(`font-bold`)과 비활성 탭(`font-medium`) 간 글자 두께 차이로 인한 자폭(Letter spacing/width) 변동.
  - 모바일 브라우저 기본 수평 오버스크롤 바운스 효과가 탭 컨테이너에 적용됨.
- **해결 방법 및 조치 (Resolution)**:
  - 모든 탭 및 뱃지의 폰트 두께를 `font-semibold (font-weight: 600 !important)`로 100% 동일하게 고정.
  - 수평 스크롤 컨테이너에 `overscroll-behavior: none !important; overscroll-behavior-x: none !important;` 영구 적용.
  - 탭 컨테이너 높이를 44px로 고정하여 세로 출렁임 차단.
- **재발 방지 대책 (Prevention)**:
  - `GEMINI.md`의 [카테고리 탭 디자인 절대 원칙]에 필수 규격으로 영구 등재.

---

### [ISSUE-004] 페이지 이동/콘텐츠 높이에 따른 세로 스크롤바 레이아웃 흔들림(Layout Shift)
- **발생 일시**: 2026-09-15
- **관련 파일/모듈**: `static/style.css`, `index.html`
- **상태**: 🟢 해결 완료 (Resolved)
- **증상 및 문제 (Problem)**:
  - 기사 수가 적거나 많은 탭 간 전환 시 브라우저 우측 세로 스크롤바가 생겼다 사라지면서 화면 전체가 좌우로 15~17px 덜컥거리는 현상.
- **원인 분석 (Root Cause)**:
  - 브라우저 기본 뷰포트 폭이 스크롤바 생성 여부에 따라 가변됨.
- **해결 방법 및 조치 (Resolution)**:
  - `html` 태그 스타일에 `overflow-y: scroll; scrollbar-gutter: stable;` 적용하여 스크롤바 공간을 항상 일정하게 유지.
- **재발 방지 대책 (Prevention)**:
  - `GEMINI.md` 레이아웃 규격에 필수 포함.

---

### [ISSUE-005] 전북대학교 아르바이트 캘린더 날짜 클릭 필터링 기능 탑재
- **발생 일시**: 2026-09-15
- **관련 파일/모듈**: `static/jobs.js`, `static/index.html`
- **상태**: 🟢 해결 완료 (Resolved)
- **증상 및 문제 (Problem)**:
  - 캘린더 모달에서 특정 날짜를 클릭했을 때, 해당 날짜에 근무하는 알바 공고만 한눈에 확인하고 싶은 사용자 편의 기능 요구.
- **해결 방법 및 조치 (Resolution)**:
  - 날짜 셀 클릭 시 이벤트 핸들러 연결.
  - 날짜 범위(시작일~마감일)를 매핑하여 해당 날짜에 유효한 공고 카드만 모달 하단/리스트에 즉시 필터링 노출.
  - '전체 보기' 리셋 버튼 제공.

### [ISSUE-006] 2GB 저용량 RAM 서버 메모리 고갈(RAM Full) 및 OOM 방지 최적화
- **발생 일시**: 2026-09-11 ~ 2026-09-16
- **관련 파일/모듈**: `/swapfile`, `clamav-daemon.service`, `civil-news-hub.service`, 시스템 커널 OOM
- **상태**: 🟢 해결 완료 (Resolved)
- **증상 및 문제 (Problem)**:
  - 서버 메모리(RAM) 점유율이 100%에 육박하며 시스템 프리징(멈춤) 및 반응 속도 급저하 발생.
  - 리눅스 커널 OOM(Out Of Memory) Killer가 발동하여 필수 웹 서비스(`Nginx`, `Gunicorn`, `Cloudflared`)를 강제 종료시킬 위험 직면.
- **원인 분석 (Root Cause)**:
  - 현재 서버의 물리 RAM이 1.9GB(약 2GB)로 매우 타이트한 환경.
  - 백그라운드 보안 검사 데몬인 `clamav-daemon`이 단독으로 1.0GB 이상의 RAM을 지속 점유(전체 물리 메모리의 50% 이상 독식).
  - 초기 스왑(Swap) 가상 메모리 공간이 없거나 부족하여 일시적인 메모리 피크 시 버퍼 공간 부재.
- **해결 방법 및 조치 (Resolution)**:
  1. **3GB 대용량 스왑 파일(`/swapfile`) 생성 및 활성화**:
     - 디스크 공간을 활용하여 3GB 크기의 가상 스왑 메모리를 생성하고 영구 활성화(`swapon`).
     - 일시적 메모리 폭증 시 커널이 크래시 없이 스왑 영역을 완충재로 활용하도록 방어막 구축.
  2. **메모리 과점 데몬(`clamav-daemon`) 비활성화 및 프로세스 정리**:
     - 메모리 1.0GB를 불필요하게 낭비하던 `clamav-daemon.service`를 즉시 중지 및 비활성화(`systemctl disable`) 처리하여 **가용 RAM 1GB 즉시 회수**.
  3. **Gunicorn 웹 워커 경량화 고정**:
     - 메모리 폭증을 방지하기 위해 Gunicorn 워커 수를 2GB RAM에 적합한 `--workers 3`으로 제한 설정.
  4. **시스템 디스크 및 저널 로그 청소**:
     - `journalctl --vacuum-size=10M` 및 불필요한 캐시/임시 파일 정리로 I/O 및 버퍼 메모리 여유 공간 확보.
- **재발 방지 대책 (Prevention)**:
  - `free -h` 기준으로 상시 가용 메모리(Available RAM) 500MB 이상 유지 확인.
  - 24시간 서비스 상주 시 불필요한 백그라운드 데몬 추가 설치 엄격 통제.

---

### [ISSUE-007] 루트 디스크 10GB 용량 고갈(Disk Full) 위기 극복 및 10GB 보조 디스크(`/dev/vdb`) 영구 마운트 확장
- **발생 일시**: 2026-09-11 ~ 2026-09-16
- **관련 파일/모듈**: `/dev/vda4`, `/dev/vdb`, `/etc/fstab`, `/home/ubuntu/data`, `/var/log`
- **상태**: 🟢 해결 완료 (Resolved)
- **증상 및 문제 (Problem)**:
  - 루트 파티션(`/dev/vda4`, 총 8.7GB)의 디스크 사용률이 95% 이상 치솟으며 `No space left on device (디스크 공간 부족)` 에러 직면.
  - 패키지 설치(`apt-get`), 로그 기록, Git 커밋, 스왑 파일 할당 등 서버 핵심 작업이 디스크 부족으로 올스톱될 위험 발생.
- **원인 분석 (Root Cause)**:
  - 기본 루트 디스크 용량이 10GB로 매우 제한적.
  - 시스템 저널 로그(`journald`), `/var/log/*.gz` 압축 로그, apt 아카이브 캐시 지속 누적.
  - 개발 도구 및 임시 디렉토리(`~/.cache`, `~/.vscode-server`, `~/.antigravity-ide-server`, `/tmp`) 누적.
  - 앞서 OOM 방지를 위해 생성한 `/swapfile`이 루트 디스크에서 3GB를 점유하여 실제 가용 공간이 극도로 협소해짐.
- **해결 방법 및 조치 (Resolution)**:
  1. **긴급 디스크 다이어트 및 불필요 파일 일괄 소거**:
     - `sudo apt-get clean`: apt 패키지 캐시 전량 삭제.
     - `sudo journalctl --vacuum-size=10M`: 거대화된 시스템 저널 로그를 10MB로 강제 축소.
     - `sudo rm -f /var/log/*.gz /var/log/*.1`: 과거 회전(Rotate) 압축 로그 일괄 삭제.
     - `rm -rf ~/.cache/* ~/.vscode-server ~/.antigravity-ide-server /tmp/*`: 임시 캐시 및 레거시 IDE 서버 잔재 완전 소거.
  2. **10GB 신규 보조 블록 디스크(`/dev/vdb`) 포맷 및 영구 확장**:
     - 미사용 보조 디스크 블록 장치인 `/dev/vdb`(10GB) 식별.
     - ext4 파일 시스템으로 포맷 수행: `sudo mkfs.ext4 -F /dev/vdb`
     - 데이터 전용 디렉토리 생성 및 마운트: `mkdir -p ~/data && sudo mount /dev/vdb ~/data`
     - 권한 설정: `sudo chown -R ubuntu:ubuntu ~/data`
     - 재부팅 시에도 영구 자동 마운트되도록 `/etc/fstab`에 등록:  
       `/dev/vdb /home/ubuntu/data ext4 defaults 0 2`
- **결과 및 효과 (Results)**:
  - 루트 파티션 가용 용량 확보(현재 여유 1.4GB 확보) 및 안정화.
  - 데이터 저장 전용 10GB 신규 스토리지(`/home/ubuntu/data`) 확보로 **서버 전체 저장 용량을 기존 10GB에서 20GB로 2배 확장**.
- **재발 방지 대책 (Prevention)**:
  - 주기적인 `df -h` 모니터링.
  - 대용량 데이터나 로그 보관 시 `/home/ubuntu/data` 전용 볼륨을 우선 활용하도록 분리.

---

### [ISSUE-008] 크롤링 중 디스크 일시 고갈로 인한 data/news.json 절단 손상 및 원자적 쓰기(Atomic Write) 도입
- **발생 일시**: 2026-09-17
- **관련 파일/모듈**: `scraper.py`, `contest_scraper.py`, `job_scraper.py`, `jbnu_scraper.py`, `data/news.json`, `static/app.js`
- **상태**: 🟢 해결 완료 (Resolved)
- **증상 및 문제 (Problem)**:
  - 프론트엔드 웹 화면 진입 시 "⚠️ 뉴스 데이터를 불러오지 못했습니다" 토스트와 함께 빈 기사 상태가 노출됨.
  - 브라우저 콘솔 확인 결과 `/api/news` 및 `data/news.json` 요청 시 JSON 파싱 에러(SyntaxError: Unexpected end of JSON input) 발생.
- **원인 분석 (Root Cause)**:
  - 2026-09-16 07:00 크롤링 실행 당시 루트 디스크 일시 고갈(`[Errno 28] No space left on device`) 발생.
  - 기존 `scraper.py`가 `with open(NEWS_JSON_PATH, "w")`로 파일을 직접 열어 쓰던 중 5,625번째 줄에서 `json.dump`가 중간 중단되어 닫는 괄호(`}]}`)가 누락된 채 손상된 파일이 저장됨.
  - `static/app.js`의 `loadNewsData`에서도 1차 API 실패 시 폴백 경로가 경직되어 있어 손상 파일 파싱 에러를 복구하지 못함.
- **해결 방법 및 조치 (Resolution)**:
  1. **원자적 파일 교체(Atomic Write) 패턴 4대 수집기 전면 적용**:
     - `scraper.py`, `contest_scraper.py`, `job_scraper.py`, `jbnu_scraper.py` 4개 전체 수집기에서 파일을 직접 `w`로 열지 않고, 임시 파일(`*.json.tmp`)에 먼저 완전하게 쓴 뒤 `os.replace(temp_path, final_path)`로 교체하도록 개편.
     - 쓰기 도중 에러나 프로세스 강제 종료가 발생해도 기존의 유효한 JSON 원본이 100% 보존됨.
  2. **최신 뉴스 데이터 정상 재수집 및 무결성 검증**:
     - `scraper.py` 재실행하여 273건의 유효 기사를 담은 `data/news.json` 정상 생성 완료.
  3. **프론트엔드 2단계 다중 폴백 강화**:
     - `static/app.js`의 `loadNewsData`에서 `/api/news` 실패 시 `./data/news.json` 및 `data/news.json` 다중 상대 경로 폴백 지원.
- **재발 방지 대책 (Prevention)**:
  - 모든 JSON 데이터 저장 시 예외 없이 임시 파일 생성 후 `os.replace` 원자적 교체 필수 준수.

---

## 3. 진행 중 / 검토 대상 이슈 (Open Issues)

| 이슈 번호 | 제목 | 등록일 | 진행 상태 |
| :--- | :--- | :--- | :--- |
| **ISSUE-009** | 개인 로컬 PC ↔ GitHub ↔ 24시간 서버 간 무인 자동 배포(CI/CD) 파이프라인 구축 | 2026-09-16 | 🟡 구성 설계 중 |
| **ISSUE-010** | 학교 학내망 환경에 적합한 영구 도메인 및 24시간 무중단 웹서빙 통로 확정 | 2026-09-16 | 🟡 사용자 선택 대기 중 |
