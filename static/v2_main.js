/* ---------- v2 화면: 데이터 준비, PC/모바일 고르기, 로그인 버튼, 테마 ---------- */
const V2 = {
  // 데이터 번들을 못 불러왔고 캐시도 없으면 getInitialData()가 null: 빈 목록으로 그려서 화면이 비지 않게
  data: { NEWS: [], CONTESTS: [], JOBS: [], ALBA: [], ...((typeof CivilData !== 'undefined' && CivilData.getInitialData && CivilData.getInitialData()) || {}), EXAMS: window.CNH_EXAMS || [] },
  today: kstToday(),
  render(){}
};

(() => {
  const pc = document.getElementById('v2pc'), m = document.getElementById('v2m');
  function apply(){
    const phone = CNHv2.isPhone({ ua: navigator.userAgent || '', platform: navigator.platform || '', maxTouchPoints: navigator.maxTouchPoints || 0, width: innerWidth });
    if (pc.hidden === phone && m.hidden === !phone) return;
    pc.hidden = phone; m.hidden = !phone;
  }
  apply();
  addEventListener('resize', apply);
})();

// GNB에는 짧은 로그인 버튼만: 클릭 처리는 v2_state.js 의 [data-auth] 공용 핸들러가 맡아요
function renderAuth(){
  const btn = document.getElementById('pc-auth'), who = document.getElementById('pc-who');
  if (!SB){ btn.hidden = true; return; }
  const meta = (authUser && authUser.user_metadata) || {};
  btn.dataset.auth = authUser ? 'logout' : 'login';
  btn.textContent = authUser ? '로그아웃' : '구글 로그인';
  who.textContent = authUser ? (meta.full_name || meta.name || authUser.email || '') : '';
}

