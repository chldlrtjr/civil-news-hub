// index.html 공용 스크립트(북마크·로그인·진행 카드)를 가짜 Supabase로 돌려 저장/불러오기 순서를 검증
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const block = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(b => b.includes('async function pullSavedRemote'));
const Tracker = require('../static/tracker_core.js');

function boot(remoteRow) {
  const calls = [];
  let authCb = null;
  let resolveSelect;
  const fakeSB = {
    auth: { onAuthStateChange: cb => { authCb = cb; }, signOut: async () => {}, signInWithOAuth: async () => {} },
    from: () => ({
      upsert: async row => { calls.push(['upsert', JSON.parse(JSON.stringify(row))]); return { error: null }; },
      select: () => ({ eq: () => ({ maybeSingle: () => { calls.push(['select']); return new Promise(r => { resolveSelect = () => r({ data: remoteRow, error: null }); }); } }) }),
    }),
  };
  const store = {};
  const ctx = {
    window: { supabase: { createClient: () => fakeSB } },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
    document: { addEventListener: () => {}, hidden: false, querySelectorAll: () => [] },
    navigator: { userAgent: 'node' }, location: { origin: 'x', pathname: '/', href: 'x' },
    matchMedia: () => ({ matches: false }), console, setTimeout, clearTimeout, Date, JSON, Promise, Map, Set,
    CNHTracker: Tracker, alert: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(block + '\n;this.__t = { get tracked(){ return tracked; }, set tracked(v){ tracked = v; }, persistTracked, trackRemove, pullSavedRemote };', ctx);
  return { ctx, calls, login: () => authCb('SIGNED_IN', { user: { id: 'u1', user_metadata: {} } }), resolveSelect: () => resolveSelect() };
}
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

test('첫 불러오기 전에는 저장하지 않아요 (다른 기기 기록을 덮어쓰지 않게)', async () => {
  const remoteCard = Tracker.makeCard('contest', { id: 'r1', title: '원격' }, '2026-11-19', '2026-11-19T01:00:00Z');
  const b = boot({ ids: [], tracked: [remoteCard] });
  b.login(); await tick(5);
  b.ctx.__t.tracked = [Tracker.makeCard('contest', { id: 'l1', title: '로컬' }, '2026-11-19')];
  b.ctx.__t.persistTracked(); await tick(400);
  assert.equal(b.calls.filter(c => c[0] === 'upsert').length, 0);
  b.resolveSelect(); await tick(400);
  const ups = b.calls.filter(c => c[0] === 'upsert');
  assert.ok(ups.length >= 1);
  assert.deepEqual(ups.at(-1)[1].tracked.map(c => c.id).sort(), ['l1', 'r1']);
});

test('저장이 기다리는 중에는 불러오기를 건너뛰어요 (삭제가 옛 사본으로 되살아나지 않게)', async () => {
  const card = Tracker.makeCard('contest', { id: 'c1', title: 'x' }, '2026-11-19', '2026-11-19T01:00:00Z');
  const b = boot({ ids: [], tracked: [card] });
  b.login(); await tick(5); b.resolveSelect(); await tick(20);
  const selectsBefore = b.calls.filter(c => c[0] === 'select').length;
  b.ctx.__t.trackRemove('c1');
  b.ctx.__t.pullSavedRemote(); await tick(5);
  assert.equal(b.calls.filter(c => c[0] === 'select').length, selectsBefore);
  await tick(400);
  const last = b.calls.filter(c => c[0] === 'upsert').at(-1)[1];
  assert.equal(last.tracked.find(c => c.id === 'c1').deleted, true);
});

test('원격과 같은 내용이면 탭에 돌아올 때 다시 저장하지 않아요', async () => {
  const card = Tracker.makeCard('contest', { id: 'c1', title: 'x' }, '2026-11-19', '2026-11-19T01:00:00Z');
  const reordered = Object.fromEntries(Object.entries(card).reverse());
  const b = boot({ ids: [], tracked: [reordered] });
  b.ctx.__t.tracked = [card];
  b.login(); await tick(5); b.resolveSelect(); await tick(400);
  assert.equal(b.calls.filter(c => c[0] === 'upsert').length, 0);
});
