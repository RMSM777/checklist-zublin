/* ============================================================
   DRIVE-INTEGRATION.JS - Modulo de guardado en Google Drive
   + repositorio en Google Sheets
   QC Digital

   Requiere, ANTES de este script, en el <head> de cada reporte:
     <script src="https://accounts.google.com/gsi/client" async defer></script>

   Uso desde cada reporte, justo despues de doc.save(nombreArch):

     QCD_DRIVE.subirConReintento({
       blob: doc.output('blob'),
       nombreArchivo: nombreArch,
       tipoReporte: 'Reporte diario',        // nombre de la subcarpeta en Drive
       correlativo: corr,                    // el que entrega MARCA.correlativo()
       empresa: MARCA.empresa.nombreCorto,
       generadoPor: gen
     }).then(function(res){
       console.log('Subido a Drive:', res.driveLink);
     }).catch(function(err){
       console.warn('No se pudo subir a Drive (se encolo para reintento automatico; el PDF local se genero igual):', err);
     });

   subirConReintento() se comporta igual que subir() (mismo error en el
   catch, para no romper el mensaje que cada reporte ya muestra), pero
   si falla, ademas guarda el PDF completo en una cola local (IndexedDB)
   y lo reintenta solo mas adelante (al abrir cualquier reporte o
   cuando vuelve la señal). subir() sigue disponible tal cual para
   quien no quiera la cola.

   Diseño:
   - No bloquea nunca la descarga local del PDF: si falla la subida a
     Drive, el usuario ya tiene su PDF descargado de todas formas.
   - La primera vez que un usuario lo usa en su navegador, Google le
     pide autorizacion (popup). Despues queda un token guardado en
     localStorage hasta que expira (normalmente ~1 hora), y se vuelve
     a pedir solo, sin volver a mostrar el consentimiento completo.
   - Carpeta raiz "QC Digital" + una subcarpeta por tipo de reporte,
     creadas automaticamente la primera vez, en el Drive del propio
     usuario que genera el reporte (cada inspector guarda en el suyo).
   - Un repositorio "QC Digital - Repositorio" (Google Sheet) dentro
     de esa misma carpeta raiz, con una fila por cada PDF generado.
   ============================================================ */

