/* ======================================================================
   supabase-integration.js — módulo compartido para los 10 reportes PDF
   clásicos (Checklist camioneta, Reporte diario, Reporte DT, Informe
   procesos constructivos, Listado de firmas, PNC/RNC, etc.)

   Reusa TAL CUAL el patrón de sesión / reintento / storage que ya usan
   login.html, app-inicio.html y ciz-dt-conectado.html: misma sesión
   guardada bajo la clave 'cizdt_sesion' en localStorage, mismo proyecto
   de Supabase (wbdmlwmnmompoamvlant). Entrar una vez en login.html sirve
   para toda la suite — incluidos estos reportes.

   Lo único nuevo que agrega, respecto a lo que ya existe:
     - subirArchivo(bucket, ruta, blob)  → sube a cualquier bucket (se usa
       para 'reportes-pdf', igual que subirFoto() ya sube a 'fotos-dt')
     - guardarReportePDF({...})          → sube el PDF + inserta la fila
       en la tabla reportes_pdf (ver claude/MIGRACION-SUPABASE.md, sección 3)
     - actualizarLogExcel(tipoReporte)   → (28-ago) reconstruye, desde la
       tabla reportes_pdf, un log.xlsx dentro de la carpeta de ese reporte
       en el bucket (p.ej. 'checklist-camioneta/log.xlsx'). Reemplaza el
       Sheet único de Drive (Hoja 1!A:I de drive-integration.js) por un
       Excel por reporte con las mismas columnas. guardarReportePDF() ya
       la llama sola al final — no hace falta invocarla a mano.
       Requiere la librería SheetJS (XLSX) cargada en la página — usa el
       archivo ya vendorizado en el repo, ANTES de este script:
         <script src="xlsx.full.min.js"></script>
       Si no está cargada, se salta en silencio (console.warn) y el
       guardado del PDF + la fila en la tabla NO se ven afectados — el
       log.xlsx es un extra de mejor esfuerzo, nunca bloquea el guardado
       real (que siempre vive, sin riesgo de pérdida, en la tabla).

       (28-ago, v3) El log.xlsx ahora también lleva el logo de la
       empresa activa (vía MARCA.logoDataUrl) y un encabezado con el
       nombre de la empresa, mismo criterio "plantilla" del resto de la
       suite. Para esto hace falta, ADEMÁS de xlsx.full.min.js, también
       JSZip (ya vendorizado, usado por el mismo truco en app-inicio.html
       para el Excel de Caminatas/DT) y que marca.js se cargue ANTES que
       este archivo:
         <script src="marca.js?v=2"></script>
         <script src="jszip.min.js"></script>
         <script src="xlsx.full.min.js"></script>
         <script src="supabase-integration.js?v=3"></script>
       Si falta JSZip o marca.js/MARCA aún no cargó el logo, el log.xlsx
       se genera igual, solo que sin el logo — nunca bloquea nada.

   ⚠️ IMPORTANTE — dónde va este archivo y cómo se incluye:
     - Sube este archivo a la raíz del repo (junto a drive-integration.js).
     - En cada uno de los 10 reportes, agrega ANTES de tu script propio:
         <script src="supabase-integration.js"></script>
     - Como este archivo ya declara SB_URL, SB_KEY, almacen, SB, etc.,
       el script propio de cada reporte NO debe volver a declararlos
       (daría error "Identifier has already been declared"). Si el
       reporte tiene su propio bloque de sesión/Supabase copiado a mano,
       hay que borrarlo y dejar que este archivo sea la única fuente.
     - Este archivo NO reemplaza drive-integration.js por sí solo — solo
       agrega la vía Supabase. El paso de quitar la subida a Drive de
       cada reporte se hace reporte por reporte (ver sección 6 del plan).

   Cómo usarlo en cada reporte, paso a paso:

     1) Al cargar la página (por ejemplo en un window.addEventListener
        DOMContentLoaded, o al inicio de tu script), llamar:

          const haySesion = await requerirSesion('checklist-camioneta.html');
          if(!haySesion) return;  // ya se está redirigiendo a login.html

     2) Cuando el PDF ya esté generado como Blob (el mismo que hoy subes
        a Drive), llamar:

          const fila = await guardarReportePDF({
            tipoReporte: 'checklist-camioneta',      // slug corto y fijo por reporte
            correlativo: 'CAM-000123',                // el correlativo que ya usas
            claveVerificacion: 'A1B2C3',               // el código que hoy va en el QR
            empresa: 'Züblin',                         // opcional
            generadoPor: 'Rodrigo Moraga',             // nombre libre, como hoy
            blobPDF: elBlobDelPDF,
            nombreArchivo: 'ChecklistCamioneta_Rodrigo_20260827.pdf',
            metadata: { turno: 'noche' }               // opcional, cualquier objeto
          });
          // fila.id, fila.storage_path, etc. — ya quedó guardado en Supabase.

   Requiere que antes se haya corrido en Supabase el SQL de la sección 3
   de claude/MIGRACION-SUPABASE.md (tabla reportes_pdf) y que exista el
   bucket 'reportes-pdf' en Storage — ver sección 6 del mismo documento.
   ====================================================================== */

