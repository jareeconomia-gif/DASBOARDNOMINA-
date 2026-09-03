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

// El Costo Empresa total debe cuadrar contra la hoja verde aunque una fila todavía
// no tenga homologación de catálogo. La homologación sólo debe limitar los desgloses
// por Contrato/Frente/Tipo de Obra/Sitio, no el total financiero del periodo.
html = html.replace(
  'function filteredBase(){const y=currentYear(),q=norm($("fSearch").value);return records.filter(r=>isHomologated(r)&&+r.year===y&&',
  'function filteredBase(){const y=currentYear(),q=norm($("fSearch").value);return records.filter(r=>+r.year===y&&'
);

html = html.replace(
  'Las referencias que no puedan resolverse con el catálogo no entran a las visualizaciones ejecutivas.',
  'Las referencias que no puedan resolverse con el catálogo se conservan en los totales financieros y de HC; únicamente quedan fuera de los desgloses que requieren Frente / Tipo de Obra / Sitio hasta recuperar su homologación.'
);

html = html.replace('V93 · CARGA HISTÓRICA ROBUSTA', 'V101 · COSTO TOTAL CUADRA CON HOJA VERDE');
html = html.replace('V100 · COSTO EMPRESA CORREGIDO', 'V101 · COSTO TOTAL CUADRA CON HOJA VERDE');

if (html !== before) {
  fs.writeFileSync(file, html, 'utf8');
  console.log('patch-index: Costo Empresa total configurado para incluir todas las filas financieras del periodo.');
} else {
  console.log('patch-index: no hubo cambios; el index ya estaba corregido o cambió su estructura.');
}
