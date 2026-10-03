# 토목 뉴스 AI 챗봇 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 모던 UI 위에서, 기사 목록을 보면서 질문할 수 있는 떠 있는 AI 챗봇 창(모바일은 절반 높이 시트)을 만들고, 이어지는 질문에도 같은 기사 맥락을 유지하게 한다.

**Architecture:** DOM 없는 순수 로직(`static/cnh_chat_core.js`, Node로 테스트)과 화면 컨트롤러(`static/cnh_chatbot.js`)를 나눈다. 서버(`app.py` `/api/chat`)는 최근 대화(history)를 받아 Gemini에 이전 턴으로 넘긴다. 기존 `static/chatbot.js`는 건드리지 않는다.

**Tech Stack:** Vanilla JS(ES2020, 빌드 없음), CSS 변수(새 UI 토큰), Python 3.12 + Flask, 테스트는 `node --test`(Node 24)와 `python -m unittest`(pytest 없음).

**Spec:** `docs/superpowers/specs/2026-10-03-chatbot-redesign-design.md`

## Global Constraints

- 저장소: `C:\Users\최익석\Desktop\goofy-borg`. 모든 명령은 이 폴더에서 Git Bash로 실행해요.
- `main`에는 **커밋되지 않은 다른 작업**이 있어요(`index.html`, `static/index.html`, `app.js`, `mobile.html`, `scraper.py` 등). 커밋할 때는 **이 계획이 만든 파일만** `git add <경로>`로 올려요. `git add -A`나 `git add .`는 절대 쓰지 않아요.
- `index.html`과 `static/index.html`은 다른 사람이 지금 편집 중이에요. Task 4 전까지는 **열지도 고치지도 않아요.** Task 4에서도 `<script>` 두 줄만 추가하고 **커밋하지 않아요**(그 파일의 나머지 변경이 같이 커밋되기 때문이에요).
- `NOTION_PORTFOLIO_GUIDE.md`는 건드리지 않아요(`auto_sync_watcher.py`가 바뀌면 자동으로 커밋하고 `main`에 푸시해요).
- 기존 `static/chatbot.js`는 수정하지 않아요.
- 챗봇 z-index: 로봇 버튼과 창 모두 **35**예요(새 UI의 탭바 30 < 35 < scrim 40 < drawer·sheet 50).
- 화면 기준: 휴대폰 `max-width:600px`, 601~760px는 하단 탭바(58px)가 있는 데스크톱 화면이에요.
- 새 UI의 색 토큰만 써요: `--bg --surface --surface-2 --ink --muted --line --accent --accent-soft --ok --warn --shadow`, 글꼴 `--f-body`, 글자 크기 `--t-label --t-small`.
- 데스크톱 창 크기는 `400px × min(560px, 100vh - 120px)`이고, 601~760px에서는 높이가 `100vh - 160px`까지예요. 모바일 시트 높이는 50dvh(기본)와 85dvh(펼침)예요.
- 맥락 전환 규칙: 1등 점수 ≥ **9**, 그리고 1등 ≥ **1.5 ×** max(2등 점수, 기억 중인 기사 점수)일 때만 바꿔요. 근거 기사는 최대 **4**건, history는 최근 **4턴(8개)**, 메시지 하나는 최대 **1000자**예요.
- API 키 저장소 이름은 예전 챗봇과 같은 `localStorage['civil_gemini_api_key']`예요. 대화 저장소는 `sessionStorage['cnh_chatbot_session']`예요.
- 화면 문구는 해요체로 써요. 서버 프롬프트의 기존 지침(합니다체)은 그대로 둬요.

## Review Focus

1. **기사 제목이나 AI 답에 HTML·스크립트가 섞여 있을 때**: 그대로 실행되지 않고 글자로 보여야 해요. 원문 링크가 `javascript:`면 `#`으로 바꿔야 해요. → Task 1 `formatMarkdown`, `safeLink` 테스트
2. **기사 데이터가 새로 고쳐져서 기억 중인 기사가 목록에서 사라졌을 때**: 오류 없이 맥락 표시만 사라져야 해요. → Task 1 "사라진 기사" 테스트
3. **history에 이상한 값이 들어올 때**(객체가 아닌 값, 빈 글, 아주 긴 글, 12개 넘는 항목): 서버가 죽지 않고 잘라서 써야 해요. → Task 2 테스트
4. **Flask 없이 정적 서버로 띄웠을 때**(`/api/chat`이 404·405·501): 키가 있으면 브라우저에서 Gemini를 직접 부르고, 없으면 기사 요약 모드로 답해야 해요. → Task 3 `callAi` 분기, Task 4 확인 6번
5. **답을 기다리는 중에 Enter나 추천 칩을 또 누를 때**: 두 번째 질문은 무시해야 해요. → Task 3 `send` 가드, Task 4 확인 8번

---

### Task 0: 작업 브랜치 만들기

**Files:** 없음 (git만)

- [ ] **Step 1: 브랜치 만들기**

