const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 10000;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const ROOT_INDEX = path.join(ROOT_DIR, 'index.html');
const PUBLIC_INDEX = path.join(PUBLIC_DIR, 'index.html');
const FALLBACK_STATE = process.env.STATE_FILE || '/tmp/subtec-shared-state.json';
const DATABASE_URL = process.env.DATABASE_URL || '';
const LOGIN_USER = process.env.LOGIN_USER || 'admin';
const LOGIN_PASS = process.env.LOGIN_PASS || 'SUBTEC2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'subtec-session-secret-2026';
const SESSION_TTL_SECONDS = 12 * 60 * 60;

let pool = null;
let storageMode = 'file-fallback';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function existingIndex() {
  if (fs.existsSync(ROOT_INDEX)) return ROOT_INDEX;
  if (fs.existsSync(PUBLIC_INDEX)) return PUBLIC_INDEX;
  return null;
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function sessionSignature(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function createSessionToken(username) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${username}|${exp}`;
  return `${Buffer.from(payload).toString('base64url')}.${sessionSignature(payload)}`;
}

function verifySessionToken(token) {
  try {
    const [encoded, sig] = String(token || '').split('.');
    if (!encoded || !sig) return null;
    const payload = Buffer.from(encoded, 'base64url').toString('utf8');
    const expected = sessionSignature(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const [username, expRaw] = payload.split('|');
    const exp = Number(expRaw);
    if (!username || !exp || exp < Math.floor(Date.now() / 1000)) return null;
    return { username, exp };
  } catch (_) {
    return null;
  }
}

function currentSession(req) {
  return verifySessionToken(parseCookies(req).subtec_session);
}

function requireAuth(req, res) {
  const session = currentSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Sesión requerida' });
    return null;
  }
  return session;
}

function cookieHeader(req, token, clear = false) {
  const secure = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  return `subtec_session=${clear ? '' : encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`;
}

function readJson(req, maxBytes = 100 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Payload demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function normalizeState(raw) {
  return {
    records: Array.isArray(raw?.records) ? raw.records : [],
    filesMeta: Array.isArray(raw?.filesMeta) ? raw.filesMeta : [],
    updatedAt: raw?.updatedAt || new Date(0).toISOString()
  };
}

function recordKey(r) {
  return [r?.payroll, r?.period, r?.employee_id, r?.ceco, r?.vessel || '', r?.activity || '']
    .map(v => String(v ?? ''))
    .join('|');
}

function mergeRecords(base, incoming) {
  const map = new Map();
  (base || []).forEach(r => map.set(recordKey(r), r));
  (incoming || []).forEach(r => map.set(recordKey(r), r));
  return [...map.values()];
}

function fileMetaKey(x) {
  return String(x?.name || '').trim().toLowerCase();
}

function mergeFilesMeta(base, incoming) {
  const map = new Map();
  (base || []).forEach(x => map.set(fileMetaKey(x), x));
  (incoming || []).forEach(x => {
    const k = fileMetaKey(x);
    if (k) map.set(k, { ...(map.get(k) || {}), ...x });
  });
  return [...map.values()];
}

async function initStorage() {
  if (!DATABASE_URL) {
    console.warn('DATABASE_URL no configurada. Se usará almacenamiento compartido temporal del servicio.');
    storageMode = 'file-fallback';
    return;
  }
  try {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
      max: 5
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dashboard_state (
        id INTEGER PRIMARY KEY,
        records JSONB NOT NULL DEFAULT '[]'::jsonb,
        files_meta JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`INSERT INTO dashboard_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
    storageMode = 'postgres';
    console.log('PostgreSQL compartido conectado.');
  } catch (e) {
    console.error('No se pudo conectar PostgreSQL; usando fallback temporal:', e.message);
    pool = null;
    storageMode = 'file-fallback';
  }
}

async function getFileState() {
  try {
    const raw = await fs.promises.readFile(FALLBACK_STATE, 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch (_) {
    return { records: [], filesMeta: [], updatedAt: new Date(0).toISOString() };
  }
}

async function saveFileState(state) {
  const next = normalizeState({ ...state, updatedAt: new Date().toISOString() });
  await fs.promises.writeFile(FALLBACK_STATE, JSON.stringify(next), 'utf8');
  return next;
}

async function getState() {
  if (!pool) return getFileState();
  const { rows } = await pool.query(`SELECT records, files_meta, updated_at FROM dashboard_state WHERE id=1`);
  const row = rows[0] || {};
  return normalizeState({ records: row.records, filesMeta: row.files_meta, updatedAt: row.updated_at?.toISOString?.() || row.updated_at });
}

async function replaceState(state) {
  if (!pool) return saveFileState(state);
  const { rows } = await pool.query(
    `UPDATE dashboard_state SET records=$1::jsonb, files_meta=$2::jsonb, updated_at=NOW() WHERE id=1 RETURNING records, files_meta, updated_at`,
    [JSON.stringify(state.records || []), JSON.stringify(state.filesMeta || [])]
  );
  const row = rows[0];
  return normalizeState({ records: row.records, filesMeta: row.files_meta, updatedAt: row.updated_at?.toISOString?.() || row.updated_at });
}

async function mergeState(incoming) {
  if (!pool) {
    const current = await getFileState();
    return saveFileState({
      records: mergeRecords(current.records, incoming.records),
      filesMeta: mergeFilesMeta(current.filesMeta, incoming.filesMeta)
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT records, files_meta FROM dashboard_state WHERE id=1 FOR UPDATE`);
    const current = rows[0] || { records: [], files_meta: [] };
    const records = mergeRecords(current.records || [], incoming.records || []);
    const filesMeta = mergeFilesMeta(current.files_meta || [], incoming.filesMeta || []);
    const result = await client.query(
      `UPDATE dashboard_state SET records=$1::jsonb, files_meta=$2::jsonb, updated_at=NOW() WHERE id=1 RETURNING records, files_meta, updated_at`,
      [JSON.stringify(records), JSON.stringify(filesMeta)]
    );
    await client.query('COMMIT');
    const row = result.rows[0];
    return normalizeState({ records: row.records, filesMeta: row.files_meta, updatedAt: row.updated_at?.toISOString?.() || row.updated_at });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function clearState() {
  return replaceState({ records: [], filesMeta: [] });
}

const SHARED_PERSISTENCE = String.raw`let sharedStateUpdatedAt=null;
let sharedSyncBusy=false;
let sharedFilesMetaCache=[];
function setSharedSyncStatus(status,text){const el=document.getElementById("sharedSyncBadge");if(!el)return;el.classList.remove("syncing","error");if(status)el.classList.add(status);const s=el.querySelector("span");if(s)s.textContent=text||"Base compartida"}
async function sharedApi(url,options={}){const res=await fetch(url,{cache:"no-store",credentials:"same-origin",...options});let data=null;try{data=await res.json()}catch(e){}if(!res.ok){const err=new Error(data?.error||("Error "+res.status));err.status=res.status;throw err}return data||{}}
async function savePersisted(){sharedSyncBusy=true;setSharedSyncStatus("syncing","Guardando...");try{const data=await sharedApi("/api/state/merge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records,filesMeta:loadedFilesMeta})});records=Array.isArray(data.records)?data.records.map(migrateRecoveredRecord):records;loadedFilesMeta=Array.isArray(data.filesMeta)?data.filesMeta:loadedFilesMeta;sharedFilesMetaCache=loadedFilesMeta;sharedStateUpdatedAt=data.updatedAt||sharedStateUpdatedAt;setSharedSyncStatus("","Base compartida · guardada");return true}catch(e){console.error("No se pudo guardar en la base compartida",e);setSharedSyncStatus("error",e.status===401?"Sesión requerida":"Error de sincronización");if(e.status===401)showLogin();else toast("No se pudo guardar en la base compartida: "+e.message);return false}finally{sharedSyncBusy=false}}
async function fetchSharedState(){const data=await sharedApi("/api/state");sharedStateUpdatedAt=data.updatedAt||null;sharedFilesMetaCache=Array.isArray(data.filesMeta)?data.filesMeta:[];return data}
async function loadPersisted(){try{const data=await fetchSharedState();return Array.isArray(data.records)?data.records:null}catch(e){if(e.status!==401){console.warn("No se pudo leer la base compartida",e);setSharedSyncStatus("error","Sin conexión a base")};return null}}
async function loadPersistedFilesMeta(){return Array.isArray(sharedFilesMetaCache)?sharedFilesMetaCache:null}
async function clearPersisted(){sharedSyncBusy=true;setSharedSyncStatus("syncing","Borrando base...");try{const data=await sharedApi("/api/state",{method:"DELETE"});sharedStateUpdatedAt=data.updatedAt||null;sharedFilesMetaCache=[];setSharedSyncStatus("","Base compartida · vacía");return true}catch(e){console.error(e);setSharedSyncStatus("error","No se pudo borrar");if(e.status===401)showLogin();else toast("No se pudo borrar la base compartida: "+e.message);return false}finally{sharedSyncBusy=false}}
async function refreshSharedState({force=false,notify=false}={}){if(sharedSyncBusy||document.hidden)return;sharedSyncBusy=true;try{const data=await sharedApi("/api/state");const changed=force||(!sharedStateUpdatedAt&&data.updatedAt)||(data.updatedAt&&data.updatedAt!==sharedStateUpdatedAt);if(changed){records=Array.isArray(data.records)?data.records.map(migrateRecoveredRecord):[];loadedFilesMeta=Array.isArray(data.filesMeta)?data.filesMeta:[];sharedFilesMetaCache=loadedFilesMeta;sharedStateUpdatedAt=data.updatedAt||null;try{renderAll(true)}catch(e){console.error("Error al refrescar base compartida",e)}if(notify)toast("Base compartida actualizada: "+num(loadedFileCount())+" archivos · "+num(records.length)+" registros.")}setSharedSyncStatus("",records.length?"Base compartida · sincronizada":"Base compartida · vacía")}catch(e){if(e.status===401)showLogin();else{console.warn("No se pudo refrescar base compartida",e);setSharedSyncStatus("error","Sin conexión a base")}}finally{sharedSyncBusy=false}}
setInterval(()=>refreshSharedState(),15000);window.addEventListener("focus",()=>refreshSharedState());document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshSharedState()});`;

const SHARED_INIT = String.raw`(async()=>{records=[];loadedFilesMeta=[];const saved=await loadPersisted(),savedFiles=await loadPersistedFilesMeta();if(saved?.length){records=saved.map(migrateRecoveredRecord);if(savedFiles?.length)loadedFilesMeta=savedFiles;else unique(records.map(r=>r.source_file)).forEach(name=>upsertLoadedFileMeta({name,payroll:records.find(r=>r.source_file===name)?.payroll||"",status:"loaded",rows:records.filter(r=>r.source_file===name).length}));Object.values(state).forEach(s=>s.clear());clearHierarchy();if($("fSearch"))$("fSearch").value="";toast("Base compartida: "+num(loadedFileCount())+" archivos · "+num(records.length)+" registros.")}try{bindDescansoModal();bindPuestoModal();bindFrontModal();renderAll(true)}catch(e){console.error("Error al reflejar la base compartida",e);toast("La base se recuperó, pero ocurrió un error al dibujar el dashboard: "+(e?.message||e))}})();`;

const SHARED_LOGIN = String.raw`// ===== LOGIN COMPARTIDO / BACKEND =====
function showLogin(){const s=document.getElementById("loginScreen");if(s)s.classList.remove("hidden");document.body.style.overflow="hidden"}
function hideLogin(){const s=document.getElementById("loginScreen");if(s)s.classList.add("hidden");document.body.style.overflow=""}
async function sessionStatus(){try{return await sharedApi("/api/session")}catch(e){return{authenticated:false}}}
function initLogin(){const form=document.getElementById("loginForm"),user=document.getElementById("loginUser"),pass=document.getElementById("loginPass"),error=document.getElementById("loginError"),toggle=document.getElementById("toggleLoginPass"),logout=document.getElementById("logoutBtn");sessionStatus().then(s=>{if(s.authenticated){hideLogin();refreshSharedState({force:true})}else showLogin()});if(toggle)toggle.addEventListener("click",()=>{if(!pass)return;const visible=pass.type==="text";pass.type=visible?"password":"text";toggle.textContent=visible?"VER":"OCULTAR"});if(form)form.addEventListener("submit",async e=>{e.preventDefault();const u=String(user?.value||"").trim(),p=String(pass?.value||"");try{await sharedApi("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,password:p})});if(error)error.textContent="";hideLogin();await refreshSharedState({force:true,notify:true})}catch(err){if(error)error.textContent="Usuario o contraseña incorrectos.";if(pass){pass.value="";pass.focus()}}});if(logout)logout.addEventListener("click",async()=>{try{await sharedApi("/api/logout",{method:"POST"})}catch(e){}records=[];loadedFilesMeta=[];sharedFilesMetaCache=[];sharedStateUpdatedAt=null;if(user)user.value="";if(pass)pass.value="";showLogin();renderAll(true)})}
document.addEventListener("DOMContentLoaded",initLogin);`;

function transformIndex(source) {
  let html = source;
  html = html.replace('V93 · CARGA HISTÓRICA ROBUSTA', 'V99 · BASE COMPARTIDA');
  html = html.replace('La carga de Excel se procesa localmente en el navegador.', 'Los Excel se procesan en el navegador y la base consolidada se sincroniza con el servidor compartido.');
  html = html.replace('Empieza con la base vacía y carga cada familia de nómina en su espacio.', 'Base compartida: las cargas guardadas por un usuario quedan disponibles para los demás usuarios autorizados.');
  html = html.replace('Acceso local configurado:<br>Usuario: <b>admin</b> &nbsp; · &nbsp; Contraseña: <b>SUBTEC2026</b>', 'Acceso corporativo SUBTEC · la sesión y la base de nómina se validan en el servidor compartido.');
  const syncCss = '.shared-sync-badge{display:inline-flex;align-items:center;gap:7px;border:1px solid #d8eade;background:#f1fbf5;color:#176c49;border-radius:999px;padding:7px 10px;font-size:9px;font-weight:900;white-space:nowrap}.shared-sync-badge i{width:7px;height:7px;border-radius:50%;background:#1ca66a}.shared-sync-badge.syncing i{background:#e49324}.shared-sync-badge.error{background:#fff4f2;border-color:#f2d3cd;color:#a7372d}.shared-sync-badge.error i{background:#c94938}';
  html = html.replace('</style>', `${syncCss}</style>`);
  html = html.replace('<div class="actions"><button class="btn secondary" id="exportCsv">Exportar filtrado</button>', '<div class="actions"><span class="shared-sync-badge" id="sharedSyncBadge"><i></i><span>Base compartida</span></span><button class="btn secondary" id="exportCsv">Exportar filtrado</button>');
  html = html.replace(/async function openDB\(\).*?async function clearPersisted\(\).*?\}\n/s, `${SHARED_PERSISTENCE}\n`);
  html = html.replace('async function clearAllData(){if(!confirm("¿Borrar toda la información de nómina cargada y empezar de cero? El presupuesto permanecerá disponible."))return;records=[];loadedFilesMeta=[];Object.values(state).forEach(x=>x.clear());clearHierarchy();await clearPersisted();renderAll(true);toast("Base de nómina vaciada. Puedes comenzar la carga desde cero.")}', 'async function clearAllData(){if(!confirm("¿Borrar TODA la base compartida de nómina para todos los usuarios? El presupuesto permanecerá disponible."))return;const ok=await clearPersisted();if(!ok)return;records=[];loadedFilesMeta=[];Object.values(state).forEach(x=>x.clear());clearHierarchy();renderAll(true);toast("Base compartida de nómina vaciada para todos los usuarios.")}');
  html = html.replace(/\(async\(\)=>\{records=\[\];loadedFilesMeta=\[\];const saved=await loadPersisted\(\),savedFiles=await loadPersistedFilesMeta\(\);if\(saved\?\.length\)\{.*?\}\}\)\(\);/s, SHARED_INIT);
  html = html.replace(/\/\/ ===== LOGIN LOCAL =====.*?document\.addEventListener\("DOMContentLoaded",initLogin\);/s, SHARED_LOGIN);
  return html;
}

function sendIndex(res, filePath) {
  fs.readFile(filePath, 'utf8', (err, source) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Archivo no encontrado');
      return;
    }
    const html = transformIndex(source);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
    res.end(html);
  });
}

function sendFile(res, filePath) {
  if (path.extname(filePath).toLowerCase() === '.html') return sendIndex(res, filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Archivo no encontrado');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' });
    res.end(data);
  });
}

async function handleApi(req, res, urlPath) {
  if (urlPath === '/api/login' && req.method === 'POST') {
    const body = await readJson(req, 1024 * 1024);
    if (String(body.username || '') !== LOGIN_USER || String(body.password || '') !== LOGIN_PASS) {
      sendJson(res, 401, { error: 'Credenciales incorrectas' });
      return true;
    }
    const token = createSessionToken(LOGIN_USER);
    sendJson(res, 200, { ok: true, username: LOGIN_USER }, { 'Set-Cookie': cookieHeader(req, token) });
    return true;
  }
  if (urlPath === '/api/logout' && req.method === 'POST') {
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, '', true) });
    return true;
  }
  if (urlPath === '/api/session' && req.method === 'GET') {
    const session = currentSession(req);
    sendJson(res, 200, { authenticated: !!session, username: session?.username || null });
    return true;
  }
  if (!urlPath.startsWith('/api/')) return false;
  if (!requireAuth(req, res)) return true;
  if (urlPath === '/api/state' && req.method === 'GET') { sendJson(res, 200, await getState()); return true; }
  if (urlPath === '/api/state' && req.method === 'PUT') { const body = await readJson(req); sendJson(res, 200, await replaceState(normalizeState(body))); return true; }
  if (urlPath === '/api/state/merge' && req.method === 'POST') { const body = await readJson(req); sendJson(res, 200, await mergeState(normalizeState(body))); return true; }
  if (urlPath === '/api/state' && req.method === 'DELETE') { sendJson(res, 200, await clearState()); return true; }
  sendJson(res, 404, { error: 'API no encontrada' });
  return true;
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  try {
    if (urlPath === '/health') {
      const indexPath = existingIndex();
      sendJson(res, indexPath ? 200 : 503, { status: indexPath ? 'ok' : 'error', service: 'subtec-nomina-dashboard', index: indexPath ? path.relative(ROOT_DIR, indexPath) : null, storage: storageMode });
      return;
    }
    if (await handleApi(req, res, urlPath)) return;
    if (urlPath === '/' || urlPath === '/index.html') {
      const indexPath = existingIndex();
      if (!indexPath) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No se encontró index.html'); return; }
      sendIndex(res, indexPath);
      return;
    }
    const cleanPath = urlPath.replace(/^\/+/, '');
    const candidates = [path.normalize(path.join(PUBLIC_DIR, cleanPath)), path.normalize(path.join(ROOT_DIR, cleanPath))];
    const safeCandidate = candidates.find(filePath => {
      const inPublic = filePath.startsWith(PUBLIC_DIR + path.sep);
      const inRoot = filePath.startsWith(ROOT_DIR + path.sep);
      return (inPublic || inRoot) && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    });
    if (safeCandidate) { sendFile(res, safeCandidate); return; }
    const indexPath = existingIndex();
    if (indexPath) { sendIndex(res, indexPath); return; }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Recurso no encontrado');
  } catch (e) {
    console.error('Error request', req.method, urlPath, e);
    sendJson(res, e.status || 500, { error: e.message || 'Error interno del servidor' });
  }
});

initStorage().finally(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SUBTEC Dashboard ejecutándose en puerto ${PORT}`);
    console.log(`Storage: ${storageMode}`);
  });
});
