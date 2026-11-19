# 마이페이지 · 제출 진행 추적 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테마 버튼 자리에 마이페이지를 두고, 그 안에서 공모전·채용 지원을 미제출 → 제출완료 → 심사중 → 결과발표(+마감(미제출))로 추적하며, 결과가 나온 것은 "내 기록"에 모은다.

**Architecture:** 상태 계산·정렬·병합 같은 순수 로직은 새 파일 `static/tracker_core.js`(브라우저 전역 + Node `module.exports`)에 두고 `node --test`로 검증한다. 화면은 기존 단일 파일 `index.html`의 PC(`#ca`)·모바일(`#m`) 두 화면에 같은 HTML 생성 함수를 써서 붙인다. 저장은 북마크와 같은 경로(localStorage + Supabase `user_saved` 행)에 `tracked` 칸을 더한다. 결과 발표일은 jcloud 수집기(전북대 공지)에서 본문·포스터 판독문을 정규식으로 읽어 `result_date`로 내보낸다.

**Tech Stack:** 바닐라 JS(빌드 없음), supabase-js 2.45.4(UMD, 이미 로드), Node 내장 `node:test`, Python 3.12 unittest/pytest.

**Spec:** `docs/superpowers/specs/2026-11-19-mypage-tracker-design.md`

## Global Constraints

- **웹페이지 어디에도 이모지를 쓰지 않는다.** 상태·결과·버튼은 글자, 기존 인라인 SVG 아이콘, 색 배지로만 표시한다. (U+1F000–1FAFF, U+2600–27BF, U+2B00–2BFF, U+FE0F 금지. ✓ ✕도 금지)
- 상태 5개와 화면 문구: `미제출` `제출완료` `심사중` `결과발표` `마감(미제출)`. 결과 2개: `수상·합격`(값 `win`), `미선정`(값 `lose`).
- 마감 판정: 마감일 **당일 23:59까지는 지나지 않음**. 즉 `today > deadline`일 때만 지남. `deadline_time`은 무시한다.
- 심사중·마감(미제출)은 **저장하지 않고** 그릴 때마다 계산한다. 저장하는 것은 사용자 행동(`submittedAt`, `result`, `resultAt`)과 공고 복사본뿐이다.
- 카드 저장 형식(키 이름 고정): `{id, kind:'contest'|'job', title, org, link, deadline:'YYYY-MM-DD'|'', resultDate:'YYYY-MM-DD'|'', steps:[], addedAt, submittedAt:'YYYY-MM-DD'|null, result:'win'|'lose'|null, resultAt:'YYYY-MM-DD'|null}`
- 저장 위치: 로그인 → Supabase `public.user_saved.tracked jsonb`(북마크와 같은 행), 비로그인 → localStorage `cnh-tracked`.
- 삭제는 사이트 스타일 확인창 `정말 삭제할까요?` [취소] [삭제]. 브라우저 `confirm()`은 쓰지 않는다.
- 새 의존성 금지. supabase-js는 이미 있는 2.45.4 그대로 쓴다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **push는 사용자가 "푸쉬해"라고 할 때만** 한다.

## Review Focus

1. 마감일을 모르는 공고(상시 모집 등, `deadline:''`): 자동 전환하지 않는다. 제출완료로 머물고, 결과 버튼은 바로 누를 수 있어야 한다. 테스트는 Task 2 `stageOf`.
2. PC와 모바일에서 서로 다른 진행 상태로 로그인한 경우: 더 진행된 쪽이 남고, 결과 기록이 사라지지 않아야 한다. 테스트는 Task 2 `mergeTracked`.
3. 추가한 공고가 다음 수집에서 목록에서 빠진 경우: 카드가 그대로 그려지고, 링크·제목이 남아야 한다. 테스트는 Task 2 `refreshFromSource`(원본 없음 → 그대로).
4. 사용자가 마감 연장으로 공고 마감일이 바뀐 경우: 카드 마감일이 새 값으로 바뀌어 상태 계산이 맞아야 한다. 테스트는 Task 2 `refreshFromSource`.
5. 이모지 재유입: 어떤 작업이든 사이트 파일에 이모지가 들어가면 테스트가 실패해야 한다. 테스트는 Task 1 `test_no_emoji_on_site`.

---

### Task 1: 이모지 금지 검사 + 수집기 `result_date`

