// Service Worker - Checklist Züblin GCC-003
// Cachea las páginas y librerías para que la app abra aunque no haya señal.

const CACHE_NAME = 'qcdigital-v33'; // sube este número cuando publiques cambios importantes

// OJO: si un archivo de esta lista no existe con ese nombre exacto, el
// install del service worker falla ENTERO y ninguna pagina queda cacheada.
// Al renombrar o borrar un archivo, hay que actualizarlo aqui tambien.
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
  './plano-dt.html',
  './plano-produccion.png',
  './plano-hundimiento.png',
  './plano-inyeccion.png',
  './plano-extraccion.png',
  './plano-acarreo.png',
  './cambio-turno-general.html',
  './reporte-pnc-rnc-index.html',
  './reporte-liberacion-frente.html',
  './ciz-dt-conectado.html',
  './app-inicio.html',
  './login.html',
  './marca.js?v=2',
  './drive-integration.js?v=3',
  './piwii-unificado.js',
  './piwii.html',
  './empresas.json',
  './xlsx.full.min.js',
  './jszip.min.js',
  './jspdf.umd.min.js',
  './jspdf.plugin.autotable.min.js',
  './qrious.min.js',
  './chart.umd.min.js',
  './supabase-integration.js?v=3',
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

  // La API de Supabase NO pasa por aqui. Si el service worker respondiera
  // estas peticiones, sin senal la app recibiria un 503 en texto plano
  // justo donde espera JSON, y mostraria un error incomprensible en vez
  // de "sin senal". Los datos los maneja la app con su propia cola.
  let url;
  try { url = new URL(event.request.url); } catch (e) { return; }
  if (url.hostname.endsWith('.supabase.co')) return;

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