const SB_URL = 'https://wbdmlwmnmompoamvlant.supabase.co';
const SB_KEY = 'sb_publishable_0SWuQqmBvxJYNKIal8MQNQ_NbyEMCCe';
const BUCKET_REPORTES = 'reportes-pdf';
const TABLA_REPORTES = 'reportes_pdf';

/* ---------- almacen: localStorage con caída a memoria (igual que el resto de la suite) ---------- */
const almacen = (function(){
  let mem = {}, ok = false;
  try { window.localStorage.setItem('__t','1'); window.localStorage.removeItem('__t'); ok = true; } catch(e){ ok = false; }
  return {
    disponible: ok,
    get(k){ try { return ok ? window.localStorage.getItem(k) : (k in mem ? mem[k] : null); } catch(e){ return k in mem ? mem[k] : null; } },
    set(k,v){ try { if(ok) window.localStorage.setItem(k,v); else mem[k]=v; } catch(e){ mem[k]=v; throw e; } },
    del(k){ try { if(ok) window.localStorage.removeItem(k); else delete mem[k]; } catch(e){ delete mem[k]; } }
  };
})();

async function pedirRed(url, opts){
  try { return await fetch(url, opts); }
  catch(e){ const err = new Error('__SIN_SENAL__'); err.red = true; throw err; }
}

async function leerJSON(r){
  const txt = await r.text();
  if(txt === '') return null;
  try { return JSON.parse(txt); }
  catch(e){
    const sinSenal = !navigator.onLine || r.status === 503 || r.status === 0;
    const err = new Error(sinSenal
      ? '__SIN_SENAL__'
      : 'La respuesta no vino de la base. Puede que la sesión de acceso haya vencido: vuelve a entrar cuando tengas señal.');
    err.noEsJson = true; err.estado = r.status;
    throw err;
  }
}

