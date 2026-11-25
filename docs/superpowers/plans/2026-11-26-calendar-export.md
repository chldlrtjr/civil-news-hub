# 마감일 캘린더에 넣기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공모전·채용 상세에 "마감일 캘린더에 넣기: [Google 캘린더] [다른 캘린더 (.ics)]" 한 줄을 둬서 마감일을 개인 캘린더에 넣게 해요.

**Architecture:** 일정 글자(.ics 본문, Google 링크)를 만드는 순수 함수 3개를 `static/v2_core.js`에 두고 node 테스트로 검사해요. `static/v2_pages.js`의 `detailHtml`이 버튼 줄을 그리고, 문서 클릭 처리기가 .ics 파일을 브라우저에서 만들어 내려받게 해요. 서버·새 의존성 없음.

**Tech Stack:** 순수 브라우저 JS(빌드 없음), `node --test`, Vercel 정적 배포.

**Spec:** `docs/superpowers/specs/2026-11-26-calendar-export-design.md`

## Global Constraints

- 사이트에 이모지 금지 (`tests/test_no_emoji.py`가 `*.html`, `static/**/*.js` 검사). 글자 + 기존 SVG 아이콘만.
- PC(`#v2pc`)와 모바일(`#v2m`)은 별도 화면: 한쪽 전용 스타일은 그 범위 선택자 안에만.
- 마감일이 `YYYY-MM-DD`이고 오늘(`V2.today`) 이후(오늘 포함)일 때만 줄을 보여요. 대상은 `contest`, `job`만.
- 하루 종일 일정, 날짜 = 마감일. 제목 `[마감] 공고 제목`(채용은 `[마감] 직무명 (기관)`). 설명 = 주최/기관, 원문 링크(`^https?://`일 때만), `토목 뉴스 브리핑에서 추가`.
- .ics UID `<kind>-<id>@civil-news-hub.vercel.app`, 알림 2개: 마감 3일 전 09:00(`TRIGGER:-PT63H`), 1일 전 09:00(`TRIGGER:-PT15H`).
- .ics는 RFC 5545: 줄 끝 CRLF, 한 줄 75바이트(UTF-8) 넘으면 CRLF+공백으로 접기(글자 중간에서 자르지 않기), TEXT 값의 `\` `;` `,` 줄바꿈 이스케이프.
- 아무것도 저장·전송하지 않아요. Google 링크는 `target="_blank" rel="noopener noreferrer"`.

## Review Focus

- 12월 31일 마감: 끝 날짜가 다음 해 1월 1일이어야 해요 (Task 1 `calNextDay` 테스트).
- 제목에 `,` `;` `\` 나 줄바꿈이 든 공고: .ics가 깨지지 않고 Google 링크도 원래 글자로 돌아와야 해요 (Task 1 이스케이프·인코딩 테스트).
- 긴 한글 제목(75바이트 초과): 접은 줄마다 75바이트 이하, 펼치면 원문과 같고 한글이 깨지지 않아야 해요 (Task 1 접기 테스트).
- 링크가 `javascript:`나 상대 주소인 공고: 설명·URL에 넣지 않아야 해요 (Task 1 테스트).
- 오늘 마감(D-DAY)은 줄이 보이고, 어제 마감·상시 모집은 안 보여야 해요 (Task 1 `calEvent` 테스트).

---

### Task 1: 일정 글자 만들기 (순수 함수)

**Files:**
- Modify: `static/v2_core.js` (함수 추가 + `API` 객체에 export)
- Test: `tests/v2_core.test.js` (끝에 추가)

**Interfaces:**
- Produces (모두 `CNHv2.*` / `require('../static/v2_core.js')`):
  - `calEvent(kind: string, item: object, today: 'YYYY-MM-DD') -> { uid, date, title, details, link } | null`
    - `date`는 마감일 그대로, `link`는 `^https?://`면 그 주소 아니면 `''`, `details`는 `\n`으로 이은 한 문자열.
    - contest: 제목 `item.title`, 주최 `item.org`. job: 제목 `item.role`, 기관 `item.co`.
  - `calIcs(ev, stamp: string /* 'YYYYMMDDTHHMMSSZ' */) -> string` (.ics 전체 본문, CRLF)
  - `calGoogleUrl(ev) -> string`
  - 내부 도우미 `calNextDay('YYYY-MM-DD') -> 'YYYYMMDD'`도 테스트용으로 export.

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/v2_core.test.js` 끝)

```js
const C = { id: 7, title: '제5회 도로 설계, 공모전; A\\B', org: '한국도로학회', link: 'https://ex.com/a', deadline: '2026-12-31' };
const J = { id: 'j1', role: '토목직 신입', co: '한국도로공사', link: 'javascript:alert(1)', deadline: '2026-11-26' };

