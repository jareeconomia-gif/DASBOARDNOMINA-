const fs=require('fs');
const path=require('path');
const file=[path.join(__dirname,'index.html'),path.join(__dirname,'public','index.html')].find(fs.existsSync);
if(!file){console.error('patch-v111: no se encontró index.html');process.exit(1)}
let html=fs.readFileSync(file,'utf8');
if(html.includes('V111_VARIANCE_CONTRAST')){console.log('patch-v111: ya aplicado');process.exit(0)}
if(!html.includes('V110_FINAL_VARIANCES')){console.error('patch-v111: primero debe ejecutarse V110');process.exit(1)}
const css=`
/* V111_VARIANCE_CONTRAST: contraste legible para variaciones, incluso en subtotales y Grand Total */
.final-summary-table{min-width:1580px}
.final-summary-table th[data-v110],.final-summary-table td[data-v110]{min-width:142px;white-space:nowrap}
.final-summary-table tbody tr.front-total td.final-variance,
.final-summary-table tbody tr.grand-total td.final-variance{
  color:#fff !important;
  background-color:#176786 !important;
}
.final-summary-table tbody tr.grand-total td.final-variance{background-color:#0f3955 !important}
.final-summary-table tbody tr.front-total td.final-variance *,
.final-summary-table tbody tr.grand-total td.final-variance *{
  color:#fff !important;
  opacity:1 !important;
}
.final-summary-table tbody tr.center-total td.final-variance,
.final-summary-table tbody tr.center-total td.final-variance *{
  color:#0b2d43 !important;
  opacity:1 !important;
}
.final-summary-table tbody tr:not(.center-total):not(.front-total):not(.grand-total) td.final-variance .final-variance-pct{
  opacity:.85;
}
`;
html=html.replace('</style>',css+'\n</style>');
html=html.replace(/V110 · VARIACIONES HC Y COSTO/g,'V111 · VARIACIONES LEGIBLES');
fs.writeFileSync(file,html,'utf8');
console.log('patch-v111: contraste de cifras corregido en subtotales, totales por frente y Grand Total.');
