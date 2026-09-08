const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(__dirname, 'index.html'),
  path.join(__dirname, 'public', 'index.html')
];
const file = candidates.find(p => fs.existsSync(p));
if (!file) {
  console.error('patch-index: no se encontró index.html');
  process.exit(1);
}

let html = fs.readFileSync(file, 'utf8');
const before = html;

// 1) Costo Empresa total: no excluir filas financieras por falta de homologación.
html = html.replace(
  'function filteredBase(){const y=currentYear(),q=norm($("fSearch").value);return records.filter(r=>isHomologated(r)&&+r.year===y&&',
  'function filteredBase(){const y=currentYear(),q=norm($("fSearch").value);return records.filter(r=>+r.year===y&&'
);
html = html.replace(
  'Las referencias que no puedan resolverse con el catálogo no entran a las visualizaciones ejecutivas.',
  'Las referencias que no puedan resolverse con el catálogo se conservan en los totales financieros y de HC; únicamente quedan fuera de los desgloses que requieren Frente / Tipo de Obra / Sitio hasta recuperar su homologación.'
);

// 2) Nueva barra de filtros oficial. Se mantienen Mes y Periodo como filtros de tiempo.
// De la tabla de PPTO se usan: Contrato, Proyecto y Nómina. CECO queda fuera.
const filtersRegex = /(<div class="filters">)(.*?)(<\/div>\s*<div class="filter-summary" id="filterSummary">)/s;
const filtersHtml = `$1
      <div class="filter-item"><span class="filter-label">Mes</span><div class="multi" data-ms="months"><button class="multi-btn" type="button">Todos</button><div class="multi-menu"><div class="multi-tools"><button class="mini" data-act="all">Todos</button><button class="mini" data-act="none">Quitar selección</button></div><div class="multi-options"></div></div></div></div>
      <div class="filter-item"><span class="filter-label">Periodo <small style="font-weight:500;text-transform:none;color:#7b8191">· depende del mes seleccionado</small></span><div class="multi" data-ms="periods"><button class="multi-btn" type="button">Todos</button><div class="multi-menu"><div class="multi-tools"><button class="mini" data-act="all">Todos</button><button class="mini" data-act="none">Quitar selección</button></div><div class="multi-options"></div></div></div></div>
      <div class="filter-item"><span class="filter-label">Contrato</span><div class="multi" data-ms="contracts"><button class="multi-btn" type="button">Todos</button><div class="multi-menu"><div class="multi-tools"><button class="mini" data-act="all">Todos</button><button class="mini" data-act="none">Quitar selección</button></div><div class="multi-options"></div></div></div></div>
      <div class="filter-item"><span class="filter-label">Proyecto</span><div class="multi" data-ms="projects"><button class="multi-btn" type="button">Todos</button><div class="multi-menu"><div class="multi-tools"><button class="mini" data-act="all">Todos</button><button class="mini" data-act="none">Quitar selección</button></div><div class="multi-options"></div></div></div></div>
      <div class="filter-item"><span class="filter-label">Nómina</span><div class="multi" data-ms="nominas"><button class="multi-btn" type="button">Todas</button><div class="multi-menu"><div class="multi-tools"><button class="mini" data-act="all">Todas</button><button class="mini" data-act="none">Quitar selección</button></div><div class="multi-options"></div></div></div></div>
      <input id="fSearch" type="hidden" value="">
    $3`;
html = html.replace(filtersRegex, filtersHtml);

// 3) Agregar nuevos estados sin romper la jerarquía existente.
html = html.replace(
  'const state={months:new Set(),periods:new Set(),contracts:new Set(),fronts:new Set(),works:new Set(),sites:new Set(),cecos:new Set(),payrolls:new Set(),activities:new Set()};',
  'const state={months:new Set(),periods:new Set(),contracts:new Set(),projects:new Set(),nominas:new Set(),fronts:new Set(),works:new Set(),sites:new Set(),cecos:new Set(),payrolls:new Set(),activities:new Set()};'
);

