/* Service worker: la app funciona sin conexión y recibe notificaciones push.
   VERSION y ASSETS los completa el script de construcción. */
const VERSION = '9226ec4255e7';
const ASSETS = ["/calendario.html", "/cotizador.html", "/finanzas.html", "/icons/apple-touch-icon.png", "/icons/badge-96.png", "/icons/favicon-32.png", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/index.html", "/manifest.webmanifest", "/shell.js", "/sync.js"];
const CACHE = 'app-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('app-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;   // la API siempre va a la red
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  e.respondWith(caches.open(CACHE).then(c => c.match(path).then(hit => hit || fetch(req).catch(() => req.mode === 'navigate' ? c.match('/index.html') : Response.error()))));
});

/* ---------- notificaciones ---------- */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  const title = String(d.title || 'Recordatorio').slice(0, 100);
  e.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || '').slice(0, 200), tag: String(d.tag || 'recordatorio').slice(0, 160), renotify: true,
    icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', data: { url: typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/calendario.html#avisos' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || '/calendario.html#avisos', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.split('#')[0] === target.split('#')[0] && 'focus' in c) { c.navigate(target).catch(() => {}); return c.focus(); }
    if (list[0] && 'navigate' in list[0]) return list[0].navigate(target).then(c => c && c.focus());
    return self.clients.openWindow(target);
  }));
});
