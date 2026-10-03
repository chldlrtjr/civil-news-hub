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
    '뭐야', '뭔가요', '뭐예요', '뭔데', '무슨', '내용', '의미', '해줘', '이거', '그거', '관련', '대해', '대해서', '좀',
    // 추천 칩 같은 일반 표현: 기사 제목에 우연히 겹쳐도 맥락을 바꾸면 안 돼요
    '오늘', '주요', '이번', '최신', '소식', '소식만', '이슈', '어려운', '용어', '풀어줘'
  ]);
  const BRIEFING_RE = /(오늘|최신|주요|전체|브리핑)/;
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

  // 최신순(published_at 문자열 내림차순) 상위 n건. 날짜가 없으면 맨 뒤예요
  function newestArticles(list, n) {
    return list.slice()
      .sort((x, y) => String(y.published_at || '').localeCompare(String(x.published_at || '')))
      .slice(0, n);
  }

  function pickContext(articles, query, active) {
    const list = articles || [];
    const activeId = active ? String(active.id) : null;
    const activeArt = activeId ? list.find(a => String(a.id) === activeId) || null : null;
    if (!tokenize(query).length) {
      // 기사를 가려낼 단어가 없는 질문: 브리핑 요청이면 맥락을 지우고, 아니면 있던 기사를 이어가요
      if (BRIEFING_RE.test(String(query || '')) || !activeArt) {
        return { active: null, switched: false, sources: newestArticles(list, MAX_SOURCES) };
      }
      return { active: toActiveRef(activeArt), switched: false, sources: [activeArt] };
    }
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
    const cleaned = (history || [])
      .filter(m => m && (m.role === 'user' || m.role === 'ai') && m.text && !m.local)   // 로컬 요약은 AI 답이 아니에요
      .slice(-turns * 2)
      .map(m => ({ role: m.role, text: String(m.text).slice(0, MAX_TEXT) }));
    while (cleaned.length && cleaned[0].role !== 'user') cleaned.shift();   // 첫 턴은 항상 user
    const merged = [];
    cleaned.forEach(m => {
      const last = merged[merged.length - 1];
      if (last && last.role === m.role) last.text = `${last.text}\n\n${m.text}`.slice(0, MAX_TEXT);
      else merged.push(m);
    });
    return merged;
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
