/* Sincronización de espacios de trabajo.
   El servidor solo guarda texto cifrado: no conoce la clave de cifrado del espacio.
   Cada herramienta (cotizador, finanzas, calendario) es un documento con número de versión. */
import crypto from 'node:crypto';
import { HttpError } from './logic.mjs';

const ID_RE = /^[A-Za-z0-9_-]{16,64}$/, TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const TOOLS = new Set(['cotizador', 'finanzas', 'calendario']);
export const MAX_DOC = 4_500_000;              // caracteres de texto cifrado (≈3,3 MB de datos)
const sha = s => crypto.createHash('sha256').update(String(s)).digest('base64');

function check(body, needTool = true) {
  if (!body || typeof body !== 'object' || !ID_RE.test(body.space || '') || !TOKEN_RE.test(body.token || '')) throw new HttpError(400, 'Espacio no válido.');
  if (needTool && !TOOLS.has(body.tool)) throw new HttpError(400, 'Herramienta no válida.');
}
async function auth(store, body) {
  const meta = await store.get(body.space + '__meta');
  if (!meta) throw new HttpError(404, 'Este espacio no existe o fue eliminado.');
  const a = Buffer.from(meta.tokenHash, 'base64'), b = Buffer.from(sha(body.token), 'base64');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(403, 'El código del espacio no es correcto.');
  return meta;
}

export async function createSpace(store, body) {
  check(body, false);
  const existing = await store.get(body.space + '__meta');
  if (existing) throw new HttpError(409, 'Ese espacio ya existe.');
  await store.set(body.space + '__meta', { tokenHash: sha(body.token), created: Date.now() });
  return { ok: true };
}

export async function getDoc(store, body) {
  check(body); await auth(store, body);
  const doc = await store.get(body.space + '__' + body.tool);
  return doc ? { rev: doc.rev, iv: doc.iv, data: doc.data, updated: doc.updated } : { rev: 0 };
}

/* Escritura con control de versión: si otro teléfono guardó primero, responde 409 con la versión actual
   para que el teléfono combine los cambios y vuelva a intentar. */
export async function putDoc(store, body) {
  check(body); await auth(store, body);
  if (typeof body.data !== 'string' || typeof body.iv !== 'string' || !/^[A-Za-z0-9_-]{16,24}$/.test(body.iv)) throw new HttpError(400, 'Datos no válidos.');
  if (body.data.length > MAX_DOC) throw new HttpError(413, 'Los datos de esta herramienta son demasiado grandes para sincronizar.');
  if (!/^[A-Za-z0-9_-]*$/.test(body.data)) throw new HttpError(400, 'Datos no válidos.');
  const key = body.space + '__' + body.tool;
  const cur = await store.get(key);
  const rev = cur ? cur.rev : 0;
  if (Number(body.baseRev) !== rev) return { conflict: true, rev, iv: cur && cur.iv, data: cur && cur.data };
  const doc = { rev: rev + 1, iv: body.iv, data: body.data, updated: Date.now() };
  await store.set(key, doc);
  return { ok: true, rev: doc.rev };
}

export async function deleteSpace(store, body) {
  check(body, false); await auth(store, body);
  for (const t of TOOLS) await store.del(body.space + '__' + t);
  await store.del(body.space + '__meta');
  return { ok: true };
}