const isDarkTheme = () => { const r = document.documentElement; return r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
const syncThemeBtns = () => document.querySelectorAll('[data-theme-toggle]').forEach(b => b.setAttribute('aria-pressed', isDarkTheme()));
document.addEventListener('click', e => {
  if (e.target.closest('[data-skip]')) { document.querySelector('#v2pc main').focus(); return; }
  if (!e.target.closest('[data-theme-toggle]')) return;
  const r = document.documentElement;
  r.dataset.theme = isDarkTheme() ? 'light' : 'dark';
  try { localStorage.setItem('cnh-theme', r.dataset.theme); } catch(e){}
  syncThemeBtns();
});
syncThemeBtns();

/* ---------- 홈: 오늘 챙길 것 → 내 관심 분야 새 소식 → 오늘의 토목 뉴스 ---------- */
const KIND = { contest: '공모전', job: '채용', alba: '알바' };
// 사생활 보호 모드 등에서 localStorage 접근 자체가 막혀도 화면은 그려지게
const LS = (() => { try { return window.localStorage; } catch(e){ return { getItem(){ return null; }, setItem(){} }; } })();
const NO_INTERESTS = { news: [], contests: [], jobs: [] };
const stored = CNHv2.readJSON(LS, 'cnh-v2-interests', NO_INTERESTS);
let interests = Object.fromEntries(Object.keys(NO_INTERESTS).map(k => [k, Array.isArray(stored[k]) ? stored[k] : []]));
let editingInterests = false;

// 원문 링크: 수집 데이터에서 id로 찾고, 없으면(사라진 공고) 진행 카드에 저장된 링크
function linkOf(id){
  const d = V2.data;
  for (const list of [d.NEWS, d.CONTESTS, d.JOBS, d.ALBA, d.EXAMS]) { const x = (list || []).find(y => String(y.id) === id); if (x) return x.link; }
  const c = tracked.find(t => t.id === id);
  return c ? c.link : '';
}
function rowHtml(id, pill, pillClass, title, kind){
  const href = linkOf(id), inner = `<span class="h-dd ${pillClass}">${esc(pill)}</span><span class="h-t">${esc(title)}</span>${kind ? `<span class="h-k">${esc(kind)}</span>` : ''}`;
  return /^https?:\/\//i.test(href || '') ? `<a class="h-row" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<div class="h-row">${inner}</div>`;
}

// 새 소식은 페이지를 열 때(또는 관심 분야를 바꿀 때) 한 번만 골라요: 다시 그려도 방금 본 게 사라지지 않게
// PC 표는 5개, 모바일은 3개까지 보여 줘요 (지금 보이는 화면 기준으로 한 번 정해요)
function ensureFresh(){
  if (V2.fresh) return;
  const seen = CNHv2.readJSON(LS, 'cnh-v2-seen', []);
  V2.fresh = CNHv2.freshItems({ news: V2.data.NEWS, contests: V2.data.CONTESTS, jobs: V2.data.JOBS }, interests, seen, V2.today, document.getElementById('v2pc').hidden ? 3 : 5);
  try { LS.setItem('cnh-v2-seen', JSON.stringify(CNHv2.rememberSeen(seen, V2.fresh.map(x => x.id)))); } catch(e){}
}

function homeHtml(){
  const d = V2.data, today = V2.today;
  const sched = CNHv2.scheduleItems({ saved: [...saved], tracked, contests: d.CONTESTS, jobs: d.JOBS, albas: d.ALBA }, today);
  const dt = new Date(today + 'T00:00:00');
  const dateText = `${dt.getMonth() + 1}월 ${dt.getDate()}일 ${'일월화수목금토'[dt.getDay()]}요일`;
  const head = sched.length
    ? `<div class="h-head"><h1>오늘 챙길 것 ${sched.length}개</h1><p>${dateText} · 저장한 항목 기준</p></div>`
    : `<div class="h-head"><h1>저장한 일정이 없어요</h1><p>${dateText} · 마감이 가까운 공고부터 보여 드려요</p></div>`;

  const list = sched.length ? sched : CNHv2.urgentFallback({ contests: d.CONTESTS, jobs: d.JOBS }, today);
  const schedRows = list.slice(0, 3).map(x => rowHtml(x.id, x.label, x.label === 'D-DAY' ? 'hot' : '', x.title, x.what === 'result' ? '발표' : KIND[x.kind])).join('');
  const schedSec = `<section class="h-sec"><div class="h-sec-h"><h2>${sched.length ? '마감·발표 일정' : '마감 임박'}</h2>${sched.length ? `<a href="#my">전체 ${sched.length}개</a>` : ''}</div>${schedRows || '<p class="h-empty">다가오는 마감이 없어요</p>'}</section>`;

  let freshBody;
  const groupsHtml = (only) => CNHv2.INTEREST_GROUPS.map(g => {
    const opts = g.options.filter(([v]) => !only || interests[g.key].includes(v));
    if (!opts.length) return '';
    const chips = opts.map(([v, label]) => only ? `<span class="h-chip on">${esc(label)}</span>`
      : `<button type="button" class="h-chip" data-interest="${g.key}:${esc(v)}" aria-pressed="${interests[g.key].includes(v)}">${esc(label)}</button>`).join('');
    return only ? chips : `<div class="h-group"><h3>${g.title}</h3><div class="h-chips">${chips}</div></div>`;
  }).join('');
  if (editingInterests || !CNHv2.hasInterests(interests)) {
    freshBody = `<p class="h-note">관심 있는 것을 고르면 새 소식을 모아 드려요</p>${groupsHtml(false)}${CNHv2.hasInterests(interests) ? '<button type="button" class="h-done" data-interest-done>완료</button>' : ''}`;
  } else {
    ensureFresh();
    const rows = V2.fresh.slice(0, 3).map(x => rowHtml(x.id, x.badge, 'new', x.title, x.meta)).join('');
    freshBody = `<div class="h-chips h-picked">${groupsHtml(true)}</div>${rows || '<p class="h-empty">새 소식이 없어요</p>'}`;
  }
  const freshLink = CNHv2.hasInterests(interests) && !editingInterests ? '<button type="button" data-interest-edit>분야 바꾸기</button>' : '';
  const freshSec = `<section class="h-sec"><div class="h-sec-h"><h2>내 관심 분야 새 소식</h2>${freshLink}</div>${freshBody}</section>`;

  const news = newsNotFresh(3).map(n => {
    const href = /^https?:\/\//i.test(n.link || '') ? n.link : '';
    const t = `<span class="h-t">${esc(n.title)}</span><span class="h-k">${esc(n.src)}</span>`;
    return href ? `<a class="h-row" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${t}</a>` : `<div class="h-row">${t}</div>`;
  }).join('');
  const newsSec = `<section class="h-sec"><div class="h-sec-h"><h2>오늘의 토목 뉴스</h2><a href="#news">뉴스 탭</a></div>${news || '<p class="h-empty">아직 수집된 기사가 없어요</p>'}</section>`;
  return { head, schedSec, examSec: examSec(3), freshSec, newsSec };
}

// 시험·공채 일정 (static/v2_exams.js): 확정은 D-day, 발표 전은 '○월쯤'. 줄을 누르면 출처, 전체·캘린더 넣기는 #exams
function examSec(n){
  const rows = CNHv2.examList(V2.data.EXAMS, V2.today).slice(0, n).map(x => { const l = CNHv2.examLabel(x, V2.today); return rowHtml(x.id, l, l === 'D-DAY' ? 'hot' : '', x.title, x.type); }).join('');
  return `<section class="h-sec"><div class="h-sec-h"><h2>시험·공채 일정</h2><a href="#exams">전체 일정</a></div>${rows || '<p class="h-empty">다가오는 일정이 없어요</p>'}</section>`;
}

// 같은 기사가 "새 소식"과 "오늘의 토목 뉴스"에 두 번 나오지 않게
function newsNotFresh(n){
  const ids = new Set((V2.fresh || []).map(x => x.id));
  return (V2.data.NEWS || []).filter(x => !ids.has(String(x.id))).slice(0, n);
}

/* ---------- PC 홈: 본문(일정 표, 새 소식 표) + 사이드(내 저장함, 달력, 뉴스) ---------- */
const PC_ROWS = 5;
const isWeb = (h) => /^https?:\/\//i.test(h || '');
const monthDay = (d) => `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일`;
const ddClass = (label) => label === 'D-DAY' ? 'hot' : /^D-[1-3]$/.test(label) ? 'soon' : '';
// 표의 한 줄: 줄 전체를 눌러도 원문이 열리고, 제목은 키보드로도 갈 수 있는 진짜 링크
function trRow(id, cells){
  const href = isWeb(linkOf(id)) ? linkOf(id) : '';
  return `<tr${href ? ` data-href="${esc(href)}"` : ''}>${cells(href)}</tr>`;
}
const titleCell = (title, href) => `<td class="t" title="${esc(title)}">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>` : esc(title)}</td>`;

function pcHomeHtml(){
  const d = V2.data, today = V2.today;
  const sched = CNHv2.scheduleItems({ saved: [...saved], tracked, contests: d.CONTESTS, jobs: d.JOBS, albas: d.ALBA }, today);
  const list = sched.length ? sched : CNHv2.urgentFallback({ contests: d.CONTESTS, jobs: d.JOBS }, today, PC_ROWS);
  const kindOf = (x) => x.what === 'result' ? '결과 발표' : KIND[x.kind];

  const head = `<div class="p-head"><p class="date">${monthDay(today)} ${CNHv2.weekdayOf(today)}요일</p>${sched.length
    ? `<h1>오늘 챙길 것 ${sched.length}개</h1><p class="sub">저장한 공고와 진행 중인 도전에서 다가오는 마감과 발표를 모았어요</p>`
    : `<h1>저장한 일정이 없어요</h1><p class="sub">공고를 저장하면 마감일을 여기서 챙겨 드려요. 지금은 마감이 가까운 공고를 보여 드려요</p>`}</div>`;

  const schedRows = list.slice(0, PC_ROWS).map(x => { const dd = CNHv2.ddayLabel(x.date, today); return trRow(x.id, href =>
    `<td><span class="dd ${ddClass(dd)}">${dd}</span></td><td>${kindOf(x)}</td>${titleCell(x.title, href)}<td title="${esc(x.org)}">${esc(x.org)}</td><td class="num">${CNHv2.dateLabel(x.date)} (${CNHv2.weekdayOf(x.date)})</td>`); }).join('');
  const schedPanel = `<section class="panel"><div class="panel-h"><h2>${sched.length ? '마감·발표 일정' : '마감 임박 공고'}${sched.length > PC_ROWS ? `<small>${PC_ROWS}개 / 전체 ${sched.length}개</small>` : ''}</h2>${sched.length ? '<a class="more" href="#my">마이페이지에서 전체 보기</a>' : ''}</div>${schedRows
    ? `<table class="tbl"><colgroup><col class="c-dd"><col class="c-k"><col><col class="c-org"><col class="c-date"></colgroup><thead><tr><th>남은 날</th><th>구분</th><th>제목</th><th>기관</th><th>날짜</th></tr></thead><tbody>${schedRows}</tbody></table>`
    : '<p class="empty">다가오는 마감이 없어요</p>'}</section>`;

  const groups = CNHv2.INTEREST_GROUPS;
  // 고른 분야 표시(off)는 누를 수 없으니 버튼이 아니라 글자로 (스크린리더가 "사용 불가 버튼"으로 읽지 않게)
  const chip = (g, v, label, off) => off ? `<span class="h-chip on">${esc(label)}</span>`
    : `<button type="button" class="h-chip" data-interest="${g.key}:${esc(v)}" aria-pressed="${interests[g.key].includes(v)}">${esc(label)}</button>`;
  let freshPanel;
  if (editingInterests || !CNHv2.hasInterests(interests)) {
    const cols = groups.map(g => `<div class="h-group"><h3>${g.title}</h3><div class="h-chips">${g.options.map(([v, l]) => chip(g, v, l, false)).join('')}</div></div>`).join('');
    freshPanel = `<section class="panel"><div class="panel-h"><h2>내 관심 분야 새 소식</h2></div><div class="pick">${cols}</div><div class="pick-foot"><p class="pick-note">관심 있는 것을 고르면 새 소식을 모아 드려요. 여러 개 골라도 돼요</p>${CNHv2.hasInterests(interests) ? '<button type="button" class="h-done" data-interest-done>완료</button>' : ''}</div></section>`;
  } else {
    ensureFresh();
    const picked = groups.flatMap(g => g.options.filter(([v]) => interests[g.key].includes(v)).map(([v, l]) => chip(g, v, l, true))).join('');
    const rows = V2.fresh.map(x => trRow(x.id, href => `<td>${x.kind === 'news' ? '뉴스' : KIND[x.kind]}</td>${titleCell(x.title, href)}<td title="${esc(x.meta)}">${esc(x.meta)}</td>`)).join('');
    freshPanel = `<section class="panel"><div class="panel-h"><h2>내 관심 분야 새 소식</h2><button type="button" class="more" data-interest-edit>분야 바꾸기</button></div><div class="filter"><span>관심 분야</span><div class="h-chips">${picked}</div></div>${rows
      ? `<table class="tbl"><colgroup><col class="c-k"><col><col class="c-org"></colgroup><thead><tr><th>구분</th><th>제목</th><th>출처·마감</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="empty">새 소식이 없어요. 내일 다시 확인해 주세요</p>'}</section>`;
  }

  // 사이드 1: 내 저장함 (로그인 안 해도 이 브라우저의 저장 개수는 보여요)
  const meta = (authUser && authUser.user_metadata) || {};
  const acct = `<section class="card acct"><div>${authUser
    ? `<div class="acct-name">${esc(meta.full_name || meta.name || '내 계정')}님</div><p class="acct-hint">저장 목록이 PC와 휴대폰에서 같이 보여요</p>`
    : `<h2>내 저장함</h2><p class="acct-hint">${SB ? '로그인하면 PC와 휴대폰에서 같은 목록을 봐요' : '저장한 항목은 이 브라우저에 보관돼요'}</p>`}</div>
    <div class="acct-stats"><a href="#my"><span>저장한 공고</span><b>${saved.size}</b></a><a href="#my"><span>진행 중인 도전</span><b>${CNHTracker.visible(tracked).length}</b></a></div>
    ${!authUser && SB ? '<button type="button" class="btn-full" data-auth="login">Google 계정으로 로그인</button>' : ''}</section>`;

  // 사이드 2: 이번 달 달력, 저장한 일정이 있는 날에 점
  const marks = new Map();
  for (const x of sched) { if (!marks.has(x.date)) marks.set(x.date, []); marks.get(x.date).push(x); }
  const ym = V2.calYM || today.slice(0, 7);
  const sel = V2.calSel !== undefined ? V2.calSel : ((sched.find(x => x.date.startsWith(ym)) || {}).date || null);
  const weeks = CNHv2.monthGrid(ym).map(w => `<tr>${w.map(day => day ? `<td><button type="button" class="cal-d${day < today ? ' past' : ''}${day === today ? ' today' : ''}${marks.has(day) ? ' has' : ''}" data-cal-day="${day}" aria-pressed="${day === sel}" aria-label="${monthDay(day)}${marks.has(day) ? ` 일정 ${marks.get(day).length}개` : ''}">${+day.slice(8)}</button></td>` : '<td></td>').join('')}</tr>`).join('');
  const dayItems = sel ? (marks.get(sel) || []).map(x => { const href = isWeb(linkOf(x.id)) ? linkOf(x.id) : ''; const inner = `<span class="k">${x.what === 'result' ? '발표' : KIND[x.kind]}</span><span class="tt">${esc(x.title)}</span>`;
    return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<div class="it">${inner}</div>`; }).join('') : '';
  const calList = sel ? `<h3>${monthDay(sel)} (${CNHv2.weekdayOf(sel)})</h3>${dayItems || '<p>이 날은 일정이 없어요</p>'}`
    : `<p>${sched.length ? '점이 찍힌 날을 누르면 일정을 볼 수 있어요' : '공고를 저장하면 마감일에 점이 찍혀요'}</p>`;
  const arrow = (dir, label, path) => `<button type="button" data-cal="${dir}" aria-label="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${path}"/></svg></button>`;
  const cal = `<section class="card cal"><div class="cal-h"><h2>${ym.slice(0, 4)}년 ${+ym.slice(5)}월</h2><div>${arrow(-1, '이전 달', 'm15 18-6-6 6-6')}${arrow(1, '다음 달', 'm9 18 6-6-6-6')}</div></div>
    <table class="cal-t"><thead><tr>${[...'일월화수목금토'].map(w => `<th>${w}</th>`).join('')}</tr></thead><tbody>${weeks}</tbody></table><div class="cal-list">${calList}</div></section>`;

  // 사이드 3: 오늘의 토목 뉴스 (새 소식과 겹치는 기사는 빼요)
  const newsItems = newsNotFresh(5).map(n => { const inner = `<div class="tt">${esc(n.title)}</div><div class="src">${esc([n.src, n.ago].filter(Boolean).join(' · '))}</div>`;
    return `<li>${isWeb(n.link) ? `<a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<div>${inner}</div>`}</li>`; }).join('');
  const news = `<section class="card news"><div class="side-h"><h2>오늘의 토목 뉴스</h2><a class="more" href="#news">더 보기</a></div>${newsItems ? `<ul class="news-l">${newsItems}</ul>` : '<p class="acct-hint">아직 수집된 기사가 없어요</p>'}</section>`;

  // 시험·공채 일정: 확정은 D-day, 발표 전은 시기 글자. 날짜 칸은 확정이면 날짜(접수 기간이면 ~끝), 예정이면 '예정'
  const exams = CNHv2.examList(d.EXAMS, today);
  const examTr = exams.slice(0, PC_ROWS).map(x => { const l = CNHv2.examLabel(x, today); return trRow(x.id, href =>
    `<td><span class="dd ${ddClass(l)}">${esc(l)}</span></td><td>${esc(x.type)}</td>${titleCell(x.title, href)}<td title="${esc(x.org)}">${esc(x.org)}</td><td class="num">${!x.date ? '예정' : x.end ? `${CNHv2.dateLabel(x.date)}~${x.end.slice(5, 7) === x.date.slice(5, 7) ? x.end.slice(8) : CNHv2.dateLabel(x.end)}` : `${CNHv2.dateLabel(x.date)} (${CNHv2.weekdayOf(x.date)})`}</td>`); }).join('');
  const examPanel = `<section class="panel"><div class="panel-h"><h2>시험·공채 일정${exams.length > PC_ROWS ? `<small>${PC_ROWS}개 / 전체 ${exams.length}개</small>` : ''}</h2><a class="more" href="#exams">전체 일정·캘린더에 넣기</a></div>${examTr
    ? `<table class="tbl"><colgroup><col class="c-dd"><col class="c-k"><col><col class="c-org"><col class="c-date"></colgroup><thead><tr><th>남은 날</th><th>구분</th><th>제목</th><th>기관</th><th>날짜</th></tr></thead><tbody>${examTr}</tbody></table>`
    : '<p class="empty">다가오는 일정이 없어요</p>'}</section>`;

  return `<div class="layout"><div class="col">${head}${schedPanel}${examPanel}${freshPanel}</div><aside class="side" aria-label="내 정보와 뉴스">${acct}${cal}${news}</aside></div>`;
}

// 홈 그리기 (다른 탭은 static/v2_pages.js 가 그려요)
V2.renderHome = function(){
  // 새 소식 고르기는 화면과 상관없이 한 번: 두 화면 중 먼저 그리는 쪽이 개수를 정하지 않게 여기서 먼저
  if (CNHv2.hasInterests(interests) && !editingInterests) ensureFresh();
  document.getElementById('pc-home').innerHTML = pcHomeHtml();
  const h = homeHtml();
  document.getElementById('m-home').innerHTML = `${h.head}${h.schedSec}${h.examSec}${h.freshSec}${h.newsSec}`;
};

document.addEventListener('click', e => {
  const chip = e.target.closest('[data-interest]');
  if (chip) {
    const [key, v] = chip.dataset.interest.split(':');
    const cur = interests[key] || [];
    interests = { ...interests, [key]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] };
    try { LS.setItem('cnh-v2-interests', JSON.stringify(interests)); } catch(err){}
    V2.fresh = null;
    if (!editingInterests && CNHv2.hasInterests(interests)) editingInterests = true;  // 처음 고르는 중에는 여러 개를 고를 수 있게 편집 상태 유지
    V2.render(); return;
  }
  if (e.target.closest('[data-interest-edit]')) { editingInterests = true; V2.render(); return; }
  if (e.target.closest('[data-interest-done]')) { editingInterests = false; V2.fresh = null; V2.render(); return; }
  // PC 달력: 달 넘기기(선택은 그 달 기본값으로), 날짜 누르면 그날 일정 (다시 누르면 닫기)
  const mv = e.target.closest('[data-cal]');
  if (mv) { V2.calYM = CNHv2.shiftMonth(V2.calYM || V2.today.slice(0, 7), +mv.dataset.cal); V2.calSel = undefined; V2.render(); return; }
  const day = e.target.closest('[data-cal-day]');
  if (day) { V2.calSel = day.getAttribute('aria-pressed') === 'true' ? null : day.dataset.calDay; V2.render(); return; }
  // PC 표: 줄 아무 곳이나 눌러도 원문 (제목 링크를 직접 누른 건 브라우저가 처리)
  const tr = e.target.closest('#v2pc tr[data-href]');
  if (tr && !e.target.closest('a')) window.open(tr.dataset.href, '_blank', 'noopener');
});

savedListeners.push(() => { renderAuth(); V2.render(); });
renderAuth();
// 탭을 열어 둔 채 오래 두면 뉴스 'N분 전'이, 자정을 넘기면 D-day·오늘 일정이 틀려요: 돌아올 때 다시 계산해 그려요
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const now = Date.now(), t = kstToday();
  let changed = false;
  (V2.data.NEWS || []).forEach(n => { const a = n.iso && CNHv2.relTime(n.iso, now); if (a && a !== n.ago) { n.ago = a; changed = true; } });
  if (t !== V2.today) {
    V2.today = t; changed = true;
    // 홈 새 소식의 공모전 D-day도 새 날짜로, 마감 지난 건 빼요 (V2.fresh 를 비우면 이미 본 항목이라 새 소식이 사라져요)
    if (V2.fresh) V2.fresh = V2.fresh.flatMap(x => {
      const c = x.kind === 'contest' && (V2.data.CONTESTS || []).find(y => String(y.id) === x.id);
      if (!c || !CNHv2.isDate(c.deadline)) return [x];
      return c.deadline < t ? [] : [{ ...x, meta: CNHv2.ddayLabel(c.deadline, t) }];
    });
  }
  if (changed) V2.render();
});
