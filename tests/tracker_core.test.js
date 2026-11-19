const test = require('node:test');
const assert = require('node:assert/strict');
const { stageOf, needsAttention, mergeTracked, refreshFromSource, makeCard, sortPicker, sortActive, sortRecords, LABEL } = require('../static/tracker_core.js');

const T = '2026-11-19';
const c = (o) => ({ id:'x', kind:'contest', title:'t', org:'o', link:'#', deadline:'2026-11-30', resultDate:'', steps:[], addedAt:T, submittedAt:null, result:null, resultAt:null, ...o });

test('stageOf: 미제출 → 마감 당일까지는 todo, 다음 날 missed', () => {
  assert.equal(stageOf(c({deadline:'2026-11-19'}), T), 'todo');
  assert.equal(stageOf(c({deadline:'2026-11-18'}), T), 'missed');
});
test('stageOf: 제출 → 마감 전 submitted, 마감 지나면 review, 결과 있으면 result', () => {
  assert.equal(stageOf(c({submittedAt:T}), T), 'submitted');
  assert.equal(stageOf(c({submittedAt:'2026-11-01', deadline:'2026-11-10'}), T), 'review');
  assert.equal(stageOf(c({submittedAt:'2026-11-01', deadline:'2026-11-10', result:'win', resultAt:T}), T), 'result');
});
test('stageOf: 마감일 모르면 자동 전환 없음', () => {
  assert.equal(stageOf(c({deadline:''}), T), 'todo');
  assert.equal(stageOf(c({deadline:'', submittedAt:T}), T), 'submitted');
});
test('stageOf: missed 카드에서 제출하면 바로 review', () => {
  assert.equal(stageOf(c({deadline:'2026-11-10', submittedAt:T}), T), 'review');
});
test('LABEL: 화면 문구', () => {
  assert.deepEqual(LABEL, {todo:'미제출', submitted:'제출완료', review:'심사중', result:'결과발표', missed:'마감(미제출)'});
});
test('needsAttention: 발표일 지난 심사중, 3일 이내 마감 미제출', () => {
  assert.equal(needsAttention(c({submittedAt:'2026-11-01', deadline:'2026-11-05', resultDate:'2026-11-18'}), T), true);
  assert.equal(needsAttention(c({deadline:'2026-11-22'}), T), true);
  assert.equal(needsAttention(c({deadline:'2026-11-30'}), T), false);
});
test('mergeTracked: 같은 id는 더 진행된 쪽(result > submitted > todo), 나머지는 합집합', () => {
  const a = [c({id:'1', submittedAt:T}), c({id:'2'})];
  const b = [c({id:'1', submittedAt:T, result:'win', resultAt:T}), c({id:'3'})];
  const m = mergeTracked(a, b);
  assert.deepEqual(m.map(x=>x.id).sort(), ['1','2','3']);
  assert.equal(m.find(x=>x.id==='1').result, 'win');
});
test('refreshFromSource: 마감 연장 반영, 원본 없으면 그대로', () => {
  const card = c({id:'1', deadline:'2026-11-20'});
  const r = refreshFromSource(card, {id:'1', deadline:'2026-11-27', resultDate:'2026-12-07'});
  assert.equal(r.deadline, '2026-11-27');
  assert.equal(r.resultDate, '2026-12-07');
  assert.equal(refreshFromSource(card, undefined), card);
});
test('makeCard: 공모전·채용 필드 복사', () => {
  const k = makeCard('job', {id:'j1', co:'수자원공사', role:'경력', link:'L', deadline:'2026-11-25', steps:['서류','면접']}, T);
  assert.deepEqual([k.kind,k.title,k.org,k.steps.length,k.submittedAt,k.addedAt], ['job','경력','수자원공사',2,null,T]);
  const p = makeCard('contest', {id:'c1', title:'공모', org:'기관', link:'L', deadline:'', resultDate:'2026-12-07'}, T);
  assert.deepEqual([p.title,p.org,p.deadline,p.resultDate,p.result], ['공모','기관','','2026-12-07',null]);
});
test('sortPicker: 마감이 먼 순, 빈 마감 맨 뒤', () => {
  assert.deepEqual(sortPicker([{id:'a',deadline:'2026-11-20'},{id:'b',deadline:''},{id:'c',deadline:'2026-12-01'}]).map(x=>x.id), ['c','a','b']);
});
test('sortActive: 확인 필요 → 진행 중 → missed, result 제외 / sortRecords: resultAt 최신순', () => {
  const list = [c({id:'m', deadline:'2026-11-01'}), c({id:'n', deadline:'2026-11-30'}), c({id:'u', deadline:'2026-11-21'}), c({id:'r', submittedAt:T, result:'lose', resultAt:T})];
  assert.deepEqual(sortActive(list, T).map(x=>x.id), ['u','n','m']);
  assert.deepEqual(sortRecords([c({id:'a', submittedAt:T, result:'win', resultAt:'2026-11-01'}), c({id:'b', submittedAt:T, result:'lose', resultAt:'2026-11-10'})]).map(x=>x.id), ['b','a']);
});
