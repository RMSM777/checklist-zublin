// Service Worker - Checklist Züblin GCC-003
// Cachea las páginas y librerías para que la app abra aunque no haya señal.

const CACHE_NAME = 'zublin-gcc003-v1'; // sube este número cuando publiques cambios importantes

const ARCHIVOS_PROPIOS = [
  './',
  './index.html',
  './reporte-diario.html',
  './reporte-dt-index.html',
  './informe-procesos-constructivos.html',
  './listado-firmas-digitales.html',
  './manifest.json'
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

// Fetch: intenta red primero (para tener datos frescos); si falla, usa caché
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(event.request))
  );
});
