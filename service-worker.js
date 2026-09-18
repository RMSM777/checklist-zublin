// Service Worker - Checklist Züblin GCC-003
// Cachea las páginas y librerías para que la app abra aunque no haya señal.

const CACHE_NAME = 'qcdigital-v38'; // sube este número cuando publiques cambios importantes

// OJO: si un archivo de esta lista no existe con ese nombre exacto (o no
// hay señal para descargarlo en el momento de instalar), ESE archivo
// puntual se queda sin cachear -- pero ya NO tumba la instalación
// completa del Service Worker (ver el fix de 'install' más abajo). Aun
// así, al renombrar o borrar un archivo real hay que actualizarlo acá
// también, para no dejar rutas rotas en la lista.
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
  './reporte-cambio-turno.html',
  './ciz-dt-conectado.html',
  './app-inicio.html',
  './login.html',
  './marca.js?v=3',
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
  './supabase-integration.js?v=5',
  './manifest.json',
  './dark-mode.css',
  './dark-mode.js',
  './verificar.html'
];

/* ------------------------------------------------------------------
   Fix (18-09-2026): "Response served by service worker has
   redirections" en iPhone/Safari.

   Que pasaba: cuando fetch(algo) sigue una redireccion en el camino
   (ej. http -> https forzado por Github Pages, o el dominio viejo
   github.io -> el dominio actual reportes.qcdigital.cl vía CNAME), el
   Response que devuelve queda marcado internamente como
   "redirected = true". Este Service Worker guardaba esa respuesta tal
   cual en la cache. Safari/iOS se niega a usar, para ABRIR una pagina
   (una navegacion), cualquier respuesta marcada como redirigida —
   sin avisar nada util, solo el error tecnico en pantalla ("Response
   served by service worker has redirections"), y la pagina no abre.

   Por que pasaba con unos reportes si y otros no: no es al azar --
   depende de si, la ULTIMA vez que ese reporte en particular se pidio
   con señal, esa peticion paso o no por una redireccion. Los reportes
   que "funcionaban offline" simplemente tuvieron la suerte de haberse
   guardado en cache sin haber pasado por ninguna redireccion.

   La solucion: antes de guardar (o de responder con) cualquier
   respuesta que vino de una redireccion, se reconstruye una respuesta
   NUEVA con el mismo contenido, status y headers, pero sin el
   historial de redireccion. Una respuesta armada asi nunca queda
   marcada como "redirected", asi que Safari ya no tiene motivo para
   rechazarla.
   ------------------------------------------------------------------ */
async function limpiarRespuesta(respuesta) {
  if (!respuesta || !respuesta.redirected) return respuesta;
  try {
    const cuerpo = await respuesta.clone().blob();
    return new Response(cuerpo, {
      status: respuesta.status,
      statusText: respuesta.statusText,
      headers: respuesta.headers
    });
  } catch (e) {
    // Si por algun motivo no se pudo reconstruir, se devuelve la
    // original -- peor es nada (sigue el comportamiento de antes).
    return respuesta;
  }
}

// Instala: guarda en caché las páginas principales
//
// Fix (07-09-2026): cache.addAll() es TODO O NADA -- si UN SOLO archivo
// de la lista falla al descargar (muy probable con la señal de interior
// mina), la promesa entera se rechaza. Eso no significa solo "faltó
// cachear un archivo": el evento 'install' entero falla, así que ESTE
// Service Worker nuevo nunca llega a activarse -- el navegador se queda
// sirviendo la versión VIEJA indefinidamente (incluyendo el
// ciz-dt-conectado.html viejo, sin el fix de duplicación), y reintenta
// la instalación completa desde cero la próxima vez, con el mismo
// resultado si la señal sigue igual de mala. Es decir: justo quien peor
// señal tiene es quien menos chance tenía de recibir cualquier
// actualización por esta vía -- esto es lo que más probablemente le
// pasó a Bastián con el fix del 06-09.
//
// Ahora cada archivo se cachea por separado y un fallo individual queda
// contenido (se avisa por consola, nada más): el Service Worker SIEMPRE
// termina de instalarse y activarse, aunque algún archivo secundario
// (ej. un plano pesado) no se haya podido descargar en ese momento --
// ese archivo puntual se cachea solo un poco más tarde, la primera vez
// que se pida con señal (ver el 'fetch' de más abajo, que ya cachea
// cualquier cosa que se descargue con éxito).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        ARCHIVOS_PROPIOS.map((ruta) =>
          fetch(ruta)
            .then((respuesta) => {
              if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
              return limpiarRespuesta(respuesta);
            })
            .then((limpia) => cache.put(ruta, limpia))
            .catch((err) => {
              console.warn('Service Worker: no se pudo cachear (se reintentará solo más adelante):', ruta, err);
            })
        )
      )
    )
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
      .then((respuesta) => limpiarRespuesta(respuesta).then((limpia) => {
        const copia = limpia.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return limpia;
      }))
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
