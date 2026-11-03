/* Servidor local para probar la app en tu computador sin Netlify:
     LOCAL_STORE_DIR=.datos VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... node herramientas/servidor-local.mjs
   Abre http://localhost:8888. Envía los recordatorios cada 30 segundos. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.LOCAL_STORE_DIR ||= path.join(root, '.datos');
const api = (await import('../netlify/functions/api.mjs')).default;
const tick = (await import('../netlify/functions/enviar-recordatorios.mjs')).default;
const toml = await fs.readFile(path.join(root, 'netlify.toml'), 'utf8');
const csp = (toml.match(/Content-Security-Policy = "([^"]+)"/) || [])[1];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
const PORT = +process.env.PORT || 8888;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PORT);
  try {
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = await api(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
    }
    let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
    const file = path.join(root, 'public', path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(path.join(root, 'public'))) throw new Error('ruta');
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...(csp ? { 'Content-Security-Policy': csp } : {}) });
    res.end(data);
  } catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado'); }
}).listen(PORT, () => console.log('App en http://localhost:' + PORT));

setInterval(() => tick().catch(e => console.error(e)), +process.env.TICK_MS || 30000);
