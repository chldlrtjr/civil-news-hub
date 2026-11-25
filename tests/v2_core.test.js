const test = require('node:test');
const assert = require('node:assert/strict');
const { makeCard } = require('../static/tracker_core.js');
const V = require('../static/v2_core.js');

const T = '2026-11-23';
const pick = (items) => items.map(({ id, what, date, label }) => ({ id, what, date, label }));

test('ddayLabel: 오늘이면 D-DAY, 아니면 D-남은 일수', () => {
  assert.equal(V.ddayLabel('2026-11-23', T), 'D-DAY');
  assert.equal(V.ddayLabel('2026-11-28', T), 'D-5');
});

test('dateLabel: MM.DD', () => {
  assert.equal(V.dateLabel('2026-12-02'), '12.02');
});

test('scheduleItems: 미제출 진행 카드는 마감일로 나와요', () => {
  const card = makeCard('contest', { id: 'c1', title: 'A', deadline: '2026-11-28' }, T);
  const out = V.scheduleItems({ saved: [], tracked: [card], contests: [], jobs: [], albas: [] }, T);
  assert.deepEqual(pick(out), [{ id: 'c1', what: 'deadline', date: '2026-11-28', label: 'D-5' }]);
});

test('scheduleItems: 제출 후 마감이 지난 카드는 결과 발표일로 나와요', () => {
  const card = { ...makeCard('contest', { id: 'c2', title: 'B', deadline: '2026-11-10', resultDate: '2026-12-02' }, T), submittedAt: '2026-11-05' };
  const out = V.scheduleItems({ saved: [], tracked: [card], contests: [], jobs: [], albas: [] }, T);
  assert.deepEqual(pick(out), [{ id: 'c2', what: 'result', date: '2026-12-02', label: '12.02' }]);
});

test('scheduleItems: 결과 나온 카드, 마감 지난 미제출, 삭제 표시 카드는 빠져요', () => {
  const done = { ...makeCard('contest', { id: 'd1', title: 'x', deadline: '2026-11-28' }, T), submittedAt: '2026-11-20', result: 'win', resultAt: T };
  const missed = makeCard('contest', { id: 'd2', title: 'x', deadline: '2026-11-22' }, T);
  const deleted = { id: 'd3', deleted: true, updatedAt: T };
  const out = V.scheduleItems({ saved: [], tracked: [done, missed, deleted], contests: [], jobs: [], albas: [] }, T);
  assert.deepEqual(out, []);
});

test('scheduleItems: 북마크한 채용은 데이터에서 찾아 제목·기관·D-day로 나와요', () => {
  const out = V.scheduleItems({ saved: ['j1'], tracked: [], contests: [], jobs: [{ id: 'j1', role: 'R', co: 'K', deadline: '2026-11-23' }], albas: [] }, T);
  assert.equal(out.length, 1);
  assert.deepEqual({ id: out[0].id, kind: out[0].kind, title: out[0].title, org: out[0].org, label: out[0].label }, { id: 'j1', kind: 'job', title: 'R', org: 'K', label: 'D-DAY' });
});

test('scheduleItems: 데이터에서 사라진 북마크는 조용히 빠지고, 진행 카드와 겹치면 한 번만 나와요', () => {
  const card = makeCard('contest', { id: 'c1', title: '카드 제목', deadline: '2026-11-28' }, T);
  const out = V.scheduleItems({ saved: ['gone', 'c1'], tracked: [card], contests: [{ id: 'c1', title: '데이터 제목', org: 'O', deadline: '2026-11-28' }], jobs: [], albas: [] }, T);
  assert.deepEqual(out.map(x => [x.id, x.title]), [['c1', '카드 제목']]);
});

