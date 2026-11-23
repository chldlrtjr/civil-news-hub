/* v2 홈 계산: 일정·마감 임박·관심 분야 새 소식·화면 선택 (화면 없음, node --test 로 검증). 날짜는 모두 'YYYY-MM-DD' 문자열. */
(function () {
  const Tr = typeof module !== 'undefined' && module.exports ? require('./tracker_core.js') : window.CNHTracker;

  const daysBetween = (fromISO, toISO) => Math.round((Date.parse(toISO + 'T00:00:00Z') - Date.parse(fromISO + 'T00:00:00Z')) / 86400000);
  const ddayLabel = (date, today) => { const d = daysBetween(today, date); return d === 0 ? 'D-DAY' : 'D-' + d; };
  const dateLabel = (date) => date.slice(5, 7) + '.' + date.slice(8, 10);
  // '상시모집' 같은 글자는 문자열 비교로 미래 날짜처럼 보여서 D-NaN 이 돼요: 날짜 모양만 받아요
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const upcoming = (d, today) => isDate(d) && d >= today;

  // 종류마다 다른 필드 이름을 일정 한 줄 모양으로 맞춰요
  const FIELDS = {
    contest: (x) => [x.title, x.org, x.deadline],
    job: (x) => [x.role, x.co, x.deadline],
    alba: (x) => [x.title, x.where, x.deadline_date],
  };
  function row(kind, x, date, what, today) {
    const [title, org] = FIELDS[kind](x);
    return { id: String(x.id), kind, title: title || '', org: org || '', date, what, label: what === 'result' ? dateLabel(date) : ddayLabel(date, today) };
  }
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title < b.title ? -1 : a.title > b.title ? 1 : 0);

  function scheduleItems(src, today) {
    const out = [];
    const seen = new Set();
    const pools = [['contest', src.contests || []], ['job', src.jobs || []], ['alba', src.albas || []]];
    const byId = new Map();
    for (const [, list] of pools) for (const x of list) if (!byId.has(String(x.id))) byId.set(String(x.id), x);
    // index.html 처럼 마감 연장·발표일 공개를 최신 수집 데이터로 반영한 뒤 계산 (저장은 하지 않아요)
    for (const c of Tr.visible(src.tracked || []).map((c0) => Tr.refreshFromSource(c0, byId.get(String(c0.id))))) {
      seen.add(String(c.id));
      const stage = Tr.stageOf(c, today);
      const [date, what] = stage === 'review' ? [c.resultDate, 'result'] : stage === 'todo' || stage === 'submitted' ? [c.deadline, 'deadline'] : [];
      if (upcoming(date, today)) out.push({ id: String(c.id), kind: c.kind, title: c.title || '', org: c.org || '', date, what, label: what === 'result' ? dateLabel(date) : ddayLabel(date, today) });
    }
    for (const id of src.saved || []) {
      if (seen.has(String(id))) continue;
      for (const [kind, list] of pools) {
        const x = list.find((y) => String(y.id) === String(id));
        if (!x) continue;
        const date = FIELDS[kind](x)[2];
        if (upcoming(date, today)) { out.push(row(kind, x, date, 'deadline', today)); seen.add(String(id)); }
        break;
      }
    }
    return out.sort(byDate);
  }

  function urgentFallback(src, today, n = 3) {
    const rows = [];
    for (const [kind, list] of [['contest', src.contests || []], ['job', src.jobs || []]]) {
      for (const x of list) { const date = FIELDS[kind](x)[2]; if (upcoming(date, today)) rows.push(row(kind, x, date, 'deadline', today)); }
    }
    return rows.sort(byDate).slice(0, n);
  }

  // 데이터마다 분류가 달라서 관심 분야를 세 묶음으로 골라요 (뉴스 cat · 공모전 category · 채용 grp)
  const INTEREST_GROUPS = [
    { key: 'news', title: '뉴스 분야', options: [['general', '토목 종합'], ['road', '도로·교량·철도'], ['water', '수자원·하천·항만'], ['tunnel', '터널·지반·안전'], ['smart', '스마트건설·정책']] },
    { key: 'contests', title: '공모전 종류', options: [['토목', '토목'], ['전북대', '전북대'], ['컴퓨터공학', '컴퓨터공학']] },
    { key: 'jobs', title: '채용 기관', options: [['public', '공기업·공공기관'], ['major', '건설·민간기업'], ['design', '설계·엔지니어링']] },
  ];
  const hasInterests = (it) => !!it && ['news', 'contests', 'jobs'].some((k) => Array.isArray(it[k]) && it[k].length > 0);

  // 날짜 내림차순, 날짜 없는 건 맨 뒤 (정렬은 안정적이라 같은 날짜는 원래 순서 유지)
  const newestFirst = (list, dateOf) => list.slice().sort((a, b) => { const x = dateOf(a), y = dateOf(b); return x === y ? 0 : !x ? 1 : !y ? -1 : x < y ? 1 : -1; });

  // 공고에는 수집 시각이 없어서 "아직 홈에 띄운 적 없는 항목"을 새 소식으로 봐요
  function freshItems(src, interests, seen, today, n = 3) {
    const it = interests || {};
    const skip = new Set(seen || []);
    const want = (k, v) => Array.isArray(it[k]) && it[k].includes(v);
    const queues = [
      (src.news || []).filter((x) => want('news', x.cat)).map((x) => ({ id: String(x.id), kind: 'news', title: x.title || '', meta: x.src || '', badge: '새 기사' })),
      newestFirst((src.contests || []).filter((x) => want('contests', x.category) && !(isDate(x.deadline) && x.deadline < today)), (x) => x.startDate || '')
        .map((x) => ({ id: String(x.id), kind: 'contest', title: x.title || '', meta: isDate(x.deadline) ? ddayLabel(x.deadline, today) : x.org || '', badge: '새 공고' })),
      newestFirst((src.jobs || []).filter((x) => want('jobs', x.grp)), (x) => Tr.startFromPeriod(x.period))
        .map((x) => ({ id: String(x.id), kind: 'job', title: x.role || '', meta: x.co || '', badge: '새 공고' })),
    ].map((q) => q.filter((x) => !skip.has(x.id)));
    const out = [];
    while (out.length < n && queues.some((q) => q.length)) for (const q of queues) if (q.length && out.length < n) out.push(q.shift());
    return out;
  }

  const rememberSeen = (seen, ids, cap = 500) => { const add = new Set(ids); return [...(seen || []).filter((x) => !add.has(x)), ...ids].slice(-cap); };

  // 저장값이 막혀 있거나 깨졌거나 형식이 다르면 기본값으로
  function readJSON(storage, key, fallback) {
    try {
      const v = JSON.parse(storage.getItem(key));
      if (v === null || typeof v !== 'object' || Array.isArray(v) !== Array.isArray(fallback)) return fallback;
      return v;
    } catch (e) { return fallback; }
  }

  // index.html isPhoneDevice() 와 같은 규칙: 태블릿은 PC, 스마트폰은 모바일, 그 밖엔 창 너비 600px 이하만 모바일
  function isPhone({ ua = '', platform = '', maxTouchPoints = 0, width = 0 }) {
    if (/iPad/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)) return false;
    if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return false;
    if (/iPhone|iPod/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua)) || /BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
    return width <= 600;
  }

  // PC 사이드 달력: 'YYYY-MM' 한 달을 일요일 시작 주 단위로, 그 달이 아닌 칸은 ''
  const pad = (n) => String(n).padStart(2, '0');
  const weekdayOf = (date) => '일월화수목금토'[new Date(date + 'T00:00:00Z').getUTCDay()];
  function shiftMonth(ym, delta) {
    const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + delta, 1));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1);
  }
  function monthGrid(ym) {
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = [...Array(first).fill(''), ...Array.from({ length: days }, (_, i) => ym + '-' + pad(i + 1))];
    while (cells.length % 7) cells.push('');
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  // ---- 탭 목록: 지난 공고는 빼고 마감이 가까운 순. 마감이 날짜가 아니면(상시) 맨 뒤 ----
  const isOpen = (deadline, today) => !isDate(deadline) || deadline >= today;
  const ddayOf = (deadline, today) => (!isDate(deadline) ? '상시' : deadline < today ? '마감' : ddayLabel(deadline, today));
  const soonest = (dateOf) => (a, b) => {
    const x = dateOf(a), y = dateOf(b), dx = isDate(x), dy = isDate(y);
    return dx !== dy ? (dx ? -1 : 1) : !dx || x === y ? 0 : x < y ? -1 : 1;
  };
  function contestList(list, { cat = 'all', sort = 'deadline' } = {}, today) {
    const open = (list || []).filter((x) => isOpen(x.deadline, today) && (cat === 'all' || x.category === cat));
    return sort === 'new' ? newestFirst(open, (x) => x.startDate || '') : open.slice().sort(soonest((x) => x.deadline));
  }
  function jobList(list, { lvl = '전체', org = 'all' } = {}, today) {
    return (list || []).filter((x) => isOpen(x.deadline, today) && (lvl === '전체' || (x.lvl || '').includes(lvl)) && (org === 'all' || x.grp === org))
      .sort(soonest((x) => x.deadline));
  }
  const albaList = (list, today) => (list || []).filter((x) => isOpen(x.deadline_date, today)).sort(soonest((x) => x.deadline_date));
  const newsList = (list, cat = 'all') => (list || []).filter((x) => cat === 'all' || x.cat === cat);
  const countBy = (list, key) => (list || []).reduce((m, x) => { const k = key(x); m[k] = (m[k] || 0) + 1; return m; }, {});

  // 검색: 제목과 출처(기관·언론사)에서 찾아요. 공고는 지금 지원할 수 있는 것만
  function searchAll(src, q, today) {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) return null;
    const hit = (...fields) => fields.some((f) => String(f || '').toLowerCase().includes(needle));
    return {
      news: (src.news || []).filter((x) => hit(x.title, x.src)),
      contests: contestList(src.contests, {}, today).filter((x) => hit(x.title, x.org)),
      jobs: jobList(src.jobs, {}, today).filter((x) => hit(x.role, x.co)),
      albas: albaList(src.albas, today).filter((x) => hit(x.title, x.where)),
    };
  }

  // 북마크 id → 종류와 항목. Set 순서가 저장한 순서라 뒤집어서 최근 것부터
  function savedList(savedIds, src) {
    const pools = [['news', src.news], ['contest', src.contests], ['job', src.jobs], ['alba', src.albas], ['sw', src.sw]];
    const out = [];
    for (const id of [...(savedIds || [])].reverse()) {
      for (const [kind, list] of pools) {
        const item = (list || []).find((y) => String(y.id) === String(id));
        if (item) { out.push({ kind, item }); break; }
      }
    }
    return out;
  }

  // 로그인 연령: 출생연도 기준 19세가 되는 해부터 (청소년 보호법 제2조 제1호와 같은 연 나이 셈법)
  function loginAllowed(birthYear, thisYear) {
    const y = Number(birthYear);
    return Number.isInteger(y) && y >= 1900 && y <= thisYear && thisYear - y >= 19;
  }

  const API = { loginAllowed, ddayLabel, dateLabel, scheduleItems, urgentFallback, INTEREST_GROUPS, hasInterests, freshItems, rememberSeen, readJSON, isPhone, monthGrid, shiftMonth, weekdayOf,
    isDate, ddayOf, contestList, jobList, albaList, newsList, countBy, searchAll, savedList };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else window.CNHv2 = API;
})();
