const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
if (!fs.existsSync(file)) {
  console.error('patch-server-v105: no se encontró server.js');
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');
if (src.includes('V105_PERSISTENT_POSTGRES')) {
  console.log('patch-server-v105: ya aplicado.');
  process.exit(0);
}

const original = src;

src = src.replace(
  "let pool = null;\nlet storageMode = 'file-fallback';",
  "let pool = null;\nlet storageMode = 'postgres-unavailable';\nlet lastStorageError = null;\nconst V105_PERSISTENT_POSTGRES = true;"
);

src = src.replace(
  "if (!DATABASE_URL) { console.warn('DATABASE_URL no configurada. Se usará almacenamiento compartido temporal.'); return; }",
  "if (!DATABASE_URL) { storageMode = 'postgres-unavailable'; lastStorageError = 'DATABASE_URL no configurada'; console.error('DATABASE_URL no configurada. La base compartida NO aceptará escrituras hasta tener PostgreSQL.'); return; }"
);

src = src.replace(
  "pool = new Pool({ connectionString: DATABASE_URL, ssl: /localhost|127\\.0\\.0\\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized: false }, max: 5 });",
  "const useTls = /[?&]sslmode=(require|verify-ca|verify-full)/i.test(DATABASE_URL);\n    pool = new Pool({ connectionString: DATABASE_URL, ssl: useTls ? { rejectUnauthorized: false } : false, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });"
);

src = src.replace(
  "storageMode = 'postgres';\n    console.log('PostgreSQL compartido conectado.');",
  "storageMode = 'postgres';\n    lastStorageError = null;\n    console.log('PostgreSQL compartido conectado y persistente.');"
);

src = src.replace(
  "} catch (e) { console.error('No se pudo conectar PostgreSQL; usando fallback:', e.message); pool = null; storageMode = 'file-fallback'; }\n}",
  "} catch (e) { console.error('No se pudo conectar PostgreSQL:', e.message); try { if (pool) await pool.end(); } catch (_) {} pool = null; storageMode = 'postgres-unavailable'; lastStorageError = e.message; }\n}\nasync function requirePersistentStorage() {\n  if (!pool) await initStorage();\n  if (!pool) { const e = new Error('Base PostgreSQL no disponible. La carga NO se guardó para evitar pérdida de información. Revisa DATABASE_URL / Render Postgres.'); e.status = 503; throw e; }\n}"
);

src = src.replace(
  "async function getState() {\n  if (!pool) return getFileState();",
  "async function getState() {\n  await requirePersistentStorage();"
);

src = src.replace(
  "async function replaceState(state) {\n  const clean = normalizeState(state);\n  if (!pool) return saveFileState(clean);",
  "async function replaceState(state) {\n  const clean = normalizeState(state);\n  await requirePersistentStorage();"
);

src = src.replace(
  "async function mergeState(incoming) {\n  const cleanIncoming = normalizeState(incoming);\n  if (!pool) {\n    const current = await getFileState();\n    return saveFileState({ records: mergeRecords(current.records, cleanIncoming.records), filesMeta: mergeFilesMeta(current.filesMeta, cleanIncoming.filesMeta) });\n  }",
  "async function mergeState(incoming) {\n  const cleanIncoming = normalizeState(incoming);\n  await requirePersistentStorage();"
);

src = src.replace(
  "if (urlPath === '/api/state' && req.method === 'GET') { sendJson(res, 200, await getState()); return true; }\n  if (urlPath === '/api/state' && req.method === 'PUT') { sendJson(res, 200, await replaceState(normalizeState(await readJson(req)))); return true; }\n  if (urlPath === '/api/state/merge' && req.method === 'POST') { sendJson(res, 200, await mergeState(normalizeState(await readJson(req)))); return true; }\n  if (urlPath === '/api/state' && req.method === 'DELETE') { sendJson(res, 200, await clearState()); return true; }",
  "if (urlPath === '/api/state' && req.method === 'GET') { sendJson(res, 200, { ...(await getState()), storage: storageMode, persistent: true }); return true; }\n  if (urlPath === '/api/state' && req.method === 'PUT') { sendJson(res, 200, { ...(await replaceState(normalizeState(await readJson(req)))), storage: storageMode, persistent: true }); return true; }\n  if (urlPath === '/api/state/merge' && req.method === 'POST') { sendJson(res, 200, { ...(await mergeState(normalizeState(await readJson(req)))), storage: storageMode, persistent: true }); return true; }\n  if (urlPath === '/api/state' && req.method === 'DELETE') { sendJson(res, 200, { ...(await clearState()), storage: storageMode, persistent: true }); return true; }"
);

src = src.replace(
  "if (urlPath === '/health') { const indexPath = existingIndex(); sendJson(res, indexPath ? 200 : 503, { status: indexPath ? 'ok' : 'error', service: 'subtec-nomina-dashboard', index: indexPath ? path.relative(ROOT_DIR, indexPath) : null, storage: storageMode, financialRule: 'costo_empresa_never_pnor' }); return; }",
  "if (urlPath === '/health') { const indexPath = existingIndex(); sendJson(res, indexPath ? 200 : 503, { status: indexPath ? 'ok' : 'error', service: 'subtec-nomina-dashboard', index: indexPath ? path.relative(ROOT_DIR, indexPath) : null, storage: storageMode, persistent: storageMode === 'postgres', storageError: lastStorageError, financialRule: 'costo_empresa_never_pnor' }); return; }"
);

// Mensajes del front: no volver a mostrar 'guardada' si el backend no confirma PostgreSQL.
src = src.replace(
  'setSharedSyncStatus(\"\",\"Base compartida · guardada\");return true',
  'if(data.storage!==\"postgres\"){throw new Error(\"El servidor no confirmó PostgreSQL persistente\")}setSharedSyncStatus(\"\",\"Base compartida · PostgreSQL\");return true'
);

src = src.replace(
  'setSharedSyncStatus(\"\",records.length?\"Base compartida · sincronizada\":\"Base compartida · vacía\")',
  'setSharedSyncStatus(\"\",data.storage===\"postgres\"?(records.length?\"Base compartida · PostgreSQL\":\"PostgreSQL · base vacía\"):\"Base NO persistente\")'
);

if (src === original) {
  console.error('patch-server-v105: no se aplicó ningún cambio; revisa server.js');
  process.exit(1);
}

fs.writeFileSync(file, src, 'utf8');
console.log('patch-server-v105: PostgreSQL persistente obligatorio + SSL interno corregido.');