test('scheduleItems: 날짜가 비었거나 지난 북마크는 빠져요', () => {
  const out = V.scheduleItems({ saved: ['a', 'b', 'c'], tracked: [], contests: [{ id: 'a', title: 'A', org: 'O', deadline: '' }, { id: 'b', title: 'B', org: 'O', deadline: '2026-11-22' }], jobs: [], albas: [{ id: 'c', title: 'C', where: 'W', deadline_date: '2026-11-30' }] }, T);
  assert.deepEqual(out.map(x => [x.id, x.kind, x.org]), [['c', 'alba', 'W']]);
});

test('scheduleItems: 날짜 오름차순, 같은 날이면 제목 오름차순', () => {
  const contests = [{ id: '1', title: '나', org: 'O', deadline: '2026-11-30' }, { id: '2', title: '가', org: 'O', deadline: '2026-11-30' }, { id: '3', title: '다', org: 'O', deadline: '2026-11-25' }];
  const out = V.scheduleItems({ saved: ['1', '2', '3'], tracked: [], contests, jobs: [], albas: [] }, T);
  assert.deepEqual(out.map(x => x.id), ['3', '2', '1']);
});

test('urgentFallback: 오늘 이후 마감 중 가까운 3개, 지난 것과 날짜 없는 것은 빼요', () => {
  const contests = [
    { id: 'p', title: 'past', org: 'O', deadline: '2026-11-22' },
    { id: 'n', title: 'none', org: 'O', deadline: '' },
    { id: 'c1', title: 'c1', org: 'O', deadline: '2026-11-30' },
    { id: 'c2', title: 'c2', org: 'O', deadline: '2026-11-24' },
  ];
  const jobs = [{ id: 'j1', role: 'j1', co: 'K', deadline: '2026-11-23' }, { id: 'j2', role: 'j2', co: 'K', deadline: '2026-12-10' }];
  const out = V.urgentFallback({ contests, jobs }, T);
  assert.deepEqual(out.map(x => [x.id, x.kind, x.what]), [['j1', 'job', 'deadline'], ['c2', 'contest', 'deadline'], ['c1', 'contest', 'deadline']]);
});

// ---- Task 2: 관심 분야 · 새 소식 · 저장값 읽기 · 화면 선택 ----
const SRC = {
  news: [{ id: 'n1', cat: 'road', src: '뉴스핌', title: 'N1' }, { id: 'n2', cat: 'water', src: 'A', title: 'N2' }, { id: 'n3', cat: 'road', src: 'B', title: 'N3' }],
  contests: [
    { id: 'c1', category: '토목', title: 'C1', org: 'O', startDate: '2026-11-01', deadline: '2026-11-28' },
    { id: 'c2', category: '토목', title: 'C2', org: 'O2', startDate: '2026-11-10', deadline: '' },
    { id: 'c3', category: '전북대', title: 'C3', org: 'O', startDate: '2026-11-20', deadline: '2026-11-30' },
  ],
  jobs: [{ id: 'j1', grp: 'public', role: 'J1', co: 'K1', period: '2026.11.09 ~ 2026.11.23' }, { id: 'j2', grp: 'public', role: 'J2', co: 'K2', period: '' }, { id: 'j3', grp: 'major', role: 'J3', co: 'K3', period: '2026.11.12 ~ 2026.11.27' }],
};
const ALL = { news: ['road'], contests: ['토목'], jobs: ['public'] };

test('INTEREST_GROUPS: 세 묶음과 값', () => {
  assert.deepEqual(V.INTEREST_GROUPS.map(g => [g.key, g.options.map(o => o[0])]), [
    ['news', ['general', 'road', 'water', 'tunnel', 'smart']],
    ['contests', ['토목', '전북대', '컴퓨터공학']],
    ['jobs', ['public', 'major', 'design']],
  ]);
});

test('hasInterests: 하나라도 고르면 true', () => {
  assert.equal(V.hasInterests({ news: [], contests: [], jobs: [] }), false);
  assert.equal(V.hasInterests({ news: [], contests: ['토목'], jobs: [] }), true);
});

