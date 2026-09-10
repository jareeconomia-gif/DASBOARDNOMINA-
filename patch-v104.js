const fs=require('fs');
const path=require('path');
const file=process.argv[2] || [path.join(__dirname,'index.html'),path.join(__dirname,'public','index.html')].find(fs.existsSync);
if(!file||!fs.existsSync(file)){console.error('patch-v104: no se encontró index.html');process.exit(1)}
let html=fs.readFileSync(file,'utf8');
const before=html;

// 1) Homologación única: PERSONAL PMT y AP PMT son la misma clasificación.
html=html.replace(
  /function nominaFilterKeyActual\(r\)\{.*?\}\s*function nominaFilterKeyBudget\(b\)\{.*?\}/s,
`function canonicalNominaFilterKey(v){
  const n=norm(String(v||""));
  if(n==="ap pmt"||n==="personal pmt"||n.includes("personal pmt")||n.includes("ap pmt"))return "personal pmt";
  return n;
}
function canonicalNominaFilterLabel(v){
  const k=canonicalNominaFilterKey(v);
  if(k==="personal pmt")return "AP PMT";
  return String(v||"").trim();
}
function nominaFilterKeyActual(r){return canonicalNominaFilterKey(actualNominaBudgetLabel(r))}
function nominaFilterKeyBudget(b){return canonicalNominaFilterKey(hcBudgetNominaLabel(b))}`
);

// 2) Filtros dependientes del contenido REAL visible. Al elegir una hoja/periodo,
// Contrato -> Proyecto -> Nómina sólo muestran valores que existen en esa selección.
html=html.replace(
  /function filterOptions\(\)\{.*?\n\}\nfunction renderMulti/s,
`function filterOptions(){
  const y=currentYear(),yr=records.filter(r=>+r.year===y);
  const monthVals=unique(yr.map(r=>+r.month_num)).map(Number).filter(Boolean).sort((a,b)=>a-b)
    .map(m=>({v:String(m),label:MONTHS[m-1],sub:String(yr.filter(r=>+r.month_num===m).length)+" registros"}));

  const validMonths=new Set(monthVals.map(o=>String(o.v)));
  const activeMonths=new Set([...state.months].filter(v=>validMonths.has(String(v))));
  const monthRows=activeMonths.size?yr.filter(r=>activeMonths.has(String(+r.month_num))):yr;

  const periods=unique(monthRows.map(r=>r.period_key)).map(k=>monthRows.find(r=>r.period_key===k)).filter(Boolean)
    .sort((a,b)=>(a.date_end||"").localeCompare(b.date_end||"")||String(a.payroll||"").localeCompare(String(b.payroll||"")))
    .map(r=>({v:r.period_key,label:r.period_label,sub:(r.period||"")+(r.month_name?" · "+r.month_name:"")}));
  const validPeriods=new Set(periods.map(o=>String(o.v)));
  const activePeriods=new Set([...state.periods].filter(v=>validPeriods.has(String(v))));
  const timeRows=activePeriods.size?monthRows.filter(r=>activePeriods.has(String(r.period_key))):monthRows;

  const contractVals=unique(timeRows.map(r=>inferContract(r)).filter(v=>v&&norm(v)!=="sin homologar")).sort();
  const contracts=contractVals.map(v=>({v,label:v,sub:String(timeRows.filter(r=>inferContract(r)===v).length)+" registros"}));
  const validContracts=new Set(contractVals.map(String));
  const activeContracts=new Set([...state.contracts].filter(v=>validContracts.has(String(v))));
  const contractRows=activeContracts.size?timeRows.filter(r=>activeContracts.has(String(inferContract(r)))):timeRows;

  const projectVals=unique(contractRows.map(r=>projectFilterKeyActual(r)).filter(v=>v&&norm(v)!=="sin homologar")).sort();
  const projects=projectVals.map(v=>({v,label:v,sub:String(contractRows.filter(r=>projectFilterKeyActual(r)===v).length)+" registros"}));
  const validProjects=new Set(projectVals.map(String));
  const activeProjects=new Set([...state.projects].filter(v=>validProjects.has(String(v))));
  const projectRows=activeProjects.size?contractRows.filter(r=>activeProjects.has(String(projectFilterKeyActual(r)))):contractRows;

  const nominaMap=new Map();
  projectRows.forEach(r=>{
    const raw=actualNominaBudgetLabel(r),key=canonicalNominaFilterKey(raw);
    if(key&&!nominaMap.has(key))nominaMap.set(key,canonicalNominaFilterLabel(raw));
  });
  const nominas=[...nominaMap.entries()].sort((a,b)=>a[1].localeCompare(b[1]))
    .map(([v,label])=>({v,label,sub:String(projectRows.filter(r=>nominaFilterKeyActual(r)===v).length)+" registros"}));

  return{months:monthVals,periods,contracts,projects,nominas};
}
function renderMulti`
);

