/* Barra superior con «Inicio», registro del service worker y aviso de nueva versión.
   Se incluye en todas las páginas de la versión web. */
(function () {
  var me = document.currentScript;
  var title = me && me.getAttribute('data-title');
  var css = '#appbar{position:sticky;top:0;z-index:60;display:flex;align-items:center;gap:8px;background:#17212b;color:#fff;padding:calc(env(safe-area-inset-top,0px) + 6px) 10px 6px;font:600 15px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '#appbar a{display:inline-flex;align-items:center;gap:4px;color:#fff;text-decoration:none;background:rgba(255,255,255,.14);border-radius:999px;padding:8px 14px 8px 10px;font-weight:700;font-size:14px;min-height:36px}' +
    '#appbar a:focus-visible{outline:3px solid #a5b4fc;outline-offset:2px}#appbar b{margin-left:4px}' +
    '#upd{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 56px);z-index:200;display:flex;align-items:center;gap:10px;background:#1e1b4b;color:#fff;border:1px solid #4338ca;border-radius:18px;padding:10px 10px 10px 16px;box-shadow:0 16px 40px rgba(0,0,0,.35);font:600 14px system-ui,-apple-system,sans-serif;width:max-content;max-width:calc(100vw - 24px)}' +
    '#upd button{border:0;border-radius:999px;font:inherit;font-weight:800;cursor:pointer;min-height:38px;padding:0 14px}#upd .go{background:#fff;color:#3730a3}#upd .no{background:rgba(255,255,255,.16);color:#fff}' +
    '@media (max-height:520px){#appbar{padding-top:calc(env(safe-area-inset-top,0px) + 3px);padding-bottom:3px}#appbar a{min-height:30px;padding:4px 12px 4px 8px}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  if (title) {
    var bar = document.createElement('div'); bar.id = 'appbar';
    var a = document.createElement('a'); a.href = '/'; a.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>Inicio';
    var b = document.createElement('b'); b.textContent = title;
    bar.appendChild(a); bar.appendChild(b);
    var put = function () { document.body.insertBefore(bar, document.body.firstChild); };
    if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
  }
  if (!('serviceWorker' in navigator)) return;
  function offer(worker) {
    if (document.getElementById('upd')) return;
    var box = document.createElement('div'); box.id = 'upd'; box.setAttribute('role', 'status');
    var t = document.createElement('span'); t.textContent = 'Hay una versión nueva';
    var go = document.createElement('button'); go.className = 'go'; go.type = 'button'; go.textContent = 'Actualizar';
    var no = document.createElement('button'); no.className = 'no'; no.type = 'button'; no.textContent = 'Luego';
    go.onclick = function () { go.disabled = true; worker.postMessage('SKIP_WAITING'); };
    no.onclick = function () { box.remove(); };
    box.appendChild(t); box.appendChild(go); box.appendChild(no); document.body.appendChild(box);
  }
  var reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (reloading) return; reloading = true;
    try { window.dispatchEvent(new Event('pagehide')); } catch (e) {}   // el Cotizador guarda al salir
    location.reload();
  });
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').then(function (reg) {
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing; if (!w) return;
        w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(function () {}); });
    }).catch(function () {});
  });
})();