test('freshItems: 고른 분야만, 종류마다 최신순으로 news→contest→job 번갈아 뽑아요', () => {
  const out = V.freshItems(SRC, ALL, [], T, 6);
  assert.deepEqual(out.map(x => x.id), ['n1', 'c2', 'j1', 'n3', 'c1', 'j2']);
  assert.deepEqual(out.slice(0, 3).map(x => [x.kind, x.title, x.meta, x.badge]), [['news', 'N1', '뉴스핌', '새 기사'], ['contest', 'C2', 'O2', '새 공고'], ['job', 'J1', 'K1', '새 공고']]);
  assert.equal(out[4].meta, 'D-5');
});

test('freshItems: 빈 묶음의 종류는 하나도 나오지 않아요', () => {
  const out = V.freshItems(SRC, { news: [], contests: ['전북대'], jobs: [] }, [], T, 3);
  assert.deepEqual(out.map(x => x.id), ['c3']);
});

test('freshItems: 본 항목은 빠지고, 다 봤으면 예전 항목을 다시 채우지 않아요', () => {
  assert.deepEqual(V.freshItems(SRC, ALL, ['n1', 'c2'], T, 3).map(x => x.id), ['n3', 'c1', 'j1']);
  assert.deepEqual(V.freshItems(SRC, ALL, ['n1', 'n3', 'c1', 'c2', 'j1', 'j2'], T, 3), []);
});

test('rememberSeen: 끝에 붙이고 중복은 뒤로, 최대 개수 유지', () => {
  assert.deepEqual(V.rememberSeen(['a', 'b'], ['b', 'c'], 3), ['a', 'b', 'c']);
  assert.deepEqual(V.rememberSeen(['a', 'b', 'c'], ['d'], 3), ['b', 'c', 'd']);
});

test('readJSON: 정상값, 저장소 오류, 깨진 JSON, 형식이 다른 값', () => {
  const st = (v) => ({ getItem: () => v });
  assert.deepEqual(V.readJSON(st('["x"]'), 'k', []), ['x']);
  assert.deepEqual(V.readJSON({ getItem: () => { throw new Error('blocked'); } }, 'k', []), []);
  assert.deepEqual(V.readJSON(st('{oops'), 'k', []), []);
  assert.deepEqual(V.readJSON(st('{"a":1}'), 'k', []), []);
  assert.deepEqual(V.readJSON(st(null), 'k', { news: [] }), { news: [] });
});

test('isPhone: 기기와 창 너비 규칙', () => {
  const pc = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130';
  const P = (o) => V.isPhone({ ua: pc, platform: 'Win32', maxTouchPoints: 0, width: 1440, ...o });
  assert.equal(P({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }), true);
  assert.equal(P({ ua: 'Mozilla/5.0 (iPad; CPU OS 17_0)', width: 500 }), false);
  assert.equal(P({ ua: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5, width: 500 }), false);
  assert.equal(P({ ua: 'Mozilla/5.0 (Linux; Android 14) Mobile' }), true);
  assert.equal(P({ ua: 'Mozilla/5.0 (Linux; Android 14)', width: 500 }), false);
  assert.equal(P({ width: 600 }), true);
  assert.equal(P({ width: 601 }), false);
});

// ---- 최종 검토 수정 ----
test('freshItems: 마감이 지난 공모전은 새 소식에 나오지 않아요 (음수 D-day 방지)', () => {
  const src = { news: [], contests: [{ id: 'old', category: '토목', title: 'OLD', org: 'O', startDate: '2026-11-20', deadline: '2026-11-21' }, { id: 'ok', category: '토목', title: 'OK', org: 'O', startDate: '2026-11-01', deadline: '2026-11-30' }], jobs: [] };
  assert.deepEqual(V.freshItems(src, { news: [], contests: ['토목'], jobs: [] }, [], T, 3).map(x => [x.id, x.meta]), [['ok', 'D-7']]);
});

