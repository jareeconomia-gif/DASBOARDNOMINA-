const fs=require('fs');
const path=require('path');
const file=[path.join(__dirname,'index.html'),path.join(__dirname,'public','index.html')].find(fs.existsSync);
if(!file){console.error('patch-summary-table: no se encontró index.html');process.exit(1)}
let html=fs.readFileSync(file,'utf8');
const before=html;

if(!html.includes('id="executiveFinalTable"')){
  const css=`
.final-summary-card{overflow:hidden}.final-summary-wrap{overflow:auto;border-radius:16px;border:1px solid #c8dbe5;background:#fff}.final-summary-table{width:100%;border-collapse:collapse;min-width:1120px;font-size:11px}.final-summary-table th{position:sticky;top:0;z-index:2;background:#103956;color:#fff;padding:9px 10px;text-align:left;font-weight:900;white-space:nowrap}.final-summary-table th.num,.final-summary-table td.num{text-align:right;font-variant-numeric:tabular-nums}.final-summary-table td{padding:6px 9px;border-top:1px solid #d9edf5;vertical-align:top}.final-summary-table .front-cell{background:#bfe4f2;font-weight:900;color:#0d2940}.final-summary-table .center-cell{background:#d9eff7;font-weight:800}.final-summary-table tr.center-total td{background:#7fc8e3;font-weight:900;color:#0b2d43}.final-summary-table tr.front-total td{background:#176786;color:#fff;font-weight:900}.final-summary-table tr.grand-total td{background:#0f3955;color:#fff;font-weight:1000;font-size:12px;border-top:3px solid #0b3049}.final-summary-note{font-size:10px;color:#68717d;margin-top:8px;line-height:1.45}`;
  html=html.replace('</style>',css+'\n</style>');

  const section=`<section class="section" id="resumenTablaFinal"><div class="section-head"><div><div class="eyebrow">RESUMEN EJECUTIVO</div><h3>Detalle Real y PPTO por frente</h3></div><small id="finalSummaryCaption">—</small></div><article class="card panel final-summary-card"><div class="final-summary-wrap"><table class="final-summary-table"><thead><tr><th>Frente</th><th>Centro Costo Descripción</th><th>Descripción Estructura Organizacional</th><th class="num">Sum of HC</th><th class="num">Sum of Costo Empresa</th><th class="num">HC Ppto</th><th class="num">Importe Ppto</th></tr></thead><tbody id="executiveFinalTable"></tbody></table></div><div class="final-summary-note">La tabla responde a los filtros visibles. El Real toma el Costo Empresa de la hoja verde. HC usa el último corte del alcance. HC Ppto e Importe Ppto se toman del trimestre correspondiente y se cruzan por Frente + Sitio/Tipo de Obra + clasificación de Nómina.</div></article></section>`;
  html=html.replace('<div class="footer">',section+'\n<div class="footer">');

  const funcs=`
function finalOrgBudgetKey(r){
  const s=norm(String(r?.org_desc||r?.nomina_label||r?.activity||''));
  if(s.includes('cuadrilla offshore'))return 'personal cuadrilla offshore';
  if(s.includes('contrato')&&s.includes('no rec')&&s.includes('offshore'))return 'personal requerido por contrato no recuperable offshore';
  if(s.includes('cuadrilla onshore'))return 'personal cuadrilla onshore';
  if(s.includes('contrato')&&s.includes('no rec')&&s.includes('onshore'))return 'personal requerido por contrato no recuperable onshore';
  if(s.includes('pemex')&&s.includes('rec'))return 'personal requerido por pemex recuperable';
  if(s.includes('pmt'))return 'personal pmt';
  if(s.includes('servicios administrativos'))return 'servicios administrativos especializados';
  return norm(actualNominaBudgetLabel(r));
}
function finalCenterDescription(r,q){
  const raw=String(r?.ceco_desc||'').trim();
  if(raw&&!/^\\d+$/.test(raw)&&!['sin dato','sin homologar','n/a','na'].includes(norm(raw)))return raw;
  const p=String(projectFilterKeyActual(r)||inferProject(r)||inferSite(r)||'').trim();
  return p?p.replace(/_Q[1-4]$/i,'').replace(/_/g,' ')+' Q'+q:(inferSite(r)||'Sin descripción');
}
function finalBudgetForGroup(arr,q){
  if(!arr.length)return{hc:0,ppto:0};
  const r=arr[0],front=inferFront(r),site=inferSite(r),work=inferWork(r),contract=inferContract(r),key=finalOrgBudgetKey(r);
  const matches=BUDGET_ROWS.filter(b=>{
    const cOk=typeof budgetContractMatches==='function'?budgetContractMatches(contract,b):(!contract||!b.contract||b.contract===contract);
    if(!cOk)return false;
    if(front&&norm(b.front)!==norm(front))return false;
    if(site&&norm(b.site)!==norm(site))return false;
    if(work&&norm(b.work)!==norm(work))return false;
    return norm(hcBudgetNominaLabel(b))===key;
  });
  return{hc:matches.reduce((s,b)=>s+(+b[qField(q,'hc')]||0),0),ppto:matches.reduce((s,b)=>s+(+b[qField(q,'ppto')]||0),0)};
}
function renderFinalExecutiveTable(rows){
  const body=$('executiveFinalTable');if(!body)return;
  if(!rows.length){body.innerHTML='<tr><td colspan="7" class="empty">Sin datos</td></tr>';if($('finalSummaryCaption'))$('finalSummaryCaption').textContent='Sin datos';return}
  const ms=monthsInScope(rows),m=ms.length?Math.max(...ms):(+rows[0]?.month_num||1),q=quarter(m),frontMap=new Map();
  rows.forEach(r=>{const front=inferFront(r)||'Sin frente',center=finalCenterDescription(r,q),org=String(r?.org_desc||normalizedNominaLabel(r)||'Sin descripción').trim()||'Sin descripción';if(!frontMap.has(front))frontMap.set(front,new Map());const cm=frontMap.get(front);if(!cm.has(center))cm.set(center,new Map());const om=cm.get(center);if(!om.has(org))om.set(org,[]);om.get(org).push(r)});
  let out='',gHC=0,gCost=0,gHCP=0,gPP=0;
  [...frontMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([front,centers])=>{let fHC=0,fCost=0,fHCP=0,fPP=0,firstFront=true;[...centers.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([center,orgs])=>{let cHC=0,cCost=0,cHCP=0,cPP=0,firstCenter=true;[...orgs.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([org,arr])=>{const hc=hcDescansosInfo(arr).hc,cost=arr.reduce((s,r)=>s+(+r.costo_empresa||0),0),bp=finalBudgetForGroup(arr,q);cHC+=hc;cCost+=cost;cHCP+=bp.hc;cPP+=bp.ppto;out+='<tr><td class="'+(firstFront?'front-cell':'')+'">'+(firstFront?esc(front):'')+'</td><td class="'+(firstCenter?'center-cell':'')+'">'+(firstCenter?esc(center):'')+'</td><td>'+esc(org)+'</td><td class="num">'+num(hc)+'</td><td class="num">'+money(cost)+'</td><td class="num">'+num(bp.hc)+'</td><td class="num">'+money(bp.ppto)+'</td></tr>';firstFront=false;firstCenter=false});out+='<tr class="center-total"><td></td><td>'+esc(center)+' Total</td><td></td><td class="num">'+num(cHC)+'</td><td class="num">'+money(cCost)+'</td><td class="num">'+num(cHCP)+'</td><td class="num">'+money(cPP)+'</td></tr>';fHC+=cHC;fCost+=cCost;fHCP+=cHCP;fPP+=cPP});out+='<tr class="front-total"><td>Total '+esc(front)+'</td><td></td><td></td><td class="num">'+num(fHC)+'</td><td class="num">'+money(fCost)+'</td><td class="num">'+num(fHCP)+'</td><td class="num">'+money(fPP)+'</td></tr>';gHC+=fHC;gCost+=fCost;gHCP+=fHCP;gPP+=fPP});
  out+='<tr class="grand-total"><td></td><td>Grand Total</td><td></td><td class="num">'+num(gHC)+'</td><td class="num">'+money(gCost)+'</td><td class="num">'+num(gHCP)+'</td><td class="num">'+money(gPP)+'</td></tr>';body.innerHTML=out;if($('finalSummaryCaption'))$('finalSummaryCaption').textContent='Q'+q+' · '+num(frontMap.size)+' frente(s)';
}
`;
  html=html.replace('function renderAll(refreshOptions=true){',funcs+'\nfunction renderAll(refreshOptions=true){');
  html=html.replace('renderVariety(rows);renderDetail(rows);document.querySelectorAll','renderVariety(rows);renderDetail(rows);renderFinalExecutiveTable(rows);document.querySelectorAll');
}
html=html.replace('V102 · FILTROS OFICIALES PPTO','V103 · TABLA EJECUTIVA FINAL');
if(html!==before){fs.writeFileSync(file,html,'utf8');console.log('patch-summary-table: tabla ejecutiva final agregada.')}else console.log('patch-summary-table: sin cambios.');