커밋되지 않은 변경은 작업 폴더에 그대로 남아요(커밋하지 않아요).

```bash
cd "/c/Users/최익석/Desktop/goofy-borg"
git switch -c feature/chatbot-redesign
git status --short
```
Expected: `On branch feature/chatbot-redesign`. 기존 ` M` 파일 목록이 그대로 보이고, `?? docs/superpowers/`가 보여요.

- [ ] **Step 2: 설계 문서와 계획 커밋하기**

```bash
git add docs/superpowers/specs/2026-10-03-chatbot-redesign-design.md docs/superpowers/plans/2026-10-03-chatbot-redesign.md
git commit -m "docs: AI 챗봇 리디자인 설계와 구현 계획"
```

---

### Task 1: 순수 로직 모듈 `cnh_chat_core.js`

**Files:**
- Create: `static/cnh_chat_core.js`
- Test: `tests/chat_core.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: (브라우저 `window.CNHChatCore`, Node `require`)
  - `tokenize(query: string): string[]`
  - `rankArticles(articles: Article[], query: string): {article: Article, score: number}[]` (점수 > 0만, 높은 순서)
  - `pickContext(articles: Article[], query: string, active: ActiveRef|null): {active: ActiveRef|null, switched: boolean, sources: Article[]}`
  - `isTermQuestion(query: string): boolean`
  - `toActiveRef(a: Article): {id: string, title: string, publisher: string, link: string}`
  - `toSourceRef(a: Article): {title: string, publisher: string, link: string}`
  - `toApiArticle(a: Article): {title, media, published_at, summary: string[]}`
  - `recentHistory(history: Msg[], turns?: number): {role: 'user'|'ai', text: string}[]`
  - `buildPrompt(query: string, apiArticles: ApiArticle[]): string`
  - `buildGeminiContents(query, apiArticles, history): {role: 'user'|'model', parts: [{text}]}[]`
  - `localBriefing(query: string, sources: Article[]): string` (마크다운)
  - `sheetAfterDrag(current: 'half'|'full', dy: number): 'half'|'full'|'closed'`
  - `shortTitle(title: string, max?: number): string`
  - `escapeHtml(text): string`, `formatMarkdown(text): string`, `safeLink(url): string`
  - `Article` = `news.json`의 `articles[]` 항목 `{id, title, link, publisher, category_name, snippet, published_at, related_articles: [{title, link, ...}]}`

- [ ] **Step 1: 실패하는 테스트 쓰기**

`tests/chat_core.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../static/cnh_chat_core.js');

const A = {
  id: 'a1', title: '대우건설, 대형 국책사업 보폭 넓힌다',
  snippet: '대우건설, 대형 국책사업 보폭 넓힌다. 토목 경쟁력 강화.',
  publisher: '프라임경제', category_name: '토목 종합', link: 'https://example.com/a',
  published_at: '2026-09-30 10:00', related_articles: [{ title: '대우건설, 국책사업 수주 확대' }]
};
const B = {
  id: 'b1', title: '지하안전 특별점검 착수', snippet: '국토부가 지하안전 특별점검에 나선다.',
  publisher: '국토일보', category_name: '터널·지반·안전', link: 'https://example.com/b', related_articles: []
};
const C = {
  id: 'c1', title: '국가철도망 계획 확정', snippet: '제5차 국가철도망 구축계획이 확정됐다.',
  publisher: '철도신문', category_name: '도로·교량·철도', link: 'https://example.com/c', related_articles: []
};
const ARTS = [A, B, C];

test('tokenize: 문장부호와 흔한 단어를 뺀다', () => {
  assert.deepEqual(Core.tokenize("'국책사업'이 뭐야?"), ['국책사업']);
  assert.deepEqual(Core.tokenize('대우건설 기사 요약해줘'), ['대우건설']);
});

test('rankArticles: 제목이 맞는 기사가 1등', () => {
  const ranked = Core.rankArticles(ARTS, '지하안전 점검');
  assert.equal(ranked[0].article.id, 'b1');
  assert.ok(ranked.every(r => r.score > 0));
});

test('pickContext: 기사 이름을 말하면 그 기사를 기억한다', () => {
  const r = Core.pickContext(ARTS, '대우건설 기사 요약해줘', null);
  assert.equal(r.active.id, 'a1');
  assert.equal(r.switched, true);
  assert.equal(r.sources[0].id, 'a1');
});

test('pickContext: 이어지는 용어 질문은 같은 기사를 유지한다', () => {
  const active = Core.toActiveRef(A);
  const r = Core.pickContext(ARTS, "'국책사업'이 뭐야?", active);
  assert.equal(r.active.id, 'a1');
  assert.equal(r.switched, false);
});

test('pickContext: 아무 기사도 안 맞으면 기억한 기사를 근거로 쓴다', () => {
  const r = Core.pickContext(ARTS, '그럼 언제 끝나?', Core.toActiveRef(A));
  assert.equal(r.active.id, 'a1');
  assert.deepEqual(r.sources.map(a => a.id), ['a1']);
});

