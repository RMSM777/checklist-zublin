/* ============================================================
   QC Digital - Integracion con Google Drive + Google Sheets
   ------------------------------------------------------------
   Sube el PDF generado a Google Drive y registra una fila en la
   Google Sheet que consulta verificar.html (asi el QR de cada PDF
   deja de apuntar a "no encontrado").

   Como funciona (sin backend, 100% en el navegador):
   - Usa Google Identity Services (GIS) para pedir un token OAuth
     con scope drive.file + spreadsheets. El usuario inicia sesion
     con Google la primera vez que genera un PDF en cada sesion del
     navegador (aparece el selector de cuenta de Google).
   - Con ese token sube el PDF a la carpeta de Drive "QC Digital"
     (organizado en subcarpetas por tipo de reporte, igual que ya
     estaba organizado a mano) y agrega una fila a la Google Sheet
     "QC Digital - Repositorio".

   CONFIGURACION: ya completada, no hay nada que rellenar.
   - CLIENT_ID: se recupero el cliente OAuth que ya existia en el
     proyecto de Google Cloud "QC Digital" (qc-digital-504403),
     creado el 3-ago-2026 ("QC Digital Web Client"). Sus origenes
     de JavaScript autorizados ya incluian qcdigital.cl,
     www.qcdigital.cl y reportes.qcdigital.cl, asi que no hubo que
     tocar nada en Cloud Console.
   - Google Drive API y Google Sheets API ya estaban habilitadas en
     ese mismo proyecto.
   - Si en algun momento hay que revisarlo o rotarlo: Google Cloud
     Console > proyecto "QC Digital" > Google Auth Platform >
     Clientes > "QC Digital Web Client".
   - Si la pantalla de consentimiento OAuth esta en modo "Prueba",
     cada inspector nuevo que vaya a generar reportes debe agregarse
     como "Usuario de prueba" ahi (Google Auth Platform > Publico),
     o el login le va a fallar con "app no verificada / acceso
     bloqueado".
   - SPREADSHEET_ID y QC_DIGITAL_ROOT_FOLDER_ID mas abajo apuntan a
     los recursos reales que ya existian en Drive (carpeta
     "QC Digital" y la Sheet "QC Digital - Repositorio" con mas
     movimiento). Si prefieres usar otra carpeta/Sheet, reemplaza
     los ID (se sacan de la URL: drive.google.com/drive/folders/AQUI
     o docs.google.com/spreadsheets/d/AQUI/edit).
   ============================================================ */
