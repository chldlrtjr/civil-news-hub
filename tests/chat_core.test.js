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
  assert.equal(r.length, 7);   // 최근 8개 중 맨 앞 ai 턴(m3)은 F2에 따라 버려요
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

// ---- 최종 리뷰 수정: 추천 칩 맥락 고정 / 대화 기록 정리 ----
const N1 = { id: 'n1', title: '신공항 활주로 공사 착수', snippet: '활주로 공사가 시작됐다.', publisher: 'X', category_name: '공항', link: 'https://e.com/1', published_at: '2026-10-01 09:00', related_articles: [] };
const N2 = { id: 'n2', title: '주요 교량 안전 점검 이슈 소식', snippet: '이번 주 주요 이슈를 정리했다. 오늘 최신 소식.', publisher: 'Y', category_name: '교량', link: 'https://e.com/2', published_at: '2026-10-03 09:00', related_articles: [] };
const N3 = { id: 'n3', title: '댐 보수 계획', snippet: '댐 보수.', publisher: 'Z', category_name: '수자원', link: 'https://e.com/3', published_at: '2026-10-02 09:00', related_articles: [] };
const N4 = { id: 'n4', title: '하수관 정비', snippet: '하수관.', publisher: 'Z', category_name: '수자원', link: 'https://e.com/4', published_at: '2026-09-20 09:00', related_articles: [] };
const N5 = { id: 'n5', title: '날짜 없는 기사', snippet: '없음', publisher: 'Z', category_name: '기타', link: 'https://e.com/5', related_articles: [] };
const N6 = { id: 'n6', title: '터널 환기', snippet: '터널.', publisher: 'Z', category_name: '터널', link: 'https://e.com/6', published_at: '2026-09-01 09:00', related_articles: [] };
const NEWS = [N1, N2, N3, N4, N5, N6];

test('tokenize: 추천 칩의 일반 단어는 버린다', () => {
  assert.deepEqual(Core.tokenize('오늘 주요 기사 요약'), []);
  assert.deepEqual(Core.tokenize('어려운 용어 풀어줘'), []);
  assert.deepEqual(Core.tokenize('이번 주 지하안전 이슈'), ['지하안전']);
});

test('칩 "오늘 주요 기사 요약": 맥락을 지우고 최신 4건', () => {
  const r = Core.pickContext(NEWS, '오늘 주요 기사 요약', Core.toActiveRef(N1));
  assert.equal(r.active, null);
  assert.equal(r.switched, false);
  assert.deepEqual(r.sources.map(a => a.id), ['n2', 'n3', 'n1', 'n4']);
});

test('칩 "어려운 용어 풀어줘": 있던 기사 유지, 없으면 최신 4건', () => {
  const kept = Core.pickContext(NEWS, '어려운 용어 풀어줘', Core.toActiveRef(N4));
  assert.equal(kept.active.id, 'n4');
  assert.equal(kept.switched, false);
  assert.deepEqual(kept.sources.map(a => a.id), ['n4']);
  const none = Core.pickContext(NEWS, '어려운 용어 풀어줘', null);
  assert.equal(none.active, null);
  assert.deepEqual(none.sources.map(a => a.id), ['n2', 'n3', 'n1', 'n4']);
});

test('칩 "도로·철도 소식만" / "이번 주 지하안전 이슈": 일반 단어만 겹치는 기사로 안 바뀐다', () => {
  const r1 = Core.pickContext(NEWS, '도로·철도 소식만', Core.toActiveRef(N1));
  assert.equal(r1.active.id, 'n1');
  assert.equal(r1.switched, false);
  const r2 = Core.pickContext(NEWS, '이번 주 지하안전 이슈', Core.toActiveRef(N1));
  assert.equal(r2.active.id, 'n1');
  assert.equal(r2.switched, false);
});

test('pickContext: 맥락 없고 단서도 없으면 published_at 없는 기사는 맨 뒤', () => {
  const r = Core.pickContext([N5, N6, N4], '최신 소식', null);
  assert.deepEqual(r.sources.map(a => a.id), ['n4', 'n6', 'n5']);
});

test('recentHistory: 맨 앞 ai 턴은 버리고 같은 역할은 합친다', () => {
  const h = Core.recentHistory([
    { role: 'ai', text: '인사' },
    { role: 'user', text: '하나' }, { role: 'user', text: '둘' },
    { role: 'ai', text: '답' }
  ]);
  assert.deepEqual(h.map(m => m.role), ['user', 'ai']);
  assert.equal(h[0].text, '하나\n\n둘');
});

test('recentHistory: 합친 글도 1000자 이하, local 메시지는 제외', () => {
  const h = Core.recentHistory([
    { role: 'user', text: '가'.repeat(900) }, { role: 'user', text: '나'.repeat(900) },
    { role: 'ai', text: '로컬 요약', local: true },
    { role: 'ai', text: '진짜 답' }
  ]);
  assert.equal(h.length, 2);
  assert.ok(h[0].text.length <= 1000);
  assert.equal(h[1].text, '진짜 답');
});

test('buildGeminiContents: 첫 턴이 user이고 역할이 번갈아 간다', () => {
  const c = Core.buildGeminiContents('질문', [], [
    { role: 'ai', text: 'x' }, { role: 'user', text: 'a' }, { role: 'user', text: 'b' }, { role: 'ai', text: 'c' }
  ]);
  assert.deepEqual(c.map(t => t.role), ['user', 'model', 'user']);
});
