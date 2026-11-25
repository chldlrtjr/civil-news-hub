// 옛 주소에서 새 화면으로 바로 이동 (CSP 가 인라인 스크립트를 막아서 파일로, 스크립트가 꺼져 있으면 meta refresh 가 대신해요)
// data-to: 고정 목적지(contests·jobs). 없으면 ./ 로, 로그인 중 돌아오는 ?code= 와 #화면은 그대로(없으면 data-hash)
(function (s) {
  location.replace(s.dataset.to || './' + location.search + (location.hash || s.dataset.hash || ''));
})(document.currentScript);
