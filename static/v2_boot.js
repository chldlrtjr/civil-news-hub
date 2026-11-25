// index.html 맨 앞에서 그리기 전에 실행해요 (CSP 가 인라인 스크립트를 막아서 파일로)
try { const th = localStorage.getItem('cnh-theme'); if (th) document.documentElement.dataset.theme = th; } catch(e){}
// 예전 사이트에서 이어받은 정리: 옛 PWA 서비스워커·캐시와 더미 데이터 캐시를 지워 늘 최신 파일을 받게 해요
if ('serviceWorker' in navigator && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.unregister()));
}
if ('caches' in window) caches.keys().then(keys => keys.forEach(k => { if (k.includes('civil-news-hub') && !k.includes('v1.1.91')) caches.delete(k); }));
// 예전 데이터 캐시: 번들이 곧 최신 데이터라 더는 쓰지 않아요
['cnh-live-cache-v1', 'cnh-live-cache-v2'].forEach(k => { try { localStorage.removeItem(k); } catch(e){} });