(function () {
  'use strict';

  const CLIENT_ID = '222108340553-3bvhd6qko8f2i8g943eblk98tckkq51v.apps.googleusercontent.com';

  // --- Ya completados con los recursos reales encontrados en Drive ---
  const SPREADSHEET_ID = '1YTi7y50sFsj3RPHIqRuHPbzxyctflSKBl_jue6FyaRs';
  const SHEET_RANGE = 'Hoja 1!A:I';
  const QC_DIGITAL_ROOT_FOLDER_ID = '1xJcaByBmatpXBY-10a3WnkMpQbItVRfx';

  const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiry = 0;
  let gisReadyPromise = null;
  const carpetaPorTipoCache = {};

  function cargarGIS() {
    if (gisReadyPromise) return gisReadyPromise;
    gisReadyPromise = new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar Google Identity Services (revisa la conexion a internet).'));
      document.head.appendChild(s);
    });
    return gisReadyPromise;
  }

  async function asegurarToken() {
    if (!CLIENT_ID) {
      throw new Error('QCD_DRIVE no esta configurado todavia (falta CLIENT_ID en drive-integration.js).');
    }
    if (accessToken && Date.now() < tokenExpiry - 60000) {
      return accessToken;
    }
    await cargarGIS();
    return new Promise((resolve, reject) => {
      try {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (resp) => {
            if (resp && resp.error) {
              reject(new Error('No se pudo iniciar sesion con Google: ' + resp.error));
              return;
            }
            accessToken = resp.access_token;
            tokenExpiry = Date.now() + (Number(resp.expires_in || 3500) * 1000);
            resolve(accessToken);
          },
          error_callback: (err) => {
            reject(new Error('Login de Google cancelado o fallido: ' + (err && err.type ? err.type : 'desconocido')));
          }
        });
        tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
      } catch (e) {
        reject(e);
      }
    });
  }

  function blobABase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('No se pudo leer el PDF generado.'));
      reader.readAsDataURL(blob);
    });
  }

  async function llamarDrive(url, opciones) {
    const token = await asegurarToken();
    const headers = Object.assign({ Authorization: 'Bearer ' + token }, opciones.headers || {});
    const resp = await fetch(url, Object.assign({}, opciones, { headers }));
    if (!resp.ok) {
      let detalle = '';
      try { detalle = await resp.text(); } catch (e) { /* ignorar */ }
      throw new Error('Google API respondio ' + resp.status + ': ' + detalle.slice(0, 300));
    }
    return resp.json();
  }

  // Busca (o crea) la subcarpeta de Drive para un tipo de reporte, dentro
  // de la carpeta raiz "QC Digital". Cachea el resultado en memoria para
  // no repetir la busqueda en cada PDF de la misma sesion.
  async function carpetaParaTipo(tipoReporte) {
    const nombre = tipoReporte || 'Otros';
    if (carpetaPorTipoCache[nombre]) return carpetaPorTipoCache[nombre];

    const q = encodeURIComponent(
      "name = '" + nombre.replace(/'/g, "\\'") + "' and '" + QC_DIGITAL_ROOT_FOLDER_ID +
      "' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    );
    const busqueda = await llamarDrive(
      'https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name)&spaces=drive',
      { method: 'GET' }
    );
    if (busqueda.files && busqueda.files.length) {
      carpetaPorTipoCache[nombre] = busqueda.files[0].id;
      return carpetaPorTipoCache[nombre];
    }

    const nueva = await llamarDrive('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nombre,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [QC_DIGITAL_ROOT_FOLDER_ID]
      })
    });
    carpetaPorTipoCache[nombre] = nueva.id;
    return nueva.id;
  }

  async function subirArchivoDrive({ blob, nombreArchivo, tipoReporte }) {
    const carpetaId = await carpetaParaTipo(tipoReporte);
    const metadata = {
      name: nombreArchivo,
      mimeType: 'application/pdf',
      parents: [carpetaId]
    };
    const base64Data = await blobABase64(blob);
    const boundary = 'qcd_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const cuerpo =
      '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: application/pdf\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Data + '\r\n' +
      '--' + boundary + '--';

    const subido = await llamarDrive(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body: cuerpo
      }
    );

    // Deja el archivo visible con el link (solo lectura) para que el boton
    // "Ver documento original" de verificar.html funcione sin pedir login.
    try {
      await llamarDrive('https://www.googleapis.com/drive/v3/files/' + subido.id + '/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      });
    } catch (e) {
      console.warn('QCD_DRIVE: no se pudo hacer publico el link (el archivo igual quedo subido).', e);
    }

    return {
      id: subido.id,
      driveLink: subido.webViewLink || ('https://drive.google.com/file/d/' + subido.id + '/view')
    };
  }

  async function registrarEnSheet(fila) {
    const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + SPREADSHEET_ID +
      '/values/' + encodeURIComponent(SHEET_RANGE) + ':append?valueInputOption=USER_ENTERED';
    await llamarDrive(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [fila] })
    });
  }

  async function subirUnaVez(datos) {
    const { driveLink } = await subirArchivoDrive(datos);
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString('es-CL');
    const hora = ahora.toLocaleTimeString('es-CL');
    await registrarEnSheet([
      fecha,
      hora,
      datos.tipoReporte || '',
      datos.correlativo || '',
      datos.empresa || '',
      datos.generadoPor || '',
      datos.nombreArchivo || '',
      driveLink,
      // Columna I: clave unica de verificacion (correlativo + sufijo).
      // La usa verificar.html para no confundir documentos con el mismo
      // correlativo (ver MARCA.claveVerificacion en marca.js).
      datos.claveVerificacion || ''
    ]);
    return { driveLink };
  }

  async function subirConReintento(datos) {
    try {
      return await subirUnaVez(datos);
    } catch (primerError) {
      console.warn('QCD_DRIVE: primer intento de subida fallo, reintentando en 1.5s...', primerError);
      await new Promise((r) => setTimeout(r, 1500));
      return subirUnaVez(datos);
    }
  }

  window.QCD_DRIVE = {
    asegurarToken: asegurarToken,
    subirConReintento: subirConReintento
  };
})();
