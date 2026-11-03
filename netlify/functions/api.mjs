/* API de notificaciones: /api/config, /api/subscribe, /api/reminders, /api/test, /api/unsubscribe */
import { devices, spaces } from '../lib/store.mjs';
import { createSpace, getDoc, putDoc, deleteSpace, MAX_DOC } from '../lib/sync.mjs';
import { subscribe, setReminders, unsubscribe, test, vapidFromEnv, pushReady, HttpError } from '../lib/logic.mjs';

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export default async (req) => {
  const route = new URL(req.url).pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  const vapid = vapidFromEnv();
  try {
    if (route === 'config') {
      if (req.method !== 'GET') throw new HttpError(405, 'Método no permitido.');
      return json(200, pushReady(vapid) ? { push: true, publicKey: vapid.publicKey } : { push: false });
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Método no permitido.');
    const origin = req.headers.get('origin'); const self = new URL(req.url).origin;
    if (origin && origin !== self) throw new HttpError(403, 'Origen no permitido.');
    const isSync = route.startsWith('sync/');
    const text = await req.text();
    if (text.length > (isSync ? MAX_DOC + 2000 : 200000)) throw new HttpError(413, 'Solicitud demasiado grande.');
    let body; try { body = JSON.parse(text); } catch (e) { throw new HttpError(400, 'JSON no válido.'); }
    if (isSync) {
      const sp = await spaces();
      if (route === 'sync/create') return json(200, await createSpace(sp, body));
      if (route === 'sync/get') return json(200, await getDoc(sp, body));
      if (route === 'sync/put') return json(200, await putDoc(sp, body));
      if (route === 'sync/delete') return json(200, await deleteSpace(sp, body));
      throw new HttpError(404, 'Ruta no encontrada.');
    }
    if (!pushReady(vapid)) throw new HttpError(503, 'Las notificaciones no están configuradas en el servidor.');
    const store = await devices();
    if (route === 'subscribe') return json(200, await subscribe(store, body));
    if (route === 'reminders') return json(200, await setReminders(store, body));
    if (route === 'unsubscribe') return json(200, await unsubscribe(store, body));
    if (route === 'test') return json(200, await test(store, body, vapid));
    throw new HttpError(404, 'Ruta no encontrada.');
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: 'Error interno del servidor.' });
  }
};

export const config = { path: '/api/*' };