**Files:**
- Create: `tests/test_no_emoji.py`
- Modify: `jbnu_contest_scraper.py` (`make_card` 반환 dict에 `result_date` 추가, 새 함수 `find_result_date`)
- Test: `tests/test_contest_scrapers.py`

**Interfaces:**
- Consumes: `jbnu_contest_scraper._find_dates(segment: str, posted: date) -> list[(date, end)]`
- Produces: 공모전 dict 키 `result_date: str` (`'YYYY-MM-DD'` 또는 `''`). `find_result_date(text: str, posted: date) -> str`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_no_emoji.py`
```python
def test_no_emoji_on_site():
    # index.html, privacy.html, mobile.html, contests.html, jobs.html, static/data_adapter.js, static/tracker_core.js(있으면)
    # 정규식 [\U0001F000-\U0001FAFF☀-➿⬀-⯿️] 로 찾은 (파일, 줄번호, 앞뒤 20자) 목록이 비어 있어야 함
    assert hits == [], hits
```
`tests/test_contest_scrapers.py`에 추가:
```python
def test_find_result_date_picks_latest_announcement():
    posted = date(2026, 11, 1)
    text = "접수: 11. 20.(금)까지 ○ 1차 결과 발표 : 2026. 12. 1. ○ 최종 수상자 발표 : 2026. 12. 7.(월) 18:00 ○ 시상식 12. 20."
    assert jcs.find_result_date(text, posted) == "2026-12-07"

def test_find_result_date_ignores_deadline_and_ceremony():
    posted = date(2026, 11, 1)
    assert jcs.find_result_date("접수 마감 11. 20. / 시상식 12. 20.", posted) == ""
    assert jcs.find_result_date("", posted) == ""

def test_find_result_date_short_dates_roll_year():
    posted = date(2026, 11, 25)
    assert jcs.find_result_date("합격자 발표: 1월 5일", posted) == "2027-01-05"
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest -q tests/test_no_emoji.py tests/test_contest_scrapers.py -k "emoji or result_date"`
Expected: `find_result_date` 없음으로 FAIL. 이모지 테스트는 PASS여야 한다(2026-11-19에 이미 제거함). FAIL이면 남은 이모지를 지운다.

- [ ] **Step 3: `find_result_date(text: str, posted: date) -> str` 구현 (`jbnu_contest_scraper.py`, `_find_dates` 아래)**

키워드 정규식 `(결과|수상자?|수상작|당선자?|당선작|합격자?|입상자?|최종|선정)\s*(발표|공고|안내|통보|공지)` 뒤 **40자 안**의 날짜를 `_find_dates`로 읽는다. 매치가 여럿이면 날짜 중 **가장 늦은 것**을 쓰고 `isoformat()`으로 반환한다. 없으면 `''`. 키워드 없이 나오는 시상식·마감 날짜는 무시한다. `make_card`의 반환 dict에 `"result_date": find_result_date(body_text, posted)`를 넣는다. 포스터 경로는 `build_poster_contest`가 판독문(transcript)을 `make_card`에 body로 넘기므로 자동으로 적용된다.

- [ ] **Step 4: 통과 확인**

Run: `python -m pytest -q tests`
Expected: 전부 PASS

- [ ] **Step 5: 실제 데이터 추출률 측정 (보고용, 코드 변경 없음)**

Run: `ssh jcloud 'cd /home/ubuntu/workspace && venv/bin/python -c "import json;import jbnu_contest_scraper as j;from datetime import date;c=json.load(open(\"data/poster_ocr_cache.json\"));print(sum(1 for v in c.values() if j.find_result_date((v.get(\"raw\") or {}).get(\"transcript\") or \"\", date.today())), \"/\", len(c))"'`
Expected: `N / M` 출력. 이 숫자를 최종 보고에 넣는다. (위비티·데브이벤트는 상세 페이지를 수집하지 않아 `result_date`가 비고, 카드는 "심사 N일째" + 수동 결과 기록으로 동작한다. 범위 밖으로 보고한다.)

- [ ] **Step 6: 커밋**

```bash
git add tests/test_no_emoji.py tests/test_contest_scrapers.py jbnu_contest_scraper.py
git commit -m "feat(contest): 전북대 공지 본문·포스터 판독문에서 결과 발표일(result_date) 추출, 사이트 이모지 금지 테스트"
```

---

### Task 2: 진행 추적 순수 로직 `static/tracker_core.js`

**Files:**
- Create: `static/tracker_core.js`
- Create: `tests/tracker_core.test.js`

**Interfaces:**
- Consumes: 없음
- Produces (전역 `window.CNHTracker`, Node `module.exports` 둘 다):
  - `STAGES = ['todo','submitted','review','result','missed']`, `LABEL = {todo:'미제출', submitted:'제출완료', review:'심사중', result:'결과발표', missed:'마감(미제출)'}`
  - `stageOf(card, today: 'YYYY-MM-DD') -> stage`
  - `makeCard(kind: 'contest'|'job', item, today) -> card`: 이 `item`은 Task 3의 화면용 객체 `{id, title, org|co, link, deadline, resultDate?, steps?, role?}`
  - `refreshFromSource(card, item|undefined) -> card`: 원본이 있으면 `deadline`·`resultDate`만 갱신한 새 객체, 없으면 원래 card
  - `mergeTracked(a: card[], b: card[]) -> card[]`
  - `sortActive(cards, today) -> card[]` (결과발표 제외)
  - `sortRecords(cards) -> card[]` (결과발표만, `resultAt` 최신순)
  - `sortPicker(items) -> items` (`deadline` 내림차순, 빈 값은 맨 뒤)
  - `daysBetween(fromISO, toISO) -> int`
  - `needsAttention(card, today) -> bool`

- [ ] **Step 1: 실패하는 테스트 작성 (`tests/tracker_core.test.js`, `node:test` + `assert/strict`, `require('../static/tracker_core.js')`)**

```js
const T = '2026-11-19';
const c = (o) => ({ id:'x', kind:'contest', title:'t', org:'o', link:'#', deadline:'2026-11-30', resultDate:'', steps:[], addedAt:T, submittedAt:null, result:null, resultAt:null, ...o });

