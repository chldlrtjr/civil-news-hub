// static/v2_state.js 의 공용 스크립트(북마크·로그인·진행 카드)를 가짜 Supabase로 돌려 저장/불러오기 순서를 검증
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCES = [['static/v2_state.js', fs.readFileSync(path.join(__dirname, '..', 'static', 'v2_state.js'), 'utf8')]];
const Tracker = require('../static/tracker_core.js');

function boot(block, remoteRow, initialStore = {}, opts = {}) {
  const calls = [];
  let authCb = null, clickH = null, visH = null;
  let failUpserts = opts.failUpserts || 0;
  let resolveSelect;
  const fakeSB = {
    auth: { onAuthStateChange: cb => { authCb = cb; }, signOut: async () => { calls.push(['signOut']); return { error: null }; }, signInWithOAuth: async () => {} },
    from: () => ({
      upsert: async row => { calls.push(['upsert', JSON.parse(JSON.stringify(row))]); return { error: failUpserts-- > 0 ? { message: 'offline' } : null }; },
      select: () => ({ eq: () => ({ maybeSingle: () => { calls.push(['select']); return new Promise(r => { resolveSelect = () => r({ data: remoteRow, error: null }); }); } }) }),
    }),
  };
  const store = { ...initialStore };
  const ctx = {
    window: { supabase: { createClient: () => fakeSB } },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
    document: { addEventListener: (t, f) => { if (t === 'click') clickH = f; if (t === 'visibilitychange') visH = f; }, hidden: false, querySelectorAll: () => [] },
    navigator: { userAgent: 'node' }, location: { origin: 'x', pathname: '/', href: 'x' },
    matchMedia: () => ({ matches: false }), console, setTimeout, clearTimeout, Date, JSON, Promise, Map, Set,
    CNHTracker: Tracker, alert: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(block + '\n;this.__t = { get saved(){ return saved; }, get tracked(){ return tracked; }, set tracked(v){ tracked = v; }, persistTracked, persistSaved, trackRemove, pullSavedRemote };', ctx);
  return { ctx, calls, store, login: () => authCb('SIGNED_IN', { user: { id: 'u1', user_metadata: {} } }), emit: (ev, s) => authCb(ev, s), resolveSelect: () => resolveSelect(),
    click: auth => clickH({ target: { closest: () => ({ dataset: { auth } }) } }), visible: () => visH() };
}
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

for (const [name, block] of SOURCES) {
test(`[${name}] 첫 불러오기 전에는 저장하지 않아요 (다른 기기 기록을 덮어쓰지 않게)`, async () => {
  const remoteCard = Tracker.makeCard('contest', { id: 'r1', title: '원격' }, '2026-11-19', '2026-11-19T01:00:00Z');
  const b = boot(block, { ids: [], tracked: [remoteCard] });
  b.login(); await tick(5);
  b.ctx.__t.tracked = [Tracker.makeCard('contest', { id: 'l1', title: '로컬' }, '2026-11-19')];
  b.ctx.__t.persistTracked(); await tick(400);
  assert.equal(b.calls.filter(c => c[0] === 'upsert').length, 0);
  b.resolveSelect(); await tick(400);
  const ups = b.calls.filter(c => c[0] === 'upsert');
  assert.ok(ups.length >= 1);
  assert.deepEqual(ups.at(-1)[1].tracked.map(c => c.id).sort(), ['l1', 'r1']);
});

test(`[${name}] 저장이 기다리는 중에는 불러오기를 건너뛰어요 (삭제가 옛 사본으로 되살아나지 않게)`, async () => {
  const card = Tracker.makeCard('contest', { id: 'c1', title: 'x' }, '2026-11-19', '2026-11-19T01:00:00Z');
  const b = boot(block, { ids: [], tracked: [card] });
  b.login(); await tick(5); b.resolveSelect(); await tick(20);
  const selectsBefore = b.calls.filter(c => c[0] === 'select').length;
  b.ctx.__t.trackRemove('c1');
  b.ctx.__t.pullSavedRemote(); await tick(5);
  assert.equal(b.calls.filter(c => c[0] === 'select').length, selectsBefore);
  await tick(400);
  const last = b.calls.filter(c => c[0] === 'upsert').at(-1)[1];
  assert.equal(last.tracked.find(c => c.id === 'c1').deleted, true);
});

test(`[${name}] 원격과 같은 내용이면 탭에 돌아올 때 다시 저장하지 않아요`, async () => {
  const card = Tracker.makeCard('contest', { id: 'c1', title: 'x' }, '2026-11-19', '2026-11-19T01:00:00Z');
  const reordered = Object.fromEntries(Object.entries(card).reverse());
  const b = boot(block, { ids: [], tracked: [reordered] });
  b.ctx.__t.tracked = [card];
  b.login(); await tick(5); b.resolveSelect(); await tick(400);
  assert.equal(b.calls.filter(c => c[0] === 'upsert').length, 0);
});
}

// 아래는 예전 사이트를 지우기 전 v2_state.js 에만 고쳤던 규칙
const V2 = SOURCES[0][1];
test('[static/v2_state.js] 다른 기기에서 저장 취소한 북마크는 탭에 돌아와도 되살아나지 않아요', async () => {
  const row = { ids: ['X'], tracked: [] };
  const b = boot(V2, row);
  b.login(); await tick(5); b.resolveSelect(); await tick(20);
  assert.deepEqual([...b.ctx.__t.saved], ['X']);
  row.ids = [];  // 다른 기기에서 X 저장 취소
  b.ctx.__t.pullSavedRemote(); await tick(5); b.resolveSelect(); await tick(400);
  assert.deepEqual([...b.ctx.__t.saved], []);
  assert.equal(b.calls.filter(c => c[0] === 'upsert').length, 0);
});

test('[static/v2_state.js] 로그아웃하면 이 브라우저의 저장 목록·진행 카드를 지우고 다음 계정에 섞지 않아요', async () => {
  const row = { ids: ['X'], tracked: [Tracker.makeCard('contest', { id: 'c1', title: 'x' }, '2026-11-19', '2026-11-19T01:00:00Z')] };
  const b = boot(V2, row);
  b.login(); await tick(5); b.resolveSelect(); await tick(20);
  assert.ok(b.store['cnh-saved'].includes('X'));
  b.emit('SIGNED_OUT', null); await tick(5);
  assert.deepEqual([...b.ctx.__t.saved], []);
  assert.equal(b.ctx.__t.tracked.length, 0);
  assert.equal(b.store['cnh-saved'], undefined);
  assert.equal(b.store['cnh-tracked'], undefined);
  row.ids = []; row.tracked = [];  // 다음 사람(u2)의 빈 계정
  b.emit('SIGNED_IN', { user: { id: 'u2', user_metadata: {} } }); await tick(5); b.resolveSelect(); await tick(400);
  assert.equal(b.calls.filter(c => c[0] === 'upsert').length, 0);
});

const ups = b => b.calls.filter(c => c[0] === 'upsert');
test('[static/v2_state.js] 비로그인 때 모은 북마크는 첫 로그인 때 계정에 합쳐요', async () => {
  const b = boot(V2, { ids: ['B'], tracked: [] }, { 'cnh-saved': '["A"]' });
  b.login(); await tick(5); b.resolveSelect(); await tick(400);
  assert.deepEqual([...b.ctx.__t.saved].sort(), ['A', 'B']);
  assert.deepEqual(ups(b).at(-1)[1].ids.sort(), ['A', 'B']);
  assert.equal(b.store['cnh-saved-uid'], 'u1');
});

test('[static/v2_state.js] 새로고침해도 다른 기기에서 저장 취소한 북마크가 되살아나지 않아요 (이미 이 계정 사본)', async () => {
  const b = boot(V2, { ids: [], tracked: [] }, { 'cnh-saved': '["X"]', 'cnh-saved-uid': 'u1' });
  b.login(); await tick(5); b.resolveSelect(); await tick(400);
  assert.deepEqual([...b.ctx.__t.saved], []);
  assert.equal(ups(b).length, 0);
});

test('[static/v2_state.js] 다른 계정의 사본은 새 계정에 섞지 않아요', async () => {
  const b = boot(V2, { ids: ['B'], tracked: [] }, { 'cnh-saved': '["A"]', 'cnh-saved-uid': 'other' });
  b.login(); await tick(5); b.resolveSelect(); await tick(400);
  assert.deepEqual([...b.ctx.__t.saved], ['B']);
  assert.equal(ups(b).length, 0);
});

test('[static/v2_state.js] 불러오는 사이 로그아웃하면 늦게 온 응답으로 옛 계정 목록을 다시 쓰지 않아요', async () => {
  const b = boot(V2, { ids: ['SECRET'], tracked: [] });
  b.login(); await tick(5);
  b.emit('SIGNED_OUT', null); await tick(5);
  b.resolveSelect(); await tick(20);
  assert.deepEqual([...b.ctx.__t.saved], []);
  assert.equal(b.store['cnh-saved'], undefined);
});

test('[static/v2_state.js] 계정 사본이 남은 채 로그인이 풀린 상태로 열면(세션 만료·공용 PC) 지워요', async () => {
  const b = boot(V2, null, { 'cnh-saved': '["X"]', 'cnh-tracked': '[]', 'cnh-saved-uid': 'u1' });
  b.emit('INITIAL_SESSION', null); await tick(5);
  assert.deepEqual([...b.ctx.__t.saved], []);
  assert.equal(b.store['cnh-saved'], undefined);
  assert.equal(b.store['cnh-saved-uid'], undefined);
});

test('[static/v2_state.js] 비로그인 목록은 로그인 안 한 상태로 열어도 그대로예요', async () => {
  const b = boot(V2, null, { 'cnh-saved': '["X"]' });
  b.emit('INITIAL_SESSION', null); await tick(5);
  assert.deepEqual([...b.ctx.__t.saved], ['X']);
});

test('[static/v2_state.js] 불러오는 사이 누른 북마크는 지워지지 않고 올라가요', async () => {
  const b = boot(V2, { ids: ['OLD'], tracked: [] });
  b.login(); await tick(5); b.resolveSelect(); await tick(20);
  b.ctx.__t.pullSavedRemote(); await tick(5);
  b.ctx.__t.saved.add('NEW'); b.ctx.__t.persistSaved();
  b.resolveSelect(); await tick(400);
  assert.deepEqual([...b.ctx.__t.saved].sort(), ['NEW', 'OLD']);
  assert.deepEqual(ups(b).at(-1)[1].ids.sort(), ['NEW', 'OLD']);
});

test('[static/v2_state.js] 저장 직후 로그아웃해도 그 변경을 먼저 계정에 올려요', async () => {
  const b = boot(V2, { ids: [], tracked: [] });
  b.login(); await tick(5); b.resolveSelect(); await tick(20);
  b.ctx.__t.saved.add('Y'); b.ctx.__t.persistSaved();
  await b.click('logout');
  const order = b.calls.map(c => c[0]).filter(n => n !== 'select');
  assert.deepEqual(order, ['upsert', 'signOut']);
  assert.deepEqual(ups(b)[0][1].ids, ['Y']);
});

test('[static/v2_state.js] 첫 불러오기 전에 누른 변경이 계정과 같아지면 다음 탭 복귀 불러오기를 막지 않아요', async () => {
  const b = boot(V2, { ids: ['X'], tracked: [] }, { 'cnh-saved': '["X"]', 'cnh-saved-uid': 'u1' });
  b.login(); await tick(5);
  b.ctx.__t.persistSaved(); await tick(350);  // 불러오기 전 변경: 아직 못 올림
  b.resolveSelect(); await tick(20);
  const before = b.calls.filter(c => c[0] === 'select').length;
  b.ctx.__t.pullSavedRemote(); await tick(5);
  assert.equal(b.calls.filter(c => c[0] === 'select').length, before + 1);
});

test('[static/v2_state.js] 올리기가 실패하면 탭에 돌아올 때 불러오기 대신 다시 올려요', async () => {
  const b = boot(V2, { ids: [], tracked: [] }, {}, { failUpserts: 1 });
  b.login(); await tick(5); b.resolveSelect(); await tick(20);
  b.ctx.__t.saved.add('Y'); b.ctx.__t.persistSaved(); await tick(400);
  assert.equal(ups(b).length, 1);  // 실패 (재시도는 10초 뒤로 예약)
  const selects = b.calls.filter(c => c[0] === 'select').length;
  b.visible(); await tick(20);
  assert.equal(ups(b).length, 2);
  assert.deepEqual(ups(b).at(-1)[1].ids, ['Y']);
  assert.equal(b.calls.filter(c => c[0] === 'select').length, selects);
  b.visible(); await tick(20);  // 올렸으니 이제는 불러오기
  assert.equal(b.calls.filter(c => c[0] === 'select').length, selects + 1);
  b.emit('SIGNED_OUT', null);  // 남은 타이머 정리
});

test('[static/v2_state.js] 계정에 올릴 때 북마크·진행 카드를 DB 상한 안으로 잘라요', async () => {
  const ids = Array.from({ length: 1005 }, (_, i) => 'id' + i);
  const cards = Array.from({ length: 205 }, (_, i) => ({ id: 't' + i, deleted: true, updatedAt: '2026-11-19T00:00:' + String(i % 60).padStart(2, '0') + 'Z' }));
  const b = boot(V2, { ids: [], tracked: [] }, { 'cnh-saved': JSON.stringify(ids), 'cnh-tracked': JSON.stringify(cards) });
  b.login(); await tick(5); b.resolveSelect(); await tick(400);
  const up = b.calls.filter(c => c[0] === 'upsert').at(-1)[1];
  assert.equal(up.ids.length, 1000);
  assert.equal(up.ids[0], 'id5');
  assert.equal(up.tracked.length, 200);
  assert.equal(b.ctx.__t.saved.size, 1000);  // 이 브라우저 사본도 같이 잘라야 다음 불러오기 때 또 올리지 않아요
  assert.equal(b.ctx.__t.tracked.length, 200);
});
