const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 10000;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const ROOT_INDEX = path.join(ROOT_DIR, 'index.html');
const PUBLIC_INDEX = path.join(PUBLIC_DIR, 'index.html');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function existingIndex() {
  if (fs.existsSync(ROOT_INDEX)) return ROOT_INDEX;
  if (fs.existsSync(PUBLIC_INDEX)) return PUBLIC_INDEX;
  return null;
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error('No se pudo leer:', filePath, err.message);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Archivo no encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=86400'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (urlPath === '/health') {
    const indexPath = existingIndex();
    res.writeHead(indexPath ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: indexPath ? 'ok' : 'error',
      service: 'subtec-nomina-dashboard',
      index: indexPath ? path.relative(ROOT_DIR, indexPath) : null
    }));
    return;
  }

  // El repositorio actual tiene index.html en la raíz. También soportamos /public/index.html.
  if (urlPath === '/' || urlPath === '/index.html') {
    const indexPath = existingIndex();
    if (!indexPath) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No se encontró index.html en la raíz ni en /public');
      return;
    }
    sendFile(res, indexPath);
    return;
  }

  // Assets: primero busca en public y después en la raíz.
  const cleanPath = urlPath.replace(/^\/+/, '');
  const candidates = [
    path.normalize(path.join(PUBLIC_DIR, cleanPath)),
    path.normalize(path.join(ROOT_DIR, cleanPath))
  ];

  const safeCandidate = candidates.find(filePath => {
    const inPublic = filePath.startsWith(PUBLIC_DIR + path.sep);
    const inRoot = filePath.startsWith(ROOT_DIR + path.sep);
    return (inPublic || inRoot) && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  });

  if (safeCandidate) {
    sendFile(res, safeCandidate);
    return;
  }

  // SPA fallback.
  const indexPath = existingIndex();
  if (indexPath) {
    sendFile(res, indexPath);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Recurso no encontrado');
});

server.listen(PORT, '0.0.0.0', () => {
  const indexPath = existingIndex();
  console.log(`SUBTEC Dashboard ejecutándose en puerto ${PORT}`);
  console.log(`Index detectado: ${indexPath ? path.relative(ROOT_DIR, indexPath) : 'NO ENCONTRADO'}`);
});