/* ---------- SB: el mismo objeto de sesión que usa ciz-dt-conectado.html, + subirArchivo ---------- */
const SB = {
  ses: null,

  cargar(){
    try { this.ses = JSON.parse(almacen.get('cizdt_sesion') || 'null'); } catch(e){ this.ses = null; }
    return this.ses;
  },
  persistir(){ try { almacen.set('cizdt_sesion', JSON.stringify(this.ses)); } catch(e){} },
  limpiar(){ this.ses = null; almacen.del('cizdt_sesion'); },

  async login(email, password){
    const r = await pedirRed(SB_URL + '/auth/v1/token?grant_type=password', {
      method:'POST',
      headers:{ 'apikey': SB_KEY, 'Content-Type':'application/json' },
      body: JSON.stringify({ email: email, password: password })
    });
    const j = await leerJSON(r);
    if(!r.ok) throw new Error((j && (j.error_description || j.msg || j.message)) || 'No se pudo iniciar sesion');
    this.ses = { access: j.access_token, refresh: j.refresh_token, email: (j.user && j.user.email) || email,
                 uid: j.user && j.user.id, vence: Date.now() + ((j.expires_in || 3600) * 1000) };
    this.persistir();
    return this.ses;
  },

  async refrescar(){
    if(!this.ses || !this.ses.refresh) throw new Error('Sin sesion');
    const r = await pedirRed(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
      method:'POST',
      headers:{ 'apikey': SB_KEY, 'Content-Type':'application/json' },
      body: JSON.stringify({ refresh_token: this.ses.refresh })
    });
    const j = await leerJSON(r);
    if(!r.ok) throw new Error('Sesion expirada');
    this.ses.access = j.access_token;
    this.ses.refresh = j.refresh_token || this.ses.refresh;
    this.ses.vence = Date.now() + ((j.expires_in || 3600) * 1000);
    this.persistir();
    return this.ses;
  },

  cabeceras(extra){
    const h = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + (this.ses ? this.ses.access : '') };
    return Object.assign(h, extra || {});
  },

  async pedir(url, opts, yaReintento){
    if(this.ses && this.ses.vence && Date.now() > this.ses.vence - 60000 && !yaReintento){
      try { await this.refrescar(); } catch(e){}
    }
    const r = await pedirRed(url, opts);
    if(r.status === 401 && !yaReintento){
      await this.refrescar();
      const o2 = Object.assign({}, opts);
      o2.headers = Object.assign({}, opts.headers, { 'Authorization': 'Bearer ' + this.ses.access });
      return this.pedir(url, o2, true);
    }
    return r;
  },

  async insertar(tabla, filas){
    const r = await this.pedir(SB_URL + '/rest/v1/' + tabla, {
      method:'POST',
      headers: this.cabeceras({ 'Content-Type':'application/json', 'Prefer':'return=representation' }),
      body: JSON.stringify(filas)
    });
    const j = await leerJSON(r);
    if(!r.ok) throw new Error((j && (j.message || j.hint)) || ('Error al guardar en ' + tabla));
    return j;
  },

  async actualizar(tabla, filtro, cambios){
    const r = await this.pedir(SB_URL + '/rest/v1/' + tabla + '?' + filtro, {
      method:'PATCH',
      headers: this.cabeceras({ 'Content-Type':'application/json', 'Prefer':'return=representation' }),
      body: JSON.stringify(cambios)
    });
    const j = await leerJSON(r);
    if(!r.ok) throw new Error((j && j.message) || ('Error al actualizar ' + tabla));
    return j;
  },

  async consultar(tabla, query){
    const r = await this.pedir(SB_URL + '/rest/v1/' + tabla + '?' + query, {
      method:'GET', headers: this.cabeceras()
    });
    const j = await leerJSON(r);
    if(!r.ok) throw new Error((j && j.message) || ('Error al leer ' + tabla));
    return j;
  },

  /* NUEVO: sube cualquier archivo (blob) a un bucket dado — igual patrón
     que subirFoto() de ciz-dt-conectado.html, pero genérico en bucket y
     tipo de contenido, así sirve para PDFs además de fotos. */
  async subirArchivo(bucket, ruta, blob, tipo){
    const r = await this.pedir(SB_URL + '/storage/v1/object/' + bucket + '/' + ruta, {
      method:'POST',
      headers: this.cabeceras({ 'Content-Type': tipo || blob.type || 'application/pdf', 'x-upsert':'true' }),
      body: blob
    });
    if(!r.ok){
      let t = ''; try { t = JSON.stringify(await r.json()); } catch(e){ t = r.status; }
      throw new Error('No se pudo subir el archivo: ' + t);
    }
    return ruta;
  }
};

/* ---------- requerirSesion: pegar esto al inicio de cada uno de los 10 reportes ----------
   Mismo criterio que ciz-dt-conectado.html: la sesión se valida LOCALMENTE
   (sin depender de tener señal en el momento), y solo se intenta refrescar
   el token si hay conexión. Devuelve false si redirigió a login.html —
   en ese caso el resto del script del reporte no debe seguir corriendo. */
async function requerirSesion(nombreArchivoActual){
  SB.cargar();
  if(!SB.ses || !SB.ses.refresh){
    location.replace('login.html?volver=' + encodeURIComponent(nombreArchivoActual));
    return false;
  }
  if(navigator.onLine){
    try { await SB.refrescar(); }
    catch(e){
      if(e && e.message === 'Sesion expirada'){
        SB.limpiar();
        location.replace('login.html?volver=' + encodeURIComponent(nombreArchivoActual));
        return false;
      }
      /* sin señal real (aunque navigator.onLine diga que sí): se sigue
         con la sesión guardada localmente, igual que hace el resto de
         la suite. */
    }
  }
  return true;
}

/* ---------- guardarReportePDF: lo nuevo que necesitan los 10 reportes clásicos ----------
   Sube el PDF al bucket reportes-pdf y crea la fila correspondiente en
   la tabla reportes_pdf (esquema en claude/MIGRACION-SUPABASE.md, sección 3).
   Devuelve la fila insertada (incluye el id generado). */