// 3) Cada cambio refresca nuevamente las opciones dependientes.
html=html.replace(
  /function renderMulti\(key,opts\)\{.*?\nfunction updateMultiButton/s,
`function renderMulti(key,opts){
  const el=document.querySelector(\`.multi[data-ms="\${key}"]\`);if(!el)return;
  const box=el.querySelector(".multi-options"),set=state[key];if(!box||!set)return;
  const valid=new Set(opts.map(o=>String(o.v)));
  [...set].forEach(v=>{if(!valid.has(String(v)))set.delete(v)});
  const btn=el.querySelector(".multi-btn");if(btn)btn.disabled=!opts.length;
  box.innerHTML=opts.map(o=>\`<label class="opt"><input type="checkbox" value="\${esc(o.v)}" \${set.has(String(o.v))?"checked":""}><span>\${esc(o.label)}\${o.sub?\`<small>\${esc(o.sub)}</small>\`:""}</span></label>\`).join("")||\`<div class="empty">Sin opciones para la hoja seleccionada</div>\`;
  box.querySelectorAll("input").forEach(i=>i.onchange=()=>{i.checked?set.add(i.value):set.delete(i.value);updateMultiButton(key,opts);renderAll(true)});
  const all=el.querySelector('[data-act="all"]'),none=el.querySelector('[data-act="none"]');
  if(all)all.onclick=e=>{e.stopPropagation();set.clear();box.querySelectorAll("input").forEach(i=>i.checked=false);updateMultiButton(key,opts);renderAll(true)};
  if(none)none.onclick=e=>{e.stopPropagation();set.clear();box.querySelectorAll("input").forEach(i=>i.checked=false);updateMultiButton(key,opts);renderAll(true)};
  updateMultiButton(key,opts);
}
function updateMultiButton`
);

html=html.replace(
  /function updateMultiButton\(key,opts\)\{.*?\nfunction renderFilterOptions/s,
`function updateMultiButton(key,opts){
  const el=document.querySelector(\`.multi[data-ms="\${key}"]\`);if(!el)return;
  const set=state[key],btn=el.querySelector(".multi-btn");if(!btn||!set)return;
  if(!set.size){
    if(opts.length===1)btn.textContent=opts[0].label;
    else btn.textContent=(key==="payrolls"||key==="nominas")?"Todas":"Todos";
  }else if(set.size===1){const o=opts.find(x=>String(x.v)===[...set][0]);btn.textContent=o?.label||[...set][0]}
  else btn.textContent=String(set.size)+" seleccionados";
}
function renderFilterOptions`
);

// 4) PPTO de costo: Proyecto y Nómina respetan el REAL filtrado, sin romper M801->M807.
html=html.replace(
  /function budgetRowsForScope\(actualRows\)\{.*?\n  return br;\n\}/s,
`function budgetRowsForScope(actualRows){
  let br=[...BUDGET_ROWS];
  if(state.contracts.size){const sc=[...state.contracts];br=br.filter(x=>sc.some(c=>budgetContractMatches(c,x)))}
  if(hierarchyState.contract)br=br.filter(x=>budgetContractMatches(hierarchyState.contract,x));

  if(state.projects.size||hierarchyState.front||hierarchyState.work||hierarchyState.site){
    const sigs=new Set((actualRows||[]).map(actualBudgetSignature).filter(Boolean));
    if(sigs.size)br=br.filter(x=>sigs.has(budgetRowSignature(x)));
  }
  if(state.nominas.size)br=br.filter(x=>state.nominas.has(nominaFilterKeyBudget(x)));
  if(hierarchyState.front)br=br.filter(x=>norm(x.front)===norm(hierarchyState.front));
  if(hierarchyState.work)br=br.filter(x=>norm(x.work)===norm(hierarchyState.work));
  if(hierarchyState.site)br=br.filter(x=>norm(x.site)===norm(hierarchyState.site));
  return br;
}`
);

// 5) HC PPTO: misma lógica dinámica y misma homologación de AP PMT/PERSONAL PMT.
html=html.replace(
  /function hcBudgetRowsForScope\(actualRows\)\{.*?\n  return br;\n\}/s,
`function hcBudgetRowsForScope(actualRows){
  let br=[...HC_BUDGET_ROWS];
  if(state.contracts.size){const sc=[...state.contracts];br=br.filter(x=>sc.some(c=>typeof budgetContractMatches==="function"?budgetContractMatches(c,x):x.contract===c))}
  if(hierarchyState.contract)br=br.filter(x=>typeof budgetContractMatches==="function"?budgetContractMatches(hierarchyState.contract,x):x.contract===hierarchyState.contract);
  if(state.projects.size||hierarchyState.front||hierarchyState.work||hierarchyState.site){
    const sigs=new Set((actualRows||[]).map(actualBudgetSignature).filter(Boolean));
    if(sigs.size)br=br.filter(x=>sigs.has(budgetRowSignature(x)));
  }
  if(state.nominas.size)br=br.filter(x=>state.nominas.has(nominaFilterKeyBudget(x)));
  if(hierarchyState.front)br=br.filter(x=>norm((hcBudgetMeta(x)?.front)||x.front)===norm(hierarchyState.front));
  if(hierarchyState.work)br=br.filter(x=>norm((hcBudgetMeta(x)?.work)||x.work)===norm(hierarchyState.work));
  if(hierarchyState.site)br=br.filter(x=>norm((hcBudgetMeta(x)?.site)||x.site)===norm(hierarchyState.site));
  return br;
}`
);

// 6) Tabla final: AP PMT y PERSONAL PMT se consolidan; PPTO siempre MXN y prorrateado por semanas visibles.
html=html.replace(
  /function finalOrgBudgetKey\(r\)\{.*?\n\}\nfunction finalCenterDescription/s,
`function finalOrgBudgetKey(r){
  const s=norm(String(r?.org_desc||r?.nomina_label||r?.activity||""));
  if(s.includes("pmt"))return "personal pmt";
  if(s.includes("cuadrilla offshore"))return "personal cuadrilla offshore";
  if(s.includes("contrato")&&s.includes("no rec")&&s.includes("offshore"))return "personal requerido por contrato no recuperable offshore";
  if(s.includes("cuadrilla onshore"))return "personal cuadrilla onshore";
  if(s.includes("contrato")&&s.includes("no rec")&&s.includes("onshore"))return "personal requerido por contrato no recuperable onshore";
  if(s.includes("pemex")&&s.includes("rec"))return "personal requerido por pemex recuperable";
  if(s.includes("servicios administrativos"))return "servicios administrativos especializados";
  return canonicalNominaFilterKey(actualNominaBudgetLabel(r));
}
function finalOrgDisplay(r){
  const k=finalOrgBudgetKey(r);
  if(k==="personal pmt")return "AP PMT";
  const v=String(r?.org_desc||normalizedNominaLabel(r)||"Sin descripción").trim()||"Sin descripción";
  return v;
}
function finalCenterDescription`
);

html=html.replace(
  /function finalBudgetForGroup\(arr,q\)\{.*?\n\}\nfunction renderFinalExecutiveTable/s,
`function finalBudgetForGroup(arr,scopeRows){
  if(!arr.length)return{hc:0,ppto:0};
  const r=arr[0],front=inferFront(r),site=inferSite(r),work=inferWork(r),contract=inferContract(r),key=finalOrgBudgetKey(r);
  const matches=BUDGET_ROWS.filter(b=>{
    const cOk=typeof budgetContractMatches==="function"?budgetContractMatches(contract,b):(!contract||!b.contract||b.contract===contract);
    if(!cOk)return false;
    if(front&&norm(b.front)!==norm(front))return false;
    if(site&&norm(b.site)!==norm(site))return false;
    if(work&&norm(b.work)!==norm(work))return false;
    return canonicalNominaFilterKey(hcBudgetNominaLabel(b))===key;
  });
  const weeks=budgetWeeks(scopeRows||arr);
  const latestMonth=monthsInScope(scopeRows||arr).slice(-1)[0]||periodMonth(arr[0]);
  const latestQ=quarter(latestMonth);
  const hc=matches.reduce((s,b)=>s+(+b[qField(latestQ,"hc")]||0),0);
  const pptoUsd=weeks.reduce((sum,w)=>{
    const q=quarter(periodMonth(w));
    return sum+matches.reduce((s,b)=>s+weeklyBudgetUsd(b,q),0);
  },0);
  return{hc,ppto:pptoUsd*fx()};
}
function renderFinalExecutiveTable`
);

html=html.replace(
  'const org=String(r?.org_desc||normalizedNominaLabel(r)||\'Sin descripción\').trim()||\'Sin descripción\';',
  'const org=finalOrgDisplay(r);'
);
html=html.replace(/const bp=finalBudgetForGroup\(arr,q\);/g,'const bp=finalBudgetForGroup(arr,rows);');
html=html.replace(
  "if($('finalSummaryCaption'))$('finalSummaryCaption').textContent='Q'+q+' · '+num(frontMap.size)+' frente(s)';",
  "if($('finalSummaryCaption'))$('finalSummaryCaption').textContent=num(budgetWeeks(rows).length)+' semana(s) · MXN · TC '+fx().toFixed(2)+' · '+num(frontMap.size)+' frente(s)';"
);
html=html.replace(
  'La tabla responde a los filtros visibles. El Real toma el Costo Empresa de la hoja verde. HC usa el último corte del alcance. HC Ppto e Importe Ppto se toman del trimestre correspondiente y se cruzan por Frente + Sitio/Tipo de Obra + clasificación de Nómina.',
  'La tabla responde a los filtros visibles. PERSONAL PMT y AP PMT se muestran consolidados como AP PMT. El Real toma el Costo Empresa de la hoja verde. HC usa el último corte del alcance. HC Ppto usa el trimestre del corte; Importe Ppto está en MXN y sigue la misma regla del dashboard: PPTO trimestral / 12 × semanas visibles × TC USD/MXN.'
);

html=html.replace(/V103 · TABLA EJECUTIVA FINAL/g,'V104 · FILTROS DINÁMICOS + PPTO MXN');

if(html!==before){fs.writeFileSync(file,html,'utf8');console.log('patch-v104: filtros dependientes, AP PMT consolidado y PPTO MXN/semanal aplicados.')}else console.log('patch-v104: sin cambios.');
