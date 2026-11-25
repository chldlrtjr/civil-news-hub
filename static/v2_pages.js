/* v2 탭 화면: 뉴스·공모전·채용·전북대·마이·저장·검색과 주소(#해시) 이동.
   PC는 "목록 + 오른쪽 상세" 두 칸(눌러도 페이지가 바뀌지 않고 오른쪽에 자세히), 모바일은 "목록 + 아래에서 올라오는 상세 시트".
   두 화면은 같은 데이터·북마크·진행 카드를 쓰고 마크업은 각자 가져요. 이모지 금지.
   static/v2_main.js(V2, LS, interests, editingInterests, KIND, isWeb, linkOf, renderAuth)와 v2_state.js 를 이어서 써요. */
(() => {
  const D = () => V2.data;
  const PER = { pc: 10, m: 6 };  // 처음 보여 줄 줄 수 (덜어내기 규칙 2), 더 보기로 같은 수만큼 더
  const ui = V2.ui = {
    route: 'home', q: '',
    newsCat: 'all', contestCat: 'all', contestSort: 'deadline', jobLvl: '전체', jobOrg: 'all', jbnuSeg: 'contest', mySeg: 'active',
    shown: {}, sel: {}, sheet: null, confirmDel: null,
  };
  const ROUTES = ['home', 'news', 'contests', 'jobs', 'jbnu', 'my', 'saved', 'search'];
  const TITLES = { home: '홈', news: '뉴스', contests: '공모전', jobs: '채용', jbnu: '전북대', my: '마이페이지', saved: '저장', search: '검색' };
  // 필터 칩은 한 줄에 들어가게 짧은 이름 (관심 분야 고르기는 긴 이름)
  const NEWS_CATS = [['all', '전체'], ['general', '토목 종합'], ['road', '도로·철도'], ['water', '수자원·항만'], ['tunnel', '터널·지반'], ['smart', '스마트건설']];
  const CONTEST_CATS = [['all', '전체'], ['토목', '토목'], ['컴퓨터공학', '컴퓨터공학'], ['전북대', '전북대']];
  const COLOR = { general: 'general', road: 'road', water: 'water', tunnel: 'tunnel', smart: 'smart', '토목': 'road', '컴퓨터공학': 'smart', '전북대': 'water' };
  const JOB_LVLS = ['전체', '인턴', '신입', '경력'];
  const JOB_ORGS = [['all', '모든 기관'], ['public', '공기업·공공기관'], ['major', '건설·민간기업'], ['design', '설계·엔지니어링']];
  const GRP_NAME = { public: '공기업·공공기관', major: '건설·민간기업', design: '설계·엔지니어링' };
  const KIND_NAME = { news: '뉴스', contest: '공모전', job: '채용', alba: '알바', sw: 'SW 프로그램' };
  const POOL = { news: 'NEWS', contest: 'CONTESTS', job: 'JOBS', alba: 'ALBA', sw: 'SW' };
  const catName = (id) => (NEWS_CATS.find(([v]) => v === id) || [, '토목 종합'])[1];
  const SVG = (d, fill = 'none') => `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" aria-hidden="true">${d}</svg>`;
  const I = {
    bm: SVG('<path d="M6 3h12v18l-6-4-6 4z"/>'),
    trash: SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    out: SVG('<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>'),
  };

  const keyOf = (kind, x) => kind + ':' + String(x.id);
  function findItem(key) {
    if (!key) return null;
    const i = key.indexOf(':'), kind = key.slice(0, i), id = key.slice(i + 1);
    const item = (D()[POOL[kind]] || []).find((x) => String(x.id) === id);
    return item ? { kind, item } : null;
  }
  const ddCls = (l) => (l === 'D-DAY' ? 'hot' : /^D-[1-3]$/.test(l) ? 'soon' : l === '마감' ? 'off' : '');
  const ddPill = (l) => (l ? `<span class="dd ${ddCls(l)}">${l}</span>` : '');
  const mmdd = (iso) => (iso ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}` : '');
  const dayText = (iso) => (CNHv2.isDate(iso) ? `${CNHv2.dateLabel(iso)} (${CNHv2.weekdayOf(iso)})` : '');
  const isPhoneView = () => document.getElementById('v2pc').hidden;

  /* ---------- 목록 한 줄: 제목, 출처, D-day만 (규칙 3). 나머지는 상세에서 ---------- */
  function rowView(kind, x) {
    const t = V2.today;
    if (kind === 'news') return { title: x.title, sub: [x.src, x.ago].filter(Boolean).join(' · '), color: x.cat, dd: '' };
    if (kind === 'contest') return { title: x.title, sub: x.org, color: COLOR[x.category], dd: CNHv2.ddayOf(x.deadline, t) };
    if (kind === 'job') return { title: x.role, sub: x.co, dd: CNHv2.ddayOf(x.deadline, t) };
    if (kind === 'alba') return { title: x.title, sub: [x.where, x.wageText].filter(Boolean).join(' · '), dd: CNHv2.ddayOf(x.deadline_date, t) };
    return { title: x.title, sub: x.kind, dd: CNHv2.ddayOf(x.deadline_date, t) };
  }
  const saveBtn = (id, cls, withText) => {
    const on = saved.has(String(id));
    return `<button type="button" class="${cls}" data-save="${esc(id)}" aria-pressed="${on}" aria-label="${on ? '저장 취소' : '저장'}">${I.bm}${withText ? (on ? '저장됨' : '저장') : ''}</button>`;
  };
  function rowHtml(e, selKey) {
    const v = rowView(e.kind, e.item), k = keyOf(e.kind, e.item), on = selKey === k;
    return `<li class="lr${on ? ' on' : ''}"><button type="button" class="lr-main" data-open="${esc(k)}"${on ? ' aria-current="true"' : ''}>${ddPill(v.dd)}`
      + `<span class="lr-txt"><span class="lr-t">${esc(v.title)}</span><span class="lr-s">${v.color ? `<i class="dot" style="--dot:var(--c-${v.color})"></i>` : ''}${esc(v.sub)}</span></span></button>`
      + `${saveBtn(e.item.id, 'lr-bm')}</li>`;
  }
  // entries: [{kind, item}]. 화면마다 펼친 개수를 따로 기억해요
  function listHtml(screen, key, entries, selKey, empty) {
    if (!entries.length) return `<p class="l-empty">${empty || '조건에 맞는 항목이 없어요'}</p>`;
    const n = ui.shown[screen + ':' + key] || PER[screen];
    return `<ul class="lrows">${entries.slice(0, n).map((e) => rowHtml(e, selKey)).join('')}</ul>`
      + (entries.length > n ? `<button type="button" class="more-btn" data-more="${screen}:${key}">더 보기<span>${n} / ${entries.length}</span></button>` : '');
  }
  const as = (kind, list) => list.map((item) => ({ kind, item }));

  const CHIP_LABEL = { newsCat: '뉴스 분야', contestCat: '공모전 종류', jobLvl: '경력 구분', jbnuSeg: '전북대 항목', mySeg: '마이 페이지 항목' };
  const chips = (field, opts, cur, counts) => `<div class="chips" role="group" aria-label="${CHIP_LABEL[field] || ''}">${opts.map(([v, l]) =>
    `<button type="button" class="chip" data-f="${field}" data-v="${esc(v)}" aria-pressed="${cur === v}">${esc(l)}${counts && counts[v] != null ? `<span>${counts[v]}</span>` : ''}</button>`).join('')}</div>`;
  const select = (field, opts, cur, label) => `<label class="sel"><span class="sr">${label}</span><select data-f="${field}">${opts.map(([v, l]) =>
    `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const withAll = (counts, total) => ({ all: total, ...counts });

  /* ---------- 상세 (PC 오른쪽 칸과 모바일 시트가 같은 내용) ---------- */
  // 못 불러온 포스터(주소 오류·CSP img-src 밖 주소)는 빈 칸 대신 지워요. CSP 가 인라인 onerror 를 막아서 문서에서 가로채요(error 는 거품이 안 올라와 캡처로)
  document.addEventListener('error', (e) => { if (e.target instanceof HTMLImageElement && e.target.classList.contains('poster')) e.target.remove(); }, true);
  function detailHtml(kind, x, titleId) {
    const t = V2.today, rows = [], blocks = [];
    const dl = (k, v) => { if (v) rows.push(`<div><dt>${k}</dt><dd>${v}</dd></div>`); };
    // 상세 사진은 이제 포스터만: 무엇의 포스터인지 대체 텍스트로 알려요 (내용은 아래 글로도 제공)
    const img = (src, title) => (isWeb(src) ? `<img class="dt-img poster" src="${esc(src)}" alt="${esc(title)} 포스터" loading="lazy" referrerpolicy="no-referrer">` : '');
    const due = (d) => (CNHv2.isDate(d) ? `${dayText(d)} ${ddPill(CNHv2.ddayOf(d, t))}` : '상시 모집');
    let meta = '', media = '', lede = '', dd = '';
    if (kind === 'news') {
      // 기사 사진은 언론사 허락이 없어 보여 주지 않아요(저작권): 제목·출처·원문 링크만
      meta = [x.src, x.ago].filter(Boolean).join(' · ');
      if (x.lede && x.lede !== x.title) lede = `<p class="dt-p">${esc(x.lede)}</p>`;
      dl('분야', `<i class="dot" style="--dot:var(--c-${x.cat})"></i>${esc(catName(x.cat))}`);
      const rel = (x.clusters || []).filter((r) => isWeb(r.link));
      if (rel.length) blocks.push(`<h3 class="dt-h">같은 소식을 다룬 기사 ${rel.length}</h3><ul class="dt-links">${rel.map((r) =>
        `<li><a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer"><b>${esc(r.publisher)}</b>${esc(r.title)}</a></li>`).join('')}</ul>`);
    } else if (kind === 'contest') {
      meta = x.org; media = img(x.image, x.title); dd = ddPill(CNHv2.ddayOf(x.deadline, t));
      dl('분야', `<i class="dot" style="--dot:var(--c-${COLOR[x.category] || 'general'})"></i>${esc(x.category)}`);
      dl('주최', esc(x.org)); dl('접수 기간', esc(x.period)); dl('마감', due(x.deadline));
      dl('결과 발표', esc(x.resultLabel || dayText(x.resultDate)));
      dl('시상', [x.award && esc(x.award), x.prize ? `<b class="prize">총 ${x.prize.toLocaleString('ko-KR')}만 원</b>` : ''].filter(Boolean).join(' · '));
      dl('대상', esc(x.targetText || (x.target || []).join(', '))); dl('출처', esc(x.srcName));
      if (x.description) lede = `<p class="dt-p">${esc(x.description)}</p>`;
    } else if (kind === 'job') {
      meta = x.co; dd = ddPill(CNHv2.ddayOf(x.deadline, t));
      dl('기관', esc(x.co)); dl('구분', GRP_NAME[x.grp] || ''); dl('채용 형태', esc(x.lvl)); dl('근무지', esc(x.loc));
      dl('접수 기간', esc(x.period)); dl('마감', due(x.deadline));
      const steps = (x.steps || []).filter((s) => s && s !== '공고 원문 참조');
      if (steps.length) blocks.push(`<h3 class="dt-h">전형 단계</h3><ol class="dt-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`);
      if ((x.welfare || []).length) blocks.push(`<div class="dt-tags">${x.welfare.map((w) => `<span>${esc(w)}</span>`).join('')}</div>`);
      if (x.summary) blocks.push(`<h3 class="dt-h">지원 자격</h3><p class="dt-p pre">${esc(x.summary)}</p>`);
    } else if (kind === 'alba') {
      meta = x.where; dd = ddPill(CNHv2.ddayOf(x.deadline_date, t));
      dl('근무처', esc(x.where)); dl('급여', `<b class="prize">${esc(x.wageText)}</b>`); dl('근무 시간', esc(x.time));
      dl('모집 인원', esc(x.person)); dl('분류', esc(x.tag)); dl('등록일', dayText(x.reg_date)); dl('마감', due(x.deadline_date));
    } else {
      meta = x.kind; media = img(x.image, x.title); dd = ddPill(CNHv2.ddayOf(x.deadline_date, t));
      dl('종류', esc(x.kind)); dl('활동 기간', esc(x.when)); dl('정원', esc(x.seats));
      dl('장소', x.location && x.location !== '-' ? esc(x.location) : ''); dl('마감', due(x.deadline_date));
    }
    const acts = [isWeb(x.link) ? `<a class="btn pri" href="${esc(x.link)}" target="_blank" rel="noopener noreferrer">원문 보기${I.out}</a>` : '', saveBtn(x.id, 'btn', true)];
    if (kind === 'contest' || kind === 'job') {
      const on = CNHTracker.visible(tracked).some((c) => c.id === String(x.id));
      acts.push(on ? '<a class="btn" href="#my">도전 중 · 마이에서 보기</a>' : `<button type="button" class="btn" data-track="${kind}:${esc(x.id)}">도전 목록에 추가</button>`);
    }
    // 마감일 캘린더에 넣기: 마감일이 오늘 이후인 공모전·채용만 (calEvent 가 아니면 null)
    const ev = CNHv2.calEvent(kind, x, t);
    const cal = ev ? `<div class="dt-cal" role="group" aria-label="마감일 캘린더에 넣기"><span>마감일 캘린더에 넣기</span><a class="btn sm" href="${esc(CNHv2.calGoogleUrl(ev))}" target="_blank" rel="noopener noreferrer">Google 캘린더<span class="sr"> (새 탭)</span></a>`
      + `<button type="button" class="btn sm" data-ics="${kind}:${esc(x.id)}">다른 캘린더 (.ics)</button></div>` : '';
    return `<article class="dt"><div class="dt-top"><span class="dt-kind">${KIND_NAME[kind]}</span>${dd}</div>`
      + `<h2 class="dt-t"${titleId ? ` id="${titleId}"` : ''}>${esc(kind === 'job' ? x.role : x.title)}</h2>${meta ? `<p class="dt-meta">${esc(meta)}</p>` : ''}`
      + `${media}<div class="dt-acts">${acts.join('')}</div>${cal}${lede}${rows.length ? `<dl class="dt-dl">${rows.join('')}</dl>` : ''}${blocks.join('')}</article>`;
  }

  /* ---------- 탭마다 무엇을 보여 줄지 (두 화면이 같이 써요) ---------- */
  function model(route) {
    const d = D(), t = V2.today;
    if (route === 'news') {
      const all = d.NEWS || [];
      const kws = (d.TRENDS || []).map(([k]) => k).filter(Boolean).slice(0, 8);
      return {
        title: '뉴스', sub: `기사 ${all.length}개${d.meta && d.meta.lastUpdated ? ` · ${d.meta.lastUpdated} 업데이트` : ''}`,
        kws, filters: chips('newsCat', NEWS_CATS, ui.newsCat, withAll(CNHv2.countBy(all, (x) => x.cat), all.length)),
        groups: [{ key: 'news', entries: as('news', CNHv2.newsList(all, ui.newsCat)), empty: '이 분야 기사가 아직 없어요' }],
      };
    }
    if (route === 'contests') {
      const open = CNHv2.contestList(d.CONTESTS, {}, t);
      return {
        title: '공모전', sub: `지금 접수 중인 공모전 ${open.length}개`,
        filters: chips('contestCat', CONTEST_CATS, ui.contestCat, withAll(CNHv2.countBy(open, (x) => x.category), open.length))
          + select('contestSort', [['deadline', '마감 가까운 순'], ['new', '새로 올라온 순']], ui.contestSort, '정렬'),
        groups: [{ key: 'contests', entries: as('contest', CNHv2.contestList(d.CONTESTS, { cat: ui.contestCat, sort: ui.contestSort }, t)), empty: '이 분야에 접수 중인 공모전이 없어요' }],
      };
    }
    if (route === 'jobs') {
      const byOrg = CNHv2.jobList(d.JOBS, { org: ui.jobOrg }, t);
      const counts = Object.fromEntries(JOB_LVLS.map((l) => [l, CNHv2.jobList(byOrg, { lvl: l }, t).length]));
      const pages = (d.CAREER_PAGES || []).filter((p) => isWeb(p.link));
      return {
        title: '채용', sub: `지원할 수 있는 공고 ${CNHv2.jobList(d.JOBS, {}, t).length}개 · 마감 가까운 순`,
        filters: chips('jobLvl', JOB_LVLS.map((l) => [l, l]), ui.jobLvl, counts) + select('jobOrg', JOB_ORGS, ui.jobOrg, '기관 구분'),
        groups: [{ key: 'jobs', entries: as('job', CNHv2.jobList(d.JOBS, { lvl: ui.jobLvl, org: ui.jobOrg }, t)), empty: '조건에 맞는 공고가 없어요. 채용 형태나 기관을 바꿔 보세요' }],
        foot: pages.length ? `<details class="fold"><summary>공채 소식에 안 올라오는 기관 채용 페이지<span>${pages.length}</span></summary><ul class="fold-links">${pages.map((p) =>
          `<li><a href="${esc(p.link)}" target="_blank" rel="noopener noreferrer"><b>${esc(p.co)}</b><span>${GRP_NAME[p.grp] || ''}</span></a></li>`).join('')}</ul></details>` : '',
      };
    }
    if (route === 'jbnu') {
      const segs = {
        contest: as('contest', CNHv2.contestList(d.CONTESTS, { cat: '전북대' }, t)),
        alba: as('alba', CNHv2.albaList(d.ALBA, t)),
        sw: as('sw', CNHv2.albaList(d.SW, t)),
      };
      const empty = { contest: '지금 접수 중인 교내 공모전이 없어요', alba: '지금 모집 중인 알바가 없어요', sw: '지금 모집 중인 SW 프로그램이 없어요' };
      return {
        title: '전북대', sub: '교내 공모전, 학생 알바, SW중심대학 프로그램',
        filters: chips('jbnuSeg', [['contest', '교내 공모전'], ['alba', '알바'], ['sw', 'SW 프로그램']], ui.jbnuSeg, { contest: segs.contest.length, alba: segs.alba.length, sw: segs.sw.length }),
        groups: [{ key: 'jbnu-' + ui.jbnuSeg, entries: segs[ui.jbnuSeg], empty: empty[ui.jbnuSeg] }],
      };
    }
    if (route === 'saved') {
      const entries = CNHv2.savedList(saved, { news: d.NEWS, contests: d.CONTESTS, jobs: d.JOBS, albas: d.ALBA, sw: d.SW });
      return { title: '저장', sub: entries.length ? `저장한 항목 ${entries.length}개 · 최근에 저장한 순` : '', groups: [{ key: 'saved', entries, empty: '목록의 책갈피 버튼을 누르면 여기에 모여요' }] };
    }
    if (route === 'search') {
      const r = CNHv2.searchAll({ news: d.NEWS, contests: d.CONTESTS, jobs: d.JOBS, albas: d.ALBA }, ui.q, t);
      const kws = (d.TRENDS || []).map(([k]) => k).filter(Boolean).slice(0, 8);
      if (!r) return { title: '검색', sub: '뉴스 제목, 공모전·채용 공고, 알바에서 찾아요', kws, groups: [], searchEmpty: true };
      const groups = [['news', 'news', '뉴스'], ['contests', 'contest', '공모전'], ['jobs', 'job', '채용'], ['albas', 'alba', '알바']]
        .filter(([k]) => r[k].length).map(([k, kind, label]) => ({ key: 'search-' + k, label, entries: as(kind, r[k]) }));
      const total = groups.reduce((n, g) => n + g.entries.length, 0);
      return { title: `'${ui.q}' 검색 결과`, sub: total ? `${total}건 · 지금 지원할 수 있는 공고만` : '', kws: total ? [] : kws, groups, noHit: !total };
    }
    return null;
  }
  const kwHtml = (kws) => (kws && kws.length ? `<div class="kws"><span>많이 나온 키워드</span>${kws.map((k) => `<a class="kw" href="#search=${encodeURIComponent(k)}">${esc(k)}</a>`).join('')}</div>` : '');
  const groupsHtml = (screen, m, selKey) => {
    if (m.searchEmpty) return '<p class="l-empty">검색어를 입력해 주세요</p>';
    if (m.noHit) return `<p class="l-empty">'${esc(ui.q)}'에 맞는 결과가 없어요. 다른 낱말로 찾아보세요</p>`;
    return m.groups.map((g) => (g.label ? `<h3 class="grp-h">${g.label}<span>${g.entries.length}</span></h3>` : '') + listHtml(screen, g.key, g.entries, selKey, g.empty)).join('');
  };

  /* ---------- PC: 머리 → (목록 | 상세) ---------- */
  function pcPageHtml(route) {
    if (route === 'my') return pcMyHtml();
    const m = model(route);
    const shownEntries = m.groups.flatMap((g) => g.entries.slice(0, ui.shown['pc:' + g.key] || PER.pc));
    let selKey = ui.sel[route];
    if (!shownEntries.some((e) => keyOf(e.kind, e.item) === selKey)) selKey = shownEntries.length ? keyOf(shownEntries[0].kind, shownEntries[0].item) : null;
    const sel = findItem(selKey);
    const solo = m.searchEmpty || m.noHit;  // 보여 줄 상세가 없으면 빈 칸을 두지 않아요
    return `<div class="pg-head"><h1>${esc(m.title)}</h1>${m.sub ? `<p class="sub">${esc(m.sub)}</p>` : ''}${kwHtml(m.kws)}</div>
      <div class="md${solo ? ' solo' : ''}"><section class="md-list" aria-label="${esc(m.title)} 목록">${m.filters ? `<div class="fbar">${m.filters}</div>` : ''}${groupsHtml('pc', m, selKey)}${m.foot || ''}</section>
      ${solo ? '' : `<aside class="md-detail" aria-label="자세히">${sel ? detailHtml(sel.kind, sel.item) : '<p class="dt-empty">목록에서 항목을 고르면 여기에 자세히 보여 드려요</p>'}</aside>`}</div>`;
  }

  /* ---------- 모바일: 머리 → 필터 한 줄 → 목록, 누르면 시트 ---------- */
  function mPageHtml(route) {
    if (route === 'my') return mMyHtml();
    const m = model(route);
    const search = route === 'search' ? `<form class="m-search" role="search" data-search-form><label class="sr" for="m-q">검색어</label><input id="m-q" type="search" name="q" value="${esc(ui.q)}" placeholder="뉴스·공모전·채용 검색" autocomplete="off"><button type="submit" class="btn pri">검색</button></form>` : '';
    return `<div class="m-head"><h1>${esc(m.title)}</h1>${m.sub ? `<p>${esc(m.sub)}</p>` : ''}</div>${search}
      ${m.filters ? `<div class="m-fbar">${m.filters}</div>` : ''}${route === 'search' && m.kws && m.kws.length ? `<div class="m-kws">${kwHtml(m.kws)}</div>` : ''}
      <section class="m-sec">${groupsHtml('m', m, null)}${m.foot || ''}</section>`;
  }

  /* ---------- 마이: 진행 중인 도전 / 저장한 공고 / 내 기록 + 계정·관심 분야·화면 ---------- */
  const STEPS = ['todo', 'submitted', 'review', 'result'];
  const tkBtn = (act, id, label, cls = '') => `<button type="button" class="btn sm ${cls}" data-trk="${act}" data-id="${esc(id)}">${label}</button>`;
  function trkHtml(c, t) {
    const T = CNHTracker, s = T.stageOf(c, t), win = tkBtn('win', c.id, '수상·합격', 'pri') + tkBtn('lose', c.id, '미선정');
    let sub = '', btns = '';
    if (s === 'todo') { const d = c.deadline ? T.daysBetween(t, c.deadline) : null; sub = d == null ? '상시 모집' : d === 0 ? '오늘 마감' : `마감까지 ${d}일`; btns = tkBtn('submit', c.id, '제출했어요', 'pri'); }
    if (s === 'missed') { sub = `${mmdd(c.deadline)} 마감, 제출 기록 없음`; btns = tkBtn('submit', c.id, '제출했어요'); }
    if (s === 'submitted') { sub = `${mmdd(c.submittedAt)} 제출` + (c.deadline ? ` · ${mmdd(c.deadline)} 마감` : ''); btns = (c.deadline ? '' : win) + tkBtn('unsubmit', c.id, '되돌리기'); }
    if (s === 'review') {
      sub = `심사 ${Math.max(0, T.daysBetween(c.deadline, t))}일째` + (c.resultDate || c.resultLabel ? ` · 발표 예정 ${esc(c.resultLabel || mmdd(c.resultDate))}` : '');
      if (c.resultDate && t > c.resultDate) sub += '<b>결과가 나왔을 거예요. 확인해 보세요</b>';
      btns = win + tkBtn('unsubmit', c.id, '되돌리기');
    }
    if (ui.confirmDel === c.id) btns = `<span class="cf">삭제할까요? 되돌릴 수 없어요</span>${tkBtn('del-no', c.id, '취소')}${tkBtn('del-yes', c.id, '삭제', 'danger')}`;
    const at = s === 'missed' ? -1 : STEPS.indexOf(s);
    const prog = `<ol class="prog" aria-label="진행 단계: ${T.LABEL[s]}">${STEPS.map((k, j) => `<li class="${j < at ? 'done' : j === at ? 'now' : ''}">${T.LABEL[k]}</li>`).join('')}</ol>`;
    return `<li class="tk${s === 'missed' ? ' off' : ''}"><div class="tk-top"><span>${c.kind === 'job' ? '채용' : '공모전'} · ${esc(c.org)}</span><span class="badge s-${s}">${T.LABEL[s]}</span></div>
      ${isWeb(c.link) ? `<a class="tk-t" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer">${esc(c.title)}</a>` : `<span class="tk-t">${esc(c.title)}</span>`}
      ${prog}<p class="tk-sub">${sub}</p><div class="tk-acts">${btns}${ui.confirmDel === c.id ? '' : `<button type="button" class="tk-del" data-trk="del" data-id="${esc(c.id)}" aria-label="${esc(c.title)} 삭제">${I.trash}</button>`}</div></li>`;
  }
  function recHtml(c) {
    const conf = ui.confirmDel === c.id;
    return `<li class="rec"><span class="res ${c.result === 'win' ? 'win' : 'lose'}">${c.result === 'win' ? '수상·합격' : '미선정'}</span>
      <div class="rec-m">${isWeb(c.link) ? `<a href="${esc(c.link)}" target="_blank" rel="noopener noreferrer">${esc(c.title)}</a>` : `<b>${esc(c.title)}</b>`}
      <span>${c.kind === 'job' ? '채용' : '공모전'} · ${esc(c.org)} · ${c.submittedAt ? mmdd(c.submittedAt) + ' 제출 · ' : ''}${mmdd(c.resultAt)} 결과</span></div>
      <div class="tk-acts">${conf ? `${tkBtn('del-no', c.id, '취소')}${tkBtn('del-yes', c.id, '삭제', 'danger')}` : `${tkBtn('undo', c.id, '되돌리기')}<button type="button" class="tk-del" data-trk="del" data-id="${esc(c.id)}" aria-label="${esc(c.title)} 삭제">${I.trash}</button>`}</div></li>`;
  }
  function myModel(screen) {
    const d = D(), t = V2.today;
    const src = new Map([...(d.CONTESTS || []), ...(d.JOBS || [])].map((x) => [String(x.id), x]));
    const cards = CNHTracker.visible(tracked).map((c) => CNHTracker.refreshFromSource(c, src.get(c.id)));
    const active = CNHTracker.sortActive(cards, t), recs = CNHTracker.sortRecords(cards);
    const savedEntries = CNHv2.savedList(saved, { news: d.NEWS, contests: d.CONTESTS, jobs: d.JOBS, albas: d.ALBA, sw: d.SW });
    const segs = chips('mySeg', [['active', '진행 중인 도전'], ['saved', '저장한 항목'], ['records', '내 기록']], ui.mySeg, { active: active.length, saved: savedEntries.length, records: recs.length });
    let body;
    if (ui.mySeg === 'active') body = active.length ? `<ul class="tks">${active.map((c) => trkHtml(c, t)).join('')}</ul>`
      : '<div class="l-empty">진행 중인 도전이 없어요. 공모전·채용 상세에서 "도전 목록에 추가"를 누르면 마감과 발표를 챙겨 드려요<div class="empty-go"><a class="btn" href="#contests">공모전 보기</a><a class="btn" href="#jobs">채용 보기</a></div></div>';
    else if (ui.mySeg === 'saved') body = listHtml(screen, 'my-saved', savedEntries, screen === 'pc' ? ui.sel.my : null, '목록의 책갈피 버튼을 누르면 여기에 모여요');
    else body = recs.length ? `<ul class="tks">${recs.map(recHtml).join('')}</ul>` : '<p class="l-empty">결과가 나온 도전이 여기에 모여요</p>';
    const meta = (authUser && authUser.user_metadata) || {};
    // 로그인 영역에도 처리방침을 둬요(작성지침: 첫 화면에서 찾기 어려우면 메뉴·로그인 영역에 추가 공개)
    const legalLinks = '<p class="acct-legal"><a href="./privacy.html"><b>개인정보 처리방침</b></a> · <a href="./terms.html">이용약관</a></p>';
    const acct = authUser
      ? `<div class="acct-name">${esc(meta.full_name || meta.name || '내 계정')}님</div><p class="acct-hint">저장 목록과 진행 상황이 PC와 휴대폰에서 같이 보여요</p><div class="acct-acts"><button type="button" class="btn" data-auth="logout">로그아웃</button><button type="button" class="btn" data-auth="delete">계정 삭제</button></div>${legalLinks}`
      : `<h2>로그인</h2><p class="acct-hint">${SB ? '로그인하면 PC와 휴대폰에서 같은 저장 목록과 진행 상황을 봐요' : '저장한 항목은 이 브라우저에 보관돼요'}</p>${SB ? '<button type="button" class="btn pri" data-auth="login">Google 계정으로 로그인</button>' : ''}${legalLinks}`;
    const groups = CNHv2.INTEREST_GROUPS.map((g) => `<div class="h-group"><h3>${g.title}</h3><div class="h-chips">${g.options.map(([v, l]) =>
      `<button type="button" class="h-chip" data-interest="${g.key}:${esc(v)}" aria-pressed="${interests[g.key].includes(v)}">${esc(l)}</button>`).join('')}</div></div>`).join('');
    return { active, recs, savedEntries, segs, body, acct, groups };
  }
  const themeRow = () => `<div class="me-row"><span>화면 밝기</span><button type="button" class="btn sm" data-theme-toggle aria-pressed="${isDarkTheme()}">어두운 화면</button></div>`;
  function pcMyHtml() {
    const m = myModel('pc');
    let detail = '';
    if (ui.mySeg === 'saved') {
      const first = m.savedEntries.slice(0, ui.shown['pc:my-saved'] || PER.pc);
      if (!first.some((e) => keyOf(e.kind, e.item) === ui.sel.my)) ui.sel.my = first.length ? keyOf(first[0].kind, first[0].item) : null;
      const sel = findItem(ui.sel.my);
      if (sel) { m.body = listHtml('pc', 'my-saved', m.savedEntries, ui.sel.my); detail = detailHtml(sel.kind, sel.item); }
    }
    const main = `<section class="md-list" aria-label="마이페이지 목록"><div class="fbar">${m.segs}</div>${m.body}</section>`;
    return `<div class="pg-head"><h1>마이페이지</h1><p class="sub">진행 중인 도전 ${m.active.length}개 · 저장한 항목 ${m.savedEntries.length}개</p></div>
      <div class="md${detail ? '' : ' wide'}">${main}<aside class="${detail ? 'md-detail' : 'me-side'}" aria-label="${detail ? '자세히' : '내 설정'}">${detail || `
        <section class="card me-card">${m.acct}</section>
        <section class="card me-card"><h2>관심 분야</h2><p class="acct-hint">홈의 "내 관심 분야 새 소식"에 쓰여요</p><div class="me-groups">${m.groups}</div></section>
        <section class="card me-card">${themeRow()}</section>`}</aside></div>`;
  }
  function mMyHtml() {
    const m = myModel('m');
    return `<div class="m-head"><h1>마이</h1><p>진행 중인 도전 ${m.active.length}개 · 저장한 항목 ${m.savedEntries.length}개</p></div>
      <div class="m-acct">${m.acct}</div>
      <div class="m-fbar m-sticky">${m.segs}</div><section class="m-sec">${m.body}</section>
      <section class="m-sec m-pad"><h2 class="m-h">관심 분야</h2><p class="acct-hint">홈의 "내 관심 분야 새 소식"에 쓰여요</p><div class="me-groups">${m.groups}</div></section>
      <section class="m-sec m-pad">${themeRow()}</section>`;
  }

  /* ---------- 그리기와 주소 ---------- */
  const $ = (id) => document.getElementById(id);
  // 다시 그리면 버튼이 새로 만들어져 키보드 포커스가 페이지 맨 위로 튀어요 → 같은 역할의 버튼을 찾아 포커스를 돌려줘요
  const FOCUS_KEYS = ['open', 'save', 'more', 'trk', 'f', 'track', 'interest', 'cal', 'calDay', 'auth', 'interestEdit', 'interestDone'];
  const dataAttr = (k) => 'data-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  function focusTarget() {
    const el = document.activeElement;
    const k = el && el.dataset && FOCUS_KEYS.find((a) => a in el.dataset);
    if (!k) return null;
    // 모바일 시트·PC 상세 안에서 누른 버튼은 그 안에서 찾아요 (시트 뒤 목록 줄은 inert 라 포커스를 못 받아요)
    const scope = el.closest('#m-sheet') ? '#m-sheet ' : el.closest('.md-detail') ? '#v2pc .md-detail ' : el.closest('#v2pc') ? '#v2pc ' : el.closest('#v2m') ? '#v2m ' : '';
    const q = (a, v) => `[${a}="${CSS.escape(v)}"]`;
    const sel = scope + q(dataAttr(k), el.dataset[k]) + ('v' in el.dataset ? q('data-v', el.dataset.v) : '') + (el.dataset.id ? q('data-id', el.dataset.id) : '');
    // 삭제 확인처럼 버튼이 바뀌는 경우: 같은 카드의 "취소" → 휴지통 → 같은 카드의 아무 버튼 순으로 찾아요
    const fallbacks = el.dataset.id ? [scope + q('data-trk', 'del-no') + q('data-id', el.dataset.id), scope + q('data-trk', 'del') + q('data-id', el.dataset.id), scope + q('data-id', el.dataset.id)] : [];
    if (k === 'track') fallbacks.push(scope + '.dt-acts a[href="#my"]');  // "도전 목록에 추가"를 누르면 마이 링크로 바뀌어요
    return [sel, ...fallbacks];
  }
  function restoreFocus(sels) {
    if (!sels || (document.activeElement && document.activeElement !== document.body)) return;
    for (const s of sels) { const el = document.querySelector(s); if (el) { el.focus({ preventScroll: true }); return; } }
  }
  V2.render = function () {
    const keep = focusTarget();
    try { renderNow(); } finally { restoreFocus(keep); }
  };
  function renderNow() {
    const r = ui.route, home = r === 'home';
    document.title = (home ? '' : TITLES[r] + ' · ') + 'Civil News Hub';
    document.querySelectorAll('[data-route]').forEach((a) => (a.dataset.route === r ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    $('pc-home').hidden = $('m-home').hidden = !home;
    $('pc-page').hidden = $('m-page').hidden = home;
    if (home) { V2.renderHome(); $('pc-page').innerHTML = $('m-page').innerHTML = ''; }  // 숨긴 탭 내용은 비워서 선택 표시가 남지 않게
    else { $('pc-page').innerHTML = pcPageHtml(r); $('m-page').innerHTML = mPageHtml(r); }
    const q = $('pc-q'); if (q && document.activeElement !== q) q.value = r === 'search' ? ui.q : '';
    renderSheet();
  }

  function parseHash() {
    let h = location.hash.slice(1);
    try { h = decodeURIComponent(h); } catch (e) {}
    const i = h.indexOf('='), r = i < 0 ? h : h.slice(0, i);
    return { route: ROUTES.includes(r) ? r : 'home', q: i < 0 ? '' : h.slice(i + 1) };
  }
  function onRoute() {
    const { route, q } = parseHash();
    if (route !== ui.route || q !== ui.q) {
      ui.route = route; ui.q = q; ui.shown = {}; ui.confirmDel = null;
      editingInterests = false;  // 마이에서 관심 분야를 고르다 홈으로 가도 홈은 결과를 보여 줘요
      closeSheet(false);
      scrollTo(0, 0);
    }
    V2.render();
  }

  /* ---------- 모바일 상세 시트 ---------- */
  let sheetFrom = null;
  function renderSheet() {
    if (!ui.sheet) return;
    const e = findItem(ui.sheet);
    if (!e) { closeSheet(); return; }
    $('m-sheet-body').innerHTML = detailHtml(e.kind, e.item, 'm-sheet-t');
  }
  function openSheet(key) {
    ui.sheet = key; sheetFrom = key;
    renderSheet();
    $('m-sheet').hidden = false; document.body.style.overflow = 'hidden';
    setBehindSheet(true);
    $('m-sheet').querySelector('.sheet-grab [data-sheet-close]').focus();
  }
  // 시트가 열려 있는 동안 뒤 화면을 inert로: Tab 키가 시트 밖으로 빠져나가지 않고 스크린리더도 시트만 읽어요
  function setBehindSheet(on) { document.querySelectorAll('#v2m > .app, #v2m > .tabbar').forEach((el) => { el.inert = on; }); }
  function closeSheet(restore = true) {
    if (!ui.sheet) return;
    ui.sheet = null; $('m-sheet').hidden = true; document.body.style.overflow = '';
    setBehindSheet(false);
    // 다시 그리면서 원래 버튼이 바뀌었을 수 있어서 같은 항목의 줄을 찾아 포커스를 돌려요
    const back = restore && sheetFrom && $('m-page').querySelector(`[data-open="${CSS.escape(sheetFrom)}"]`);
    if (back) back.focus();
  }

  /* ---------- 이벤트 ---------- */
  const setFilter = (field, v) => { ui[field] = v; ui.shown = {}; ui.confirmDel = null; if (field !== 'mySeg') delete ui.sel[ui.route]; V2.render(); };
  // .ics 는 브라우저에서 만들어 내려받아요(서버 없음, 아무것도 저장·전송 안 함)
  function downloadIcs(ev, key) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const url = URL.createObjectURL(new Blob([CNHv2.calIcs(ev, stamp)], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = '마감일-' + key.replace(/[^\w-]+/g, '-') + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);  // 아이폰은 "다운로드할까요?" 확인을 누를 때까지 주소가 살아 있어야 해요
  }
  // 앱 속 브라우저면 바깥 브라우저로 보내요(카카오톡은 바로 열기, 그 밖은 안내): 버튼을 눌러도 아무 일이 없는 일이 없게
  function leftInApp(url) {
    const k = CNHv2.inAppBrowser(navigator.userAgent);
    if (k === 'kakao') location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
    else if (k === 'other') alert('이 앱 안의 브라우저에서는 캘린더에 넣기가 안 될 수 있어요. 메뉴에서 "다른 브라우저로 열기"를 눌러 주세요.');
    return !!k;
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    const open = t.closest('[data-open]');
    if (open) {
      if (isPhoneView()) { openSheet(open.dataset.open); return; }
      ui.sel[ui.route] = open.dataset.open; V2.render();
      const pane = document.querySelector('#pc-page .md-detail'); if (pane) pane.scrollTop = 0;
      return;
    }
    const sv = t.closest('[data-save]');
    if (sv) { const id = sv.dataset.save; saved.has(id) ? saved.delete(id) : saved.add(id); persistSaved(); return; }
    const tr = t.closest('[data-track]');
    if (tr) { const f = findItem(tr.dataset.track); if (f) trackAdd(f.kind, f.item); return; }
    const gc = t.closest('.dt-cal a');
    if (gc) { if (leftInApp(gc.href)) e.preventDefault(); return; }
    const ic = t.closest('[data-ics]');
    if (ic) { const f = findItem(ic.dataset.ics); const ev = f && CNHv2.calEvent(f.kind, f.item, V2.today); if (ev && !leftInApp(location.href)) downloadIcs(ev, ic.dataset.ics); return; }
    const more = t.closest('[data-more]');
    if (more) { const k = more.dataset.more; ui.shown[k] = (ui.shown[k] || PER[k.split(':')[0]]) + PER[k.split(':')[0]]; V2.render(); return; }
    const f = t.closest('button[data-f]');
    if (f) { setFilter(f.dataset.f, f.dataset.v); return; }
    if (t.closest('[data-sheet-close]')) { closeSheet(); return; }
    const b = t.closest('[data-trk]');
    if (b) {
      const id = b.dataset.id, act = b.dataset.trk;
      if (act === 'del') { ui.confirmDel = id; V2.render(); return; }
      if (act === 'del-no') { ui.confirmDel = null; V2.render(); return; }
      ui.confirmDel = null;
      if (act === 'del-yes') trackRemove(id);
      if (act === 'submit') trackSubmit(id);
      if (act === 'unsubmit') trackUnsubmit(id);
      if (act === 'win' || act === 'lose') trackResult(id, act);
      if (act === 'undo') trackUndoResult(id);
    }
  });
  document.addEventListener('change', (e) => { const s = e.target.closest('select[data-f]'); if (s) setFilter(s.dataset.f, s.value); });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-search-form]'); if (!form) return;
    e.preventDefault();
    const q = (form.querySelector('input[name="q"]').value || '').trim();
    location.hash = 'search' + (q ? '=' + encodeURIComponent(q) : '');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.sheet) closeSheet(); });
  // 화면이 PC↔모바일로 바뀌면 열린 시트는 닫아요
  addEventListener('resize', () => { if (ui.sheet && !isPhoneView()) closeSheet(false); });
  addEventListener('hashchange', onRoute);

  onRoute();
})();