test('scheduleItems·urgentFallback: 날짜 형식이 아닌 마감일(상시모집 등)은 빼요', () => {
  const albas = [{ id: 'a', title: 'A', where: 'W', deadline_date: '상시모집' }];
  const contests = [{ id: 'c', title: 'C', org: 'O', deadline: '상시' }];
  assert.deepEqual(V.scheduleItems({ saved: ['a', 'c'], tracked: [], contests, jobs: [], albas }, T), []);
  assert.deepEqual(V.urgentFallback({ contests, jobs: [] }, T), []);
});

test('scheduleItems: 진행 카드는 최신 수집 데이터의 날짜로 고쳐서 계산해요 (마감 연장)', () => {
  const card = makeCard('contest', { id: 'c1', title: 'A', deadline: '2026-11-20' }, '2026-11-10');
  const out = V.scheduleItems({ saved: [], tracked: [card], contests: [{ id: 'c1', title: 'A', org: 'O', deadline: '2026-11-30' }], jobs: [], albas: [] }, T);
  assert.deepEqual(pick(out), [{ id: 'c1', what: 'deadline', date: '2026-11-30', label: 'D-7' }]);
});

// ---- PC 사이드 달력 ----
test('monthGrid: 일요일부터 시작하는 주 단위 칸, 다른 달 칸은 빈 문자열', () => {
  const nov = V.monthGrid('2026-11');
  assert.equal(nov.length, 5);
  assert.deepEqual(nov[0], ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
  assert.deepEqual(nov[4], ['2026-11-29', '2026-11-30', '', '', '', '', '']);
  const dec = V.monthGrid('2026-12');
  assert.deepEqual(dec[0].slice(0, 3), ['', '', '2026-12-01']);
  assert.equal(dec.at(-1).filter(Boolean).at(-1), '2026-12-31');
  assert.equal(V.monthGrid('2026-02').length, 4);
});

test('shiftMonth: 해가 바뀌는 달 이동', () => {
  assert.equal(V.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(V.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(V.shiftMonth('2026-11', 0), '2026-11');
});

test('weekdayOf: 날짜의 요일 한 글자', () => {
  assert.equal(V.weekdayOf('2026-11-23'), '월');
  assert.equal(V.weekdayOf('2026-11-01'), '일');
});

// ---- 2·3단계: 탭 목록 ----
const ids = (l) => l.map((x) => x.id);

test('ddayOf: 지난 마감은 "마감", 날짜가 아닌 마감은 "상시"', () => {
  assert.equal(V.ddayOf('2026-11-23', T), 'D-DAY');
  assert.equal(V.ddayOf('2026-11-30', T), 'D-7');
  assert.equal(V.ddayOf('2026-11-20', T), '마감');
  assert.equal(V.ddayOf('', T), '상시');
  assert.equal(V.ddayOf('상시모집', T), '상시');
});

test('contestList: 지난 공모전은 빼고 분야로 거르고 마감순(상시는 맨 뒤), 최신순도 가능', () => {
  const list = [
    { id: 'a', category: '토목', deadline: '2026-12-10', startDate: '2026-11-01' },
    { id: 'b', category: '컴퓨터공학', deadline: '2026-11-25', startDate: '2026-11-20' },
    { id: 'c', category: '토목', deadline: '', startDate: '2026-11-10' },
    { id: 'd', category: '토목', deadline: '2026-11-22', startDate: '2026-11-21' },
    { id: 'e', category: '토목', deadline: '2026-11-24', startDate: '2026-10-01' },
  ];
  assert.deepEqual(ids(V.contestList(list, {}, T)), ['e', 'b', 'a', 'c']);
  assert.deepEqual(ids(V.contestList(list, { cat: '토목' }, T)), ['e', 'a', 'c']);
  assert.deepEqual(ids(V.contestList(list, { cat: '토목', sort: 'new' }, T)), ['c', 'a', 'e']);
});

test('jobList: 채용 형태는 포함 관계("신입·경력"은 신입과 경력 양쪽), 기관 구분, 지난 공고 제외', () => {
  const list = [
    { id: 'a', lvl: '신입·경력', grp: 'public', deadline: '2026-11-30' },
    { id: 'b', lvl: '인턴', grp: 'major', deadline: '2026-11-24' },
    { id: 'c', lvl: '경력', grp: 'public', deadline: '2026-11-20' },
    { id: 'd', lvl: '경력', grp: 'design', deadline: '2026-11-26' },
  ];
  assert.deepEqual(ids(V.jobList(list, {}, T)), ['b', 'd', 'a']);
  assert.deepEqual(ids(V.jobList(list, { lvl: '신입' }, T)), ['a']);
  assert.deepEqual(ids(V.jobList(list, { lvl: '경력' }, T)), ['d', 'a']);
  assert.deepEqual(ids(V.jobList(list, { org: 'public' }, T)), ['a']);
});

test('albaList·newsList: 알바는 열린 것만 마감순, 뉴스는 분야로', () => {
  const albas = [{ id: 'a', deadline_date: '2026-12-01' }, { id: 'b', deadline_date: '2026-11-01' }, { id: 'c', deadline_date: '2026-11-25' }, { id: 'd', deadline_date: '' }];
  assert.deepEqual(ids(V.albaList(albas, T)), ['c', 'a', 'd']);
  const news = [{ id: 'n1', cat: 'road' }, { id: 'n2', cat: 'water' }, { id: 'n3', cat: 'road' }];
  assert.deepEqual(ids(V.newsList(news, 'road')), ['n1', 'n3']);
  assert.deepEqual(ids(V.newsList(news, 'all')), ['n1', 'n2', 'n3']);
});

test('countBy: 필터 칩 옆 개수', () => {
  assert.deepEqual(V.countBy([{ c: 'x' }, { c: 'y' }, { c: 'x' }], (x) => x.c), { x: 2, y: 1 });
});

test('searchAll: 대소문자 무시, 제목·기관·언론사에서 찾고 지난 공고는 빼요. 빈 검색어는 null', () => {
  const src = {
    news: [{ id: 'n1', title: '철도 BIM 도입', src: '건설신문' }, { id: 'n2', title: '항만', src: '철도일보' }],
    contests: [{ id: 'c1', title: 'bim 공모전', org: 'O', deadline: '2026-12-01' }, { id: 'c2', title: 'BIM 지난', org: 'O', deadline: '2026-11-01' }],
    jobs: [{ id: 'j1', role: '토목직', co: 'BIM 엔지니어링', deadline: '2026-12-01' }],
    albas: [{ id: 'a1', title: '과외', where: '학원', deadline_date: '2026-12-01' }],
  };
  const r = V.searchAll(src, ' Bim ', T);
  assert.deepEqual([ids(r.news), ids(r.contests), ids(r.jobs), ids(r.albas)], [['n1'], ['c1'], ['j1'], []]);
  assert.deepEqual(ids(V.searchAll(src, '철도', T).news), ['n1', 'n2']);
  assert.equal(V.searchAll(src, '  ', T), null);
});

test('savedList: 북마크 id를 종류별 항목으로, 최근에 저장한 것부터, 사라진 공고는 빼요', () => {
  const src = { news: [{ id: 'n1' }], contests: [{ id: 'c1' }], jobs: [{ id: 'j1' }], albas: [{ id: 'a1' }], sw: [{ id: 's1' }] };
  assert.deepEqual(V.savedList(['c1', 'gone', 'n1', 'j1', 'a1', 's1'], src).map((x) => [x.kind, x.item.id]),
    [['sw', 's1'], ['alba', 'a1'], ['job', 'j1'], ['news', 'n1'], ['contest', 'c1']]);
});

test('loginAllowed: 출생연도 기준 19세가 되는 해부터 로그인 (2026년이면 2007년생까지)', () => {
  assert.equal(V.loginAllowed('2007', 2026), true);
  assert.equal(V.loginAllowed(2008, 2026), false);
  assert.equal(V.loginAllowed('1960', 2026), true);
  assert.equal(V.loginAllowed('', 2026), false);
  assert.equal(V.loginAllowed('abc', 2026), false);
  assert.equal(V.loginAllowed('1800', 2026), false);
  assert.equal(V.loginAllowed('2030', 2026), false);
});

test('relTime: 뉴스 시각을 지금 기준으로 (수집 때 굳은 값 대신)', () => {
  const now = Date.parse('2026-11-25T21:30:00+09:00');
  assert.equal(V.relTime('2026-11-25T21:26:00+09:00', now), '4분 전');
  assert.equal(V.relTime('2026-11-25T18:00:00+09:00', now), '3시간 전');
  assert.equal(V.relTime('2026-11-24T20:00:00+09:00', now), '어제');
  assert.equal(V.relTime('2026-11-15T23:30:00+09:00', now), '2026.11.15');  // KST 날짜 (UTC로는 14일)
  assert.equal(V.relTime('2026-11-25T21:31:00+09:00', now), '방금 전');
  assert.equal(V.relTime('', now), '');
});

// 마감일 캘린더에 넣기 (.ics + Google 캘린더 링크)
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

// 검수 반영: 수집 데이터가 이상해도 화면이 깨지거나 .ics 가 깨지지 않게
test('calEvent: 달력에 없는 날짜는 null (화면이 예외로 깨지지 않게)', () => {
  assert.equal(V.calEvent('contest', { ...C, deadline: '2026-13-01' }, '2026-11-26'), null);
  assert.equal(V.calEvent('contest', { ...C, deadline: '2026-02-30' }, '2026-01-01'), null);
  assert.ok(V.calEvent('contest', { ...C, deadline: '2028-02-29' }, '2026-11-26'));
});

test('calEvent: 공백·제어문자가 든 링크와 상대 주소는 빼고, UID 에 줄바꿈이 없어요', () => {
  assert.equal(V.calEvent('contest', { ...C, link: 'https://ex.com/\r\nX-INJECT:1' }, '2026-11-26').link, '');
  assert.equal(V.calEvent('contest', { ...C, link: '/contest/7' }, '2026-11-26').link, '');
  assert.equal(V.calEvent('contest', { ...C, link: ' https://ex.com/a ' }, '2026-11-26').link, 'https://ex.com/a');
  const s = V.calIcs(V.calEvent('contest', { ...C, id: '7\r\nX-INJECT:1' }, '2026-11-26'), '20261126T000000Z');
  assert.ok(!/\r\nX-INJECT/.test(s));
});

test('calIcs: 제목의 줄바꿈·단독 CR 도 \\n 으로', () => {
  const s = V.calIcs(V.calEvent('contest', { ...C, title: 'A\rB\nC\r\nD' }, '2026-11-26'), '20261126T000000Z');
  assert.ok(s.replace(/\r\n /g, '').split('\r\n').includes('SUMMARY:[마감] A\\nB\\nC\\nD'));
  assert.ok(!/\r(?!\n)/.test(s));
});

test('inAppBrowser: 카카오톡은 kakao, 그 밖의 앱 속 브라우저는 other, 보통 브라우저는 빈 문자열', () => {
  assert.equal(V.inAppBrowser('Mozilla/5.0 (Linux; Android 14) KAKAOTALK 10.8.0'), 'kakao');
  assert.equal(V.inAppBrowser('Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'), 'other');
  assert.equal(V.inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Instagram 300.0'), 'other');
  assert.equal(V.inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), '');
  assert.equal(V.inAppBrowser('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'), '');
});