test('calEvent: 마감일이 오늘 이후인 공모전·채용만, 제목·설명·UID', () => {
  const e = V.calEvent('contest', C, '2026-11-26');
  assert.equal(e.uid, 'contest-7@civil-news-hub.vercel.app');
  assert.equal(e.date, '2026-12-31');
  assert.equal(e.title, '[마감] 제5회 도로 설계, 공모전; A\\B');
  assert.equal(e.details, '한국도로학회\nhttps://ex.com/a\n토목 뉴스 브리핑에서 추가');
  const j = V.calEvent('job', J, '2026-11-26');          // 오늘 마감도 보여요
  assert.equal(j.title, '[마감] 토목직 신입 (한국도로공사)');
  assert.equal(j.link, '');                               // javascript: 는 빼요
  assert.equal(j.details, '한국도로공사\n토목 뉴스 브리핑에서 추가');
  assert.equal(V.calEvent('job', J, '2026-11-27'), null); // 지난 마감
  assert.equal(V.calEvent('contest', { ...C, deadline: '상시모집' }, '2026-11-26'), null);
  assert.equal(V.calEvent('contest', { ...C, deadline: '' }, '2026-11-26'), null);
  assert.equal(V.calEvent('alba', { ...C }, '2026-11-26'), null);
});

test('calNextDay: 월·해 넘김', () => {
  assert.equal(V.calNextDay('2026-12-31'), '20270101');
  assert.equal(V.calNextDay('2028-02-28'), '20280229');
});

test('calIcs: RFC 5545 하루 종일 일정 + 알림 2개, CRLF, 이스케이프', () => {
  const s = V.calIcs(V.calEvent('contest', C, '2026-11-26'), '20261126T000000Z');
  assert.ok(s.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(s));                          // 맨 \n 없음
  const un = s.replace(/\r\n /g, '');                      // 접은 줄 펼치기
  for (const l of ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:contest-7@civil-news-hub.vercel.app',
    'DTSTAMP:20261126T000000Z', 'DTSTART;VALUE=DATE:20261231', 'DTEND;VALUE=DATE:20270101',
    'SUMMARY:[마감] 제5회 도로 설계\\, 공모전\\; A\\\\B', 'DESCRIPTION:한국도로학회\\nhttps://ex.com/a\\n토목 뉴스 브리핑에서 추가',
    'URL:https://ex.com/a', 'TRIGGER:-PT63H', 'TRIGGER:-PT15H', 'END:VEVENT', 'END:VCALENDAR'])
    assert.ok(un.split('\r\n').includes(l), l);
  assert.equal((un.match(/BEGIN:VALARM/g) || []).length, 2);
  // 링크 없는 채용 일정에는 URL 줄이 없어요
  assert.ok(!V.calIcs(V.calEvent('job', J, '2026-11-26'), '20261126T000000Z').includes('URL:'));
});

