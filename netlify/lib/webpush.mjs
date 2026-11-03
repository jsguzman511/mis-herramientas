/* Envío de notificaciones Web Push sin dependencias externas.
   - Cifrado del mensaje: RFC 8291 (aes128gcm, RFC 8188).
   - Identificación del servidor: VAPID (RFC 8292) con firma ES256.
   Solo usa el módulo crypto de Node. */
import crypto from 'node:crypto';

export const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/* Cifra `payload` (Buffer) para una suscripción {keys:{p256dh, auth}}. Devuelve el cuerpo listo para enviar. */
export function encrypt(subscription, payload, { salt = crypto.randomBytes(16), ecdh = null } = {}) {
  const uaPublic = unb64u(subscription.keys.p256dh);
  const authSecret = unb64u(subscription.keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh inválida');
  if (authSecret.length < 16) throw new Error('auth inválida');
  const as = ecdh || crypto.createECDH('prime256v1');
  if (!ecdh) as.generateKeys();
  const asPublic = as.getPublicKey();
  const shared = as.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const plain = Buffer.concat([payload, Buffer.from([2])]);          // delimitador del último registro
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ct]);
}

/* Firma VAPID para el origen del servicio de push. */
export function vapidHeader(endpoint, { publicKey, privateKey, subject }) {
  const pub = unb64u(publicKey);
  if (pub.length !== 65) throw new Error('VAPID_PUBLIC_KEY inválida');
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + publicKey;
}

/* Solo se envía a servicios de push conocidos: evita que el servidor se use para llamar direcciones arbitrarias. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/, /^android\.googleapis\.com$/];
export function validEndpoint(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && PUSH_HOSTS.some(r => r.test(u.hostname)) && url.length <= 1024; } catch (e) { return false; }
}

/* Envía un mensaje. Devuelve {ok, status, gone}. `gone` = la suscripción ya no existe (borrarla). */
export async function sendPush(subscription, message, vapid, { ttl = 3600, fetchImpl = fetch } = {}) {
  if (!validEndpoint(subscription.endpoint)) return { ok: false, status: 0, gone: true };
  const body = encrypt(subscription, Buffer.from(JSON.stringify(message)));
  const res = await fetchImpl(subscription.endpoint, {
    method: 'POST',
    headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: 'high', Authorization: vapidHeader(subscription.endpoint, vapid) },
    body
  });
  return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
}
