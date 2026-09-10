const fs=require('fs');
const path=require('path');
const file=[path.join(__dirname,'index.html'),path.join(__dirname,'public','index.html')].find(fs.existsSync);
if(!file){console.error('patch-v107: no se encontró index.html');process.exit(1)}
let html=fs.readFileSync(file,'utf8');
const before=html;

// V107 seguro: NO reemplaza funciones completas con regex. Inyecta un renderer independiente
// y envuelve renderAll() con try/finally para que la tabla se pinte aunque otra visual falle.
if(!html.includes('V107_FINAL_TABLE_SAFE')){
const injected=String.raw`
// ===== V107_FINAL_TABLE_SAFE =====
function finalTableVisibleRowsV107(){
  const y=(typeof currentYear==='function'?currentYear():2026);
  let rows=(records||[]).filter(r=>+r.year===+y);

  function applySet(key,getter){
    const set=state?.[key];
    if(!set||!set.size)return;
    const available=new Set(rows.map(r=>String(getter(r)??'')).filter(Boolean));
    const valid=[...set].map(String).filter(v=>available.has(v));
    if(!valid.length){set.clear();return;}
    const validSet=new Set(valid);
    rows=rows.filter(r=>validSet.has(String(getter(r)??'')));
  }

  applySet('months',r=>r.month_num);
  applySet('periods',r=>r.period_key);
  applySet('contracts',r=>typeof inferContract==='function'?inferContract(r):(r.contract||''));
  applySet('projects',r=>typeof projectFilterKeyActual==='function'?projectFilterKeyActual(r):(r.project||''));
  applySet('nominas',r=>typeof nominaFilterKeyActual==='function'?nominaFilterKeyActual(r):(r.nomina_label||r.payroll||''));
  return rows;
}
function finalOrgDisplayV107(r){
  const raw=String(r?.org_desc||r?.nomina_label||r?.activity||r?.payroll||'').trim();
  const n=typeof norm==='function'?norm(raw):raw.toLowerCase();
  if(n.includes('personal pmt')||n.includes('ap pmt'))return 'AP PMT';
  return raw||'Sin descripción';
}
function finalCenterV107(r,q){
  try{if(typeof finalCenterDescription==='function')return finalCenterDescription(r,q)}catch(e){}
  const raw=String(r?.ceco_desc||'').trim();
  if(raw&&!/^\d+$/.test(raw))return raw;
  const site=typeof inferSite==='function'?inferSite(r):'';
  const project=typeof projectFilterKeyActual==='function'?projectFilterKeyActual(r):(r.project||'');
  return String(site||project||'Sin descripción');
}
function finalBudgetV107(arr,scopeRows){
  try{
    if(typeof finalBudgetForGroup==='function'){
      const b=finalBudgetForGroup(arr,scopeRows);
      return {hc:+b?.hc||0,ppto:+b?.ppto||0};
    }
  }catch(e){console.warn('PPTO tabla final',e)}
  return {hc:0,ppto:0};
}
function finalHCV107(arr){
  try{return typeof hcDescansosInfo==='function'?(+hcDescansosInfo(arr).hc||0):0}catch(e){}
  return new Set(arr.map(r=>String(r.employee_id||r.name||'')).filter(Boolean)).size;
}
function renderFinalExecutiveTableV107(){
  const body=document.getElementById('executiveFinalTable');
  if(!body)return;
  const data=finalTableVisibleRowsV107();
  const baseCount=(records||[]).filter(r=>+r.year===+(typeof currentYear==='function'?currentYear():2026)).length;
  if(!data.length){
    body.innerHTML='<tr><td colspan="7" class="empty">'+(baseCount?'Sin registros para los filtros actuales':'Base sin registros')+'</td></tr>';
    const cap=document.getElementById('finalSummaryCaption');
    if(cap)cap.textContent=baseCount?('0 visibles · '+(typeof num==='function'?num(baseCount):baseCount)+' en la base'):'Sin datos';
    return;
  }

  const ms=typeof monthsInScope==='function'?monthsInScope(data):[];
  const m=ms.length?Math.max(...ms):(+data[0]?.month_num||1);
  const q=typeof quarter==='function'?quarter(m):(m<=3?1:m<=6?2:m<=9?3:4);
  const frontMap=new Map();

  data.forEach(r=>{
    const front=(typeof inferFront==='function'?inferFront(r):'')||String(r?.front||'').trim();
    if(!front)return; // No inventar frentes: sólo se muestra lo que realmente pudo homologarse.
    const center=finalCenterV107(r,q);
    const org=finalOrgDisplayV107(r);
    if(!frontMap.has(front))frontMap.set(front,new Map());
    const centers=frontMap.get(front);
    if(!centers.has(center))centers.set(center,new Map());
    const orgs=centers.get(center);
    if(!orgs.has(org))orgs.set(org,[]);
    orgs.get(org).push(r);
  });

  if(!frontMap.size){
    body.innerHTML='<tr><td colspan="7" class="empty">Los registros están cargados, pero ninguno tiene Frente homologado para esta tabla.</td></tr>';
    const cap=document.getElementById('finalSummaryCaption');
    if(cap)cap.textContent=(typeof num==='function'?num(data.length):data.length)+' registros visibles · 0 frentes homologados';
    return;
  }

  let out='',gHC=0,gCost=0,gHCP=0,gPP=0;
  [...frontMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([front,centers])=>{
    let fHC=0,fCost=0,fHCP=0,fPP=0,firstFront=true;
    [...centers.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([center,orgs])=>{
      let cHC=0,cCost=0,cHCP=0,cPP=0,firstCenter=true;
      [...orgs.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([org,arr])=>{
        const hc=finalHCV107(arr);
        const cost=arr.reduce((s,r)=>s+(+r.costo_empresa||0),0);
        const bp=finalBudgetV107(arr,data);
        cHC+=hc;cCost+=cost;cHCP+=bp.hc;cPP+=bp.ppto;
        out+='<tr><td class="'+(firstFront?'front-cell':'')+'">'+(firstFront?esc(front):'')+'</td><td class="'+(firstCenter?'center-cell':'')+'">'+(firstCenter?esc(center):'')+'</td><td>'+esc(org)+'</td><td class="num">'+num(hc)+'</td><td class="num">'+money(cost)+'</td><td class="num">'+num(bp.hc)+'</td><td class="num">'+money(bp.ppto)+'</td></tr>';
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
  const cap=document.getElementById('finalSummaryCaption');
  if(cap){
    const weeks=typeof budgetWeeks==='function'?budgetWeeks(data).length:0;
    cap.textContent=num(data.length)+' registros · '+num(frontMap.size)+' frente(s) · '+num(weeks)+' semana(s) · MXN';
  }
}
(function(){
  if(typeof renderAll==='function'&&!renderAll.__v107wrapped){
    const originalRenderAll=renderAll;
    const wrapped=function(refreshOptions=true){
      try{return originalRenderAll(refreshOptions)}
      finally{try{renderFinalExecutiveTableV107()}catch(e){console.error('Tabla ejecutiva V107',e)}}
    };
    wrapped.__v107wrapped=true;
    renderAll=wrapped;
  }
  const draw=()=>{try{renderFinalExecutiveTableV107()}catch(e){console.error('Tabla ejecutiva V107 init',e)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(draw,150));
  else setTimeout(draw,150);
})();
`;
const pos=html.lastIndexOf('</script>');
if(pos<0){console.error('patch-v107: no se encontró </script>');process.exit(1)}
html=html.slice(0,pos)+injected+'\n'+html.slice(pos);
}

html=html.replace(/V106 · BASE PERSISTENTE \+ RECUPERACIÓN/g,'V107 · TABLA FINAL SINCRONIZADA');
html=html.replace(/V104 · FILTROS DINÁMICOS \+ PPTO MXN/g,'V107 · TABLA FINAL SINCRONIZADA');
html=html.replace(/V103 · TABLA EJECUTIVA FINAL/g,'V107 · TABLA FINAL SINCRONIZADA');

if(html===before){console.log('patch-v107: sin cambios.')}else{fs.writeFileSync(file,html,'utf8');console.log('patch-v107: renderer seguro de tabla ejecutiva aplicado.');}