test('pickContext: 다른 기사를 뚜렷하게 말하면 바꾼다', () => {
  const r = Core.pickContext(ARTS, '지하안전 점검 소식', Core.toActiveRef(A));
  assert.equal(r.active.id, 'b1');
  assert.equal(r.switched, true);
  assert.equal(r.sources[0].id, 'b1');
});

test('pickContext: 점수가 비슷하면 고르지 않는다', () => {
  const D = { id: 'd1', title: '고속도로 확장 착공', snippet: '', related_articles: [] };
  const E = { id: 'e1', title: '고속도로 휴게소 개편', snippet: '', related_articles: [] };
  const r = Core.pickContext([D, E], '고속도로 소식', null);
  assert.equal(r.active, null);
  assert.equal(r.sources.length, 2);
});

test('pickContext: 기억한 기사가 목록에서 사라지면 맥락을 지운다', () => {
  const r = Core.pickContext(ARTS, '고마워', { id: 'zz', title: '사라진 기사', publisher: '', link: '' });
  assert.equal(r.active, null);
  assert.deepEqual(r.sources, []);
});

test('pickContext: 근거는 최대 4건이고 기억한 기사가 맨 앞', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ id: 'm' + i, title: '교량 점검 ' + i, snippet: '교량', related_articles: [] }));
  const r = Core.pickContext([A, ...many], '교량', Core.toActiveRef(A));
  assert.equal(r.sources.length, 4);
  assert.equal(r.sources[0].id, 'a1');
});

test('isTermQuestion', () => {
  assert.equal(Core.isTermQuestion('국책사업이 뭐야?'), true);
  assert.equal(Core.isTermQuestion('이 용어 의미 알려줘'), true);
  assert.equal(Core.isTermQuestion('대우건설 기사 요약해줘'), false);
});

test('toApiArticle: snippet과 관련 기사 제목을 summary로 보낸다', () => {
  assert.deepEqual(Core.toApiArticle(A), {
    title: A.title, media: '프라임경제', published_at: '2026-09-30 10:00',
    summary: [A.snippet, '대우건설, 국책사업 수주 확대']
  });
});

test('recentHistory: 오류를 빼고 최근 8개, 1000자까지', () => {
  const h = [];
  for (let i = 0; i < 10; i++) h.push({ role: i % 2 ? 'ai' : 'user', text: 'm' + i });
  h.push({ role: 'error', text: '실패' });
  h.push({ role: 'user', text: 'x'.repeat(1500) });
  const r = Core.recentHistory(h);
  assert.equal(r.length, 8);
  assert.ok(r.every(m => m.role === 'user' || m.role === 'ai'));
  assert.equal(r[r.length - 1].text.length, 1000);
});

test('buildGeminiContents: 이전 대화 + 마지막 질문 프롬프트', () => {
  const c = Core.buildGeminiContents("'국책사업'이 뭐야?", [Core.toApiArticle(A)], [
    { role: 'user', text: '대우건설 기사 요약해줘' }, { role: 'ai', text: '요약입니다.' }
  ]);
  assert.deepEqual(c.map(x => x.role), ['user', 'model', 'user']);
  const last = c[2].parts[0].text;
  assert.ok(last.includes("'국책사업'이 뭐야?"));
  assert.ok(last.includes('3줄 이내'));
  assert.ok(last.includes('1~2문장'));
  assert.ok(last.includes(A.title));
});

test('localBriefing: 용어 질문이면 키 안내, 기사 없으면 못 찾았다고', () => {
  assert.ok(Core.localBriefing('국책사업이 뭐야?', [A]).startsWith('단어 뜻 풀이는 AI 연결이 필요해요.'));
  assert.ok(Core.localBriefing('대우건설 요약', [A]).includes('**대우건설, 대형 국책사업 보폭 넓힌다**'));
  assert.ok(Core.localBriefing('없는 얘기', []).includes('찾지 못했어요'));
});

test('sheetAfterDrag', () => {
  assert.equal(Core.sheetAfterDrag('half', 2), 'full');
  assert.equal(Core.sheetAfterDrag('full', -3), 'half');
  assert.equal(Core.sheetAfterDrag('half', -50), 'full');
  assert.equal(Core.sheetAfterDrag('full', 50), 'half');
  assert.equal(Core.sheetAfterDrag('full', 200), 'half');
  assert.equal(Core.sheetAfterDrag('half', 50), 'half');
  assert.equal(Core.sheetAfterDrag('half', 90), 'closed');
});

test('shortTitle', () => {
  assert.equal(Core.shortTitle('짧은 제목', 18), '짧은 제목');
  assert.equal(Core.shortTitle('가나다라마바사아자차', 4), '가나다라…');
});

test('formatMarkdown: HTML은 글자로, 굵게와 불릿은 태그로', () => {
  const html = Core.formatMarkdown('<img src=x onerror=alert(1)> **굵게**\n• 항목');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('<strong>굵게</strong>'));
  assert.ok(html.includes('<ul><li>항목</li></ul>'));
});