// 4) Helpers para cruzar Proyecto y Nómina contra el formato oficial de PPTO.
const nominaFn = `function actualNominaBudgetLabel(r){\n  const lbl=String(r?.nomina_label||"").trim();\n  if(lbl)return lbl.toUpperCase();\n  const c=classifyNomina(r?.org_desc||"",r?.activity||"");\n  return String(c?.label||"").trim().toUpperCase();\n}`;
if (html.includes(nominaFn) && !html.includes('function nominaFilterKeyActual(')) {
  html = html.replace(nominaFn, nominaFn + `
function nominaFilterKeyActual(r){return norm(actualNominaBudgetLabel(r))}
function nominaFilterKeyBudget(b){return norm(hcBudgetNominaLabel(b))}
function projectFilterKeyActual(r){return String(inferProject(r)||"").trim()}
function projectFilterKeyBudget(b){return String(b?.project||"").replace(/_Q[1-4]$/i,"").replace(/\\._/g,"_").trim()}`);
}

// 5) Los totales y gráficas responden sólo a los nuevos filtros superiores.
html = html.replace(
  /function filteredBase\(\)\{.*?\}\nfunction filteredHCBase\(\)\{.*?\n\}/s,
`function filteredBase(){
  const y=currentYear();
  return records.filter(r=>
    +r.year===y &&
    selected("months",r.month_num) &&
    selected("periods",r.period_key) &&
    selected("contracts",inferContract(r)) &&
    selected("projects",projectFilterKeyActual(r)) &&
    selected("nominas",nominaFilterKeyActual(r))
  );
}
function filteredHCBase(){
  const y=currentYear();
  return records.filter(r=>{
    if(+r.year!==y)return false;
    if(!selected("months",r.month_num)||!selected("periods",r.period_key))return false;
    if(!selected("contracts",inferContract(r)))return false;
    if(!selected("projects",projectFilterKeyActual(r)))return false;
    if(!selected("nominas",nominaFilterKeyActual(r)))return false;
    if(hierarchyState.contract&&inferContract(r)!==hierarchyState.contract)return false;
    if(hierarchyState.front&&inferFront(r)!==hierarchyState.front)return false;
    if(hierarchyState.work&&inferWork(r)!==hierarchyState.work)return false;
    if(hierarchyState.site&&inferSite(r)!==hierarchyState.site)return false;
    return true;
  });
}`
);

// 6) Aplicar Proyecto y Nómina también al HC PPTO.
const hcContractNeedle = '  if(hierarchyState.contract)br=br.filter(x=>x.contract===hierarchyState.contract);\n';
if (html.includes(hcContractNeedle) && !html.includes('if(state.projects.size)br=br.filter(x=>state.projects.has(projectFilterKeyBudget(x)));')) {
  html = html.replace(hcContractNeedle, hcContractNeedle + `
  if(state.projects.size)br=br.filter(x=>state.projects.has(projectFilterKeyBudget(x)));
  if(state.nominas.size)br=br.filter(x=>state.nominas.has(nominaFilterKeyBudget(x)));
`);
}

// 7) Aplicar Proyecto y Nómina también al PPTO de costo.
const budgetContractNeedle = `  if(hierarchyState.contract){
    br=br.filter(x=>budgetContractMatches(hierarchyState.contract,x));
  }
`;
if (html.includes(budgetContractNeedle) && !html.includes('br=br.filter(x=>state.projects.has(projectFilterKeyBudget(x)));')) {
  html = html.replace(budgetContractNeedle, budgetContractNeedle + `
  if(state.projects.size){br=br.filter(x=>state.projects.has(projectFilterKeyBudget(x)));}
  if(state.nominas.size){br=br.filter(x=>state.nominas.has(nominaFilterKeyBudget(x)));}
`);
}

