// CSP(script-src 'self'): 배포되는 HTML 에 인라인 스크립트·인라인 이벤트 처리기가 없어야 해요 (있으면 브라우저가 막아 화면이 멈춰요)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const SITE_JS = fs.readdirSync(path.join(ROOT, 'static')).filter((f) => f.endsWith('.js')).map((f) => 'static/' + f);
const vercel = JSON.parse(read('vercel.json'));
const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy').value;
const directive = (name) => (csp.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0] === name) || []).slice(1);

test("vercel.json CSP: script-src 에 'unsafe-inline' 이 없어요", () => {
  assert.deepEqual(directive('script-src'), ["'self'"]);
});

test('img-src: 아무 https 주소나 허용하지 않아요', () => {
  assert.ok(!directive('img-src').includes('https:'), directive('img-src').join(' '));
});

test('HTML 에 인라인 <script> 가 없어요 (모두 src 로)', () => {
  for (const f of HTML) {
    const inline = [...read(f).matchAll(/<script\b([^>]*)>/gi)].filter((m) => !/\bsrc=/.test(m[1]));
    assert.equal(inline.length, 0, f);
  }
});

test('HTML·화면 스크립트에 인라인 이벤트 처리기(onerror= 등)가 없어요', () => {
  for (const f of [...HTML, ...SITE_JS.filter((f) => !f.endsWith('cnh_data_bundle.js'))]) {
    assert.ok(!/<[^>]*\son[a-z]+\s*=/i.test(read(f)), f);
  }
});

test('HTML 이 부르는 로컬 스크립트는 모두 있고 Vercel 에 올라가요(.vercelignore 허용)', () => {
  const allow = read('.vercelignore').split('\n').filter((l) => l.startsWith('!')).map((l) => l.slice(1).trim());
  for (const f of HTML) {
    for (const [, src] of read(f).matchAll(/<script\b[^>]*\bsrc="\.\/([^"?]+)/gi)) {
      assert.ok(fs.existsSync(path.join(ROOT, src)), `${f}: ${src}`);
      assert.ok(allow.some((a) => src === a || src.startsWith(a + '/')), `${f}: ${src} 가 .vercelignore 허용 목록에 없어요`);
    }
  }
});

test('Vercel 빌드 단계에서 데이터 번들 형식을 검사해요 (검사 파일도 업로드 허용)', () => {
  assert.equal(vercel.buildCommand, 'node check_data_bundle.js');
  assert.equal(vercel.framework, null);
  assert.equal(vercel.outputDirectory, undefined);  // 출력 폴더는 지금처럼 저장소 맨 위
  assert.ok(read('.vercelignore').split('\n').includes('!check_data_bundle.js'));
});

test('마감일 캘린더 줄: 묶음 이름과 새 탭 안내(화면읽기)', () => {
  const pages = read('static/v2_pages.js');
  assert.ok(pages.includes('<div class="dt-cal" role="group" aria-label="마감일 캘린더에 넣기">'));
  assert.ok(/Google 캘린더<span class="sr">\s*\(새 탭\)<\/span><\/a>/.test(pages));
  const css = read('index.html');
  assert.ok(/#v2m \.dt-cal \.btn\{flex:1;height:40px\}/.test(css));
  // PC 1024~1199px: 안내 글을 한 줄 다 쓰게 해서 두 버튼이 같은 줄에
  const narrow = css.split('@media (max-width:1199px){').slice(1).map((b) => b.slice(0, b.indexOf('\n}')));
  assert.ok(narrow.some((b) => b.includes('#v2pc .dt-cal>span{flex-basis:100%}')));
});
