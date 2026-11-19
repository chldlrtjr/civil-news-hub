/* 마이페이지 진행 추적: 상태 계산·정렬·병합 (화면 없음, node --test 로 검증)
   날짜는 모두 'YYYY-MM-DD' 문자열 비교. 마감일 당일 23:59까지는 지나지 않은 것으로 본다. */
(function () {
  const STAGES = ['todo', 'submitted', 'review', 'result', 'missed'];
  const LABEL = { todo: '미제출', submitted: '제출완료', review: '심사중', result: '결과발표', missed: '마감(미제출)' };
  const RANK = { result: 3, submitted: 2, todo: 1 };

  const passed = (deadline, today) => !!deadline && today > deadline;

  function daysBetween(fromISO, toISO) {
    return Math.round((Date.parse(toISO + 'T00:00:00Z') - Date.parse(fromISO + 'T00:00:00Z')) / 86400000);
  }

  // 저장된 건 사용자 행동뿐이고, 심사중·마감(미제출)은 오늘 날짜로 계산
  function stageOf(card, today) {
    if (card.result) return 'result';
    if (card.submittedAt) return passed(card.deadline, today) ? 'review' : 'submitted';
    return passed(card.deadline, today) ? 'missed' : 'todo';
  }

  function needsAttention(card, today) {
    const s = stageOf(card, today);
    if (s === 'review') return !!card.resultDate && today > card.resultDate;
    if (s === 'todo') return !!card.deadline && daysBetween(today, card.deadline) <= 3;
    return false;
  }

  const safeLink = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');

  function makeCard(kind, item, today, now = new Date().toISOString()) {
    return {
      id: String(item.id), kind,
      title: kind === 'job' ? (item.role || item.title || '') : (item.title || ''),
      org: kind === 'job' ? (item.co || item.org || '') : (item.org || ''),
      link: safeLink(item.link),
      deadline: item.deadline || '',
      resultDate: item.resultDate || '',
      steps: Array.isArray(item.steps) ? item.steps.slice() : [],
      addedAt: today, submittedAt: null, result: null, resultAt: null, updatedAt: now,
    };
  }

  // 공고가 아직 목록에 있으면 마감 연장·발표일만 최신으로, 사라졌으면 복사본 그대로
  function refreshFromSource(card, item) {
    if (!item || card.deleted) return card;
    const deadline = item.deadline || card.deadline, resultDate = item.resultDate || card.resultDate;
    return deadline === card.deadline && resultDate === card.resultDate ? card : { ...card, deadline, resultDate };
  }

  const rank = (c) => (c.result ? RANK.result : c.submittedAt ? RANK.submitted : RANK.todo);

  // 같은 id는 더 나중에 바꾼 쪽(삭제·되돌리기 포함), 시각이 같거나 없으면 더 진행된 쪽, 그래도 같으면 a쪽
  // 삭제는 {id, deleted:true, updatedAt} 표시로 남겨서 다른 기기의 옛 사본이 되살리지 못하게 해요
  // shortcut: 삭제 표시는 지우지 않고 계속 쌓임(카드당 약 60바이트), 수천 개가 되면 오래된 표시를 정리
  function mergeTracked(a, b) {
    const out = new Map(a.map((c) => [c.id, c]));
    b.forEach((c) => {
      const have = out.get(c.id);
      const ta = (have && have.updatedAt) || '', tb = c.updatedAt || '';
      if (!have || tb > ta || (tb === ta && !c.deleted && !have.deleted && rank(c) > rank(have))) out.set(c.id, c);
    });
    return [...out.values()];
  }

  const visible = (cards) => cards.filter((c) => !c.deleted);

  // 서버가 돌려주는 jsonb는 필드 순서가 바뀌어서 JSON 문자열 비교 대신 id·updatedAt으로 비교
  function sameTracked(a, b) {
    const key = (l) => l.map((c) => c.id + '|' + (c.updatedAt || '') + '|' + (c.deleted ? 1 : 0)).sort().join(',');
    return a.length === b.length && key(a) === key(b);
  }

  const byDeadline = (x, y) => (!x.deadline) - (!y.deadline) || (x.deadline < y.deadline ? -1 : x.deadline > y.deadline ? 1 : 0);

  function sortActive(cards, today) {
    const key = (c) => (stageOf(c, today) === 'missed' ? 2 : needsAttention(c, today) ? 0 : 1);
    return visible(cards).filter((c) => stageOf(c, today) !== 'result').sort((x, y) => key(x) - key(y) || byDeadline(x, y));
  }

  function sortRecords(cards) {
    return visible(cards).filter((c) => c.result).sort((x, y) => (x.resultAt < y.resultAt ? 1 : x.resultAt > y.resultAt ? -1 : 0));
  }

  // 팝업: 마감이 먼 것부터, 마감일 없는 상시 공고는 맨 뒤
  function sortPicker(items) {
    return items.slice().sort((x, y) => (!x.deadline) - (!y.deadline) || (x.deadline < y.deadline ? 1 : x.deadline > y.deadline ? -1 : 0));
  }

  const API = { STAGES, LABEL, stageOf, needsAttention, makeCard, refreshFromSource, mergeTracked, visible, sameTracked, sortActive, sortRecords, sortPicker, daysBetween };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else window.CNHTracker = API;
})();
