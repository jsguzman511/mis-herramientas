/* Lógica del servidor de recordatorios, separada de Netlify para poder probarla. */
import crypto from 'node:crypto';
import { sendPush, validEndpoint } from './webpush.mjs';

export const vapidFromEnv = () => ({ publicKey: process.env.VAPID_PUBLIC_KEY || '', privateKey: process.env.VAPID_PRIVATE_KEY || '', subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com' });
export const pushReady = v => /^[A-Za-z0-9_-]{80,100}$/.test(v.publicKey) && /^[A-Za-z0-9_-]{40,50}$/.test(v.privateKey);

const ID_RE = /^[A-Za-z0-9_-]{16,64}$/, TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const MAX_REMINDERS = 500, DAY = 864e5;
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const GENERIC = { title: 'Recordatorio', body: 'Tienes una actividad próxima. Abre la app para verla.' };

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function auth(rec, token) {
  if (!rec) throw new HttpError(404, 'Este teléfono no está registrado. Vuelve a activar las notificaciones.');
  const a = Buffer.from(rec.tokenHash, 'base64'), b = sha(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(403, 'Credenciales no válidas.');
}
function checkIds(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Solicitud no válida.');
  if (!ID_RE.test(body.deviceId || '') || !TOKEN_RE.test(body.token || '')) throw new HttpError(400, 'Identificador no válido.');
}
export function cleanReminders(list, now = Date.now()) {
  if (!Array.isArray(list)) throw new HttpError(400, 'La lista de recordatorios no es válida.');
  const out = [], seen = new Set();
  for (const r of list.slice(0, MAX_REMINDERS * 2)) {
    if (!r || typeof r !== 'object') continue;
    const id = str(r.id, 160), at = Math.round(Number(r.at));
    if (!id || seen.has(id) || !Number.isFinite(at) || at < now - 3600e3 || at > now + 75 * DAY) continue;
    const url = typeof r.url === 'string' && /^\/[A-Za-z0-9._\-\/#?=&]{0,200}$/.test(r.url) ? r.url : '/calendario.html';
    seen.add(id); out.push({ id, at, title: str(r.title, 100) || 'Recordatorio', body: str(r.body, 160), url });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_REMINDERS);
}

export async function subscribe(store, body) {
  checkIds(body);
  const s = body.subscription;
  if (!s || typeof s !== 'object' || !validEndpoint(s.endpoint) || !s.keys || !/^[A-Za-z0-9_-]{80,100}$/.test(s.keys.p256dh || '') || !/^[A-Za-z0-9_-]{16,30}$/.test(s.keys.auth || ''))
    throw new HttpError(400, 'La suscripción de notificaciones no es válida.');
  const rec = await store.get(body.deviceId);
  if (rec) auth(rec, body.token);
  const now = Date.now();
  const next = { ...(rec || { reminders: [], sent: {}, created: now, tokenHash: sha(body.token).toString('base64') }), sub: { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, hide: !!body.hideDetails, updated: now };
  await store.set(body.deviceId, next);
  return { ok: true };
}

export async function setReminders(store, body) {
  checkIds(body);
  const rec = await store.get(body.deviceId); auth(rec, body.token);
  const reminders = cleanReminders(body.reminders);
  const ids = new Set(reminders.map(r => r.id)), sent = {};
  for (const [k, v] of Object.entries(rec.sent || {})) if (ids.has(k) || Date.now() - v < 7 * DAY) sent[k] = v;
  await store.set(body.deviceId, { ...rec, reminders, sent, hide: body.hideDetails == null ? rec.hide : !!body.hideDetails, updated: Date.now() });
  return { ok: true, count: reminders.length };
}

export async function unsubscribe(store, body) {
  checkIds(body);
  const rec = await store.get(body.deviceId); if (!rec) return { ok: true };
  auth(rec, body.token); await store.del(body.deviceId); return { ok: true };
}

export async function test(store, body, vapid, opts) {
  checkIds(body);
  const rec = await store.get(body.deviceId); auth(rec, body.token);
  if (rec.lastTest && Date.now() - rec.lastTest < 20e3) throw new HttpError(429, 'Espera unos segundos antes de enviar otra prueba.');
  await store.set(body.deviceId, { ...rec, lastTest: Date.now() });
  let r;
  try { r = await sendPush(rec.sub, { title: 'Notificaciones activadas', body: 'Así te llegarán los recordatorios del Calendario.', tag: 'prueba', url: '/calendario.html#avisos' }, vapid, opts); }
  catch (e) { throw new HttpError(502, 'No se pudo contactar el servicio de notificaciones. Intenta de nuevo en un momento.'); }
  if (r.gone) { await store.del(body.deviceId); throw new HttpError(410, 'El teléfono ya no acepta notificaciones. Vuelve a activarlas.'); }
  if (!r.ok) throw new HttpError(502, 'El servicio de notificaciones respondió con un error (' + r.status + ').');
  return { ok: true };
}

/* Se ejecuta cada minuto: envía los recordatorios que ya tocan (hasta 6 horas de atraso). */
export async function dispatch(store, vapid, { now = Date.now(), fetchImpl, concurrency = 8 } = {}) {
  const keys = await store.keys(); let sent = 0, removed = 0, errors = 0;
  let i = 0;
  async function worker() {
    while (i < keys.length) {
      const key = keys[i++];
      const rec = await store.get(key); if (!rec || !rec.sub) continue;
      const due = (rec.reminders || []).filter(r => r.at <= now && r.at > now - 6 * 3600e3 && !(rec.sent || {})[r.id]).slice(0, 10);
      if (!due.length) continue;
      const mark = { ...(rec.sent || {}) }; let gone = false;
      for (const r of due) {
        const msg = rec.hide ? { ...GENERIC, tag: r.id, url: r.url } : { title: r.title, body: r.body, tag: r.id, url: r.url };
        try {
          const res = await sendPush(rec.sub, msg, vapid, { ttl: 6 * 3600, fetchImpl });
          if (res.gone) { gone = true; break; }
          if (res.ok) { mark[r.id] = now; sent++; } else errors++;
        } catch (e) { errors++; }
      }
      if (gone) { await store.del(key); removed++; } else await store.set(key, { ...rec, sent: mark });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, worker));
  return { devices: keys.length, sent, removed, errors };
}
