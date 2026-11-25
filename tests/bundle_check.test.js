// check_data_bundle.js: 데이터 번들은 주석 + window.CNH_STATIC_DATA = <JSON>; 만 (데이터 커밋으로 스크립트를 못 넣게)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkBundle } = require('../check_data_bundle.js');

const HEAD = '// Civil News Hub: Real Live Data Bundle\n// DO NOT EDIT\n';
const ok = (s) => assert.equal(checkBundle(s), '', JSON.stringify(s.slice(-60)));
const bad = (s) => assert.notEqual(checkBundle(s), '', JSON.stringify(s));

test('저장소의 실제 번들(build_data_bundle.py 출력)은 통과', () => {
  ok(fs.readFileSync(path.join(__dirname, '..', 'static', 'cnh_data_bundle.js'), 'utf8'));
});

test('정상 형식: LF·CRLF 줄끝, 문자열 안의 특수 글자', () => {
  ok(HEAD + 'window.CNH_STATIC_DATA = {"a":[1,"x;</script>\u2028"]};\n');
  ok(HEAD.replace(/\n/g, '\r\n') + 'window.CNH_STATIC_DATA = {"a":1};\r\n');
});

test('코드를 끼워 넣은 번들은 실패', () => {
  bad(HEAD + 'window.CNH_STATIC_DATA = {"a":1};alert(1);\n');
  bad(HEAD + 'window.CNH_STATIC_DATA = {"a":1};\nalert(1)\n');
  bad(HEAD + 'alert(1);\nwindow.CNH_STATIC_DATA = {"a":1};\n');
  bad(HEAD + 'window.CNH_STATIC_DATA = {"a":alert(1)};\n');
  bad(HEAD + 'window.CNH_STATIC_DATA = {"a":1}, alert(1);\n');
  bad(HEAD + 'window.CNH_STATIC_DATA = {"a":1}\n');            // ; 없음
  bad('// x\u2028alert(1)\nwindow.CNH_STATIC_DATA = {"a":1};\n');  // JS 는 U+2028 에서 주석이 끝나요
  bad('/* x */ window.CNH_STATIC_DATA = {"a":1};\n');
  bad(HEAD + 'window.CNH_STATIC_DATA = 1;\n');                  // 객체가 아님
  bad('');
});