test('safeLink: http(s)만 허용', () => {
  assert.equal(Core.safeLink('https://a.com/x'), 'https://a.com/x');
  assert.equal(Core.safeLink('javascript:alert(1)'), '#');
  assert.equal(Core.safeLink(undefined), '#');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인하기**

Run: `node --test tests/chat_core.test.js`
Expected: FAIL — `Cannot find module '../static/cnh_chat_core.js'`

- [ ] **Step 3: 구현하기**

`static/cnh_chat_core.js`:

```js
// Civil News Hub - AI 기사 챗봇 순수 로직 (DOM 없음)
// 브라우저: window.CNHChatCore / Node 테스트: require('./cnh_chat_core.js')
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CNHChatCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const SWITCH_MIN_SCORE = 9;   // 제목 핵심 단어 1개(6) + snippet(3)
  const SWITCH_RATIO = 1.5;
  const MAX_SOURCES = 4;
  const HISTORY_TURNS = 4;
  const MAX_TEXT = 1000;

  // 질문에 흔히 붙지만 기사를 가려내는 데는 쓸모없는 단어
  const STOPWORDS = new Set([
    '기사', '기사를', '기사는', '기사에', '요약', '요약해줘', '요약해', '알려줘', '설명해줘', '설명',
    '뭐야', '뭔가요', '뭐예요', '뭔데', '무슨', '내용', '의미', '해줘', '이거', '그거', '관련', '대해', '대해서', '좀'
  ]);
  const TERM_RE = /(뜻|뭐야|뭔가요|뭐예요|뭔데|의미|무슨\s*말|용어)/;

  const SYSTEM_PROMPT = [
    '당신은 대한민국 토목·인프라 및 건설 엔지니어링 분야 전문 AI 연구원입니다.',
    '사용자의 질문에 대해 아래 제공된 [참고 기사 데이터]를 바탕으로 팩트에 입각하여 친절하고 전문적으로 답변하세요.',
    '',
    '답변 지침:',
    '1. 기사에 나온 구체적인 수치(사업비, 공사비, 노선 길이, 완공/착공 연도 등)가 있다면 명확히 밝히세요.',
    '2. 읽기 편하게 불릿 기호(•)와 굵은 글씨(**)를 사용하여 핵심 위주로 일목요연하게 작성하세요.',
    '3. 기사에 없는 내용은 허구로 꾸며내지 말고 솔직하게 밝히세요.',
    '4. 한국어로 정중하고 격식 있는 어조(~합니다, ~입니다)로 답변하세요.',
    '5. 기사 요약을 요청받으면 3줄 이내 불릿(•)으로 핵심만 정리하세요.',
    '6. 단어나 용어의 뜻을 물으면 기사 속 맥락을 살려 쉬운 말로 1~2문장으로 설명하고, 예를 하나 드세요.',
    '7. 이전 대화가 있으면 이어지는 질문으로 이해하고, "그 기사", "그 단어"가 무엇을 가리키는지 이전 대화에서 찾으세요.'
  ].join('\n');
  const NO_ARTICLE = '직접 관련된 최신 기사를 찾지 못했습니다. 일반 토목·인프라 공학 및 건설 지식을 바탕으로 설명하되, "제공된 기사 데이터베이스에는 직접 언급되지 않았습니다"라는 점을 먼저 명시하세요.';

  function tokenize(query) {
    return String(query || '').toLowerCase()
      .replace(/[^\w가-힣\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 2 && !STOPWORDS.has(t));
  }

  function relatedTitles(a) {
    const rel = Array.isArray(a.related_articles) ? a.related_articles : [];
    return rel.map(r => (r && r.title) || '').filter(Boolean);
  }

  function scoreArticle(a, q, tokens) {
    const title = String(a.title || '').toLowerCase();
    const snippet = String(a.snippet || '').toLowerCase();
    const related = relatedTitles(a).join(' ').toLowerCase();
    const cat = String(a.category_name || '').toLowerCase();
    let score = q.length >= 4 && title.includes(q) ? 20 : 0;
    tokens.forEach(tok => {
      if (title.includes(tok)) score += 6;
      if (snippet.includes(tok)) score += 3;
      if (related.includes(tok)) score += 2;
      if (cat.includes(tok)) score += 2;
    });
    return score;
  }

  function rankArticles(articles, query) {
    const tokens = tokenize(query);
    if (!tokens.length) return [];
    const q = String(query || '').trim().toLowerCase();
    return (articles || [])
      .map(article => ({ article, score: scoreArticle(article, q, tokens) }))
      .filter(r => r.score > 0)
      .sort((x, y) => y.score - x.score);
  }

  function toActiveRef(a) {
    return { id: String(a.id), title: a.title || '', publisher: a.publisher || '', link: a.link || '' };
  }

  function toSourceRef(a) {
    return { title: a.title || '', publisher: a.publisher || '', link: a.link || '' };
  }

  function pickContext(articles, query, active) {
    const list = articles || [];
    const activeId = active ? String(active.id) : null;
    const activeArt = activeId ? list.find(a => String(a.id) === activeId) || null : null;
    const ranked = rankArticles(list, query);
    let next = activeArt;
    let switched = false;
    const top = ranked[0];
    if (top && top.article !== activeArt) {
      const second = ranked[1] ? ranked[1].score : 0;
      const activeHit = activeArt ? ranked.find(r => r.article === activeArt) : null;
      const rival = Math.max(second, activeHit ? activeHit.score : 0);
      if (top.score >= SWITCH_MIN_SCORE && top.score >= SWITCH_RATIO * rival) {
        next = top.article;
        switched = true;
      }
    }
    const sources = next ? [next] : [];
    ranked.forEach(r => {
      if (sources.length < MAX_SOURCES && r.article !== next) sources.push(r.article);
    });
    return { active: next ? toActiveRef(next) : null, switched, sources };
  }

  function isTermQuestion(query) {
    return TERM_RE.test(String(query || ''));
  }

  function toApiArticle(a) {
    return {
      title: a.title || '',
      media: a.publisher || '언론사',
      published_at: a.published_at || '',
      summary: [a.snippet || a.title || '', ...relatedTitles(a).slice(0, 3)].filter(Boolean)
    };
  }

  function recentHistory(history, turns = HISTORY_TURNS) {
    return (history || [])
      .filter(m => m && (m.role === 'user' || m.role === 'ai') && m.text)
      .slice(-turns * 2)
      .map(m => ({ role: m.role, text: String(m.text).slice(0, MAX_TEXT) }));
  }

  function buildPrompt(query, apiArticles) {
    const ctx = (apiArticles || []).length
      ? apiArticles.map((a, i) => `[기사 ${i + 1}]\n- 제목: ${a.title}\n- 매체/일시: ${a.media} (${a.published_at})\n- 주요 내용:\n• ${a.summary.join('\n• ')}`).join('\n\n')
      : NO_ARTICLE;
    return `${SYSTEM_PROMPT}\n\n[참고 기사 데이터]\n${ctx}\n\n[사용자 질문]\n${query}`;
  }

  function buildGeminiContents(query, apiArticles, history) {
    const turns = recentHistory(history).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    }));
    turns.push({ role: 'user', parts: [{ text: buildPrompt(query, apiArticles) }] });
    return turns;
  }

  function localBriefing(query, sources) {
    const lines = [];
    if (isTermQuestion(query)) {
      lines.push('단어 뜻 풀이는 AI 연결이 필요해요. 🔑 버튼에서 키를 넣으면 쓸 수 있어요.', '');
    }
    if (!sources || !sources.length) {
      lines.push(`'${String(query || '').trim()}'와 맞는 기사를 찾지 못했어요. 기사 제목에 나온 단어로 다시 물어봐 주세요.`);
      return lines.join('\n');
    }
    lines.push(`관련 기사 ${sources.length}건을 정리했어요.`);
    sources.forEach(a => {
      lines.push('', `**${a.title}** (${a.publisher || '언론사'})`, `• ${a.snippet || a.title}`);
      relatedTitles(a).slice(0, 2).forEach(t => lines.push(`• ${t}`));
    });
    return lines.join('\n');
  }

  // 모바일 시트 손잡이를 놓았을 때 다음 높이. 거의 안 움직였으면(탭) 절반↔크게 전환
  function sheetAfterDrag(current, dy) {
    if (Math.abs(dy) < 6) return current === 'full' ? 'half' : 'full';
    if (dy <= -40) return 'full';
    if (current === 'full' && dy >= 40) return 'half';
    if (current === 'half' && dy >= 80) return 'closed';
    return current;
  }

  function shortTitle(title, max = 18) {
    const t = String(title || '');
    return t.length > max ? t.slice(0, max) + '…' : t;
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function inlineMd(s) {
    return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function formatMarkdown(text) {
    let html = '';
    let inList = false;
    escapeHtml(text).split('\n').forEach(line => {
      const bullet = line.match(/^\s*[•\-*]\s+(.*)$/);
      if (bullet) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${inlineMd(bullet[1])}</li>`;
        return;
      }
      if (inList) { html += '</ul>'; inList = false; }
      if (line.trim()) html += `<p>${inlineMd(line)}</p>`;
    });
    if (inList) html += '</ul>';
    return html;
  }

  function safeLink(url) {
    return /^https?:\/\//i.test(String(url || '')) ? String(url) : '#';
  }

  return {
    tokenize, rankArticles, pickContext, isTermQuestion, toActiveRef, toSourceRef, toApiArticle,
    recentHistory, buildPrompt, buildGeminiContents, localBriefing, sheetAfterDrag, shortTitle,
    escapeHtml, formatMarkdown, safeLink
  };
});
```

- [ ] **Step 4: 테스트가 통과하는지 확인하기**

Run: `node --test tests/chat_core.test.js`
Expected: `ℹ pass 18`, `ℹ fail 0`

- [ ] **Step 5: 실제 기사 데이터로 점수 감 잡기 (확인만)**

```bash
node -e "const C=require('./static/cnh_chat_core.js');const a=require('./data/news.json').articles;const t=a[0].title.split(/[ ,·]/).filter(w=>w.length>=2)[0];const r=C.pickContext(a,t+' 기사 요약해줘',null);console.log(t,'→',r.active&&r.active.title,r.switched)"
```
Expected: 첫 기사 제목의 첫 단어로 물으면 그 단어가 들어간 기사가 `active`로 잡혀요. 같은 단어가 여러 기사 제목에 있으면 `null`도 정상이에요(비슷한 점수라 고르지 않음).

- [ ] **Step 6: 커밋하기**

```bash
git add static/cnh_chat_core.js tests/chat_core.test.js
git commit -m "feat(chatbot): 기사 맥락 고르기와 프롬프트를 만드는 순수 로직 모듈"
```

---

### Task 2: 서버 `/api/chat`에 history와 새 답변 지침 추가

**Files:**
- Modify: `app.py` (`gemini_chat()` 안의 `system_prompt`와 Gemini 요청 `json=`의 `contents`, 그리고 새 함수 `build_gemini_contents`)
- Test: `tests/test_chat_api.py`

**Interfaces:**
- Consumes: 요청 JSON `{query, relevantArticles, history?: [{role: 'user'|'ai', text}]}` (Task 3이 보냄)
- Produces: `build_gemini_contents(prompt_text: str, history) -> list[dict]` (app.py 모듈 함수). 응답 모양 `{success, answer, model}`은 그대로예요.

- [ ] **Step 1: 실패하는 테스트 쓰기**

`tests/test_chat_api.py`:

```python
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as app_module  # noqa: E402


