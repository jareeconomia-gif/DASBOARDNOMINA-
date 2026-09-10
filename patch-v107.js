const fs=require('fs');
const path=require('path');
const file=[path.join(__dirname,'index.html'),path.join(__dirname,'public','index.html')].find(fs.existsSync);
if(!file){console.error('patch-v107: no se encontró index.html');process.exit(1)}
let html=fs.readFileSync(file,'utf8');
const before=html;

// La tabla ejecutiva debe construirse desde los registros guardados y SOLO con los filtros visibles.
// No debe quedarse vacía por una jerarquía abierta, filtros antiguos ocultos o por falta de homologación.
const helpers=`
function finalTableScopeRows(){
  const y=typeof currentYear==='function'?currentYear():2026;
  const has=(key,val)=>!state?.[key]?.size||state[key].has(String(val));
  return (records||[]).filter(r=>{
    if(+r.year!==+y)return false;
    if(!has('months',r.month_num))return false;
    if(!has('periods',r.period_key))return false;
    const contract=typeof inferContract==='function'?inferContract(r):String(r.contract||'');
    if(!has('contracts',contract))return false;
    const project=typeof projectFilterKeyActual==='function'?projectFilterKeyActual(r):String(r.project||'');
    if(!has('projects',project))return false;
    const nomina=typeof nominaFilterKeyActual==='function'?nominaFilterKeyActual(r):String(r.nomina_label||r.payroll||'');
    if(!has('nominas',nomina))return false;
    return true;
  });
}
function safeFinalOrgDisplay(r){
  if(typeof finalOrgDisplay==='function')return finalOrgDisplay(r);
  const raw=String(r?.org_desc||r?.nomina_label||r?.activity||r?.payroll||'').trim();
  const n=typeof norm==='function'?norm(raw):raw.toLowerCase();
  if(n.includes('personal pmt')||n.includes('ap pmt'))return 'AP PMT';
  return raw||'Sin descripción';
}
function safeFinalCenterDescription(r,q){
  if(typeof finalCenterDescription==='function')return finalCenterDescription(r,q);
  const raw=String(r?.ceco_desc||'').trim();
  if(raw&&!/^\\d+$/.test(raw))return raw;
  return String((typeof inferSite==='function'?inferSite(r):'')||r?.project||'Sin descripción');
}
function safeFinalBudget(arr,scopeRows){
  try{return typeof finalBudgetForGroup==='function'?finalBudgetForGroup(arr,scopeRows):{hc:0,ppto:0}}catch(e){console.warn('PPTO tabla final:',e);return{hc:0,ppto:0}}
}
`;

if(!html.includes('function finalTableScopeRows(){')){
  const needle='function renderFinalExecutiveTable(rows){';
  if(html.includes(needle))html=html.replace(needle,helpers+'\n'+needle);
  else html=html.replace('</script>',helpers+'\n</script>');
}

