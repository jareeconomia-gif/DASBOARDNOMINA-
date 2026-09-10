const fs=require('fs');
const path=require('path');
const file=[path.join(__dirname,'index.html'),path.join(__dirname,'public','index.html')].find(fs.existsSync);
if(!file){console.error('patch-v108: no se encontró index.html');process.exit(1)}
let html=fs.readFileSync(file,'utf8');
const before=html;

if(!html.includes('V108_EXPORT_DETAIL')){
  const css=`
.detail-head-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.detail-export-btn{border:1px solid #d8d4ee;background:#fff;color:#201460;border-radius:10px;padding:8px 11px;font-size:10px;font-weight:900;cursor:pointer}.detail-export-btn:hover{background:#f5f2ff}`;
  html=html.replace('</style>',css+'\n</style>');

  html=html.replace(
    '<small id="detailCount">—</small>',
    '<div class="detail-head-actions"><small id="detailCount">—</small><button type="button" class="detail-export-btn" id="exportDetailBtn">Descargar detalle Excel</button></div>'
  );

  const injected=String.raw`
// ===== V108_EXPORT_DETAIL =====
function exportDetailRowsV108(){
  let rows=[];
  try{rows=typeof filtered==='function'?filtered():[]}catch(e){rows=[]}
  if(!Array.isArray(rows)||!rows.length){
    if(typeof toast==='function')toast('No hay registros para descargar con los filtros actuales.');
    return;
  }
  const sorted=rows.slice().sort((a,b)=>(b.date_end||'').localeCompare(a.date_end||'')||String(a.payroll||'').localeCompare(String(b.payroll||'')));
  const data=sorted.map(r=>{
    let c=null;try{c=typeof catalogMeta==='function'?catalogMeta(r):null}catch(e){}
    let contrato='',frente='',tipoObra='',sitio='',etiqueta='',rec='';
    try{contrato=typeof inferContract==='function'?inferContract(r):(r.contract||'')}catch(e){}
    try{frente=typeof inferFront==='function'?inferFront(r):(r.front||'')}catch(e){}
    try{tipoObra=typeof inferWork==='function'?inferWork(r):(r.work||'')}catch(e){}
    try{sitio=typeof inferSite==='function'?inferSite(r):(r.site||'')}catch(e){}
    try{etiqueta=typeof normalizedNominaLabel==='function'?normalizedNominaLabel(r):(r.nomina_label||'')}catch(e){}
    try{rec=typeof activityCategory==='function'?activityCategory(r):(r.activity||'')}catch(e){}
    let dtra=0;try{dtra=typeof incidenceAmount==='function'?incidenceAmount(r):(+r.dtra||0)}catch(e){dtra=+r.dtra||0}
    const fechaIni=(()=>{try{return typeof fmtDate==='function'?fmtDate(r.date_start):(r.date_start||'')}catch(e){return r.date_start||''}})();
    const fechaFin=(()=>{try{return typeof fmtDate==='function'?fmtDate(r.date_end):(r.date_end||'')}catch(e){return r.date_end||''}})();
    return {
      'Mes':r.month_name||'',
      'Nómina':r.payroll||'',
      'Periodo':r.period||'',
      'Fecha Inicio':fechaIni,
      'Fecha Fin':fechaFin,
      'Contrato':contrato,
      'Frente':frente,
      'Centro de Coste':r.ceco||'',
      'CC Niv5 / Descripción':r.ceco_desc||c?.cc||'',
      'Tipo de Obra':tipoObra,
      'Sitio':sitio,
      'Empleado':r.employee_id||'',
      'Nombre':r.name||'',
      'Puesto':r.puesto||'',
      'Etiqueta Nómina':etiqueta,
      'REC/NO REC':rec,
      'PNOR':+r.pnor||0,
      'DTRA':+dtra||0,
      'Costo Empresa':+r.costo_empresa||0,
      'Archivo':r.source_file||''
    };
  });
  try{
    if(typeof XLSX==='undefined')throw new Error('XLSX no disponible');
    const ws=XLSX.utils.json_to_sheet(data);
    ws['!cols']=[{wch:12},{wch:18},{wch:15},{wch:13},{wch:13},{wch:12},{wch:18},{wch:16},{wch:28},{wch:20},{wch:22},{wch:14},{wch:28},{wch:32},{wch:30},{wch:14},{wch:14},{wch:14},{wch:18},{wch:34}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Detalle');
    const stamp=new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb,'SUBTEC_Detalle_Nomina_'+stamp+'.xlsx');
    if(typeof toast==='function')toast(data.length+' registros exportados a Excel.');
  }catch(e){
    console.error('Export detail V108',e);
    if(typeof toast==='function')toast('No se pudo generar el Excel del detalle.');
  }
}
(function(){
  const bind=()=>{const b=document.getElementById('exportDetailBtn');if(b&&!b.__v108){b.__v108=true;b.addEventListener('click',exportDetailRowsV108)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
`;
  const pos=html.lastIndexOf('</script>');
  if(pos<0){console.error('patch-v108: no se encontró </script>');process.exit(1)}
  html=html.slice(0,pos)+injected+'\n'+html.slice(pos);
}

html=html.replace(/V107 · TABLA FINAL SINCRONIZADA/g,'V108 · DETALLE EXPORTABLE');
html=html.replace(/V106 · BASE PERSISTENTE \+ RECUPERACIÓN/g,'V108 · DETALLE EXPORTABLE');

if(html===before){console.log('patch-v108: sin cambios.')}else{fs.writeFileSync(file,html,'utf8');console.log('patch-v108: descarga de detalle en Excel agregada.');}