test('calIcs: 75바이트 접기, 한글을 자르지 않고 펼치면 원문', () => {
  const long = { ...C, title: '가'.repeat(80) };
  const s = V.calIcs(V.calEvent('contest', long, '2026-11-26'), '20261126T000000Z');
  for (const line of s.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.ok(s.replace(/\r\n /g, '').includes('SUMMARY:[마감] ' + '가'.repeat(80)));
});

test('calGoogleUrl: 일정 입력 화면 링크, 글자 그대로 되돌아옴', () => {
  const e = V.calEvent('contest', C, '2026-11-26');
  const u = V.calGoogleUrl(e);
  assert.ok(u.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&'));
  const q = new URL(u).searchParams;
  assert.equal(q.get('text'), e.title);
  assert.equal(q.get('dates'), '20261231/20270101');
  assert.equal(q.get('details'), e.details);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/v2_core.test.js`
Expected: 새 테스트 5개가 `V.calEvent is not a function` 등으로 FAIL, 기존 33개 PASS

- [ ] **Step 3: `static/v2_core.js`에 구현하고 `API`에 `calEvent, calIcs, calGoogleUrl, calNextDay` 추가**

- `calNextDay`: `Date.UTC`로 하루 더해 `toISOString().slice(0,10).replace(/-/g,'')` (시간대 영향 없게).
- 이스케이프(`calIcs` 내부): `\`→`\\` 먼저, 그다음 `;` `,` → `\;` `\,`, `\n` → `\\n`.
- 줄 접기(`calIcs` 내부)는 바이트 단위라 알고리즘을 정해 둬요:

```js
// 75바이트(UTF-8)를 넘으면 CRLF+공백으로 접어요. 이어지는 줄은 앞 공백 1바이트를 빼고 74바이트. 글자 단위로 자르니 한글이 깨지지 않아요
const fold = (line) => {
  const out = []; let cur = '', size = 0, max = 75;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (size + b > max) { out.push(cur); cur = ''; size = 0; max = 74; }
    cur += ch; size += b;
  }
  out.push(cur);
  return out.join('\r\n ');
};
```

- 본문 줄 순서: `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//civil-news-hub//ko`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, `BEGIN:VEVENT`, `UID`, `DTSTAMP`, `DTSTART;VALUE=DATE`, `DTEND;VALUE=DATE`(다음 날), `SUMMARY`, `DESCRIPTION`, (`link`가 있을 때만) `URL`, VALARM 2개(각각 `BEGIN:VALARM`, `ACTION:DISPLAY`, `DESCRIPTION:` + 이스케이프한 제목, `TRIGGER:-PT63H` / `-PT15H`, `END:VALARM`), `END:VEVENT`, `END:VCALENDAR`. 각 줄 `fold` 후 `\r\n`으로 잇고 끝에도 `\r\n`.
- `calGoogleUrl`: `'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) + '&dates=' + 시작 + '/' + 끝 + '&details=' + encodeURIComponent(details)` (`dates`의 `/`는 그대로 둬요).

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/*.test.js`
Expected: `tests 80`, `pass 80`, `fail 0`

- [ ] **Step 5: 커밋**

```bash
git add static/v2_core.js tests/v2_core.test.js docs/superpowers/specs/2026-11-26-calendar-export-design.md docs/superpowers/plans/2026-11-26-calendar-export.md
git commit -m "feat(calendar): 마감일 .ics·Google 캘린더 일정 글자 만들기"
```

---

### Task 2: 상세 화면 버튼 줄과 내려받기

**Files:**
- Modify: `static/v2_pages.js` (`detailHtml` 끝의 `acts` 다음, 문서 클릭 처리기 `document.addEventListener('click', …)`)
- Modify: `index.html` (CSS: `.dt-acts` 줄 근처 298행, 모바일 `#v2m .dt-acts .btn{flex:1}` 근처 435행; `v2_core.js`·`v2_pages.js` 스크립트 `?v=` 값을 `20261126`으로)
- Modify: `README.md` "주요 기능" 공모전 항목에 한 구절: 마감일을 Google 캘린더나 .ics로 캘린더에 넣을 수 있어요.

**Interfaces:**
- Consumes: `CNHv2.calEvent`, `CNHv2.calIcs`, `CNHv2.calGoogleUrl` (Task 1), 기존 `findItem('kind:id') -> {kind, item}`, `esc`, `V2.today`.

- [ ] **Step 1: `detailHtml`에 줄 추가**

`kind === 'contest' || kind === 'job'`일 때 `const ev = CNHv2.calEvent(kind, x, t)`가 있으면 `dt-acts` 바로 다음에:

```html
<div class="dt-cal"><span>마감일 캘린더에 넣기</span>
  <a class="btn sm" href="{esc(calGoogleUrl(ev))}" target="_blank" rel="noopener noreferrer">Google 캘린더</a>
  <button type="button" class="btn sm" data-ics="{kind}:{esc(x.id)}">다른 캘린더 (.ics)</button></div>
```

- [ ] **Step 2: 클릭 처리기에 `[data-ics]` 추가** (`[data-track]` 처리 바로 아래)

`findItem(dataset.ics)` → `calEvent(f.kind, f.item, V2.today)` → `calIcs(ev, new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z')`를 `Blob([...], {type:'text/calendar;charset=utf-8'})`로 만들어 임시 `<a download>`로 내려받고 `URL.revokeObjectURL`은 `setTimeout` 1초 뒤. 파일 이름 `마감일-<kind>-<id>.ics`.

- [ ] **Step 3: CSS**

`.dt-cal{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px}` `.dt-cal>span{font-size:14px;color:var(--muted)}` 그리고 모바일만 `#v2m .dt-cal>span{flex-basis:100%}` `#v2m .dt-cal .btn{flex:1}`.

- [ ] **Step 4: 자동 검사**

Run: `node --test tests/*.test.js` → `pass 80, fail 0`
Run: `python -m pytest -q tests` → `126 passed, 1 skipped` (이모지 검사 포함)

- [ ] **Step 5: 화면 확인 (로컬)**

Run: `python -m http.server 8000 --bind 127.0.0.1` 후 Chrome에서 `http://localhost:8000/#contests`
- PC 폭 1280: 마감일 있는 공모전 상세에 줄이 보이고, "상시"·마감 지난 공고에는 없음. Google 버튼이 새 탭에서 일정 입력 화면(제목·날짜 채워짐)을 엶. ".ics" 버튼이 파일을 내려받고, 파일을 열면 마감일 하루 종일 일정.
- 모바일 폭 390: 아래 시트 안에서 안내 글자가 한 줄, 버튼 두 개가 반씩. 가로 스크롤 없음.
- 개발자 도구 콘솔에 CSP 위반 없음.
- 같은 확인을 `#jobs`에서도.

- [ ] **Step 6: 커밋**

```bash
git add static/v2_pages.js index.html README.md
git commit -m "feat(calendar): 공모전·채용 상세에 마감일 캘린더에 넣기 버튼"
```

---

### Task 3: 배포와 실제 휴대폰 확인

- [ ] **Step 1: 사용자에게 push 승인 받기** (한 번 승인 = GitHub + jcloud 배포). 승인 뒤 `git fetch` → `git rebase origin/main`(매시 데이터 커밋) → `git push origin main`.
- [ ] **Step 2: 배포 확인**: `gh run list --workflow tests.yml --limit 1`이 success, `curl -s https://civil-news-hub.vercel.app/static/v2_core.js | grep -c calIcs` ≥ 1, `ssh jcloud 'cd ~/workspace && git log --oneline -1 && tail -2 auto_deploy.log'`.
- [ ] **Step 3: 사용자 휴대폰 확인 요청**: 공모전 상세에서 두 버튼을 눌러 마감일 날짜로 들어가는지. 아이폰 Safari에서 .ics가 "캘린더에 추가" 화면 대신 파일 저장으로만 끝나면, 아이폰일 때 `download` 속성 없이 blob 주소로 이동(`location.href = url`)하도록 바꾸고 Task 1 테스트를 다시 돌린 뒤 재배포.