(function(){
  const CLIENT_ID = '222108340553-3bvhd6qko8f2i8g943eblk98tckkq51v.apps.googleusercontent.com';
  const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';
  const CARPETA_RAIZ = 'QC Digital';
  const NOMBRE_SHEET = 'QC Digital - Repositorio';
  const LS_TOKEN = 'qcd_drive_token';
  const LS_TOKEN_EXP = 'qcd_drive_token_exp';
  const LS_CARPETAS = 'qcd_drive_carpetas';
  const LS_SHEET_ID = 'qcd_drive_sheet_id';
  const ENCABEZADOS = ['Fecha','Hora','Tipo de reporte','Correlativo','Empresa','Generado por','Nombre archivo','Link Drive'];

  let tokenClient = null;
  let accessToken = null;

  function cargarTokenGuardado(){
    try{
      const exp = parseInt(localStorage.getItem(LS_TOKEN_EXP) || '0', 10);
      if(exp > Date.now() + 30000){
        accessToken = localStorage.getItem(LS_TOKEN);
        return accessToken;
      }
    }catch(e){}
    return null;
  }

  function guardarToken(tok, expiresInSec){
    accessToken = tok;
    try{
      localStorage.setItem(LS_TOKEN, tok);
      localStorage.setItem(LS_TOKEN_EXP, String(Date.now() + (expiresInSec * 1000)));
    }catch(e){}
  }

  function initTokenClient(){
    if(tokenClient) return tokenClient;
    if(!window.google || !google.accounts || !google.accounts.oauth2){
      throw new Error('Google Identity Services no cargo. Falta <script src="https://accounts.google.com/gsi/client"> en el head.');
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: () => {}
    });
    return tokenClient;
  }

  function obtenerToken(){
    return new Promise((resolve, reject) => {
      const cached = cargarTokenGuardado();
      if(cached){ resolve(cached); return; }
      try{
        const tc = initTokenClient();
        tc.callback = (resp) => {
          if(resp.error){ reject(new Error('Autorizacion Google fallo: ' + resp.error)); return; }
          guardarToken(resp.access_token, resp.expires_in || 3600);
          resolve(resp.access_token);
        };
        tc.requestAccessToken({ prompt: '' });
      }catch(e){ reject(e); }
    });
  }

  function fetchConTimeout(url, options, timeoutMs){
    timeoutMs = timeoutMs || 12000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    options = Object.assign({}, options, { signal: controller.signal });
    return fetch(url, options)
      .finally(() => clearTimeout(timer))
      .catch(e => {
        if(e && e.name === 'AbortError'){
          throw new Error('Sin respuesta de Google Drive (revisa tu conexion a internet).');
        }
        throw e;
      });
  }

  async function apiFetch(url, options){
    options = options || {};
    const token = await obtenerToken();
    const headers = Object.assign({}, options.headers || {}, { 'Authorization': 'Bearer ' + token });
    const resp = await fetchConTimeout(url, Object.assign({}, options, { headers }));
    if(!resp.ok){
      const txt = await resp.text().catch(() => '');
      throw new Error('Google API error ' + resp.status + ': ' + txt.slice(0, 300));
    }
    return resp;
  }

  // --- Carpetas ---
  async function buscarCarpeta(nombre, padreId){
    let q = "mimeType='application/vnd.google-apps.folder' and name='" + nombre.replace(/'/g, "\\'") + "' and trashed=false";
    if(padreId) q += " and '" + padreId + "' in parents";
    const url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)&spaces=drive';
    const resp = await apiFetch(url);
    const data = await resp.json();
    return (data.files && data.files[0]) ? data.files[0].id : null;
  }

  async function crearCarpeta(nombre, padreId){
    const metadata = { name: nombre, mimeType: 'application/vnd.google-apps.folder' };
    if(padreId) metadata.parents = [padreId];
    const resp = await apiFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata)
    });
    const data = await resp.json();
    return data.id;
  }

  async function obtenerOCrearCarpeta(nombre, padreId){
    let id = await buscarCarpeta(nombre, padreId);
    if(!id) id = await crearCarpeta(nombre, padreId);
    return id;
  }

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  function leerCacheCarpetas(){
    try{ return JSON.parse(localStorage.getItem(LS_CARPETAS) || '{}'); }catch(e){ return {}; }
  }
  function guardarCacheCarpetas(cache){
    try{ localStorage.setItem(LS_CARPETAS, JSON.stringify(cache)); }catch(e){}
  }

  /* Estructura en Drive: QC Digital (raiz, compartida con el equipo)
       > <Tipo de reporte>   ej: "Reporte diario"
         > <Año>             ej: "2026"
           > <Mes>           ej: "Agosto"
     La carpeta raiz se busca SIN restringir por dueño: si el usuario
     autenticado tiene una carpeta "QC Digital" compartida con el (por
     ejemplo, compartida por el administrador de QC Digital), la
     encuentra y reutiliza esa misma carpeta centralizada en vez de
     crear una nueva en su propio Drive. */
  async function obtenerCarpetaReporte(tipoReporte){
    const ahora = new Date();
    const anio = String(ahora.getFullYear());
    const mes = MESES[ahora.getMonth()];
    const claveRuta = tipoReporte + '|' + anio + '|' + mes;

    const cache = leerCacheCarpetas();
    if(cache.raizId && cache.rutas && cache.rutas[claveRuta]){
      return { raizId: cache.raizId, subId: cache.rutas[claveRuta] };
    }

    const raizId = cache.raizId || await obtenerOCrearCarpeta(CARPETA_RAIZ, null);
    const tipoId = await obtenerOCrearCarpeta(tipoReporte, raizId);
    const anioId = await obtenerOCrearCarpeta(anio, tipoId);
    const mesId = await obtenerOCrearCarpeta(mes, anioId);

    const nuevasRutas = Object.assign({}, cache.rutas || {});
    nuevasRutas[claveRuta] = mesId;
    guardarCacheCarpetas({ raizId, rutas: nuevasRutas });
    return { raizId, subId: mesId };
  }

  // --- Subir PDF ---
  async function subirPDF(blob, nombreArchivo, carpetaId){
    const token = await obtenerToken();
    const metadata = { name: nombreArchivo, parents: [carpetaId], mimeType: 'application/pdf' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    const resp = await fetchConTimeout('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: form
    }, 20000);
    if(!resp.ok){
      const txt = await resp.text().catch(() => '');
      throw new Error('Error subiendo PDF a Drive: ' + resp.status + ' ' + txt.slice(0, 300));
    }
    return resp.json();
  }

  // --- Sheet repositorio ---
  async function obtenerOCrearSheet(raizId){
    let id = null;
    try{ id = localStorage.getItem(LS_SHEET_ID); }catch(e){}
    if(id){
      try{
        await apiFetch('https://www.googleapis.com/drive/v3/files/' + id + '?fields=id');
        return id;
      }catch(e){ /* referencia invalida: se recrea abajo */ }
    }
    const q = "name='" + NOMBRE_SHEET.replace(/'/g, "\\'") + "' and '" + raizId + "' in parents and trashed=false";
    const url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id)&spaces=drive';
    const resp = await apiFetch(url);
    const data = await resp.json();
    if(data.files && data.files[0]){
      try{ localStorage.setItem(LS_SHEET_ID, data.files[0].id); }catch(e){}
      return data.files[0].id;
    }
    const createResp = await apiFetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { title: NOMBRE_SHEET } })
    });
    const createData = await createResp.json();
    const sheetId = createData.spreadsheetId;
    await apiFetch('https://www.googleapis.com/drive/v3/files/' + sheetId + '?addParents=' + raizId + '&removeParents=root', {
      method: 'PATCH'
    });
    await apiFetch('https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/A1:H1?valueInputOption=RAW', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [ENCABEZADOS] })
    });
    try{ localStorage.setItem(LS_SHEET_ID, sheetId); }catch(e){}
    return sheetId;
  }

  async function agregarFilaSheet(sheetId, fila){
    await apiFetch('https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/A:H:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [fila] })
    });
  }

  // --- API publica ---
  async function subir(opts){
    opts = opts || {};
    const { blob, nombreArchivo, tipoReporte, correlativo, empresa, generadoPor } = opts;
    if(!blob || !nombreArchivo || !tipoReporte){
      throw new Error('QCD_DRIVE.subir: faltan parametros obligatorios (blob, nombreArchivo, tipoReporte).');
    }
    const { raizId, subId } = await obtenerCarpetaReporte(tipoReporte);
    const archivoSubido = await subirPDF(blob, nombreArchivo, subId);
    const sheetId = await obtenerOCrearSheet(raizId);
    const ahora = new Date();
    const fila = [
      ahora.toLocaleDateString('es-CL'),
      ahora.toLocaleTimeString('es-CL'),
      tipoReporte,
      correlativo || '-',
      empresa || '-',
      generadoPor || '-',
      nombreArchivo,
      archivoSubido.webViewLink || ''
    ];
    await agregarFilaSheet(sheetId, fila);
    return { driveFileId: archivoSubido.id, driveLink: archivoSubido.webViewLink, sheetId };
  }

  // --- Cola de reintento (IndexedDB) ---
  // Si una subida falla (sin señal, timeout, error de Google), el PDF
  // completo se guarda aqui junto a sus metadatos. Se reintenta solo:
  // al abrir cualquier reporte y cuando vuelve la conexion (evento
  // 'online'). El usuario tambien puede forzar el reintento desde el
  // aviso que se auto-inyecta cuando hay pendientes.
  const DB_NAME = 'qcd_drive_queue';
  const DB_STORE = 'pendientes';

  function abrirDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(DB_STORE)){
          db.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function encolarPendiente(opts){
    try{
      const db = await abrirDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).add(Object.assign({}, opts, {
          fechaEncolado: new Date().toISOString(), intentos: 0
        }));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }catch(e){ console.warn('QCD_DRIVE: no se pudo encolar para reintento.', e); }
  }

  async function listarPendientes(){
    try{
      const db = await abrirDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }catch(e){ return []; }
  }

  async function eliminarPendiente(id){
    try{
      const db = await abrirDB();
      await new Promise((resolve) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    }catch(e){}
  }

  async function marcarIntento(id, intentos){
    try{
      const db = await abrirDB();
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result;
        if(item){
          item.intentos = intentos;
          item.ultimoIntento = new Date().toISOString();
          store.put(item);
        }
      };
    }catch(e){}
  }

  let reintentando = false;

  async function reintentarPendientes(){
    if(reintentando) return { intentados: 0, exitosos: 0 };
    reintentando = true;
    try{
      const pendientes = await listarPendientes();
      let exitosos = 0;
      for(const item of pendientes){
        try{
          await subir(item);
          await eliminarPendiente(item.id);
          exitosos++;
        }catch(e){
          await marcarIntento(item.id, (item.intentos || 0) + 1);
        }
      }
      await pintarAvisoPendientes();
      return { intentados: pendientes.length, exitosos };
    } finally {
      reintentando = false;
    }
  }

  // Subida "segura": si falla, encola para reintento automatico en vez
  // de perder el reporte. Sigue lanzando el error igual que subir(),
  // para no romper el catch() que cada reporte ya tiene (su propio
  // mensaje en pantalla no cambia).
  async function subirConReintento(opts){
    try{
      const res = await subir(opts);
      pintarAvisoPendientes();
      return res;
    }catch(err){
      await encolarPendiente(opts);
      pintarAvisoPendientes();
      throw err;
    }
  }

  function inyectarEstilosAviso(){
    if(document.getElementById('qcdDriveEstilos')) return;
    const style = document.createElement('style');
    style.id = 'qcdDriveEstilos';
    style.textContent =
      '.qcd-drive-pendientes{ position:fixed; top:8px; right:8px; z-index:9997; ' +
      'max-width:220px; background:#fff8e1; border:1px solid #ffca28; color:#7a5c00; ' +
      'font-size:11.5px; line-height:1.4; padding:8px 10px; border-radius:10px; ' +
      'box-shadow:0 2px 10px rgba(0,0,0,.18); }' +
      '.qcd-drive-pendientes button{ display:block; margin-top:6px; width:100%; border:none; ' +
      'background:#7a5c00; color:#fff; font-size:11px; font-weight:700; padding:6px 8px; ' +
      'border-radius:6px; cursor:pointer; }' +
      'html.dark .qcd-drive-pendientes{ background:#2a2410; border-color:#5c4a10; color:#ffd977; }' +
      'html.dark .qcd-drive-pendientes button{ background:#5c4a10; color:#ffe8a3; }';
    document.head.appendChild(style);
  }

  async function pintarAvisoPendientes(){
    const pendientes = await listarPendientes();
    let el = document.querySelector('.qcd-drive-pendientes');
    if(!pendientes.length){
      if(el) el.remove();
      return;
    }
    inyectarEstilosAviso();
    if(!el){
      el = document.createElement('div');
      el.className = 'qcd-drive-pendientes';
      document.body.appendChild(el);
    }
    const n = pendientes.length;
    el.innerHTML = '\u26A0\uFE0F ' + n + ' reporte' + (n > 1 ? 's' : '') + ' sin subir a Drive'
      + '<button type="button">Reintentar ahora</button>';
    el.querySelector('button').addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      ev.target.textContent = 'Subiendo...';
      await reintentarPendientes();
    });
  }

  // Reintento automatico: al cargar la pagina (con un pequeño respiro
  // para no competir con el resto de la carga inicial) y cuando el
  // navegador avisa que volvio la conexion.
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => { pintarAvisoPendientes(); setTimeout(reintentarPendientes, 2500); });
  } else {
    pintarAvisoPendientes();
    setTimeout(reintentarPendientes, 2500);
  }
  window.addEventListener('online', () => { reintentarPendientes(); });

  async function asegurarToken(){
    try{ await obtenerToken(); return true; }catch(e){ console.warn('QCD_DRIVE: no se pudo pre-autorizar Google Drive.', e); return false; }
  }

  window.QCD_DRIVE = { subir, subirConReintento, asegurarToken, reintentarPendientes, listarPendientes };
})();