class FakeResp:
    ok = True
    status_code = 200

    def json(self):
        return {"candidates": [{"content": {"parts": [{"text": "답변"}]}}]}


ARTICLE = {"title": "대우건설, 대형 국책사업 보폭 넓힌다", "media": "프라임경제",
           "published_at": "2026-09-30 10:00", "summary": ["대우건설이 국책사업 수주를 늘린다"]}


class ChatHistoryTest(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()

    def post(self, body):
        with mock.patch.object(app_module.requests, "post", return_value=FakeResp()) as p:
            resp = self.client.post("/api/chat", json=body, headers={"X-Gemini-Key": "test-key"})
        return resp, p.call_args.kwargs["json"]["contents"]

    def test_history_becomes_previous_turns(self):
        resp, contents = self.post({
            "query": "'국책사업'이 뭐야?", "relevantArticles": [ARTICLE],
            "history": [{"role": "user", "text": "대우건설 기사 요약해줘"},
                        {"role": "ai", "text": "대우건설이 국책사업을 늘립니다."}]})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([c["role"] for c in contents], ["user", "model", "user"])
        self.assertEqual(contents[0]["parts"][0]["text"], "대우건설 기사 요약해줘")
        self.assertIn("'국책사업'이 뭐야?", contents[-1]["parts"][0]["text"])

    def test_without_history_sends_single_turn(self):
        _, contents = self.post({"query": "대우건설 기사 요약해줘", "relevantArticles": [ARTICLE]})
        self.assertEqual(len(contents), 1)
        self.assertEqual(contents[0]["role"], "user")

    def test_prompt_has_summary_and_term_rules(self):
        _, contents = self.post({"query": "요약해줘", "relevantArticles": [ARTICLE]})
        text = contents[-1]["parts"][0]["text"]
        self.assertIn("3줄 이내", text)
        self.assertIn("1~2문장", text)

    def test_bad_history_is_capped_and_cleaned(self):
        history = [{"role": "user", "text": f"질문{i}"} for i in range(12)]
        history += ["문자열", None, {"role": "ai", "text": "   "}, {"role": "ai", "text": "가" * 3000}]
        resp, contents = self.post({"query": "요약", "relevantArticles": [], "history": history})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(contents[0]["parts"][0]["text"], "질문8")
        self.assertLessEqual(len(contents), 9)
        self.assertTrue(all(len(c["parts"][0]["text"]) <= 1000 for c in contents[:-1]))

    def test_history_not_a_list_is_ignored(self):
        _, contents = self.post({"query": "요약", "relevantArticles": [], "history": "oops"})
        self.assertEqual(len(contents), 1)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 테스트가 실패하는지 확인하기**

Run: `python -m unittest discover -s tests -p "test_*.py" -v`
Expected: `test_history_becomes_previous_turns`, `test_prompt_has_summary_and_term_rules`, `test_bad_history_is_capped_and_cleaned`가 FAIL이에요(contents 길이가 1이고 지침이 없어서). 나머지 둘은 지금도 PASS일 수 있어요.

- [ ] **Step 3: `build_gemini_contents` 함수 추가하기**

`app.py`에서 `@app.route("/api/chat/status", ...)` 줄 **바로 위**에 넣어요:

```python
def build_gemini_contents(prompt_text, history):
    """최근 대화(최대 8개, 각 1000자)를 이전 턴으로 넣고, 마지막에 이번 프롬프트를 붙여요."""
    contents = []
    if isinstance(history, list):
        for item in history[-8:]:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()[:1000]
            if not text:
                continue
            role = "user" if item.get("role") == "user" else "model"
            contents.append({"role": role, "parts": [{"text": text}]})
    contents.append({"role": "user", "parts": [{"text": prompt_text}]})
    return contents
```

- [ ] **Step 4: 답변 지침 세 줄 추가하기**

`gemini_chat()`의 `system_prompt`에서 이 줄을:

```python
            "4. 한국어로 정중하고 격식 있는 어조(~합니다, ~입니다)로 답변하세요."
```

이렇게 바꿔요:

```python
            "4. 한국어로 정중하고 격식 있는 어조(~합니다, ~입니다)로 답변하세요.\n"
            "5. 기사 요약을 요청받으면 3줄 이내 불릿(•)으로 핵심만 정리하세요.\n"
            "6. 단어나 용어의 뜻을 물으면 기사 속 맥락을 살려 쉬운 말로 1~2문장으로 설명하고, 예를 하나 드세요.\n"
            "7. 이전 대화가 있으면 이어지는 질문으로 이해하고, \"그 기사\", \"그 단어\"가 무엇을 가리키는지 이전 대화에서 찾으세요."
```

- [ ] **Step 5: Gemini 요청에 history 넣기**

`model_candidates = [...]` 줄 **바로 위**에 추가해요:

```python
    contents = build_gemini_contents(prompt_text, data.get("history"))
```

그리고 `requests.post(...)`의 `json=` 안에 있는 이 부분을:

```python
                    "contents": [
                        {
                            "role": "user",
                            "parts": [{"text": prompt_text}]
                        }
                    ],
```

이렇게 바꿔요:

```python
                    "contents": contents,
```

- [ ] **Step 6: 테스트가 통과하는지 확인하기**

Run: `python -m unittest discover -s tests -p "test_*.py" -v`
Expected: `Ran 5 tests ... OK`

- [ ] **Step 7: 커밋하기**

```bash
git add app.py tests/test_chat_api.py
git commit -m "feat(api): /api/chat이 최근 대화를 이어 받고 요약·용어 답변 지침 추가"
```

---

### Task 3: 화면 컨트롤러 `cnh_chatbot.js`

**Files:**
- Create: `static/cnh_chatbot.js`

**Interfaces:**
- Consumes: `window.CNHChatCore`의 Task 1 함수 전부, `/api/news`(또는 `./data/news.json`)의 `{articles: Article[]}`, `/api/chat/status`의 `{has_server_key, model}`, `/api/chat`(Task 2)
- Produces: `document.body`에 `#cnhChatbot`을 붙여요. 전역은 `window.openCNHChatbot()` 하나만 내보내요(다른 화면에서 챗봇을 열 때 써요).

- [ ] **Step 1: 파일 쓰기**

`static/cnh_chatbot.js`:

```js
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
    if (res && !PROXY_MISSING.includes(res.status)) {
      const d = await res.json().catch(() => ({}));
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
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: Core.buildGeminiContents(query, apiArticles, history),
        generationConfig: { temperature: 0.2, maxOutputTokens: 1200 }
      })
    });
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
    setGenerating(true);
    try {
      const articles = await loadArticles();
      const ctx = Core.pickContext(articles, query, state.active);
      state.active = ctx.active;
      renderContext();
      let text = null;
      if (state.serverKey || state.apiKey) {
        try { text = await callAi(query, ctx.sources.map(Core.toApiArticle), prior); }
        catch (err) { if (err.message !== 'KEY_MISSING') throw err; }
      }
      const local = text == null;
      if (local) text = Core.localBriefing(query, ctx.sources);
      state.generating = false;
      push({ role: 'ai', text, local, sources: ctx.sources.map(Core.toSourceRef) });
    } catch (err) {
      state.generating = false;
      push({ role: 'error', text: err.message || 'AI 답변 처리 중 오류가 났어요.', retry: query });
    } finally {
      setGenerating(false);
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
        state.history = []; state.active = null;
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
```

- [ ] **Step 2: 문법 확인하기**

Run: `node --check static/cnh_chatbot.js && node --test tests/chat_core.test.js`
Expected: 아무 오류 없이 끝나고 core 테스트는 `# fail 0`

- [ ] **Step 3: index.html을 고치지 않고 브라우저에서 띄워 보기**

```bash
python app.py
```
브라우저에서 앱 주소(터미널에 찍히는 주소, 보통 `http://localhost:8000`)를 열고, 개발자 도구(F12) 콘솔에 붙여 넣어요:

```js
['./static/cnh_chat_core.js', './static/cnh_chatbot.js'].reduce((p, src) => p.then(() => new Promise(r => { const s = document.createElement('script'); s.src = src + '?t=' + Date.now(); s.onload = r; document.body.appendChild(s); })), Promise.resolve());
```
Expected: 오른쪽 아래에 로봇이 떠요. 누르면 남색 헤더 창이 열리고, 뒤 화면은 어두워지지 않아요.

- [ ] **Step 4: 데스크톱 동작 확인하기 (1440×900)**

1. 창을 연 채로 기사 목록을 마우스 휠로 스크롤하면 → 페이지가 스크롤돼요.
2. 창을 연 채로 기사 제목 링크를 클릭하면 → 원문이 새 탭에서 열리고 챗봇은 그대로예요.
3. "대우건설 기사 요약해줘"처럼 지금 목록에 있는 기사 제목의 단어로 물어보면 → 답 아래에 근거 기사 칩이 붙고, 입력창 위에 "💬 … 기사에 대해 대화 중"이 떠요.
4. 이어서 그 기사에 나온 단어로 "○○이 뭐야?"라고 물어보면 → 맥락 표시가 그대로예요. 키가 없으면 "단어 뜻 풀이는 AI 연결이 필요해요."가 먼저 나와요.
5. 맥락 표시의 ✕를 누르면 → 표시가 사라져요.
6. '—'를 누르면 → 창이 접히고 로봇이 다시 보여요. 다시 열면 대화와 맥락이 그대로예요. '✕'로 닫고 다시 열면 → 대화는 남고 맥락 표시만 없어요.
7. 입력창에서 ESC를 누르면 → 창이 접혀요.
8. 테마 버튼으로 다크 모드로 바꾸면 → 챗봇 색도 같이 바뀌어요.

- [ ] **Step 5: 커밋하기**

```bash
git add static/cnh_chatbot.js
git commit -m "feat(chatbot): 모던 UI용 떠 있는 챗봇 창과 모바일 절반 시트"
```

---

### Task 4: 새 UI에 연결하고 전체 확인하기

**Files:**
- Modify (커밋하지 않음): `index.html`, `static/index.html` — 각각 `</body>` 바로 앞에 두 줄 추가

**Interfaces:**
- Consumes: Task 1의 `static/cnh_chat_core.js`, Task 3의 `static/cnh_chatbot.js`
- Produces: 없음

- [ ] **Step 1: 편집 중인지 먼저 확인하기**

```bash
ls -la --time-style=full-iso index.html static/index.html
```
수정 시각이 몇 분 이내면 **사용자에게 지금 고쳐도 되는지 물어본 뒤** 진행해요.

- [ ] **Step 2: 두 파일의 `</body>` 앞에 스크립트 추가하기**

두 파일 모두 마지막 `<script>…</script>`(화면 고르기 스크립트) **뒤**, `</body>` 앞에 넣어요. `</body>`가 없으면 파일 맨 끝에 붙여요:

```html
<script src="./static/cnh_chat_core.js?v=20261003"></script>
<script src="./static/cnh_chatbot.js?v=20261003"></script>
```

확인:
```bash
grep -n "cnh_chat" index.html static/index.html
```
Expected: 파일마다 2줄씩, 총 4줄이 보여요.

- [ ] **Step 3: 모바일 확인하기 (개발자 도구 기기 모드 390×844)**

1. 로봇이 하단 탭바 바로 위에 떠 있어요.
2. 누르면 시트가 화면 절반까지만 올라와요. 위쪽 절반에서 기사 목록이 스크롤돼요.
3. 손잡이를 위로 끌면 85%, 다시 아래로 끌면 50%, 50%에서 크게 아래로 끌면 접혀요. 손잡이를 탭하면 50%와 85%가 바뀌어요.
4. 시트가 열려 있을 때 하단 탭바가 시트 아래로 가려져요.
5. 실제 휴대폰이 있으면 `python app.py`가 알려주는 내부망 주소로 열어서, 입력창을 누르고 키보드가 올라와도 입력창이 보이는지 확인해요.

- [ ] **Step 4: 경계 폭과 겹침 확인하기**

1. 폭 700px: 로봇과 창이 하단 탭바 위에 있어요(겹치지 않아요).
2. 창을 연 채로 폭을 1000px ↔ 400px로 바꾸면 → 창과 시트 모양이 바뀌어도 대화와 맥락 표시는 그대로예요.
3. 새 UI의 기사 상세(drawer)나 저장 목록 시트를 열면 → 챗봇이 그 아래로 가려져요.

- [ ] **Step 5: 서버 없이 확인하기 (정적 서버)**

```bash
python -m http.server 8090
```
`http://localhost:8090`을 열고:
6. 키 없이 질문하면 → "관련 기사 N건을 정리했어요." 요약 카드가 나와요(오류가 나면 안 돼요).
7. 🔑에 키를 넣고 질문하면 → 브라우저에서 Gemini를 직접 불러서 답해요.
8. 답을 기다리는 동안 Enter와 추천 칩을 여러 번 눌러도 → 질문이 하나만 올라가요.

- [ ] **Step 6: 마무리 보고**

`index.html`과 `static/index.html`은 **커밋하지 않고** 사용자에게 알려요. "두 파일에 스크립트 두 줄을 추가했어요. 진행 중이던 새 UI 작업과 함께 커밋해 주세요."