// 8) Opciones de filtro tomadas del catálogo presupuestal oficial.
html = html.replace(
  /function filterOptions\(\)\{.*?\}\nfunction renderMulti/s,
`function filterOptions(){
  const y=currentYear(),yr=records.filter(r=>+r.year===y);
  const monthVals=unique(yr.map(r=>+r.month_num)).map(Number).filter(Boolean).sort((a,b)=>a-b).map(m=>({v:String(m),label:MONTHS[m-1],sub:\`${num(yr.filter(r=>+r.month_num===m).length)} registros\`}));
  const periodRows=state.months.size?yr.filter(r=>state.months.has(String(+r.month_num))):yr;
  const periods=unique(periodRows.map(r=>r.period_key)).map(k=>periodRows.find(r=>r.period_key===k)).filter(Boolean).sort((a,b)=>(a.date_end||"").localeCompare(b.date_end||"")||a.payroll.localeCompare(b.payroll)).map(r=>({v:r.period_key,label:r.period_label,sub:\`${r.period||""}${r.month_name?` · ${r.month_name}`:""}\`}));
  const contracts=unique(BUDGET_ROWS.map(b=>b.contract).filter(Boolean)).sort().map(v=>({v,label:v}));
  const projects=unique(BUDGET_ROWS.map(projectFilterKeyBudget).filter(v=>v&&norm(v)!=="sin homologar")).sort().map(v=>({v,label:v}));
  const nominaMap=new Map();
  BUDGET_ROWS.forEach(b=>{const key=nominaFilterKeyBudget(b);if(key&&!nominaMap.has(key))nominaMap.set(key,String(b.nomina||hcBudgetNominaLabel(b)).trim())});
  const nominas=[...nominaMap.entries()].sort((a,b)=>a[1].localeCompare(b[1])).map(([v,label])=>({v,label}));
  return{months:monthVals,periods,contracts,projects,nominas};
}
function renderMulti`
);

// 9) Etiqueta 'Todas' para Nómina.
html = html.replace('(key==="payrolls")?"Todas":"Todos"','(key==="payrolls"||key==="nominas")?"Todas":"Todos"');

// 10) Resumen sólo de filtros visibles.
html = html.replace(
  /function renderFilterSummary\(rows\)\{.*?\nfunction upsertLoadedFileMeta/s,
`function renderFilterSummary(rows){
  const tags=[],labels={months:"Mes",periods:"Periodo",contracts:"Contrato",projects:"Proyecto",nominas:"Nómina"};
  ["months","periods","contracts","projects","nominas"].forEach(k=>{if(state[k].size)tags.push(\`<span class="tag">\${labels[k]}: \${state[k].size}</span>\`)});
  const ms=monthsInScope(rows);if(ms.length)tags.unshift(\`<span class="tag time">\${ms.map(m=>MONTHS[m-1].slice(0,3)).join(" · ")}</span>\`);
  $("filterSummary").innerHTML=tags.join("")||\`<span class="tag">Sin filtros: toda la base del año</span>\`;
}
function upsertLoadedFileMeta`
);

// 11) Versión visible.
html = html.replace('V93 · CARGA HISTÓRICA ROBUSTA', 'V102 · FILTROS OFICIALES PPTO');
html = html.replace('V99 · BASE COMPARTIDA', 'V102 · FILTROS OFICIALES PPTO');
html = html.replace('V100 · COSTO EMPRESA CORREGIDO', 'V102 · FILTROS OFICIALES PPTO');
html = html.replace('V101 · COSTO TOTAL CUADRA CON HOJA VERDE', 'V102 · FILTROS OFICIALES PPTO');

if (html !== before) {
  fs.writeFileSync(file, html, 'utf8');
  console.log('patch-index: filtros actualizados a Mes, Periodo, Contrato, Proyecto y Nómina; CECO y filtros anteriores eliminados de la barra.');
} else {
  console.log('patch-index: no hubo cambios; el index ya estaba actualizado o cambió su estructura.');
}
