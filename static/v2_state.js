/* 예전 사이트 old.html(옛 index.html) 공용 스크립트("공용 북마크" ~ "마이페이지" 직전) 사본. old.html 은 2026-11-24부터 배포 제외라 그 뒤 규칙은 여기에만 고쳐요. tests/sync_guard.test.js로 확인 */
/* ---------- 공용 북마크: 두 화면이 같은 목록을 쓰고, 로그인한 사람은 기기 사이에서도 동기화돼요 ---------- */
const saved = new Set();
const savedListeners = [];
try { JSON.parse(localStorage.getItem('cnh-saved') || '[]').forEach(id => saved.add(id)); } catch(e){}
let savedUid = null, savedWriteT = null, savedWriting = false, savedAgain = false;
// savedPulled: 로그인 후 첫 불러오기 전엔 저장 금지(다른 기기 기록 보호) / savedDirty: 올릴 변경이 남아 있음
let savedPulled = false, savedDirty = false;
// 이 브라우저의 북마크·진행 카드가 어느 계정의 사본인지 (비로그인 때 모은 목록이면 없음)
const SYNC_UID_KEY = 'cnh-saved-uid';
const syncedUid = () => { try { return localStorage.getItem(SYNC_UID_KEY); } catch(e){ return null; } };
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
  const uid = savedUid;
  if (!uid) return;
  if (savedPulled && (savedWriting || savedDirty)) return;  // 올릴 변경이 먼저: 옛 사본으로 덮지 않게
  const { data, error } = await SB.from('user_saved').select('ids, tracked').eq('user_id', uid).maybeSingle();
  if (uid !== savedUid) return;  // 기다리는 사이 로그아웃·계정 전환: 옛 계정 목록을 다시 쓰지 않게
  if (error){ console.warn('북마크 불러오기 실패:', error.message); return; }
  const firstPull = !savedPulled;
  if (!firstPull && (savedWriting || savedDirty)) return;  // 기다리는 사이 누른 변경이 먼저
  savedPulled = true;
  const remote = data && Array.isArray(data.ids) ? data.ids : [];
  const before = [...saved].join('\n');
  const owner = syncedUid();
  if (owner && owner !== uid){ saved.clear(); tracked = []; storeTrackedLocal(); }  // 다른 계정의 사본은 섞지 않아요
  // 비로그인 때 모은 목록만 로그인할 때 계정에 합쳐요. 이미 이 계정의 사본이면 계정 목록이 기준
  // (새로고침·탭 복귀 때도 합치면 다른 기기에서 저장 취소한 항목을 옛 사본이 되살려요). 불러오는 사이 누른 변경은 지키려고 합쳐요
  if (!(firstPull && (owner !== uid || savedDirty))) saved.clear();
  remote.forEach(id => saved.add(id));
  if ([...saved].join('\n') !== before) storeSavedLocal();
  try { localStorage.setItem(SYNC_UID_KEY, uid); } catch(e){}
  // 진행 카드도 합쳐요: 같은 공고면 더 나중에 바꾼 쪽(같으면 더 진행된 쪽)을 남겨요
  const remoteTracked = data && Array.isArray(data.tracked) ? data.tracked : [];
  const mergedTracked = CNHTracker.mergeTracked(tracked, remoteTracked);
  const trackedChanged = !CNHTracker.sameTracked(mergedTracked, remoteTracked);
  if (!CNHTracker.sameTracked(mergedTracked, tracked)){ tracked = mergedTracked; storeTrackedLocal(); }
  if (saved.size !== remote.length || trackedChanged) writeSavedRemote();
  else savedDirty = false;  // 합친 결과가 계정과 같으면 올릴 게 없어요 (남겨 두면 탭 복귀 불러오기가 계속 건너뛰어짐)
  notifySaved();
}
if (SB){
  SB.auth.onAuthStateChange((event, session) => {
    const u = session ? session.user : null;
    const prev = authUser;
    const changed = (u && u.id) !== (prev && prev.id);
    authUser = u; savedUid = u ? u.id : null;
    if (changed) savedPulled = false;
    // 로그아웃했거나, 계정 사본이 남은 채 로그인이 풀려 있으면(공용 PC·세션 만료) 이 브라우저에서 지워요
    if (!u && (prev || syncedUid())) clearAccountLocal();
    else if (changed) notifySaved();
    if (changed && u) setTimeout(pullSavedRemote, 0);  // 콜백 안에서 바로 DB 호출하면 막힐 수 있어 다음 틱으로
  });
  // 다른 기기에서 바꾼 북마크는 이 탭으로 돌아올 때 가져와요
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pullSavedRemote(); });
}
// 계정 사본은 서버에 남아서 다시 로그인하면 돌아와요
function clearAccountLocal(){
  clearTimeout(savedWriteT);
  saved.clear(); tracked = []; savedDirty = false; savedAgain = false;
  ['cnh-saved', 'cnh-tracked', SYNC_UID_KEY].forEach(k => { try { localStorage.removeItem(k); } catch(e){} });
  notifySaved();
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
  if (b.dataset.auth === 'delete'){
    if (!confirm('계정을 삭제할까요?\n계정 정보와 이 계정에 저장한 목록·진행 기록, 이 브라우저의 저장 목록이 지워지고 되돌릴 수 없어요.')) return;
    clearTimeout(savedWriteT);
    const { error } = await SB.rpc('delete_my_account');  // DB 함수: 로그인한 본인 계정만 지움 (supabase/schema.sql)
    if (error){ alert('계정을 삭제하지 못했어요. 잠시 후 다시 시도하거나 axisnode0000@gmail.com 으로 알려 주세요.'); return; }
    savedUid = null;
    clearAccountLocal();
    try { localStorage.removeItem(SB.auth.storageKey); } catch(e){}
    alert('계정을 삭제했어요.');
    location.reload();
    return;
  }
  if (b.dataset.auth === 'logout'){
    // 이 기기만 로그아웃해요(전체 로그아웃은 다른 기기 세션까지 지움). 서버 세션이 이미 없으면
    // supabase-js 2.45.4는 에러만 돌려주고 기기 세션을 남기므로 직접 지우고 새로 그려요
    // 로그아웃하면 이 브라우저 사본을 지우므로, 아직 안 올린 변경(저장 직후 300ms 안 등)을 먼저 계정에 올려요
    for (let i = 0; savedWriting && i < 60; i++) await new Promise(r => setTimeout(r, 50));
    if (savedDirty && savedPulled){ clearTimeout(savedWriteT); await writeSavedRemote(); }
    const { error } = await SB.auth.signOut({ scope: 'local' });
    if (error){ clearAccountLocal(); try { localStorage.removeItem(SB.auth.storageKey); } catch(e){} location.reload(); }
    return;
  }
  // 카카오톡 등 인앱 브라우저는 구글이 로그인을 막아요 → 외부 브라우저로 열기
  if (/KAKAOTALK/i.test(navigator.userAgent)){ location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href); return; }
  if (/; wv\)|FBAN|FBAV|Instagram|NAVER\(inapp|Line\//i.test(navigator.userAgent)){
    alert('이 앱 안의 브라우저에서는 구글 로그인이 안 돼요. 메뉴에서 "다른 브라우저로 열기"를 눌러 주세요.'); return;
  }
  if (!ageConfirmed()){ openAgeGate(); return; }
  await googleLogin();
});
const googleLogin = () => SB.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
/* 로그인 전 출생연도 확인 (v2 전용, old.html은 2026-11-24부터 배포 제외): 연도는 비교만 하고 저장·전송하지 않고, 이 브라우저에 "확인함"만 남겨요 */
const AGE_KEY = 'cnh-age-ok';
function ageConfirmed(){ try { return localStorage.getItem(AGE_KEY) === '1'; } catch(e){ return false; } }
function openAgeGate(){
  const dlg = document.getElementById('age-gate');
  if (!dlg || !dlg.showModal) return;  // 모달을 못 여는 아주 옛 브라우저는 확인 없이 로그인시키지 않아요
  const sel = document.getElementById('age-year'), msg = document.getElementById('age-msg');
  const thisYear = +kstToday().slice(0, 4);
  if (!dlg.dataset.ready){
    dlg.dataset.ready = '1';
    for (let y = thisYear; y >= 1930; y--) sel.add(new Option(y + '년', y));
    dlg.querySelector('[data-age-cancel]').addEventListener('click', () => dlg.close());
    dlg.querySelector('[data-age-form]').addEventListener('submit', async e => {
      e.preventDefault();
      if (!sel.value){ msg.textContent = '출생연도를 골라 주세요.'; sel.focus(); return; }
      if (!CNHv2.loginAllowed(sel.value, thisYear)){
        msg.textContent = '로그인은 출생연도 기준 19세가 되는 해부터 쓸 수 있어요. 로그인하지 않아도 모든 정보를 보고 이 브라우저에 저장할 수 있어요.';
        return;
      }
      try { localStorage.setItem(AGE_KEY, '1'); } catch(e){}
      dlg.close();
      await googleLogin();
    });
  }
  sel.value = ''; msg.textContent = '';
  dlg.showModal();
}