async function guardarReportePDF({ tipoReporte, correlativo, claveVerificacion, empresa, generadoPor, blobPDF, nombreArchivo, metadata }){
  if(!SB.ses) throw new Error('No hay sesión activa — llama a requerirSesion() antes de guardar el reporte.');
  if(!blobPDF) throw new Error('Falta el PDF (blobPDF) a subir.');
  if(!correlativo) throw new Error('Falta el correlativo del reporte.');

  const ruta = tipoReporte + '/' + correlativo + '_' + Date.now() + '.pdf';
  await SB.subirArchivo(BUCKET_REPORTES, ruta, blobPDF, 'application/pdf');

  const filas = await SB.insertar(TABLA_REPORTES, [{
    tipo_reporte: tipoReporte,
    correlativo: correlativo,
    clave_verificacion: claveVerificacion,
    empresa: empresa || null,
    generado_por: generadoPor || (SB.ses.email || null),
    generado_por_uid: SB.ses.uid || null,
    nombre_archivo: nombreArchivo,
    storage_path: ruta,
    metadata: metadata || null
  }]);

  if(!filas || !filas.length){
    throw new Error('La base no registró el reporte. Puede que tu cuenta no tenga permiso (revisa la política RLS de reportes_pdf — debe permitir insertar a usuarios "authenticated").');
  }

  /* Log en Excel: de mejor esfuerzo — si falla, no revienta el guardado
     real (el PDF y la fila ya quedaron guardados arriba). */
  try { await actualizarLogExcel(tipoReporte); }
  catch(e){ console.warn('No se pudo actualizar log.xlsx de ' + tipoReporte + ':', e); }

  return filas[0];
}

/* ---------- actualizarLogExcel: reconstruye el Excel-log de un tipo de reporte ----------
   Lee TODAS las filas de reportes_pdf para ese tipoReporte (la tabla es
   la fuente de verdad — nunca se pierde nada aunque esto falle) y sube
   un log.xlsx con esas mismas columnas a la carpeta del reporte en el
   bucket. Al reconstruirlo completo cada vez (en vez de "agregarle una
   fila" al archivo existente), dos inspectores guardando casi al mismo
   tiempo nunca se pisan datos entre sí: en el peor caso el log.xlsx
   queda un instante desactualizado en una fila, y se autocorrige solo
   la próxima vez que alguien guarde un reporte de ese tipo — la tabla
   reportes_pdf (no el Excel) es siempre el dato real. */
