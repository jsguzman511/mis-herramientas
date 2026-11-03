/* Función programada: cada minuto revisa los recordatorios pendientes y envía las notificaciones. */
import { devices } from '../lib/store.mjs';
import { dispatch, vapidFromEnv, pushReady } from '../lib/logic.mjs';

export default async () => {
  const vapid = vapidFromEnv();
  if (!pushReady(vapid)) { console.log('Notificaciones sin configurar (faltan las claves VAPID).'); return; }
  const r = await dispatch(await devices(), vapid);
  if (r.sent || r.removed || r.errors) console.log('Recordatorios:', JSON.stringify(r));
};

export const config = { schedule: '* * * * *' };