test('stageOf: 미제출 → 마감 당일까지는 todo, 다음 날 missed', () => {
  assert.equal(stageOf(c({deadline:'2026-11-19'}), T), 'todo');
  assert.equal(stageOf(c({deadline:'2026-11-18'}), T), 'missed');
});
test('stageOf: 제출 → 마감 전 submitted, 마감 지나면 review, 결과 있으면 result', () => {
  assert.equal(stageOf(c({submittedAt:T}), T), 'submitted');
  assert.equal(stageOf(c({submittedAt:'2026-11-01', deadline:'2026-11-10'}), T), 'review');
  assert.equal(stageOf(c({submittedAt:'2026-11-01', deadline:'2026-11-10', result:'win', resultAt:T}), T), 'result');
});
test('stageOf: 마감일 모르면 자동 전환 없음', () => {
  assert.equal(stageOf(c({deadline:''}), T), 'todo');
  assert.equal(stageOf(c({deadline:'', submittedAt:T}), T), 'submitted');
});
test('stageOf: missed 카드에서 제출하면 바로 review', () => {
  assert.equal(stageOf(c({deadline:'2026-11-10', submittedAt:T}), T), 'review');
});
test('needsAttention: 발표일 지난 심사중, 3일 이내 마감 미제출', () => {
  assert.equal(needsAttention(c({submittedAt:'2026-11-01', deadline:'2026-11-05', resultDate:'2026-11-18'}), T), true);
  assert.equal(needsAttention(c({deadline:'2026-11-22'}), T), true);
  assert.equal(needsAttention(c({deadline:'2026-11-30'}), T), false);
});
test('mergeTracked: 같은 id는 더 진행된 쪽(result > submitted > todo), 나머지는 합집합', () => {
  const a = [c({id:'1', submittedAt:T}), c({id:'2'})];
  const b = [c({id:'1', submittedAt:T, result:'win', resultAt:T}), c({id:'3'})];
  const m = mergeTracked(a, b);
  assert.deepEqual(m.map(x=>x.id).sort(), ['1','2','3']);
  assert.equal(m.find(x=>x.id==='1').result, 'win');
});
test('refreshFromSource: 마감 연장 반영, 원본 없으면 그대로', () => {
  const card = c({id:'1', deadline:'2026-11-20'});
  assert.equal(refreshFromSource(card, {id:'1', deadline:'2026-11-27', resultDate:'2026-12-07'}).deadline, '2026-11-27');
  assert.equal(refreshFromSource(card, undefined), card);
});
test('makeCard: 공모전·채용 필드 복사', () => {
  const k = makeCard('job', {id:'j1', co:'수자원공사', role:'경력', link:'L', deadline:'2026-11-25', steps:['서류','면접']}, T);
  assert.deepEqual([k.kind,k.title,k.org,k.steps.length,k.submittedAt,k.addedAt], ['job','경력','수자원공사',2,null,T]);
});
test('sortPicker: 마감이 먼 순, 빈 마감 맨 뒤', () => {
  assert.deepEqual(sortPicker([{id:'a',deadline:'2026-11-20'},{id:'b',deadline:''},{id:'c',deadline:'2026-12-01'}]).map(x=>x.id), ['c','a','b']);
});
test('sortActive: 확인 필요 → 진행 중 → missed, result 제외 / sortRecords: resultAt 최신순', () => {
  const list = [c({id:'m', deadline:'2026-11-01'}), c({id:'n', deadline:'2026-11-30'}), c({id:'u', deadline:'2026-11-21'}), c({id:'r', submittedAt:T, result:'lose', resultAt:T})];
  assert.deepEqual(sortActive(list, T).map(x=>x.id), ['u','n','m']);
  assert.deepEqual(sortRecords([c({id:'a', submittedAt:T, result:'win', resultAt:'2026-11-01'}), c({id:'b', submittedAt:T, result:'lose', resultAt:'2026-11-10'})]).map(x=>x.id), ['b','a']);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/tracker_core.test.js`
Expected: FAIL (파일 없음)

- [ ] **Step 3: `static/tracker_core.js` 구현**

맨 아래에 `(typeof module !== 'undefined' && module.exports) ? module.exports = API : (window.CNHTracker = API)` 형태로 둘 다 내보낸다. 날짜는 모두 `'YYYY-MM-DD'` 문자열 비교로 처리한다(시간대 문제 회피). `stageOf` 규칙: `result` 있으면 result. `submittedAt` 있으면, 마감이 지났으면 review, 아니면 submitted. 그 외에는 마감이 지났으면 missed, 아니면 todo. `mergeTracked` 순위: result 3, submitted 2, todo 1. 동점이면 `a`쪽. 진행 중 정렬 키: [확인 필요 우선, missed 마지막, 그 안에서 deadline 오름차순, 빈 deadline 뒤].

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/tracker_core.test.js && python -m pytest -q tests/test_no_emoji.py`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add static/tracker_core.js tests/tracker_core.test.js
git commit -m "feat(my): 진행 추적 상태 계산·정렬·병합 로직(tracker_core) + 테스트"
```

---

### Task 3: 데이터 연결 + 저장/동기화

**Files:**
- Modify: `static/data_adapter.js` (공모전 객체 `deadline`, `resultDate` / 채용 객체 `deadline` 추가)
- Modify: `index.html` (tracked 저장소, Supabase 읽기·쓰기 확장, tracker_core 로드)
- Modify: `supabase/schema.sql` (열 추가 SQL 덧붙임)
- Modify: `sw.js` (캐시 목록에 `./static/tracker_core.js`, 캐시 버전 올림)

**Interfaces:**
- Consumes: Task 2의 `CNHTracker.mergeTracked`, `refreshFromSource`. 기존 `saved`, `savedUid`, `SB`, `writeSavedRemote()`, `pullSavedRemote()`, `notifySaved()`, `savedListeners`
- Produces (index.html 공용 스크립트 블록, 북마크 코드 바로 아래):
  - `let tracked = []`: 카드 배열, localStorage `cnh-tracked`에서 복원
  - `persistTracked()`: localStorage 저장 + `notifySaved()` + 300ms 뒤 `writeSavedRemote()`
  - `trackAdd(kind, item)`, `trackSubmit(id)`, `trackUnsubmit(id)`, `trackResult(id, 'win'|'lose')`, `trackUndoResult(id)`, `trackRemove(id)`: 모두 `persistTracked()` 호출
  - 화면용 데이터 객체: 공모전 `{..., deadline:'YYYY-MM-DD'|'', resultDate:'YYYY-MM-DD'|''}`, 채용 `{..., deadline:'YYYY-MM-DD'|''}`

- [ ] **Step 1: 데이터 객체 확장**

`data_adapter.js` 공모전 매핑 반환값에 `deadline: c.deadline_date || ''`, `resultDate: c.result_date || ''`, 채용 매핑에 `deadline: j.deadline_date || ''`를 넣는다.
Run: `node -e "global.window={};require('./static/data_adapter.js')"` 로 문법 확인.
Expected: 오류 없음

- [ ] **Step 2: 저장소와 동기화 확장**

`writeSavedRemote`의 upsert에 `tracked` 추가, `pullSavedRemote`는 `select('ids, tracked')` 후 `tracked = mergeTracked(tracked, remote.tracked||[])`. 합친 결과가 원격과 다르면(JSON 비교) 다시 쓴다. `<script src="./static/tracker_core.js?v=20261119">`는 `data_adapter.js` 다음, supabase-js 다음에 둔다.
`schema.sql` 끝에 덧붙일 내용:
```sql
alter table public.user_saved add column if not exists tracked jsonb not null default '[]'::jsonb;
```

- [ ] **Step 3: 사용자에게 SQL 실행 요청 후 원격 확인**

사용자가 Supabase SQL Editor에서 위 한 줄을 실행한다.
Run: `curl -s "https://eazksxmhtypedxaycrcg.supabase.co/rest/v1/user_saved?select=tracked&limit=1" -H "apikey: sb_publishable_UJokd3NMOFJcfWjNjNSXPg_urs5q3kN"`
Expected: `permission denied` (42501). `column ... does not exist`가 나오면 SQL이 실행되지 않은 것이다.

- [ ] **Step 4: 문법·테스트 확인**

Run: 인라인 `<script>` 블록을 각각 `node --check` (2026-11-19 세션에서 쓴 추출 스크립트와 같은 방식) + `node --test tests/tracker_core.test.js` + `python -m pytest -q tests`
Expected: 전부 OK / PASS

- [ ] **Step 5: 커밋**

```bash
git add static/data_adapter.js index.html supabase/schema.sql sw.js
git commit -m "feat(my): 진행 카드 저장(localStorage + Supabase tracked) 및 로그인 병합"
```

---

### Task 4: 마이페이지 화면 (PC + 모바일) + ＋ 팝업 + 삭제 확인창

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: Task 2 전체 API, Task 3 `tracked`, `track*` 함수, 화면용 `CONTESTS`·`JOBS`(+`deadline`), `saved`, `authBoxHtml()`, 기존 테마 전환 로직, `ICON` 객체, `toast()`
- Produces:
  - `myPageHtml() -> string`: 로그인 칸 + 테마 전환 + 진행 중인 도전(카드 + 점선 ＋ 칸) + 내 기록(수상·미선정 개수 요약 + 목록) + 북마크 목록. PC `#v-my`와 모바일 `views.my()`가 같이 쓴다. 클래스 접두사 `trk-`, 스코프 없는 CSS(`.cnh-auth`와 같은 방식)
  - `openPicker()`: 공용 모달 `#trk-modal`. 탭 `공모전`/`채용`/`북마크`, `sortPicker` 순서, 이미 추가된 항목은 `추가됨`(비활성), 추가 후에도 열린 채 유지
  - `askDelete(id)`: 공용 모달 `#trk-confirm`, 문구 `정말 삭제할까요?`, 버튼 `취소`/`삭제`
  - 클릭 위임 속성: `data-trk="add|submit|unsubmit|win|lose|undo|del"` + `data-id`, `data-trk-tab="contest|job|saved"`

- [ ] **Step 1: 진입 버튼 교체**

PC 헤더 `#theme` → `#my-btn`(사람 모양 SVG, `aria-label="마이페이지"`, 클릭 시 `go('my')`). `VIEWS`에 `'my'` 추가, `<section class="view" id="v-my" hidden>` 추가, `go('my')`일 때 `#v-my` 내용을 `myPageHtml()`로 다시 그린다. 모바일 하단 `#m-theme` → `#m-my`(라벨 `마이`) → 모바일 `my` 화면. `TITLES`에 `my:'마이페이지'` 추가. 기존 `#theme`·`#m-theme` 클릭 로직은 `toggleTheme()` 함수로 옮기고, 마이페이지 안 `data-theme-toggle` 버튼에서 호출한다.

- [ ] **Step 2: `myPageHtml()`과 카드 렌더**

각 카드에는 종류(공모전/채용), 제목(원문 링크), 기관, 상태 배지(`LABEL`), 4칸 진행 막대(missed는 막대 대신 회색 배지)를 넣는다. 보조 문구는 todo `D-n`, submitted `MM/DD 제출`, review `심사 n일째` + `발표 예정 MM/DD`가 있으면 표시, 발표일이 지났으면 `결과 나왔을 거예요. 확인해 보세요`. 채용 review는 `steps`를 `서류 → 면접` 형식으로 붙인다. 버튼은 todo·missed `제출했어요`, submitted `되돌리기`, review `수상·합격` `미선정` `되돌리기`(→ 미제출), 공통으로 휴지통 SVG(`aria-label="삭제"`)를 둔다. 내 기록 줄은 결과 배지(win `수상·합격` 강조색, lose `미선정` 회색)와 `되돌리기`(→ 심사중)를 둔다. 점선 ＋ 칸은 `<button data-trk="add" class="trk-add">`로 만들고, 가운데 + SVG와 `도전 추가` 문구를 넣는다. 그리기 전에 `tracked`의 각 카드를 `refreshFromSource(card, 현재 CONTESTS/JOBS에서 같은 id)`로 갱신하고, 바뀐 게 있으면 `persistTracked()`를 호출한다.

- [ ] **Step 3: 팝업·확인창**

`#trk-modal`과 `#trk-confirm`은 `</body>` 직전에 한 번만 둔다. Esc와 배경 클릭으로 닫히고, 열면 첫 버튼에 포커스를 준다(`role="dialog" aria-modal="true"`). 북마크 탭은 `saved`에 있는 id 중 CONTESTS·JOBS에 있는 것만 보여 준다. 비어 있으면 `북마크한 공모전·채용이 없어요`를 띄운다. 공모전·채용 탭은 `end >= 0`인 항목만 보여 준다.

- [ ] **Step 4: 변경 알림 연결**

`savedListeners`에 마이페이지 다시 그리기를 추가한다. PC는 `#v-my`가 보일 때, 모바일은 `tab === 'my'`일 때만 그린다.

- [ ] **Step 5: 브라우저 확인**

Run: `python -m http.server 8765` 후 `http://localhost:8765/#my`를 PC 폭(1280)과 모바일 폭(390)으로 연다.
Expected:
1. 헤더·하단 탭에 마이페이지 진입 버튼이 있고 테마 버튼은 없다. 마이페이지 안에서 테마가 바뀐다.
2. ＋ → 팝업, 공모전 탭이 마감이 먼 순, 추가 후 `추가됨`, 카드가 `미제출`로 생긴다.
3. `제출했어요` → `제출완료`. 콘솔에서 `tracked[0].deadline='2026-01-01'; persistTracked()` → `심사중`, `수상·합격` → 카드가 내 기록으로 이동하고 요약 개수 +1, `되돌리기` → 심사중으로 복귀.
4. 휴지통 → `정말 삭제할까요?` → `취소`는 유지, `삭제`는 제거.
5. 콘솔 오류 0건, 화면에 이모지 0개.

- [ ] **Step 6: 전체 테스트 + 커밋**

Run: `node --test tests/tracker_core.test.js && python -m pytest -q tests`
Expected: 전부 PASS
```bash
git add index.html
git commit -m "feat(my): 마이페이지(진행 중인 도전·내 기록·북마크·테마), 도전 추가 팝업, 삭제 확인창"
```

---

### Task 5: 배포와 실사용 확인

**Files:** 없음 (확인만)

- [ ] **Step 1: 사용자에게 push 승인 받기 ("푸쉬해")** 후 `git push`
- [ ] **Step 2: Vercel 반영 확인**

Run: `curl -s https://civil-news-hub.vercel.app/static/tracker_core.js -o /dev/null -w "%{http_code}"`
Expected: `200`

- [ ] **Step 3: 사용자 실기기 확인 요청**

로그인 상태에서 PC로 카드를 추가하고 제출한 뒤, 모바일 마이페이지에서 같은 상태가 보이는지 사용자가 확인한다.

- [ ] **Step 4: 다음 정시 수집 후 `result_date` 확인**

Run: `ssh jcloud 'cd /home/ubuntu/workspace && python3 -c "import json;cs=json.load(open(\"data/contests.json\"))[\"contests\"];print(sum(1 for c in cs if c.get(\"result_date\")),\"/\",len(cs))"'`
Expected: 숫자 출력. Task 1 Step 5 결과와 함께 사용자에게 보고한다.
