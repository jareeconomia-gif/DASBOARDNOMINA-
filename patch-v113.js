const fs=require('fs');
const path=require('path');
const file=path.join(__dirname,'server.js');
if(!fs.existsSync(file)){console.error('patch-v113: no se encontró server.js');process.exit(1)}
let src=fs.readFileSync(file,'utf8');
if(src.includes('V113_DASHBOARD_DISABLED')){console.log('patch-v113: ya aplicado');process.exit(0)}
const marker="const server = http.createServer(async (req, res) => {\n  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);";
if(!src.includes(marker)){console.error('patch-v113: no se encontró el handler principal');process.exit(1)}
const replacement=marker+`
  // V113_DASHBOARD_DISABLED
  // Modo reversible: mantiene el servicio y la base de datos intactos, pero bloquea dashboard y API.
  if (urlPath !== '/health') {
    res.writeHead(503, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Retry-After': '3600'
    });
    res.end(\`<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SUBTEC · Dashboard no disponible</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#13094a,#26136f);font-family:Inter,Arial,sans-serif;color:#1d2030;padding:24px}
.card{width:min(620px,94vw);background:#fff;border-radius:26px;padding:42px;box-shadow:0 30px 90px rgba(0,0,0,.32);text-align:center}
.mark{width:62px;height:62px;margin:0 auto 18px;border-radius:18px;background:#201460;color:#fff;display:grid;place-items:center;font-size:24px;font-weight:900}
.eyebrow{font-size:11px;letter-spacing:.16em;font-weight:900;color:#5b45b5;margin-bottom:10px}
h1{margin:0;font-size:31px;line-height:1.1;color:#201460}
p{margin:16px auto 0;max-width:470px;color:#6f7584;font-size:14px;line-height:1.6}
.note{margin-top:24px;padding:12px 14px;border-radius:13px;background:#f5f3fb;color:#51486f;font-size:12px;font-weight:700}
</style>
</head>
<body><main class="card"><div class="mark">S</div><div class="eyebrow">SUBTEC · CONTROL PRESUPUESTAL</div><h1>Dashboard temporalmente fuera de servicio</h1><p>El acceso al dashboard histórico de nómina está deshabilitado temporalmente.</p><div class="note">La información almacenada no ha sido eliminada.</div></main></body>
</html>\`);
    return;
  }`;
src=src.replace(marker,replacement);
src=src.replace("financialRule: 'costo_empresa_never_pnor'","financialRule: 'costo_empresa_never_pnor', dashboardDisabled: true");
fs.writeFileSync(file,src,'utf8');
console.log('patch-v113: dashboard y API deshabilitados; /health permanece activo.');