function _tituloTipoReporte(tipoReporte){
  return String(tipoReporte || '').replace(/-/g, ' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
}

async function actualizarLogExcel(tipoReporte){
  if(typeof XLSX === 'undefined'){
    console.warn('actualizarLogExcel: falta cargar la librería XLSX (SheetJS) en esta página — se omite el log.xlsx.');
    return;
  }
  const filas = await SB.consultar(
    TABLA_REPORTES,
    'tipo_reporte=eq.' + encodeURIComponent(tipoReporte) +
    '&select=creado_en,correlativo,clave_verificacion,empresa,generado_por,nombre_archivo,storage_path' +
    '&order=creado_en.asc'
  );

  const encabezado = ['Fecha', 'Hora', 'Correlativo', 'Clave verificación', 'Empresa', 'Generado por', 'Nombre archivo', 'Ruta en Supabase'];
  const filasHoja = (filas || []).map(function(f){
    const ts = f.creado_en ? new Date(f.creado_en) : null;
    return [
      ts ? ts.toLocaleDateString('es-CL') : '',
      ts ? ts.toLocaleTimeString('es-CL') : '',
      f.correlativo || '',
      f.clave_verificacion || '',
      f.empresa || '',
      f.generado_por || '',
      f.nombre_archivo || '',
      f.storage_path || ''
    ];
  });

  /* Encabezado institucional (fila 1: título, fila 2: empresa activa) —
     mismo criterio "plantilla" que el resto de la suite: el nombre y el
     logo salen de MARCA (empresa activa), no de un texto fijo, para que
     el mismo código sirva para Zublin, QC Digital o cualquier empresa
     que se agregue despues. Deja las columnas E en adelante libres para
     el logo (ver incrustarLogoEnExcel), igual que ya hace el Excel de
     Caminatas/DT en app-inicio.html. */
  const nombreEmpresa = (typeof MARCA !== 'undefined' && MARCA.empresa)
    ? (MARCA.empresa.nombreCorto || MARCA.empresa.nombre) : '';
  const filaTitulo = ['Log de reportes — ' + _tituloTipoReporte(tipoReporte)];
  const filaEmpresa = [nombreEmpresa ? (nombreEmpresa + ' · QC Digital') : 'QC Digital'];
  const filaEncabezadoIdx = 3; // 0-based: 0=titulo, 1=empresa, 2=espacio, 3=encabezado de columnas

  const aoa = [filaTitulo, filaEmpresa, []].concat([encabezado], filasHoja);
  const hoja = XLSX.utils.aoa_to_sheet(aoa);
  hoja['!merges'] = [
    { s:{ r:0, c:0 }, e:{ r:0, c:3 } },
    { s:{ r:1, c:0 }, e:{ r:1, c:3 } }
  ];
  hoja['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 18 },
    { wch: 14 }, { wch: 22 }, { wch: 32 }, { wch: 34 }
  ];
  const ultimaFila = filaEncabezadoIdx + 1 + filasHoja.length; // 1-based, para el rango del autofiltro
  hoja['!autofilter'] = { ref: 'A' + (filaEncabezadoIdx + 1) + ':H' + ultimaFila };

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Log');
  let buffer = XLSX.write(libro, { bookType: 'xlsx', type: 'array' });

  /* Logo de la empresa activa (mejor esfuerzo — si MARCA o JSZip no
     están cargados, o el logo aún no terminó de cargar, se entrega el
     Excel igual, solo que sin el logo). */
  try{
    const logoDataUrl = (typeof MARCA !== 'undefined' && MARCA.logoDataUrl) ? MARCA.logoDataUrl : null;
    if(logoDataUrl) buffer = await incrustarLogoEnExcel(buffer, logoDataUrl, { columna: 4 });
  }catch(e){
    console.warn('actualizarLogExcel: no se pudo incrustar el logo en el log.xlsx.', e);
  }

  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await SB.subirArchivo(BUCKET_REPORTES, tipoReporte + '/log.xlsx', blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* ---------- incrustarLogoEnExcel: incrusta una imagen (logo de la empresa activa) ----------
   en un .xlsx ya generado por SheetJS, escribiendo a mano las piezas
   OOXML que la edición comunidad de SheetJS no sabe crear: la imagen,
   el "drawing" que la ancla a una celda, y las referencias cruzadas que
   las conectan entre sí y con la hoja. Generalizado a partir del mismo
   truco ya usado y probado en producción para el logo de Zublin en el
   Excel de Caminatas/DT (app-inicio.html, función agregarLogoZublin) —
   aquí recibe el logo como parámetro (data URL de MARCA.logoDataUrl) en
   vez de tenerlo fijo, para que sirva con cualquier empresa activa.
   Solo soporta PNG (igual que el original) — es lo que usan los logos
   de la suite (logo-zublin.txt, logo-qcdigital.txt). Si el logo viniera
   en otro formato, se omite sin romper el Excel. */
async function incrustarLogoEnExcel(bufferXlsx, logoDataUrl, opciones){
  if(typeof JSZip === 'undefined' || !logoDataUrl) return bufferXlsx;
  const m = /^data:image\/png;base64,(.+)$/i.exec(logoDataUrl);
  if(!m) return bufferXlsx;
  const base64 = m[1];

  const zip = await JSZip.loadAsync(bufferXlsx);
  zip.file('xl/media/image1.png', base64, { base64: true });

  const dispW = (opciones && opciones.anchoPx) || 100;
  const dispH = (opciones && opciones.altoPx) || 40;
  const col = (opciones && opciones.columna != null) ? opciones.columna : 4;
  const emuW = dispW * 9525, emuH = dispH * 9525;

  const drawingXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    + '<xdr:oneCellAnchor>'
    + '<xdr:from><xdr:col>' + col + '</xdr:col><xdr:colOff>19050</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>9525</xdr:rowOff></xdr:from>'
    + '<xdr:ext cx="' + emuW + '" cy="' + emuH + '"/>'
    + '<xdr:pic>'
    + '<xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr/></xdr:nvPicPr>'
    + '<xdr:blipFill><a:blip r:embed="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
    + '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + emuW + '" cy="' + emuH + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>'
    + '</xdr:pic>'
    + '<xdr:clientData/>'
    + '</xdr:oneCellAnchor>'
    + '</xdr:wsDr>';
  zip.file('xl/drawings/drawing1.xml', drawingXml);

  const drawingRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>'
    + '</Relationships>';
  zip.file('xl/drawings/_rels/drawing1.xml.rels', drawingRels);

  const sheetRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>'
    + '</Relationships>';
  zip.file('xl/worksheets/_rels/sheet1.xml.rels', sheetRels);

  let sheet1 = await zip.file('xl/worksheets/sheet1.xml').async('string');
  sheet1 = sheet1.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>');
  zip.file('xl/worksheets/sheet1.xml', sheet1);

  let ct = await zip.file('[Content_Types].xml').async('string');
  const overrideDrawing = '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
  if(!ct.includes(overrideDrawing)) ct = ct.replace('</Types>', overrideDrawing + '</Types>');
  zip.file('[Content_Types].xml', ct);

  return await zip.generateAsync({ type: 'arraybuffer' });
}
