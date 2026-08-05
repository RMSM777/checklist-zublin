// Service Worker - Checklist Züblin GCC-003
// Cachea las páginas y librerías para que la app abra aunque no haya señal.

const CACHE_NAME = 'qcdigital-v7'; // sube este número cuando publiques cambios importantes

const ARCHIVOS_PROPIOS = [
  './',
  './home.html',
  './index.html',
  './checklist-camioneta.html',
  './reporte-diario.html',
  './reporte-dt-index.html',
  './informe-procesos-constructivos.html',
  './listado-firmas-digitales.html',
  './reporte-programa-semanal.html',
  './caminata-avance-index.html',
  './ic-mi-plano-index.html',
  './cambio-turno-general.html',
  './marca.js',
  './empresas.json',
  './manifest.json',
  './dark-mode.css',
  './dark-mode.js',
  './verificar.html'
];

// Instala: guarda en caché las páginas principales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_PROPIOS))
  );
  self.skipWaiting();
});

// Activa: limpia caches antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// Fetch: intenta red primero (para tener datos frescos); si falla, usa caché.
// Si tampoco está en caché, responde con un error controlado (nunca null).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return respuesta;
      })
      .catch(() =>
        caches.match(event.request).then((cacheada) =>
          cacheada || new Response('Sin conexion y pagina no disponible en cache. Intenta de nuevo con senal.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          })
        )
      )
  );
});
