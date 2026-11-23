// 로그아웃: 서버에서 세션이 이미 사라진 경우(다른 기기의 전체 로그아웃 등)에도 이 기기의 로그인이 풀려야 해요
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'static', 'v2_state.js'), 'utf8');

function boot(signOutResult) {
  const calls = { signOut: [], removed: [], reloads: 0 };
  let clickHandler = null;
  const store = { 'sb-ref-auth-token': '{"access_token":"x"}' };
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
    console, setTimeout, clearTimeout, Date, JSON, Promise, Map, Set, CNHTracker: require('../static/tracker_core.js'),
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const clickLogout = () => clickHandler({ target: { closest: () => ({ dataset: { auth: 'logout' } }) } });
  return { calls, store, clickLogout };
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
  assert.equal(b.store['sb-ref-auth-token'], undefined);
  assert.equal(b.calls.reloads, 1);
});
