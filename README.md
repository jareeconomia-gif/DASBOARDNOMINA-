# SUBTEC · Dashboard histórico de nómina

Paquete listo para GitHub + Render.

## Estructura

- `public/index.html` — dashboard completo.
- `server.js` — servidor Node.js sin dependencias externas.
- `package.json` — comando de arranque.
- `render.yaml` — configuración automática para Render.
- `/health` — health check para Render.

## Probar localmente

Requiere Node.js 20 o superior.

```bash
npm start
```

Abrir: `http://localhost:10000`

Health check: `http://localhost:10000/health`

## Subir a GitHub

1. Crear un repositorio nuevo en GitHub.
2. Subir **todo el contenido de esta carpeta a la raíz del repositorio**.
3. Confirmar que en la raíz estén `package.json`, `server.js`, `render.yaml` y la carpeta `public`.

## Desplegar en Render

### Opción recomendada: Blueprint

1. En Render elegir **New + → Blueprint**.
2. Conectar el repositorio de GitHub.
3. Render detectará `render.yaml`.
4. Crear el servicio.
5. Esperar a que `/health` marque estado saludable.

### Opción manual

- Service type: **Web Service**
- Runtime: **Node**
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

## Nota sobre datos y acceso

El dashboard procesa y conserva las cargas de Excel en el navegador del usuario. No existe todavía una base central compartida entre usuarios.

El login actual también es del lado del navegador. Para producción con usuarios reales, contraseñas seguras y datos compartidos, se debe agregar backend + base de datos/autenticación.
