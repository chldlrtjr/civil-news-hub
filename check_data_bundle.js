// Vercel 빌드 단계(vercel.json buildCommand): 데이터 번들이 build_data_bundle.py 형식 그대로인지 검사해요.
// 번들은 '데이터만 바뀐 커밋'으로 서버 잠금을 통과하지만 브라우저에서는 JS 로 실행돼요.
// 주석 줄 + window.CNH_STATIC_DATA = <JSON 객체>; 말고 무엇이든 있으면 빌드 실패 → 배포 안 됨
// 직접 실행: node check_data_bundle.js [파일]   테스트: tests/bundle_check.test.js, tests/test_bundle_check.py
const fs = require('fs');
const path = require('path');

// 주석 안에 JS 줄끝(CR·LF·U+2028·U+2029)이 있으면 그 뒤가 코드로 실행돼요: 주석은 그 글자 없이 한 줄씩만
const FORMAT = /^((?:\/\/[^\r\n\u2028\u2029]*\r?\n)*)window\.CNH_STATIC_DATA = ([\s\S]*);\r?\n?$/;

function checkBundle(text) {
  const m = FORMAT.exec(text);
  if (!m) return '형식이 다름 (주석 + window.CNH_STATIC_DATA = <JSON>; 만 허용)';
  let data;
  try { data = JSON.parse(m[2]); } catch (e) { return '본문이 JSON 이 아님: ' + e.message; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '본문이 JSON 객체가 아님';
  return '';
}

if (require.main === module) {
  const file = process.argv[2] || path.join(__dirname, 'static', 'cnh_data_bundle.js');
  const err = checkBundle(fs.readFileSync(file, 'utf8'));
  if (err) { console.error(`데이터 번들 검사 실패 (${file}): ${err}`); process.exit(1); }
  console.log(`데이터 번들 검사 통과: ${file}`);
}

module.exports = { checkBundle };
