const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
if (!fs.existsSync(file)) {
  console.error('patch-server-v106: no se encontró server.js');
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');
if (src.includes('V106_LEGACY_BROWSER_MIGRATION')) {
  console.log('patch-server-v106: ya aplicado.');
  process.exit(0);
}

const original = src;

src = src.replace(
  'let sharedFilesMetaCache=[];',
  'let sharedFilesMetaCache=[];\nconst V106_LEGACY_BROWSER_MIGRATION=true;\nconst LEGACY_DB_NAME="SUBTEC_NOMINA_HIST_V39_HC_COMPLETO";\nconst LEGACY_MIGRATION_KEY="SUBTEC_V106_LEGACY_MIGRATED";\nasync function readLegacyBrowserState(){if(typeof indexedDB==="undefined")return null;return await new Promise(resolve=>{let req;try{req=indexedDB.open(LEGACY_DB_NAME,1)}catch(e){resolve(null);return}req.onerror=()=>resolve(null);req.onupgradeneeded=()=>{};req.onsuccess=()=>{const db=req.result;if(!db.objectStoreNames.contains("state")){db.close();resolve(null);return}let recordsLocal=null,metaLocal=null;try{const tx=db.transaction("state","readonly"),st=tx.objectStore("state"),qr=st.get("records"),qm=st.get("filesMeta");qr.onsuccess=()=>{recordsLocal=qr.result};qm.onsuccess=()=>{metaLocal=qm.result};tx.oncomplete=()=>{db.close();resolve({records:Array.isArray(recordsLocal)?recordsLocal:[],filesMeta:Array.isArray(metaLocal)?metaLocal:[]})};tx.onerror=()=>{db.close();resolve(null)}}catch(e){db.close();resolve(null)}}})}\nasync function recoverLegacyBrowserStateIfNeeded(serverData){if((serverData?.records||[]).length)return serverData;if(localStorage.getItem(LEGACY_MIGRATION_KEY)==="1")return serverData;const legacy=await readLegacyBrowserState();if(!legacy?.records?.length){return serverData}setSharedSyncStatus("syncing","Recuperando carga anterior...");try{const merged=await sharedApi("/api/state/merge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:legacy.records,filesMeta:legacy.filesMeta})});localStorage.setItem(LEGACY_MIGRATION_KEY,"1");sharedFilesMetaCache=Array.isArray(merged.filesMeta)?merged.filesMeta:[];sharedStateUpdatedAt=merged.updatedAt||sharedStateUpdatedAt;setSharedSyncStatus("","Base compartida · PostgreSQL");return merged}catch(e){console.error("No se pudo migrar IndexedDB anterior",e);setSharedSyncStatus("error","No se pudo recuperar carga anterior");return serverData}}'
);

src = src.replace(
  'async function fetchSharedState(){const data=await sharedApi("/api/state");sharedStateUpdatedAt=data.updatedAt||null;sharedFilesMetaCache=Array.isArray(data.filesMeta)?data.filesMeta:[];return data}',
  'async function fetchSharedState(){let data=await sharedApi("/api/state");data=await recoverLegacyBrowserStateIfNeeded(data);sharedStateUpdatedAt=data.updatedAt||null;sharedFilesMetaCache=Array.isArray(data.filesMeta)?data.filesMeta:[];return data}'
);

src = src.replace(
  'async function clearPersisted(){sharedSyncBusy=true;setSharedSyncStatus("syncing","Borrando base...");',
  'async function clearPersisted(){localStorage.setItem(LEGACY_MIGRATION_KEY,"1");sharedSyncBusy=true;setSharedSyncStatus("syncing","Borrando base...");'
);

src = src.replace(/V104 · FILTROS DINÁMICOS \+ PPTO MXN/g, 'V106 · BASE PERSISTENTE + RECUPERACIÓN');
src = src.replace(/V100 · COSTO EMPRESA CORREGIDO/g, 'V106 · BASE PERSISTENTE + RECUPERACIÓN');

if (src === original) {
  console.error('patch-server-v106: no se aplicó ningún cambio; revisa server.js');
  process.exit(1);
}

fs.writeFileSync(file, src, 'utf8');
console.log('patch-server-v106: recuperación desde IndexedDB anterior hacia PostgreSQL aplicada.');
