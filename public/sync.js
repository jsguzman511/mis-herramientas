/* Sincronización entre teléfonos de un mismo «espacio de trabajo».
   - Los datos se cifran en el teléfono (AES-GCM 256) con una clave que solo tienen los teléfonos del espacio.
     El servidor guarda texto cifrado y no puede leerlo.
   - Cada herramienta se divide en registros (un cliente, una cotización, un movimiento, un evento…).
     Los cambios se combinan registro por registro comparando con la última versión sincronizada,
     así dos personas pueden trabajar a la vez sin pisarse.
   - Lo que es propio de cada teléfono (borrador de cotización, perfil activo, tema, avisos descartados) no se comparte. */
(function () {
  'use strict';
  var CRED = 'sync.espacio';
  var TOOLS = {
    cotizador: { key: 'cotizador.v1', local: ['draft'], lists: [['catalog', 'cat:'], ['quotes', 'q:'], ['templates', 't:']], singles: [['brand', 'brand']] },
    finanzas: { key: 'finanzas.v1', local: ['active'] },
    calendario: { key: 'calendario.v1', local: ['prefs', 'dismissed', 'snoozed', 'v'], lists: [['events', 'e:'], ['tasks', 't:'], ['notes', 'n:'], ['categories', 'c:']] }
  };

  /* ---------- utilidades ---------- */
  var enc = new TextEncoder(), dec = new TextDecoder();
  function b64u(bytes) { var s = ''; bytes = new Uint8Array(bytes); for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var r = atob(s), a = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; }
  function stable(v) { return JSON.stringify(v, function (k, x) { if (x && typeof x === 'object' && !Array.isArray(x)) { var o = {}; Object.keys(x).sort().forEach(function (y) { o[y] = x[y]; }); return o; } return x; }); }
  function same(a, b) { return a === b || (a !== undefined && b !== undefined && stable(a) === stable(b)); }
  function readLS(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function writeLS(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function stamp(r) { return r && typeof r === 'object' ? (+r.updatedAt || +r.savedAt || +r.updated || 0) : 0; }

  /* ---------- registros ---------- */
  function toRecords(tool, s) {
    var t = TOOLS[tool], m = {};
    if (!s) return m;
    if (tool === 'finanzas') {
      (s.profiles || []).forEach(function (p, i) {
        m['p:' + p.id] = { name: p.name, order: i };
        var d = p.data || {};
        Object.keys(d).forEach(function (list) { (d[list] || []).forEach(function (it) { m['p:' + p.id + ':' + list + ':' + it.id] = it; }); });
      });
      return m;
    }
    (t.singles || []).forEach(function (x) { if (s[x[0]] !== undefined) m[x[1]] = s[x[0]]; });
    (t.lists || []).forEach(function (x) { (s[x[0]] || []).forEach(function (it, i) { if (it && it.id != null) m[x[1] + it.id] = it; }); });
    return m;
  }
  /* Reconstruye el estado a partir de los registros, conservando lo propio del teléfono y el orden local. */
  function fromRecords(tool, m, local) {
    var t = TOOLS[tool], out = {};
    (t.local || []).forEach(function (k) { if (local && local[k] !== undefined) out[k] = local[k]; });
    if (tool === 'finanzas') {
      var profiles = [], byId = {};
      Object.keys(m).forEach(function (k) { var p = k.split(':'); if (p.length === 2) { byId[p[1]] = { id: p[1], name: m[k].name, order: m[k].order, data: {} }; } });
      Object.keys(m).forEach(function (k) {
        var p = k.split(':'); if (p.length < 4) return;
        var prof = byId[p[1]]; if (!prof) return;                          // perfil eliminado: sus datos también
        (prof.data[p[2]] = prof.data[p[2]] || []).push(m[k]);
      });
      var lorder = {}; ((local && local.profiles) || []).forEach(function (p, i) { lorder[p.id] = i; });
      Object.keys(byId).forEach(function (id) { profiles.push(byId[id]); });
      profiles.sort(function (a, b) { var x = lorder[a.id], y = lorder[b.id]; if (x != null && y != null) return x - y; if (x != null) return -1; if (y != null) return 1; return (a.order || 0) - (b.order || 0); });
      profiles.forEach(function (p) {
        var lp = ((local && local.profiles) || []).filter(function (q) { return q.id === p.id; })[0];
        Object.keys(p.data).forEach(function (list) { p.data[list] = orderLike(p.data[list], lp && lp.data && lp.data[list], list === 'tx'); });
        delete p.order;
      });
      out.profiles = profiles;
      if (!profiles.some(function (p) { return p.id === out.active; })) out.active = profiles[0] ? profiles[0].id : null;
      return out;
    }
    (t.singles || []).forEach(function (x) { if (m[x[1]] !== undefined) out[x[0]] = m[x[1]]; else if (local && local[x[0]] !== undefined) out[x[0]] = local[x[0]]; });
    (t.lists || []).forEach(function (x) {
      var items = []; Object.keys(m).forEach(function (k) { if (k.indexOf(x[1]) === 0 && k !== x[1].replace(':', '')) items.push(m[k]); });
      out[x[0]] = orderLike(items, local && local[x[0]], false);
    });
    return out;
  }
  function orderLike(items, localList, newestFirst) {
    if (newestFirst) return items.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')) || (+b.id || 0) - (+a.id || 0) || String(b.id).localeCompare(String(a.id)); });
    var pos = {}; (localList || []).forEach(function (it, i) { if (it) pos[it.id] = i; });
    return items.map(function (it, i) { return [it, pos[it.id] != null ? pos[it.id] : 1e9 + i]; }).sort(function (a, b) { return a[1] - b[1]; }).map(function (x) { return x[0]; });
  }

  /* Fusión de tres vías por registro: base = última versión sincronizada. */
  function mergeRecord(key, b, l, r) {
    if (l && r && typeof l === 'object' && typeof r === 'object' && !Array.isArray(l) && !Array.isArray(r)) {
      var bb = b && typeof b === 'object' ? b : {}, o = {}, keys = {};
      [bb, l, r].forEach(function (x) { Object.keys(x).forEach(function (k) { keys[k] = 1; }); });
      var newer = stamp(l) > stamp(r) ? l : r;
      Object.keys(keys).forEach(function (k) {
        var lc = !same(l[k], bb[k]), rc = !same(r[k], bb[k]);
        var v = !lc ? r[k] : !rc ? l[k] : newer[k];
        if (v !== undefined) o[k] = v;
      });
      if (key === 'brand') o.nextNumber = Math.max(+l.nextNumber || 1, +r.nextNumber || 1);   // nunca repetir números de cotización
      return o;
    }
    return stamp(l) > stamp(r) ? l : r;
  }
  function merge3(base, local, remote) {
    var out = {}, keys = {};
    [base, local, remote].forEach(function (x) { Object.keys(x).forEach(function (k) { keys[k] = 1; }); });
    Object.keys(keys).forEach(function (k) {
      var b = base[k], l = local[k], r = remote[k];
      var lc = !same(l, b), rc = !same(r, b), v;
      if (!lc) v = r; else if (!rc) v = l;
      else if (l === undefined) v = r; else if (r === undefined) v = l;   // borrado de un lado y editado del otro: se conserva la edición
      else v = mergeRecord(k, b, l, r);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }

  /* ---------- cifrado ---------- */
  var keyCache = null;
  function creds() { var c = readLS(CRED); return c && c.space && c.secret ? c : null; }
  function cryptoKey(c) {
    if (keyCache && keyCache.secret === c.secret) return keyCache.p;
    var p = crypto.subtle.importKey('raw', unb64u(c.secret), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    keyCache = { secret: c.secret, p: p }; return p;
  }
  function tokenOf(c) { return crypto.subtle.digest('SHA-256', enc.encode('auth:' + c.secret)).then(function (h) { return b64u(h); }); }
  async function pack(c, obj) {
    var bytes = enc.encode(JSON.stringify(obj)), flag = 0;
    if (typeof CompressionStream === 'function') { try { bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()); flag = 1; } catch (e) { bytes = enc.encode(JSON.stringify(obj)); } }
    var plain = new Uint8Array(bytes.length + 1); plain[0] = flag; plain.set(bytes, 1);
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, await cryptoKey(c), plain);
    return { iv: b64u(iv), data: b64u(ct) };
  }
  async function unpack(c, iv, data) {
    var plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv) }, await cryptoKey(c), unb64u(data)));
    var body = plain.subarray(1);
    if (plain[0] === 1) {
      if (typeof DecompressionStream !== 'function') throw new Error('Este navegador no puede leer los datos comprimidos. Actualízalo.');
      body = new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    }
    return JSON.parse(dec.decode(body));
  }

  /* ---------- servidor ---------- */
  async function api(route, body) {
    var r = await fetch('/api/sync/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { var err = new Error(j.error || ('Error ' + r.status)); err.status = r.status; throw err; }
    return j;
  }

  /* ---------- estado y eventos ---------- */
  var status = { state: 'off', at: 0, error: '' };
  function setStatus(state, error) {
    status = { state: state, at: Date.now(), error: error || '' };
    try { window.dispatchEvent(new CustomEvent('appsync:status', { detail: status })); } catch (e) {}
  }
  var running = {}, again = {}, timers = {};

  /* Una ronda de sincronización de una herramienta. */
  async function syncTool(tool) {
    var c = creds(); if (!c) return;
    if (running[tool]) { again[tool] = true; return; }
    running[tool] = true;
    try {
      var t = TOOLS[tool], token = await tokenOf(c);
      var revKey = 'sync.rev.' + tool, baseKey = 'sync.base.' + tool;
      var rev = +localStorage.getItem(revKey) || 0, base = readLS(baseKey) || {};
      setStatus('syncing');
      var remote = await api('get', { space: c.space, token: token, tool: tool });
      var synced = null;
      for (var attempt = 0; attempt < 6 && !synced; attempt++) {
        var raw = localStorage.getItem(t.key), localState = raw ? JSON.parse(raw) : null;
        var localRec = toRecords(tool, localState);
        if (remote.rev && remote.rev === rev && same(localRec, base)) { synced = base; break; }      // nada nuevo en ningún lado
        var remoteRec = remote.rev ? toRecords(tool, await unpack(c, remote.iv, remote.data)) : {};
        var merged = (remote.rev && remote.rev === rev) ? localRec : merge3(rev ? base : {}, localRec, remoteRec);
        if (!same(merged, localRec)) {
          if (localStorage.getItem(t.key) !== raw) continue;                                        // el usuario cambió algo justo ahora: repetir
          writeLS(t.key, fromRecords(tool, merged, localState || {}));
          try { window.dispatchEvent(new CustomEvent('appsync:applied', { detail: { tool: tool } })); } catch (e) {}
        }
        if (remote.rev && same(merged, remoteRec)) { rev = remote.rev; synced = merged; break; }   // el servidor ya lo tiene
        if (!remote.rev && !Object.keys(merged).length) { synced = merged; break; }
        var packed = await pack(c, fromRecords(tool, merged, {}));
        var res = await api('put', { space: c.space, token: token, tool: tool, baseRev: remote.rev || 0, iv: packed.iv, data: packed.data });
        if (res.ok) { rev = res.rev; synced = merged; break; }
        /* otro teléfono guardó primero: su versión parte de la que ya combinamos */
        base = remoteRec; rev = remote.rev || 0;
        remote = { rev: res.rev, iv: res.iv, data: res.data };
      }
      if (!synced) throw new Error('No se pudo sincronizar; se reintentará.');
      localStorage.setItem(revKey, String(rev));
      writeLS(baseKey, synced);
      setStatus('ok');
    } catch (e) {
      if (e && (e.status === 404 || e.status === 403)) { setStatus('error', e.message); }
      else setStatus(navigator.onLine === false ? 'offline' : 'error', navigator.onLine === false ? 'Sin conexión' : (e && e.message) || 'Error de sincronización');
    } finally {
      running[tool] = false;
      if (again[tool]) { again[tool] = false; schedule(tool, 300); }
    }
  }
  function schedule(tool, ms) { clearTimeout(timers[tool]); timers[tool] = setTimeout(function () { syncTool(tool); }, ms == null ? 1500 : ms); }

  /* ---------- API pública ---------- */
  var current = [];
  var AppSync = {
    tools: Object.keys(TOOLS),
    connected: function () { return !!creds(); },
    status: function () { return status; },
    /* las páginas avisan después de guardar */
    changed: function (tool) { if (creds() && TOOLS[tool]) schedule(tool); },
    syncNow: function (tools) { return Promise.all((tools || current).map(syncTool)); },
    /* empezar a sincronizar estas herramientas mientras la página esté abierta */
    start: function (tools) {
      current = tools;
      if (!creds()) return;
      AppSync.syncNow(tools);
      setInterval(function () { if (document.visibilityState === 'visible' && navigator.onLine !== false) AppSync.syncNow(); }, 30000);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') AppSync.syncNow(); });
      window.addEventListener('online', function () { AppSync.syncNow(); });
    },
    /* crear un espacio nuevo con los datos de este teléfono */
    create: async function () {
      var id = crypto.getRandomValues(new Uint8Array(12)), secret = crypto.getRandomValues(new Uint8Array(32));
      var c = { space: b64u(id), secret: b64u(secret) };
      await api('create', { space: c.space, token: await tokenOf(c) });
      Object.keys(TOOLS).forEach(function (t) { localStorage.removeItem('sync.rev.' + t); localStorage.removeItem('sync.base.' + t); });
      writeLS(CRED, c); keyCache = null;
      await AppSync.syncNow(Object.keys(TOOLS));
      return AppSync.code();
    },
    /* unirse con el código: los datos de este teléfono se combinan con los del espacio */
    join: async function (code) {
      var raw = String(code || '').trim().replace(/^MH1-/i, '').replace(/\s+/g, '');
      var bytes; try { bytes = unb64u(raw); } catch (e) { bytes = null; }
      if (!bytes || bytes.length !== 44) throw new Error('El código no es válido. Cópialo completo, empieza por «MH1-».');
      var c = { space: b64u(bytes.subarray(0, 12)), secret: b64u(bytes.subarray(12)) };
      await api('get', { space: c.space, token: await tokenOf(c), tool: 'cotizador' });   // comprueba que existe
      Object.keys(TOOLS).forEach(function (t) { localStorage.removeItem('sync.rev.' + t); localStorage.removeItem('sync.base.' + t); });
      writeLS(CRED, c); keyCache = null;
      await AppSync.syncNow(Object.keys(TOOLS));
    },
    code: function () { var c = creds(); if (!c) return ''; var a = unb64u(c.space), b = unb64u(c.secret), all = new Uint8Array(44); all.set(a, 0); all.set(b, 12); return 'MH1-' + b64u(all); },
    /* salir: los datos quedan en este teléfono, pero ya no se sincronizan */
    leave: function () { localStorage.removeItem(CRED); Object.keys(TOOLS).forEach(function (t) { localStorage.removeItem('sync.rev.' + t); localStorage.removeItem('sync.base.' + t); }); keyCache = null; setStatus('off'); },
    /* borrar el espacio del servidor (los teléfonos conservan su copia) */
    destroy: async function () { var c = creds(); if (!c) return; await api('delete', { space: c.space, token: await tokenOf(c) }); AppSync.leave(); },
    _test: { toRecords: toRecords, fromRecords: fromRecords, merge3: merge3 }
  };
  window.AppSync = AppSync;
})();
