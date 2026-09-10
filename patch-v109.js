const fs=require('fs');
const path=require('path');
const file=[path.join(__dirname,'index.html'),path.join(__dirname,'public','index.html')].find(fs.existsSync);
if(!file){console.error('patch-v109: no se encontró index.html');process.exit(1)}
let html=fs.readFileSync(file,'utf8');
const before=html;

if(!html.includes('V109_GREEN_ACCUMULATOR')){
  const css=`
.green-accum-card{overflow:hidden}.green-accum-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px}.green-accum-copy{max-width:920px}.green-accum-copy strong{display:block;color:#201460;font-size:13px}.green-accum-copy span{display:block;margin-top:4px;color:#737988;font-size:10px;line-height:1.45}.green-accum-btn{border:0;background:#201460;color:#fff;border-radius:11px;padding:10px 14px;font-size:11px;font-weight:900;cursor:pointer}.green-accum-btn:hover{filter:brightness(1.08)}.green-accum-stats{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;margin-bottom:12px}.green-accum-stat{border:1px solid #e6e7ef;background:#fafafe;border-radius:13px;padding:11px}.green-accum-stat small{display:block;color:#7a7f8b;font-size:8px;text-transform:uppercase;font-weight:900;letter-spacing:.05em}.green-accum-stat strong{display:block;color:#201460;font-size:18px;margin-top:4px}.green-accum-note{padding:10px 12px;border-radius:11px;background:#f3f9fc;border:1px solid #d8edf6;color:#52606b;font-size:9px;line-height:1.45;margin-bottom:12px}.green-accum-preview{max-height:360px;overflow:auto;border:1px solid #e3e6ee;border-radius:13px}.green-accum-preview table{min-width:980px}.green-accum-preview th{background:#153f5f;color:#fff}.green-accum-preview td{white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}.green-original-ok{color:#17865f!important}.green-original-warn{color:#b46a15!important}@media(max-width:900px){.green-accum-stats{grid-template-columns:repeat(2,1fr)}}`;
  html=html.replace('</style>',css+'\n</style>');

  const section=`
<section class="section" id="acumuladoHojasVerdes">
  <div class="section-head"><div><div class="eyebrow">ACUMULADO DE HOJAS VERDES</div><h3>Consolidado completo de los periodos seleccionados</h3></div><small id="greenAccumCaption">—</small></div>
  <article class="card panel green-accum-card">
    <div class="green-accum-toolbar">
      <div class="green-accum-copy"><strong>Apila las hojas completas como si las copiaras una debajo de otra</strong><span>El acumulado se guía por Mes + Periodo. Si seleccionas 2 periodos, toma las hojas completas asociadas a esos 2 periodos. Si combinas distintos tipos de nómina, conserva todos los encabezados originales y deja vacías las columnas que no existan en alguna hoja.</span></div>
      <button type="button" class="green-accum-btn" id="exportGreenAccumBtn">Descargar acumulado Excel</button>
    </div>
    <div class="green-accum-stats">
      <div class="green-accum-stat"><small>Archivos / hojas</small><strong id="greenAccumFiles">0</strong></div>
      <div class="green-accum-stat"><small>Periodos</small><strong id="greenAccumPeriods">0</strong></div>
      <div class="green-accum-stat"><small>Filas acumuladas</small><strong id="greenAccumRows">0</strong></div>
      <div class="green-accum-stat"><small>Columnas</small><strong id="greenAccumCols">0</strong></div>
      <div class="green-accum-stat"><small>Estructura original</small><strong id="greenAccumExact">0/0</strong></div>
    </div>
    <div class="green-accum-note" id="greenAccumNotice">Selecciona uno o varios periodos para formar el acumulado.</div>
    <div class="green-accum-preview" id="greenAccumPreview"><div class="empty">Sin datos</div></div>
  </article>
</section>`;
  const detailNeedle='<section class="section" id="detalle">';
  if(html.includes(detailNeedle))html=html.replace(detailNeedle,section+'\n'+detailNeedle);
  else html=html.replace('<div class="footer">',section+'\n<div class="footer">');

  const captureHelpers=String.raw`
// ===== V109_GREEN_ACCUMULATOR: CAPTURA DE HOJA ORIGINAL =====
function greenRawHeadersV109(rows,hi){
  const src=Array.isArray(rows?.[hi])?rows[hi]:[];
  const seen=new Map();
  return src.map(function(v,i){
    const base=String(v==null?'':v).trim()||('Columna '+(i+1));
    const n=(seen.get(base)||0)+1;seen.set(base,n);
    return n===1?base:(base+' ('+n+')');
  });
}
function captureGreenSheetV109(rows,hi,sheetName){
  const headers=greenRawHeadersV109(rows,hi);
  const body=(Array.isArray(rows)?rows.slice((+hi||0)+1):[])
    .filter(function(r){return Array.isArray(r)&&r.some(function(v){return String(v==null?'':v).trim()!==''})})
    .map(function(r){return headers.map(function(_,i){return r[i]==null?'':r[i]})});
  return {raw_captured:true,raw_sheet:String(sheetName||''),raw_headers:headers,raw_rows:body};
}
`;
  const parseNeedle='function parseGreenSheet(rows,payroll,fileName,workbookLookup=null){';
  if(html.includes(parseNeedle)&&!html.includes('function captureGreenSheetV109('))html=html.replace(parseNeedle,captureHelpers+'\n'+parseNeedle);

  const parsedNeedle='let parsed=parseGreenSheet(c.rows,payrollForFile,file.name,workbookLookup).map(homologateRecord);';
  if(html.includes(parsedNeedle))html=html.replace(parsedNeedle,parsedNeedle+'\n      const rawSheetSnapshotV109=captureGreenSheetV109(c.rows,c.hi,c.sn);');

  const metaNeedle='upsertLoadedFileMeta({name:file.name,payroll:payrollForFile,status:"loaded",rows:parsed.length});';
  if(html.includes(metaNeedle))html=html.replace(metaNeedle,'upsertLoadedFileMeta({name:file.name,payroll:payrollForFile,status:"loaded",rows:parsed.length,raw_captured:rawSheetSnapshotV109.raw_captured,raw_sheet:rawSheetSnapshotV109.raw_sheet,raw_headers:rawSheetSnapshotV109.raw_headers,raw_rows:rawSheetSnapshotV109.raw_rows,period_keys:unique(parsed.map(function(r){return r.period_key}).filter(Boolean)),month_nums:unique(parsed.map(function(r){return r.month_num}).filter(Boolean))});');

  const upsertRegex=/function upsertLoadedFileMeta\(meta\)\{[\s\S]*?\n\}/;
  if(upsertRegex.test(html)){
    html=html.replace(upsertRegex,`function upsertLoadedFileMeta(meta){
  const key=norm(meta?.name||"");
  const idx=loadedFilesMeta.findIndex(x=>norm(x?.name||"")===key);
  const row={...meta,name:String(meta?.name||""),payroll:String(meta?.payroll||""),status:String(meta?.status||"loaded"),rows:+meta?.rows||0,homologated:+meta?.homologated||0,unmatched:+meta?.unmatched||0,error:String(meta?.error||""),updatedAt:Date.now()};
  if(idx>=0)loadedFilesMeta[idx]={...loadedFilesMeta[idx],...row}; else loadedFilesMeta.push(row);
}`);
  }

  const injected=String.raw`
// ===== V109_GREEN_ACCUMULATOR =====
function greenAccumScopeRecordsV109(){
  const y=typeof currentYear==='function'?currentYear():2026;
  let rr=(records||[]).filter(function(r){return +r.year===+y});
  if(state?.months?.size)rr=rr.filter(function(r){return state.months.has(String(+r.month_num))});
  if(state?.periods?.size)rr=rr.filter(function(r){return state.periods.has(String(r.period_key||''))});
  return rr;
}
function greenFallbackHeaderV109(){
  return ['Mes','Nómina','Periodo','Fecha Inicio','Fecha Fin','Contrato','Frente','Centro de Coste','CC Niv5 / Descripción','Tipo de Obra','Sitio','Empleado','Nombre','Puesto','Etiqueta Nómina','REC/NO REC','PNOR','DTRA','Percepciones','Deducciones','Neto','Provisiones / Carga Social','Costo Empresa'];
}
function greenFallbackRowV109(r){
  let c=null;try{c=typeof catalogMeta==='function'?catalogMeta(r):null}catch(e){}
  let contrato='',frente='',work='',site='',label='',rec='',dtra=0;
  try{contrato=typeof inferContract==='function'?inferContract(r):(r.contract||'')}catch(e){}
  try{frente=typeof inferFront==='function'?inferFront(r):(r.front||'')}catch(e){}
  try{work=typeof inferWork==='function'?inferWork(r):(r.work||'')}catch(e){}
  try{site=typeof inferSite==='function'?inferSite(r):(r.site||'')}catch(e){}
  try{label=typeof normalizedNominaLabel==='function'?normalizedNominaLabel(r):(r.nomina_label||'')}catch(e){}
  try{rec=typeof activityCategory==='function'?activityCategory(r):(r.activity||'')}catch(e){}
  try{dtra=typeof incidenceAmount==='function'?incidenceAmount(r):(+r.descanso_trabajado||0)}catch(e){dtra=+r.descanso_trabajado||0}
  return [r.month_name||'',r.payroll||'',r.period||'',r.date_start||'',r.date_end||'',contrato,frente,r.ceco||'',r.ceco_desc||c?.cc||'',work,site,r.employee_id||'',r.name||'',r.puesto||'',label,rec,+r.pnor||0,+dtra||0,+r.percepciones||0,+r.deducciones||0,+r.neto||0,+r.provisiones||+r.carga_social||0,+r.costo_empresa||0];
}
function greenAccumBuildV109(){
  const scope=greenAccumScopeRecordsV109();
  const selectedFiles=[];
  const seenFiles=new Set();
  scope.forEach(function(r){const f=String(r.source_file||'').trim();if(f&&!seenFiles.has(f)){seenFiles.add(f);selectedFiles.push(f)}});
  const metaByFile=new Map((loadedFilesMeta||[]).map(function(m){return [String(m?.name||'').trim().toLowerCase(),m]}));
  const union=[];const unionSet=new Set();const chunks=[];let exactFiles=0;
  selectedFiles.forEach(function(fileName){
    const meta=metaByFile.get(fileName.toLowerCase());
    const fileRecords=scope.filter(function(r){return String(r.source_file||'')===fileName});
    let headers=[],rows=[],exact=false,sheet='';
    if(meta&&Array.isArray(meta.raw_headers)&&meta.raw_headers.length&&Array.isArray(meta.raw_rows)){
      headers=meta.raw_headers.map(String);rows=meta.raw_rows;exact=true;sheet=String(meta.raw_sheet||'');exactFiles++;
    }else{
      headers=greenFallbackHeaderV109();rows=fileRecords.map(greenFallbackRowV109);sheet='Reconstruido desde base normalizada';
    }
    headers.forEach(function(h){if(!unionSet.has(h)){unionSet.add(h);union.push(h)}});
    chunks.push({file:fileName,meta:meta||{},headers:headers,rows:rows,exact:exact,sheet:sheet,fileRecords:fileRecords});
  });
  const helperHeaders=['Archivo origen','Hoja origen','Tipo de Nómina (Dashboard)','Periodo (Dashboard)'];
  helperHeaders.forEach(function(h){if(!unionSet.has(h)){unionSet.add(h);union.push(h)}});
  const outRows=[];
  chunks.forEach(function(ch){
    const idx=new Map(ch.headers.map(function(h,i){return [h,i]}));
    const payroll=String(ch.meta?.payroll||ch.fileRecords[0]?.payroll||'');
    const periodLabels=[...new Set(ch.fileRecords.map(function(r){return String(r.period_label||r.period||'')}).filter(Boolean))].join(' / ');
    ch.rows.forEach(function(raw){
      const row=union.map(function(h){
        if(h==='Archivo origen')return ch.file;
        if(h==='Hoja origen')return ch.sheet;
        if(h==='Tipo de Nómina (Dashboard)')return payroll;
        if(h==='Periodo (Dashboard)')return periodLabels;
        const i=idx.get(h);return i==null?'':(raw[i]==null?'':raw[i]);
      });
      outRows.push(row);
    });
  });
  const periods=[...new Set(scope.map(function(r){return String(r.period_key||'')}).filter(Boolean))];
  return {headers:union,rows:outRows,files:selectedFiles,chunks:chunks,exactFiles:exactFiles,periods:periods,scope:scope};
}
function renderGreenAccumV109(){
  const root=document.getElementById('greenAccumPreview');if(!root)return;
  const a=greenAccumBuildV109();
  const put=function(id,val){const e=document.getElementById(id);if(e)e.textContent=val};
  put('greenAccumFiles',a.files.length);put('greenAccumPeriods',a.periods.length);put('greenAccumRows',a.rows.length);put('greenAccumCols',a.headers.length);put('greenAccumExact',a.exactFiles+'/'+a.files.length);
  const cap=document.getElementById('greenAccumCaption');if(cap)cap.textContent=a.files.length+' hoja(s) · '+a.rows.length+' filas';
  const note=document.getElementById('greenAccumNotice');
  if(note){
    if(!a.files.length){note.className='green-accum-note';note.textContent='Selecciona uno o varios periodos. El acumulado tomará las hojas completas asociadas a esos periodos.'}
    else if(a.exactFiles===a.files.length){note.className='green-accum-note green-original-ok';note.textContent='Estructura original disponible para todas las hojas seleccionadas. El Excel conservará sus encabezados originales y apilará todos los registros.'}
    else{note.className='green-accum-note green-original-warn';note.textContent=(a.files.length-a.exactFiles)+' hoja(s) fueron cargadas antes de esta versión y no tienen snapshot de columnas originales. Se exportarán reconstruidas con la estructura normalizada. Si necesitas copia exacta de sus columnas, vuelve a cargar esos archivos una sola vez.'}
  }
  if(!a.rows.length||!a.headers.length){root.innerHTML='<div class="empty">Sin filas para acumular</div>';return}
  const maxCols=Math.min(12,a.headers.length),maxRows=Math.min(50,a.rows.length),heads=a.headers.slice(0,maxCols);
  let out='<table><thead><tr>'+heads.map(function(h){return '<th>'+esc(h)+'</th>'}).join('')+'</tr></thead><tbody>';
  for(let i=0;i<maxRows;i++)out+='<tr>'+a.rows[i].slice(0,maxCols).map(function(v){return '<td title="'+esc(String(v==null?'':v))+'">'+esc(String(v==null?'':v))+'</td>'}).join('')+'</tr>';
  out+='</tbody></table>';
  if(a.headers.length>maxCols)out+='<div class="green-accum-note">Vista previa: primeras '+maxCols+' de '+a.headers.length+' columnas. El Excel incluye todas.</div>';
  if(a.rows.length>maxRows)out+='<div class="green-accum-note">Vista previa: primeras '+maxRows+' de '+a.rows.length+' filas. El Excel incluye todas.</div>';
  root.innerHTML=out;
}
function exportGreenAccumV109(){
  const a=greenAccumBuildV109();
  if(!a.rows.length||!a.headers.length){if(typeof toast==='function')toast('No hay hojas seleccionadas para acumular.');return}
  try{
    if(typeof XLSX==='undefined')throw new Error('XLSX no disponible');
    const ws=XLSX.utils.aoa_to_sheet([a.headers].concat(a.rows));
    ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(0,a.rows.length),c:Math.max(0,a.headers.length-1)}})};
    ws['!cols']=a.headers.map(function(h,ci){let w=Math.max(10,Math.min(32,String(h).length+2));for(let r=0;r<Math.min(100,a.rows.length);r++)w=Math.max(w,Math.min(32,String(a.rows[r][ci]==null?'':a.rows[r][ci]).length+2));return {wch:w}});
    const control=[['Archivo','Hoja','Nómina','Periodo(s)','Filas','Columnas','Estructura original']];
    a.chunks.forEach(function(ch){control.push([ch.file,ch.sheet,String(ch.meta?.payroll||ch.fileRecords[0]?.payroll||''),[...new Set(ch.fileRecords.map(function(r){return String(r.period_label||r.period||'')}).filter(Boolean))].join(' / '),ch.rows.length,ch.headers.length,ch.exact?'Sí':'No - reconstruida'])});
    const ws2=XLSX.utils.aoa_to_sheet(control);ws2['!cols']=[{wch:42},{wch:24},{wch:20},{wch:55},{wch:12},{wch:12},{wch:24}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Acumulado Hojas Verdes');
    XLSX.utils.book_append_sheet(wb,ws2,'Control de archivos');
    const stamp=new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb,'SUBTEC_Acumulado_Hojas_Verdes_'+stamp+'.xlsx');
    if(typeof toast==='function')toast(a.files.length+' hoja(s) acumuladas · '+a.rows.length+' filas exportadas.');
  }catch(e){console.error('Acumulado hojas verdes V109',e);if(typeof toast==='function')toast('No se pudo generar el acumulado en Excel: '+(e?.message||e))}
}
(function(){
  const bind=function(){const b=document.getElementById('exportGreenAccumBtn');if(b&&!b.__v109){b.__v109=true;b.addEventListener('click',exportGreenAccumV109)}renderGreenAccumV109()};
  if(typeof renderAll==='function'&&!renderAll.__v109green){const prev=renderAll;const wrap=function(){try{return prev.apply(this,arguments)}finally{setTimeout(function(){try{renderGreenAccumV109()}catch(e){console.warn(e)}},0)}};wrap.__v109green=true;renderAll=wrap}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
`;
  const pos=html.lastIndexOf('</script>');
  if(pos<0){console.error('patch-v109: no se encontró </script>');process.exit(1)}
  html=html.slice(0,pos)+injected+'\n'+html.slice(pos);
}

html=html.replace(/V108 · DETALLE EXPORTABLE/g,'V109 · ACUMULADO HOJAS VERDES');
html=html.replace(/V107 · TABLA FINAL SINCRONIZADA/g,'V109 · ACUMULADO HOJAS VERDES');

if(html===before){console.log('patch-v109: sin cambios.')}else{fs.writeFileSync(file,html,'utf8');console.log('patch-v109: acumulado de hojas verdes + exportación Excel agregado.');}