const newRenderer=`function renderFinalExecutiveTable(rows){
  const body=$('executiveFinalTable');if(!body)return;
  const scopeRows=finalTableScopeRows();
  const data=scopeRows.length?scopeRows:(Array.isArray(rows)?rows:[]);
  if(!data.length){
    body.innerHTML='<tr><td colspan="7" class="empty">Sin datos para los filtros seleccionados</td></tr>';
    if($('finalSummaryCaption'))$('finalSummaryCaption').textContent=(records?.length||0)?num(records.length)+' registros en base · 0 en filtros':'Base vacía';
    return;
  }
  const ms=monthsInScope(data),m=ms.length?Math.max(...ms):(+data[0]?.month_num||1),q=quarter(m),frontMap=new Map();
  data.forEach(r=>{
    const front=(typeof inferFront==='function'?inferFront(r):'')||'Pendiente homologación';
    const center=safeFinalCenterDescription(r,q);
    const org=safeFinalOrgDisplay(r);
    if(!frontMap.has(front))frontMap.set(front,new Map());
    const cm=frontMap.get(front);if(!cm.has(center))cm.set(center,new Map());
    const om=cm.get(center);if(!om.has(org))om.set(org,[]);om.get(org).push(r);
  });
  let out='',gHC=0,gCost=0,gHCP=0,gPP=0;
  [...frontMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([front,centers])=>{
    let fHC=0,fCost=0,fHCP=0,fPP=0,firstFront=true;
    [...centers.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([center,orgs])=>{
      let cHC=0,cCost=0,cHCP=0,cPP=0,firstCenter=true;
      [...orgs.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([org,arr])=>{
        let hc=0;
        try{hc=hcDescansosInfo(arr).hc}catch(e){hc=new Set(arr.map(r=>String(r.employee_id||r.name||'')).filter(Boolean)).size}
        const cost=arr.reduce((s,r)=>s+(+r.costo_empresa||0),0),bp=safeFinalBudget(arr,data);
        cHC+=hc;cCost+=cost;cHCP+=(+bp.hc||0);cPP+=(+bp.ppto||0);
        out+='<tr><td class="'+(firstFront?'front-cell':'')+'">'+(firstFront?esc(front):'')+'</td><td class="'+(firstCenter?'center-cell':'')+'">'+(firstCenter?esc(center):'')+'</td><td>'+esc(org)+'</td><td class="num">'+num(hc)+'</td><td class="num">'+money(cost)+'</td><td class="num">'+num(+bp.hc||0)+'</td><td class="num">'+money(+bp.ppto||0)+'</td></tr>';
        firstFront=false;firstCenter=false;
      });
      out+='<tr class="center-total"><td></td><td>'+esc(center)+' Total</td><td></td><td class="num">'+num(cHC)+'</td><td class="num">'+money(cCost)+'</td><td class="num">'+num(cHCP)+'</td><td class="num">'+money(cPP)+'</td></tr>';
      fHC+=cHC;fCost+=cCost;fHCP+=cHCP;fPP+=cPP;
    });
    out+='<tr class="front-total"><td>Total '+esc(front)+'</td><td></td><td></td><td class="num">'+num(fHC)+'</td><td class="num">'+money(fCost)+'</td><td class="num">'+num(fHCP)+'</td><td class="num">'+money(fPP)+'</td></tr>';
    gHC+=fHC;gCost+=fCost;gHCP+=fHCP;gPP+=fPP;
  });
  out+='<tr class="grand-total"><td></td><td>Grand Total</td><td></td><td class="num">'+num(gHC)+'</td><td class="num">'+money(gCost)+'</td><td class="num">'+num(gHCP)+'</td><td class="num">'+money(gPP)+'</td></tr>';
  body.innerHTML=out;
  if($('finalSummaryCaption'))$('finalSummaryCaption').textContent=num(data.length)+' registros · '+num(frontMap.size)+' frente(s) · '+num(typeof budgetWeeks==='function'?budgetWeeks(data).length:0)+' semana(s) · MXN';
}`;

// Reemplazar el renderer anterior completo.
html=html.replace(/function renderFinalExecutiveTable\(rows\)\{.*?\n\}/s,newRenderer);

// Garantizar que renderAll refresque la tabla cada vez que se carga, filtra o sincroniza información.
if(!/renderFinalExecutiveTable\(finalTableScopeRows\(\)\)/.test(html)){
  if(/renderFinalExecutiveTable\(rows\);/.test(html))html=html.replace(/renderFinalExecutiveTable\(rows\);/g,'renderFinalExecutiveTable(finalTableScopeRows());');
  else html=html.replace('renderVariety(rows);renderDetail(rows);document.querySelectorAll','renderVariety(rows);renderDetail(rows);renderFinalExecutiveTable(finalTableScopeRows());document.querySelectorAll');
}

// También refrescar inmediatamente después de una carga guardada en PostgreSQL.
html=html.replace(
  'setSharedSyncStatus(\"\",\"Base compartida · PostgreSQL\");return true',
  'setSharedSyncStatus(\"\",\"Base compartida · PostgreSQL\");try{renderFinalExecutiveTable(finalTableScopeRows())}catch(e){console.warn(e)}return true'
);

html=html.replace(/V106 · BASE PERSISTENTE \+ RECUPERACIÓN/g,'V107 · TABLA FINAL SINCRONIZADA');
html=html.replace(/V104 · FILTROS DINÁMICOS \+ PPTO MXN/g,'V107 · TABLA FINAL SINCRONIZADA');

if(html!==before){fs.writeFileSync(file,html,'utf8');console.log('patch-v107: tabla ejecutiva enlazada directamente a registros + filtros visibles.')}else console.log('patch-v107: sin cambios.');