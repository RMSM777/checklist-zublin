/* ============================================================
   DRIVE-INTEGRATION.JS - Modulo de guardado en Google Drive
   + repositorio en Google Sheets
   QC Digital

   Requiere, ANTES de este script, en el <head> de cada reporte:
     <script src="https://accounts.google.com/gsi/client" async defer></script>

   Uso desde cada reporte, justo despues de doc.save(nombreArch):

     QCD_DRIVE.subir({
       blob: doc.output('blob'),
       nombreArchivo: nombreArch,
       tipoReporte: 'Reporte diario',        // nombre de la subcarpeta en Drive
       correlativo: corr,                    // el que entrega MARCA.correlativo()
       empresa: MARCA.empresa.nombreCorto,
       generadoPor: gen
     }).then(function(res){
       console.log('Subido a Drive:', res.driveLink);
     }).catch(function(err){
       console.warn('No se pudo subir a Drive (el PDF local se genero igual):', err);
     });

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

  async function apiFetch(url, options){
    options = options || {};
    const token = await obtenerToken();
    const headers = Object.assign({}, options.headers || {}, { 'Authorization': 'Bearer ' + token });
    const resp = await fetch(url, Object.assign({}, options, { headers }));
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
    const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: form
    });
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
    await apiFetch('https://www.googleapis.com/drive/v3/files/' + sheetId + '?addParents=' + raizId + '&removeParents=root');
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

  window.QCD_DRIVE = { subir };
})();
