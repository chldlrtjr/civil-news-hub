// Civil News Hub - 모던 UI용 AI 기사 챗봇
// 데스크톱: 오른쪽 아래 떠 있는 창(화면을 가리지 않음) / 휴대폰(≤600px): 절반 높이 시트
// 판단 로직은 cnh_chat_core.js(window.CNHChatCore)에 있어요.
(function () {
  const Core = window.CNHChatCore;
  if (!Core) { console.warn('[cnh_chatbot] cnh_chat_core.js를 먼저 불러와야 해요.'); return; }

  const KEY_STORAGE = 'civil_gemini_api_key';      // 예전 챗봇과 같은 키를 같이 써요
  const SESSION_STORAGE = 'cnh_chatbot_session';
  const MAX_SAVED = 40;
  const PHONE = matchMedia('(max-width:600px)');
  const QUICK_PROMPTS = ['오늘 주요 기사 요약', '어려운 용어 풀어줘', '도로·철도 소식만', '이번 주 지하안전 이슈'];
  const PROXY_MISSING = [404, 405, 501];             // Flask 없이 정적 서버로 띄운 경우

  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    key: svg('<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>'),
    reset: svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
    min: svg('<path d="M5 12h14"/>'),
    x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    send: svg('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>')
  };
  const WELCOME_HTML = `<div class="cnh-msg cnh-ai"><p>안녕하세요! 목록에서 궁금한 <strong>기사 제목</strong>이나 <strong>단어</strong>를 그대로 적어 보세요.</p><ul><li>대우건설 기사 요약해줘</li><li>국책사업이 뭐야?</li></ul></div>`;
  const LOADING_HTML = '<div class="cnh-loading" aria-label="답변 작성 중"><i></i><i></i><i></i></div>';

  const state = {
    open: false,
    sheet: 'half',        // 휴대폰 시트 높이 'half' | 'full'
    generating: false,
    gen: 0,               // 초기화할 때마다 올라가요(초기화 전에 보낸 질문의 답을 버리려고)
    apiKey: '',
    serverKey: false,
    model: '',
    articles: null,       // 원본 기사 목록(한 번만 불러와요)
    history: [],          // [{role:'user'|'ai'|'error', text, sources?, local?, retry?}]
    active: null          // 지금 대화 중인 기사 {id,title,publisher,link}
  };
  const el = {};

  /* ---------- 저장 ---------- */
  function loadKey() {
    try { state.apiKey = localStorage.getItem(KEY_STORAGE) || ''; } catch (e) { state.apiKey = ''; }
  }
  function saveKey(key) {
    state.apiKey = String(key || '').trim();
    try {
      if (state.apiKey) localStorage.setItem(KEY_STORAGE, state.apiKey);
      else localStorage.removeItem(KEY_STORAGE);
    } catch (e) {}
    renderMode();
  }
  function loadSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_STORAGE) || 'null');
      if (saved && Array.isArray(saved.history)) state.history = saved.history.filter(m => m && m.role && typeof m.text === 'string');
      if (saved && saved.active && saved.active.id) state.active = saved.active;
    } catch (e) {}
  }
  function saveSession() {
    try {
      sessionStorage.setItem(SESSION_STORAGE, JSON.stringify({ history: state.history.slice(-MAX_SAVED), active: state.active }));
    } catch (e) {}
  }

  /* ---------- 화면 만들기 ---------- */
  function avatarSrc() {
    return location.pathname.includes('/static/') ? './ai_robot_avatar.png' : './static/ai_robot_avatar.png';
  }

  function injectStyle() {
    const style = document.createElement('style');
    style.id = 'cnh-chatbot-style';
    style.textContent = `
#cnhChatbot{--cnh-tab-h:58px;--cnh-gap:24px;--cnh-bottom:24px;--cnh-kb:0px;font-family:var(--f-body,system-ui,sans-serif);color:var(--ink)}
#cnhChatbot *{box-sizing:border-box}
#cnhChatbot [hidden]{display:none!important}
#cnhChatbot .cnh-fab{position:fixed;right:var(--cnh-gap);bottom:var(--cnh-bottom);z-index:35;width:64px;height:64px;padding:0;border:0;background:none;cursor:pointer;animation:cnhFloat 3.2s ease-in-out infinite}
#cnhChatbot .cnh-fab img{width:100%;height:100%;object-fit:contain;pointer-events:none;filter:drop-shadow(0 8px 12px rgba(15,42,68,.25))}
#cnhChatbot .cnh-fab:hover{animation-play-state:paused}
#cnhChatbot .cnh-dot{position:absolute;top:2px;right:2px;width:14px;height:14px;border-radius:50%;background:var(--ok);border:2px solid var(--surface)}
@keyframes cnhFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
#cnhChatbot .cnh-win{position:fixed;right:var(--cnh-gap);bottom:var(--cnh-bottom);z-index:35;width:400px;height:min(560px,calc(100vh - 120px));display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow),0 18px 48px rgba(15,42,68,.18);overflow:hidden;opacity:0;transform:translateY(12px);transition:opacity .2s,transform .2s}
#cnhChatbot.is-open .cnh-win{opacity:1;transform:none}
#cnhChatbot .cnh-handle{display:none;justify-content:center;padding:10px 0 4px;background:var(--ink);touch-action:none;cursor:grab;flex:none}
#cnhChatbot .cnh-handle span{width:36px;height:4px;border-radius:2px;background:color-mix(in srgb,var(--bg) 45%,transparent)}
#cnhChatbot .cnh-head{display:flex;align-items:center;gap:6px;padding:10px 8px 10px 12px;background:var(--ink);color:var(--bg);flex:none}
#cnhChatbot .cnh-logo{width:28px;height:28px;border-radius:8px;background:var(--accent);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:700;flex:none}
#cnhChatbot .cnh-title{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.3;margin-left:2px}
#cnhChatbot .cnh-title b{font-size:var(--t-small,14px)}
#cnhChatbot .cnh-title small{font-size:var(--t-label,12px);opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cnhChatbot .cnh-ib{width:30px;height:30px;border:0;border-radius:8px;background:none;color:inherit;opacity:.75;display:grid;place-items:center;cursor:pointer;flex:none;padding:0}
#cnhChatbot .cnh-ib:hover{opacity:1;background:color-mix(in srgb,var(--bg) 14%,transparent)}
#cnhChatbot .cnh-ib svg{width:16px;height:16px}
#cnhChatbot .cnh-keybox{padding:10px 12px;background:var(--surface-2);border-bottom:1px solid var(--line);font-size:var(--t-label,12px);color:var(--muted);flex:none}
#cnhChatbot .cnh-keybox p{margin:0 0 8px}
#cnhChatbot .cnh-keyrow{display:flex;gap:6px}
#cnhChatbot .cnh-keyrow input{flex:1;min-width:0;height:32px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);padding:0 8px;font:inherit;font-size:13px}
#cnhChatbot .cnh-keyrow button{height:32px;border:0;border-radius:8px;padding:0 10px;font:inherit;font-size:var(--t-label,12px);font-weight:600;cursor:pointer;background:var(--ink);color:var(--bg)}
#cnhChatbot .cnh-keyrow button[data-act="key-clear"]{background:var(--surface);color:var(--muted);border:1px solid var(--line)}
#cnhChatbot .cnh-chips{display:flex;gap:6px;overflow-x:auto;padding:8px 12px;border-bottom:1px solid var(--line);scrollbar-width:none;flex:none}
#cnhChatbot .cnh-chips::-webkit-scrollbar{display:none}
#cnhChatbot .cnh-chip{white-space:nowrap;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:4px 10px;font:inherit;font-size:var(--t-label,12px);cursor:pointer}
#cnhChatbot .cnh-chip:hover{border-color:var(--ink)}
#cnhChatbot .cnh-msgs{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px;display:flex;flex-direction:column;gap:8px}
#cnhChatbot .cnh-msg{max-width:88%;padding:8px 11px;border-radius:12px;font-size:var(--t-small,14px);line-height:1.55;word-break:break-word}
#cnhChatbot .cnh-msg p{margin:0 0 6px}
#cnhChatbot .cnh-msg p:last-child{margin-bottom:0}
#cnhChatbot .cnh-msg ul{margin:4px 0;padding-left:18px}
#cnhChatbot .cnh-me{align-self:flex-end;background:var(--ink);color:var(--bg);border-top-right-radius:4px}
#cnhChatbot .cnh-ai{align-self:flex-start;background:var(--surface-2);color:var(--ink);border-top-left-radius:4px}
#cnhChatbot .cnh-err{align-self:flex-start;background:color-mix(in srgb,var(--warn) 14%,var(--surface));color:var(--ink);border:1px solid color-mix(in srgb,var(--warn) 45%,transparent)}
#cnhChatbot .cnh-retry{display:block;margin-top:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:8px;padding:3px 10px;font:inherit;font-size:var(--t-label,12px);cursor:pointer}
#cnhChatbot .cnh-src{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;padding-top:6px;border-top:1px solid var(--line)}
#cnhChatbot .cnh-src a{max-width:100%;font-size:11px;color:var(--muted);text-decoration:none;border:1px solid var(--line);background:var(--surface);border-radius:6px;padding:2px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cnhChatbot .cnh-src a:hover{color:var(--ink);border-color:var(--ink)}
#cnhChatbot .cnh-src b{color:var(--accent);font-weight:600;margin-right:4px}
#cnhChatbot .cnh-loading{align-self:flex-start;display:flex;gap:4px;padding:12px}
#cnhChatbot .cnh-loading i{width:6px;height:6px;border-radius:50%;background:var(--muted);animation:cnhBlink 1s infinite}
#cnhChatbot .cnh-loading i:nth-child(2){animation-delay:.15s}
#cnhChatbot .cnh-loading i:nth-child(3){animation-delay:.3s}
@keyframes cnhBlink{0%,100%{opacity:.25}50%{opacity:1}}
#cnhChatbot .cnh-ctx{display:flex;align-items:center;gap:6px;margin:0 12px 8px;padding:4px 4px 4px 10px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:var(--t-label,12px);font-weight:600;flex:none}
#cnhChatbot .cnh-ctx span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cnhChatbot .cnh-ctx button{border:0;background:none;color:inherit;cursor:pointer;width:22px;height:22px;border-radius:50%;padding:0;display:grid;place-items:center}
#cnhChatbot .cnh-ctx svg{width:12px;height:12px}
#cnhChatbot .cnh-input{display:flex;gap:6px;padding:10px;border-top:1px solid var(--line);background:var(--surface);flex:none;margin:0}
#cnhChatbot .cnh-input input{flex:1;min-width:0;height:40px;border:1px solid transparent;border-radius:10px;background:var(--surface-2);color:var(--ink);padding:0 12px;font:inherit;font-size:var(--t-small,14px);outline:none}
#cnhChatbot .cnh-input input:focus{border-color:var(--accent);background:var(--surface)}
#cnhChatbot .cnh-input button{width:40px;height:40px;border:0;border-radius:10px;background:var(--accent);color:#fff;display:grid;place-items:center;cursor:pointer;flex:none;padding:0}
#cnhChatbot .cnh-input button:disabled{opacity:.5;cursor:not-allowed}
#cnhChatbot .cnh-input svg{width:18px;height:18px}
@media (min-width:601px) and (max-width:760px){
  #cnhChatbot{--cnh-bottom:calc(var(--cnh-tab-h) + env(safe-area-inset-bottom,0px) + 16px)}
  #cnhChatbot .cnh-win{height:min(560px,calc(100vh - 160px))}
}
@media (max-width:600px){
  #cnhChatbot{--cnh-gap:16px;--cnh-bottom:calc(var(--cnh-tab-h) + env(safe-area-inset-bottom,0px) + 12px)}
  #cnhChatbot .cnh-fab{width:56px;height:56px}
  #cnhChatbot .cnh-win{left:50%;right:auto;bottom:var(--cnh-kb);width:100%;max-width:440px;height:50vh;height:50dvh;max-height:calc(100vh - var(--cnh-kb) - 8px);border-radius:20px 20px 0 0;border-bottom:0;transform:translate(-50%,24px);transition:opacity .2s,transform .28s cubic-bezier(.2,.8,.2,1),height .28s cubic-bezier(.2,.8,.2,1)}
  #cnhChatbot.is-open .cnh-win{transform:translate(-50%,0)}
  #cnhChatbot.is-full .cnh-win{height:85vh;height:85dvh}
  #cnhChatbot .cnh-handle{display:flex}
  #cnhChatbot .cnh-head{padding-top:4px}
  #cnhChatbot .cnh-input{padding-bottom:calc(10px + env(safe-area-inset-bottom,0px))}
  #cnhChatbot .cnh-input input{font-size:16px}
}
@media (prefers-reduced-motion:reduce){
  #cnhChatbot .cnh-fab,#cnhChatbot .cnh-loading i{animation:none}
  #cnhChatbot .cnh-win{transition:none}
}`;
    document.head.appendChild(style);
  }

  function injectDom() {
    const root = document.createElement('div');
    root.id = 'cnhChatbot';
    root.innerHTML = `
      <button type="button" class="cnh-fab" aria-label="AI에게 기사 질문하기" aria-expanded="false" aria-controls="cnhWin" title="AI 기사 질문">
        <img src="${avatarSrc()}" alt=""><span class="cnh-dot"></span>
      </button>
      <section class="cnh-win" id="cnhWin" role="dialog" aria-modal="false" aria-label="토목 뉴스 AI 브리핑" hidden>
        <div class="cnh-handle" aria-hidden="true"><span></span></div>
        <header class="cnh-head">
          <div class="cnh-logo" aria-hidden="true">AI</div>
          <div class="cnh-title"><b>토목 뉴스 AI 브리핑</b><small>기사 기반 Q&amp;A · <span data-mode>기사 요약 모드</span></small></div>
          <button type="button" class="cnh-ib" data-act="key" aria-label="Gemini API 키 설정" title="API 키">${ICON.key}</button>
          <button type="button" class="cnh-ib" data-act="reset" aria-label="대화 초기화" title="초기화">${ICON.reset}</button>
          <button type="button" class="cnh-ib" data-act="min" aria-label="접기" title="접기">${ICON.min}</button>
          <button type="button" class="cnh-ib" data-act="close" aria-label="닫기" title="닫기">${ICON.x}</button>
        </header>
        <div class="cnh-keybox" hidden>
          <p>개인 Gemini API 키를 넣으면 단어 뜻 풀이와 AI 요약을 쓸 수 있어요. 키는 이 브라우저에만 저장돼요.</p>
          <div class="cnh-keyrow">
            <input type="password" placeholder="AIza…" autocomplete="off" aria-label="Gemini API 키">
            <button type="button" data-act="key-save">저장</button>
            <button type="button" data-act="key-clear">삭제</button>
          </div>
        </div>
        <div class="cnh-chips">${QUICK_PROMPTS.map(p => `<button type="button" class="cnh-chip" data-prompt="${Core.escapeHtml(p)}">${Core.escapeHtml(p)}</button>`).join('')}</div>
        <div class="cnh-msgs" aria-live="polite"></div>
        <div class="cnh-ctx" hidden><span></span><button type="button" data-act="ctx-clear" aria-label="기사 맥락 지우기">${ICON.x}</button></div>
        <form class="cnh-input">
          <input type="text" placeholder="기사 제목이나 궁금한 단어를 적어 보세요" autocomplete="off" enterkeyhint="send" aria-label="질문 입력">
          <button type="submit" aria-label="보내기">${ICON.send}</button>
        </form>
      </section>`;
    document.body.appendChild(root);
    el.root = root;
    el.fab = root.querySelector('.cnh-fab');
    el.win = root.querySelector('.cnh-win');
    el.handle = root.querySelector('.cnh-handle');
    el.mode = root.querySelector('[data-mode]');
    el.keybox = root.querySelector('.cnh-keybox');
    el.keyInput = el.keybox.querySelector('input');
    el.msgs = root.querySelector('.cnh-msgs');
    el.ctx = root.querySelector('.cnh-ctx');
    el.ctxText = el.ctx.querySelector('span');
    el.form = root.querySelector('.cnh-input');
    el.input = el.form.querySelector('input');
    el.send = el.form.querySelector('button');
  }

  /* ---------- 그리기 ---------- */
  function renderMode() {
    if (el.mode) el.mode.textContent = (state.serverKey || state.apiKey) ? 'AI 연결됨' : '기사 요약 모드';
  }

  function sourcesHtml(sources) {
    if (!sources || !sources.length) return '';
    return `<div class="cnh-src">${sources.map(s =>
      `<a href="${Core.escapeHtml(Core.safeLink(s.link))}" target="_blank" rel="noopener noreferrer" title="${Core.escapeHtml(s.title)} (원문 열기)"><b>${Core.escapeHtml(s.publisher || '기사')}</b>${Core.escapeHtml(Core.shortTitle(s.title, 22))}</a>`
    ).join('')}</div>`;
  }

  function messageHtml(m, i) {
    if (m.role === 'user') return `<div class="cnh-msg cnh-me">${Core.escapeHtml(m.text)}</div>`;
    if (m.role === 'error') {
      const canRetry = m.retry && i === state.history.length - 1;
      return `<div class="cnh-msg cnh-err">${Core.escapeHtml(m.text)}${canRetry ? `<button type="button" class="cnh-retry" data-retry="${i}">다시 시도</button>` : ''}</div>`;
    }
    return `<div class="cnh-msg cnh-ai">${Core.formatMarkdown(m.text)}${sourcesHtml(m.sources)}</div>`;
  }

  function renderMessages() {
    const body = state.history.length ? state.history.map(messageHtml).join('') : WELCOME_HTML;
    el.msgs.innerHTML = body + (state.generating ? LOADING_HTML : '');
    requestAnimationFrame(() => { el.msgs.scrollTop = el.msgs.scrollHeight; });
  }

  function renderContext() {
    const a = state.active;
    el.ctx.hidden = !a;
    if (a) {
      el.ctxText.textContent = `💬 ${Core.shortTitle(a.title, 18)} 기사에 대해 대화 중`;
      el.ctx.title = a.title;
    }
  }

  /* ---------- 열기 / 접기 / 시트 ---------- */
  function setOpen(open, opts = {}) {
    state.open = open;
    if (opts.clearContext) { state.active = null; saveSession(); renderContext(); }
    el.fab.setAttribute('aria-expanded', String(open));
    if (open) {
      el.win.hidden = false;
      el.fab.hidden = true;
      requestAnimationFrame(() => el.root.classList.add('is-open'));
      loadArticles().catch(() => {});
      syncKeyboard();
      renderMessages();
      if (!PHONE.matches) el.input.focus();
    } else {
      const hadFocus = el.win.contains(document.activeElement);
      el.root.classList.remove('is-open', 'is-full');
      state.sheet = 'half';
      el.fab.hidden = false;
      setTimeout(() => { if (!state.open) el.win.hidden = true; }, 220);
      if (hadFocus) el.fab.focus();
    }
  }

  function setSheet(next) {
    if (next === 'closed') { setOpen(false); return; }
    state.sheet = next;
    el.root.classList.toggle('is-full', next === 'full');
  }

  function bindSheetDrag() {
    let startY = 0, dy = 0, dragging = false;
    el.handle.addEventListener('pointerdown', e => {
      if (!PHONE.matches) return;
      dragging = true; startY = e.clientY; dy = 0;
      el.handle.setPointerCapture(e.pointerId);
      el.win.style.transition = 'none';
    });
    el.handle.addEventListener('pointermove', e => {
      if (!dragging) return;
      dy = e.clientY - startY;
      el.win.style.transform = `translate(-50%, ${Math.max(dy, 0)}px)`;   // 아래로만 따라 내려가요
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      el.win.style.transition = '';
      el.win.style.transform = '';
      setSheet(Core.sheetAfterDrag(state.sheet, dy));
    };
    el.handle.addEventListener('pointerup', end);
    el.handle.addEventListener('pointercancel', end);
  }

  // 휴대폰 키보드가 올라오면 그 높이만큼 시트를 올려요
  function syncKeyboard() {
    const vv = window.visualViewport;
    const kb = vv && PHONE.matches ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    el.root.style.setProperty('--cnh-kb', kb + 'px');
  }

  /* ---------- 데이터 / AI ---------- */
  async function checkServer() {
    try {
      const r = await fetch('/api/chat/status');
      if (r.ok) {
        const d = await r.json();
        state.serverKey = !!d.has_server_key;
        state.model = d.model || '';
      }
    } catch (e) {}
    renderMode();
  }

  async function loadArticles() {
    if (state.articles) return state.articles;
    for (const url of ['/api/news', './data/news.json']) {
      try {
        const r = await fetch(url + '?t=' + Date.now());
        if (!r.ok) continue;
        const d = await r.json();
        if (d && Array.isArray(d.articles)) { state.articles = d.articles; return state.articles; }
      } catch (e) {}
    }
    throw new Error('기사 목록을 불러오지 못했어요.');
  }

  async function callAi(query, apiArticles, history) {
    let res = null;
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(state.apiKey ? { 'X-Gemini-Key': state.apiKey } : {}) },
        body: JSON.stringify({ query, relevantArticles: apiArticles, history })
      });
    } catch (e) { res = null; }
    let d = null;
    if (res && PROXY_MISSING.includes(res.status)) {
      // 서버가 JSON({success})로 답했다면 프록시는 있는 거예요(예: Gemini 모델 404)
      d = await res.json().catch(() => null);
      if (!d || typeof d.success === 'undefined') res = null;
    }
    if (res) {
      if (d === null) d = await res.json().catch(() => ({}));
      if (res.ok && d.success && d.answer) return d.answer;
      if (d.error === 'KEY_MISSING' && !state.apiKey) throw new Error('KEY_MISSING');
      throw new Error(d.message || `AI 서버 오류가 났어요 (HTTP ${res.status}).`);
    }
    if (!state.apiKey) throw new Error('KEY_MISSING');
    return callDirect(query, apiArticles, history);
  }

  async function callDirect(query, apiArticles, history) {
    const model = state.model || 'gemini-flash-latest';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: Core.buildGeminiContents(query, apiArticles, history),
          generationConfig: { temperature: 0.2, maxOutputTokens: 1200 }
        })
      });
    } catch (e) {
      throw new Error('Gemini에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
    }
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (d.error && d.error.message) || `HTTP ${res.status}`;
      if (res.status === 400 || res.status === 403) throw new Error(`Gemini API 키를 확인해 주세요 (${msg}).`);
      if (res.status === 429) throw new Error('Gemini API 무료 호출 한도를 넘었어요. 잠시 후 다시 시도해 주세요.');
      throw new Error(`Gemini API 호출에 실패했어요: ${msg}`);
    }
    const parts = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
    const text = parts && parts[0] && parts[0].text;
    if (!text) throw new Error('AI 답변을 만들지 못했어요.');
    return text;
  }

  /* ---------- 대화 ---------- */
  function push(m) {
    state.history.push(m);
    saveSession();
    renderMessages();
  }

  function setGenerating(on) {
    state.generating = on;
    el.send.disabled = on;
    renderMessages();
  }

  function send(query) {
    if (!query || state.generating) return;            // 답을 기다리는 중이면 무시
    const prior = Core.recentHistory(state.history);
    push({ role: 'user', text: query });
    answer(query, prior);
  }

  function retryAt(i) {
    const m = state.history[i];
    if (!m || m.role !== 'error' || !m.retry || state.generating) return;
    state.history.splice(i, 1);
    saveSession();
    answer(m.retry, Core.recentHistory(state.history.slice(0, Math.max(0, i - 1))));
  }

  async function answer(query, prior) {
    const gen = state.gen;
    setGenerating(true);
    try {
      const articles = await loadArticles();
      if (gen !== state.gen) return;                   // 기다리는 사이 초기화됐으면 답을 버려요
      const ctx = Core.pickContext(articles, query, state.active);
      state.active = ctx.active;
      renderContext();
      let text = null;
      if (state.serverKey || state.apiKey) {
        try { text = await callAi(query, ctx.sources.map(Core.toApiArticle), prior); }
        catch (err) { if (err.message !== 'KEY_MISSING') throw err; }
      }
      if (gen !== state.gen) return;
      const local = text == null;
      if (local) text = Core.localBriefing(query, ctx.sources);
      state.generating = false;
      push({ role: 'ai', text, local, sources: ctx.sources.map(Core.toSourceRef) });
    } catch (err) {
      if (gen !== state.gen) return;
      state.generating = false;
      push({ role: 'error', text: err.message || 'AI 답변 처리 중 오류가 났어요.', retry: query });
    } finally {
      if (gen === state.gen) setGenerating(false);
    }
  }

  /* ---------- 이벤트 ---------- */
  function onClick(e) {
    const chip = e.target.closest('[data-prompt]');
    if (chip) { send(chip.dataset.prompt); return; }
    const retry = e.target.closest('[data-retry]');
    if (retry) { retryAt(Number(retry.dataset.retry)); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    switch (btn.dataset.act) {
      case 'min': setOpen(false); break;
      case 'close': setOpen(false, { clearContext: true }); break;
      case 'reset':
        state.gen++;
        state.history = []; state.active = null; state.generating = false;
        el.send.disabled = false;
        saveSession(); renderMessages(); renderContext();
        break;
      case 'key':
        el.keybox.hidden = !el.keybox.hidden;
        if (!el.keybox.hidden) { el.keyInput.value = state.apiKey; el.keyInput.focus(); }
        break;
      case 'key-save': saveKey(el.keyInput.value); el.keybox.hidden = true; break;
      case 'key-clear': saveKey(''); el.keyInput.value = ''; break;
      case 'ctx-clear': state.active = null; saveSession(); renderContext(); break;
    }
  }

  function bindEvents() {
    el.fab.addEventListener('click', () => setOpen(true));
    el.win.addEventListener('click', onClick);
    el.form.addEventListener('submit', e => {
      e.preventDefault();
      const q = el.input.value.trim();
      if (!q || state.generating) return;
      el.input.value = '';
      send(q);
    });
    el.input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    });
    bindSheetDrag();
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncKeyboard);
      window.visualViewport.addEventListener('scroll', syncKeyboard);
    }
    PHONE.addEventListener('change', syncKeyboard);
  }

  function init() {
    if (document.getElementById('cnhChatbot')) return;
    loadKey();
    loadSession();
    injectStyle();
    injectDom();
    bindEvents();
    renderMessages();
    renderContext();
    renderMode();
    checkServer();
    window.openCNHChatbot = () => setOpen(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
