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
  return filas[0];
}
