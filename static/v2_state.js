/* 예전 사이트 old.html(옛 index.html) 공용 스크립트("공용 북마크" ~ "마이페이지" 직전) 사본. 고칠 때는 두 곳을 같이 고치고 tests/sync_guard.test.js로 확인 */
/* ---------- 공용 북마크: 두 화면이 같은 목록을 쓰고, 로그인한 사람은 기기 사이에서도 동기화돼요 ---------- */
const saved = new Set();
const savedListeners = [];
try { JSON.parse(localStorage.getItem('cnh-saved') || '[]').forEach(id => saved.add(id)); } catch(e){}
let savedUid = null, savedWriteT = null, savedWriting = false, savedAgain = false;
// savedPulled: 로그인 후 첫 불러오기 전엔 저장 금지(다른 기기 기록 보호) / savedDirty: 올릴 변경이 남아 있음
let savedPulled = false, savedDirty = false;
function storeSavedLocal(){ try { localStorage.setItem('cnh-saved', JSON.stringify([...saved])); } catch(e){} }
/* 마이페이지 진행 카드: 북마크와 같은 경로로 저장 (이 브라우저 + 로그인 시 Supabase 같은 행의 tracked 칸) */
let tracked = [];
try { const t = JSON.parse(localStorage.getItem('cnh-tracked') || '[]'); if (Array.isArray(t)) tracked = t; } catch(e){}
function storeTrackedLocal(){ try { localStorage.setItem('cnh-tracked', JSON.stringify(tracked)); } catch(e){} }
function persistTracked(){
  savedDirty = true;
  storeTrackedLocal(); notifySaved();
  clearTimeout(savedWriteT); savedWriteT = setTimeout(writeSavedRemote, 300);
}
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
function trackUpdate(id, patch){ const now = new Date().toISOString(); tracked = tracked.map(c => c.id === id ? { ...c, ...patch, updatedAt: now } : c); persistTracked(); }
function trackAdd(kind, item){
  const id = String(item.id);
  if (tracked.some(c => c.id === id && !c.deleted)) return;
  tracked = [...tracked.filter(c => c.id !== id), CNHTracker.makeCard(kind, item, kstToday())]; persistTracked();
}
const trackSubmit = id => trackUpdate(id, { submittedAt: kstToday() });
const trackUnsubmit = id => trackUpdate(id, { submittedAt: null });
const trackResult = (id, r) => trackUpdate(id, { result: r, resultAt: kstToday() });
const trackUndoResult = id => trackUpdate(id, { result: null, resultAt: null });
// 삭제는 표시로 남겨요: 다른 기기의 옛 사본이 합쳐질 때 되살아나지 않게
function trackRemove(id){ const now = new Date().toISOString(); tracked = tracked.map(c => c.id === id ? { id, deleted: true, updatedAt: now } : c); persistTracked(); }
function notifySaved(){ savedListeners.forEach(f => { try { f(); } catch(e){} }); }
async function writeSavedRemote(){
  if (!savedUid || !savedPulled) return;
  if (savedWriting){ savedAgain = true; return; }
  savedWriting = true;
  try {
    const { error } = await SB.from('user_saved').upsert({ user_id: savedUid, ids: [...saved], tracked, updated_at: new Date().toISOString() });
    if (error) console.warn('북마크 동기화 실패:', error.message);
    else if (!savedAgain) savedDirty = false;
  } catch(e){ console.warn('북마크 동기화 실패:', e); }
  savedWriting = false;
  if (savedAgain){ savedAgain = false; writeSavedRemote(); }
}
function persistSaved(){
  savedDirty = true;
  storeSavedLocal(); notifySaved();
  clearTimeout(savedWriteT); savedWriteT = setTimeout(writeSavedRemote, 300);
}
/* 구글 로그인(Supabase): 로그인하면 북마크가 계정에 저장돼 다른 기기에서도 보여요. 비로그인은 이 브라우저에만 저장 */
const SB = window.supabase ? window.supabase.createClient(
  'https://eazksxmhtypedxaycrcg.supabase.co',
  'sb_publishable_UJokd3NMOFJcfWjNjNSXPg_urs5q3kN',  // 공개용 키: 실제 보안은 DB의 RLS(본인 행만 접근)가 맡아요
  // pkce: 로그인 결과를 ?code= 로 받아요. 기본값(#access_token)은 #탭 라우터가 먼저 지워 버려요
  { auth: { flowType: 'pkce' } }
) : null;
let authUser = null;
async function pullSavedRemote(){
  if (!savedUid) return;
  if (savedPulled && (savedWriting || savedDirty)) return;  // 올릴 변경이 먼저: 옛 사본으로 덮지 않게
  const { data, error } = await SB.from('user_saved').select('ids, tracked').eq('user_id', savedUid).maybeSingle();
  if (error){ console.warn('북마크 불러오기 실패:', error.message); return; }
  savedPulled = true;
  const remote = data && Array.isArray(data.ids) ? data.ids : [];
  // 이 브라우저에 있던 북마크와 합쳐서, 계정에 없던 게 있으면 다시 올려요
  const before = saved.size;
  remote.forEach(id => saved.add(id));
  if (saved.size !== before) storeSavedLocal();
  // 진행 카드도 합쳐요: 같은 공고면 더 나중에 바꾼 쪽(같으면 더 진행된 쪽)을 남겨요
  const remoteTracked = data && Array.isArray(data.tracked) ? data.tracked : [];
  const mergedTracked = CNHTracker.mergeTracked(tracked, remoteTracked);
  const trackedChanged = !CNHTracker.sameTracked(mergedTracked, remoteTracked);
  if (!CNHTracker.sameTracked(mergedTracked, tracked)){ tracked = mergedTracked; storeTrackedLocal(); }
  if (saved.size !== remote.length || trackedChanged) writeSavedRemote();
  notifySaved();
}
if (SB){
  SB.auth.onAuthStateChange((event, session) => {
    const u = session ? session.user : null;
    const changed = (u && u.id) !== (authUser && authUser.id);
    authUser = u; savedUid = u ? u.id : null;
    if (changed) savedPulled = false;
    if (changed){ notifySaved(); if (u) setTimeout(pullSavedRemote, 0); }  // 콜백 안에서 바로 DB 호출하면 막힐 수 있어 다음 틱으로
  });
  // 다른 기기에서 바꾼 북마크는 이 탭으로 돌아올 때 가져와요
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pullSavedRemote(); });
}
const esc = t => String(t || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function authBoxHtml(){
  if (!SB) return '';
  if (authUser){
    const m = authUser.user_metadata || {};
    return `<div class="cnh-auth"><span><b>${esc(m.full_name || m.name || authUser.email)}</b> 계정에 저장 중이에요</span><button type="button" data-auth="logout">로그아웃</button></div>`;
  }
  return `<div class="cnh-auth"><span>구글로 로그인하면 다른 기기에서도 북마크가 보여요</span><button type="button" data-auth="login">구글 로그인</button></div>`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-auth]');
  if (!b || !SB) return;
  if (b.dataset.auth === 'logout'){ await SB.auth.signOut(); return; }
  // 카카오톡 등 인앱 브라우저는 구글이 로그인을 막아요 → 외부 브라우저로 열기
  if (/KAKAOTALK/i.test(navigator.userAgent)){ location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href); return; }
  if (/; wv\)|FBAN|FBAV|Instagram|NAVER\(inapp|Line\//i.test(navigator.userAgent)){
    alert('이 앱 안의 브라우저에서는 구글 로그인이 안 돼요. 메뉴에서 "다른 브라우저로 열기"를 눌러 주세요.'); return;
  }
  await SB.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
});

