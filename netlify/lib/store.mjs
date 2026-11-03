/* Almacenamiento de dispositivos y recordatorios.
   En Netlify usa Netlify Blobs. Para pruebas locales, LOCAL_STORE_DIR guarda archivos JSON en una carpeta. */
import fs from 'node:fs/promises';
import path from 'node:path';

const NAME = 'dispositivos';

function fileStore(dir) {
  const f = k => path.join(dir, encodeURIComponent(k) + '.json');
  return {
    async get(k) { try { return JSON.parse(await fs.readFile(f(k), 'utf8')); } catch (e) { return null; } },
    async set(k, v) { await fs.mkdir(dir, { recursive: true }); await fs.writeFile(f(k), JSON.stringify(v)); },
    async del(k) { try { await fs.unlink(f(k)); } catch (e) {} },
    async keys() { try { return (await fs.readdir(dir)).filter(n => n.endsWith('.json')).map(n => decodeURIComponent(n.slice(0, -5))); } catch (e) { return []; } }
  };
}

export const devices = () => named(NAME);
export const spaces = () => named('espacios');

async function named(name) {
  if (process.env.LOCAL_STORE_DIR) return fileStore(path.join(process.env.LOCAL_STORE_DIR, name === NAME ? '' : name));
  const { getStore } = await import('@netlify/blobs');
  const s = getStore({ name, consistency: 'strong' });
  return {
    get: k => s.get(k, { type: 'json' }),
    set: (k, v) => s.setJSON(k, v),
    del: k => s.delete(k),
    async keys() { const { blobs } = await s.list(); return blobs.map(b => b.key); }
  };
}
