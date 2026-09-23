const fs=require('fs');
const path=require('path');
const file=[path.join(__dirname,'index.html'),path.join(__dirname,'public','index.html')].find(fs.existsSync);
if(!file){console.error('patch-v110: no se encontró index.html');process.exit(1)}
let html=fs.readFileSync(file,'utf8');
if(html.includes('V110_FINAL_VARIANCES')){console.log('patch-v110: ya aplicado');process.exit(0)}
if(!html.includes('id="executiveFinalTable"')||!html.includes('function renderFinalExecutiveTableV107()')){
  console.error('patch-v110: faltan tabla final o renderer V107; no se modificó index.html');
  process.exit(1);
}
const css=String.raw`
.final-summary-table{min-width:1430px}
.final-summary-table td.final-variance{white-space:nowrap;font-weight:800;color:#172c47}
.final-summary-table td.final-variance .final-variance-pct{display:block;margin-top:3px;font-size:9px;font-weight:650;opacity:.7}
.final-summary-table td.final-variance.over{color:#b73638}
.final-summary-table td.final-variance.under{color:#15714f}
.final-summary-table tr.front-total td.final-variance,.final-summary-table tr.grand-total td.final-variance,.final-summary-table tr.center-total td.final-variance{color:inherit}
.final-summary-table thead th{min-width:125px}
`;
html=html.replace('</style>',css+'\\n</style>');
const injected=String.raw`
// ===== V110_FINAL_VARIANCES =====
// Amplía la tabla existente, sin cambiar su fuente, filtros, PPTO, agrupación ni subtotales.
function finalVarianceNumberV110(value){
  const s=String(value==null?'':value).replace(/\\s/g,'').replace(/,/g,'');
  const n=Number(s.replace(/[^0-9.\\-]/g,''));
  return Number.isFinite(n)?n:0;
}
function finalVarianceLabelV110(delta,currency){
  const amount=currency?money(Math.abs(delta)):num(Math.abs(delta));
  return delta>0?'+'+amount:delta<0?'-'+amount:(currency?money(0):num(0));
}
function decorateFinalTableV110(){
  const table=document.querySelector('.final-summary-table');
  if(!table)return;
  const header=table.querySelector('thead tr');
  const body=document.getElementById('executiveFinalTable');
  if(!header||!body)return;
  if(!header.querySelector('[data-v110="hc"]')){
    header.insertAdjacentHTML('beforeend','<th class="num" data-v110="hc">Variación HC<br><small>Real − PPTO</small></th><th class="num" data-v110="cost">Variación costo (MXN)<br><small>Real − PPTO</small></th>');
  }
  Array.from(body.querySelectorAll('tr')).forEach(function(row){
    if(row.querySelector('[data-v110="hc"]'))return;
    const cells=Array.from(row.children);
    if(cells.length===1&&cells[0].hasAttribute('colspan')){
      cells[0].colSpan=9;
      return;
    }
    if(cells.length<7)return;
    const hcReal=finalVarianceNumberV110(cells[3].textContent);
    const costReal=finalVarianceNumberV110(cells[4].textContent);
    const hcBudget=finalVarianceNumberV110(cells[5].textContent);
    const costBudget=finalVarianceNumberV110(cells[6].textContent);
    const dh=hcReal-hcBudget;
    const dc=costReal-costBudget;
    const percentage=function(delta,budget){
      return budget>0?(delta/budget*100).toFixed(1)+'%':'Sin PPTO';
    };
    const hc=document.createElement('td');
    hc.className='num final-variance';
    hc.setAttribute('data-v110','hc');
    const moneyCell=document.createElement('td');
    moneyCell.className='num final-variance';
    moneyCell.setAttribute('data-v110','cost');
    if(dc>0)moneyCell.classList.add('over');
    if(dc<0)moneyCell.classList.add('under');
    const mainHC=document.createElement('span');
    mainHC.textContent=finalVarianceLabelV110(dh,false);
    const subHC=document.createElement('small');
    subHC.className='final-variance-pct';
    subHC.textContent=percentage(dh,hcBudget);
    const mainCost=document.createElement('span');
    mainCost.textContent=finalVarianceLabelV110(dc,true);
    const subCost=document.createElement('small');
    subCost.className='final-variance-pct';
    subCost.textContent=percentage(dc,costBudget);
    hc.append(mainHC,subHC);
    moneyCell.append(mainCost,subCost);
    row.append(hc,moneyCell);
  });
  const note=document.querySelector('#resumenTablaFinal .final-summary-note');
  if(note&&!note.textContent.includes('Variación HC =')){
    note.textContent+=' Variación HC = HC Real menos HC PPTO; variación de costo = Costo Empresa Real menos Importe PPTO (MXN). Se calcula para cada renglón, subtotal por centro, total por frente y gran total. Un valor positivo supera el presupuesto. Si no existe PPTO, se indica Sin PPTO.';
  }
}
(function(){
  if(typeof renderFinalExecutiveTableV107!=='function')return;
  const previous=renderFinalExecutiveTableV107;
  renderFinalExecutiveTableV107=function(){
    const result=previous.apply(this,arguments);
    decorateFinalTableV110();
    return result;
  };
  const draw=function(){try{decorateFinalTableV110()}catch(e){console.error('Variaciones V110',e)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',draw);
  else draw();
})();
`;
const pos=html.lastIndexOf('</script>');
if(pos<0){console.error('patch-v110: no se encontró </script>');process.exit(1)}
html=html.slice(0,pos)+injected+'\\n'+html.slice(pos);
html=html.replace(/V109 · ACUMULADO HOJAS VERDES/g,'V110 · VARIACIONES HC Y COSTO');
fs.writeFileSync(file,html,'utf8');
console.log('patch-v110: variaciones HC y costo agregadas a tabla ejecutiva; 9 columnas.');
