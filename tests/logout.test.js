// 로그아웃: 서버에서 세션이 이미 사라진 경우(다른 기기의 전체 로그아웃 등)에도 이 기기의 로그인이 풀려야 해요
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'static', 'v2_state.js'), 'utf8');

function boot(signOutResult, extraStore = {}, con = console) {
  const calls = { signOut: [], removed: [], reloads: 0 };
  let clickHandler = null;
  const store = { 'sb-ref-auth-token': '{"access_token":"x"}', ...extraStore };
  const ctx = {
    window: { supabase: { createClient: () => ({
      auth: {
        storageKey: 'sb-ref-auth-token',
        onAuthStateChange: () => {},
        signOut: async (opts) => { calls.signOut.push(opts); return signOutResult; },
      },
    }) } },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { calls.removed.push(k); delete store[k]; } },
    document: { addEventListener: (t, f) => { if (t === 'click') clickHandler = f; }, hidden: false },
    navigator: { userAgent: 'node' }, location: { origin: 'x', pathname: '/', href: 'x', reload: () => { calls.reloads++; } },
    console: con, setTimeout, clearTimeout, Date, JSON, Promise, Map, Set, CNHTracker: require('../static/tracker_core.js'),
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const clickLogout = () => clickHandler({ target: { closest: () => ({ dataset: { auth: 'logout' } }) } });
  return { calls, store, clickLogout, ctx };
}

test('로그아웃은 이 기기만 (다른 기기 세션은 그대로)', async () => {
  const b = boot({ error: null });
  await b.clickLogout();
  assert.equal(JSON.stringify(b.calls.signOut), '[{"scope":"local"}]');  // vm 안에서 만든 객체라 JSON으로 비교
  assert.equal(b.calls.reloads, 0);
});

test('서버에 세션이 없어 라이브러리가 에러를 돌려줘도 이 기기 로그인 정보를 지우고 새로 그려요', async () => {
  const b = boot({ error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' } });
  await b.clickLogout();
  assert.ok(b.calls.removed.includes('sb-ref-auth-token'));
  assert.ok(b.calls.removed.includes('cnh-saved') && b.calls.removed.includes('cnh-tracked'));
  assert.equal(b.store['sb-ref-auth-token'], undefined);
  assert.equal(b.calls.reloads, 1);
});

function bootDelete({ confirmed, rpcError }) {
  const calls = { rpc: [], removed: [], reloads: 0, alerts: [] };
  let clickHandler = null;
  const store = { 'sb-ref-auth-token': 'x', 'cnh-saved': '["a"]', 'cnh-tracked': '[]', 'cnh-theme': 'dark' };
  const ctx = {
    window: { supabase: { createClient: () => ({
      auth: { storageKey: 'sb-ref-auth-token', onAuthStateChange: () => {} },
      rpc: async (name) => { calls.rpc.push(name); return { error: rpcError || null }; },
    }) } },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { calls.removed.push(k); delete store[k]; } },
    document: { addEventListener: (t, f) => { if (t === 'click') clickHandler = f; }, hidden: false },
    navigator: { userAgent: 'node' }, location: { origin: 'x', pathname: '/', href: 'x', reload: () => { calls.reloads++; } },
    confirm: () => confirmed, alert: (m) => { calls.alerts.push(m); },
    console, setTimeout, clearTimeout, Date, JSON, Promise, Map, Set, CNHTracker: require('../static/tracker_core.js'),
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const click = () => clickHandler({ target: { closest: () => ({ dataset: { auth: 'delete' } }) } });
  return { calls, store, click };
}

test('계정 삭제: 확인을 취소하면 아무것도 지우지 않아요', async () => {
  const b = bootDelete({ confirmed: false });
  await b.click();
  assert.equal(b.calls.rpc.length, 0);
  assert.equal(b.calls.removed.length, 0);
});

test('계정 삭제: 서버에서 지운 뒤 이 브라우저의 로그인·저장 목록을 비우고 새로 그려요 (화면 설정은 남김)', async () => {
  const b = bootDelete({ confirmed: true });
  await b.click();
  assert.equal(b.calls.rpc.join(), 'delete_my_account');
  assert.equal(b.store['sb-ref-auth-token'], undefined);
  assert.equal(b.store['cnh-saved'], undefined);
  assert.equal(b.store['cnh-theme'], 'dark');
  assert.equal(b.calls.reloads, 1);
});

test('계정 삭제: 서버가 실패하면 아무것도 지우지 않고 알려요', async () => {
  const b = bootDelete({ confirmed: true, rpcError: { message: 'x' } });
  await b.click();
  assert.equal(b.calls.removed.length, 0);
  assert.equal(b.calls.reloads, 0);
  assert.equal(b.calls.alerts.length, 1);
});

test('화면에 넣는 글자(esc)에서 수집 데이터의 이모지를 빼고 HTML은 이스케이프해요', () => {
  const { ctx } = boot({ error: null });
  ctx.input = '\u{1F687} 지하철 파업 \u2708\uFE0F <b>';
  assert.equal(vm.runInContext('esc(input)', ctx), ' 지하철 파업  &lt;b&gt;');
  ctx.input = '\u{1F1F0}\u{1F1F7}국기 \u{1F44D}\u{1F3FD}엄지 \u{1F468}‍\u{1F527}정비';  // 국기·피부색·ZWJ 결합
  assert.equal(vm.runInContext('esc(input)', ctx), '국기 엄지 정비');
});

test('상한을 넘어 잘라 내면 콘솔에 경고 한 줄 (사용자 안내 화면은 없음)', () => {
  const warns = [];
  const con = { ...console, warn: (...a) => warns.push(a.join(' ')) };
  const cards = Array.from({ length: 205 }, (_, i) => ({ id: 'k' + i, kind: 'contest', title: 't', deadline: '2099-01-01', updatedAt: '2026-11-01T00:00:00Z' }));
  const b = boot({ error: null }, { 'cnh-tracked': JSON.stringify(cards) }, con);
  b.ctx.capSynced();
  assert.equal(warns.length, 1);
  assert.match(warns[0], /5/);
  b.ctx.capSynced();
  assert.equal(warns.length, 1);  // 이미 잘랐으면 조용히
});
