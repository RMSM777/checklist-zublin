/* ============================================================
   MARCA.JS - Módulo central de marca / multi-empresa
   QCDigital - Fase 2 (v2)

   - QC Digital es la marca por defecto (plantilla neutra, esPlantilla:true).
   - Züblin y futuras empresas (Acciona, OSSA, ...) son datos en
     empresas.json que el selector activa.
   - colorPrimario (acentos: títulos, tablas, líneas) está separado de
     colorFondoHeader (fondo de la barra superior). En Züblin ambos son
     rojo. En QC Digital header=navy, acento=naranja.
   - "esPlantilla" (true en QC Digital): cuando está activa, el texto de
     contrato es neutro y ciertos campos quedan vacíos hasta elegir empresa.
   - "tagline" (QC Digital: "INDUSTRY QUALITY SUITE").
   - Empresas con "estado":"pendiente" (Acciona, OSSA) SÍ aparecen en el
     selector (para mostrar el roadmap) pero quedan DESHABILITADAS, con
     sufijo "(próximamente)", hasta tener contrato real y autorización
     de marca por escrito.

   API pública (window.MARCA):
     MARCA.iniciar()                    -> Promise<MARCA>
     MARCA.empresa                       -> objeto de la empresa activa
     MARCA.logoDataUrl                   -> logo como data URL
     MARCA.colorRGB()                    -> [r,g,b] acento (para jsPDF)
     MARCA.colorHeaderRGB()              -> [r,g,b] fondo header
     MARCA.aplicarCSS()                  -> escribe variables CSS
     MARCA.pintarHeaderHTML(idImgLogo)   -> setea src del <img>
     MARCA.textoContrato()               -> texto para el header oscuro
     MARCA.esPlantilla()                 -> true si es marca neutra
     MARCA.crearSelector(idContenedor)   -> inyecta <select> de empresa
     MARCA.VERSION                        -> string, ej. "v2026.08.05"
     MARCA.pintarVersion(idContenedor)   -> escribe VERSION en un elemento
   ============================================================ */

(function(){
  const LS_KEY_EMPRESA = 'qcd_empresa_activa';

  /* Fallback embebido: si empresas.json no carga (red, CORS en file://),
     la app sigue funcionando con Züblin (empresa realmente activa hoy). */
  const FALLBACK_EMPRESAS = {
    activa: 'zublin',
    empresas: {
      qcdigital: {
        id: 'qcdigital', nombre: 'QC DIGITAL', nombreCorto: 'QC Digital',
        tagline: 'INDUSTRY QUALITY SUITE',
        colorPrimario: '#f5851f', colorPrimarioRGB: [245, 133, 31],
        colorFondoHeader: '#0d1526', colorFondoHeaderRGB: [13, 21, 38],
        logoArchivo: 'logo-qcdigital.txt', esPlantilla: true,
        contrato: { numero: '', codigoProyecto: '',
          textoCompleto: 'QC Digital \u00b7 Industry Quality Suite \u2014 Seleccione una empresa en el selector para cargar los datos del contrato.',
          obra: '', division: '' }
      },
      zublin: {
        id: 'zublin', nombre: 'Z\u00dcBLIN', nombreCorto: 'Z\u00fcblin', tagline: '',
        colorPrimario: '#D72622', colorPrimarioRGB: [215, 38, 34],
        colorFondoHeader: '#D72622', colorFondoHeaderRGB: [215, 38, 34],
        logoArchivo: 'logo-zublin.txt', esPlantilla: false,
        contrato: {
          numero: '4600031460', codigoProyecto: 'GCC-003',
          textoCompleto: 'Contrato N\u00b0 4600031460 / GCC-003 \u2014 "Desarrollo y Construcci\u00f3n Nivel Superior e Inferior Mina Norte" \u2014 Divisi\u00f3n Chuquicamata \u2014 Empresa Contratista: Z\u00dcBLIN',
          obra: 'Mina Chuquicamata Subterr\u00e1nea - Mina Norte', division: 'Chuquicamata'
        }
      }
    },
    pendientes: {}
  };

  /* Version de la app (formato: v + fecha de release AAAA.MM.DD).
     Fuente unica: se actualiza SOLO aqui, no en cada reporte. Los
     footers de las paginas la pintan llamando a MARCA.pintarVersion(). */
  const VERSION = 'v2026.08.08';

  const MARCA = {
    _datos: null,
    empresa: null,
    logoDataUrl: null,
    logoQCDigitalDataUrl: null,
    logoQCDigitalSelloDataUrl: null,
    _listo: false,
    VERSION: VERSION,

    async iniciar(){
      if(this._listo) return this;
      this._datos = await this._cargarEmpresasJson();

      const empresaGuardada = this._leerEmpresaGuardada();
      const empresaValida = empresaGuardada
        && this._datos.empresas[empresaGuardada]
        && this._datos.empresas[empresaGuardada].estado !== 'pendiente';
      const idActivo = empresaValida ? empresaGuardada : this._datos.activa;

      this.empresa = this._datos.empresas[idActivo] || Object.values(this._datos.empresas)[0];
      this.logoDataUrl = await this._cargarLogo(this.empresa.logoArchivo);

      /* El sello de firma (dibujarSelloFirma) SIEMPRE usa el logo y los
         colores de QC Digital, sin importar la empresa activa — es un
         sello de plataforma, no de contrato. Se carga aparte del logo
         de la empresa activa. */
      const qcDigital = (this._datos.empresas && this._datos.empresas.qcdigital) || null;
      this.logoQCDigitalDataUrl = qcDigital
        ? await this._cargarLogo(qcDigital.logoArchivo)
        : this.logoDataUrl;

      /* Version cuadrada del sello (hexagono + check, sin texto) para la
         placa de firma. Si no existe el archivo, cae al logo apaisado. */
      this.logoQCDigitalSelloDataUrl =
        (await this._cargarLogo('logo-qcdigital-sello.txt'))
        || this.logoQCDigitalDataUrl;

      this._listo = true;
      this._avisarSiPlantilla();
      this._avisarSiPrivado();
      return this;
    },

    /* Aviso visible desde el momento en que se abre la pagina, si la
       empresa activa es la plantilla neutra (QC Digital) sin datos de
       contrato. Antes, el unico aviso era la alerta al intentar cerrar
       el reporte -- es decir, DESPUES de llenar todo. Esto avisa ANTES,
       para no hacer perder tiempo. No reemplaza el bloqueo al cerrar
       (ese sigue existiendo como red de seguridad), es un aviso extra. */
    _avisarSiPlantilla(){
      if(!this.esPlantilla()) return;
      if(document.getElementById('qcdAvisoPlantilla')) return;
      const div = document.createElement('div');
      div.id = 'qcdAvisoPlantilla';
      div.style.cssText = 'background:#fff3cd; border-bottom:2px solid #ffca28; color:#7a5c00; '
        + 'font-size:12.5px; font-weight:600; padding:10px 14px; text-align:center; line-height:1.4;';
      div.textContent = '\u26A0\uFE0F Modo plantilla activo (QC Digital), sin datos de contrato. '
        + 'Para cerrar un reporte real de terreno, cambia \u201cEmpresa activa\u201d de abajo a Z\u00daBLIN.';
      this._insertarAviso(div);
    },

    /* Deteccion best-effort de navegacion privada/incognito. No hay API
       oficial para esto en ningun navegador, asi que se usa una heuristica
       de cuota de almacenamiento (Chrome/Edge/Android en incognito reportan
       una cuota mucho mas chica que en modo normal) mas un intento de
       escritura real en IndexedDB (Firefox/Safari privado suelen fallar o
       reportar cuota ~0). Si algo no esta disponible, se asume que NO es
       privado (falso negativo es preferible a un aviso equivocado). */
    async _esNavegacionPrivada(){
      try{
        if(navigator.storage && navigator.storage.estimate){
          const { quota } = await navigator.storage.estimate();
          if(typeof quota === 'number' && quota > 0 && quota < 120 * 1024 * 1024){
            return true;
          }
        }
      }catch(e){ /* seguimos con el siguiente metodo */ }

      try{
        return await new Promise((resolve) => {
          const req = indexedDB.open('qcd_test_privado');
          req.onerror = () => resolve(true);
          req.onsuccess = () => {
            try{ req.result.close(); }catch(e){}
            try{ indexedDB.deleteDatabase('qcd_test_privado'); }catch(e){}
            resolve(false);
          };
        });
      }catch(e){
        return false;
      }
    },

    /* Aviso visible desde el momento en que se abre la pagina, si el
       navegador esta en modo privado/incognito. Motivo: localStorage
       (correlativo, borrador autoguardado, empresa activa, modo oscuro,
       token de Google Drive) se borra completo al cerrar la pestaña en
       ese modo -- causo correlativos repetidos en terreno (ver traspaso
       Fase 4). Es solo informativo, no bloquea nada. */
    async _avisarSiPrivado(){
      const esPrivado = await this._esNavegacionPrivada();
      if(!esPrivado) return;
      if(document.getElementById('qcdAvisoPrivado')) return;
      const div = document.createElement('div');
      div.id = 'qcdAvisoPrivado';
      div.style.cssText = 'background:#fdecea; border-bottom:2px solid #e57373; color:#7a1f1f; '
        + 'font-size:12.5px; font-weight:600; padding:10px 14px; text-align:center; line-height:1.4;';
      div.textContent = '\u26A0\uFE0F Navegaci\u00f3n privada detectada. El correlativo, el borrador y la '
        + 'empresa activa NO se guardar\u00e1n al cerrar esta pesta\u00f1a. Usa una pesta\u00f1a normal para reportes reales.';
      this._insertarAviso(div);
    },

    /* Inserta un aviso al tope de la pagina, debajo de los avisos que ya
       esten puestos (para que plantilla + privado puedan convivir en el
       orden en que se detectaron, sin pisarse). */
    _insertarAviso(div){
      const anterior = document.getElementById('qcdAvisoPlantilla');
      if(div.id !== 'qcdAvisoPlantilla' && anterior){
        document.body.insertBefore(div, anterior.nextSibling);
      } else if(document.body.firstChild){
        document.body.insertBefore(div, document.body.firstChild);
      } else {
        document.body.appendChild(div);
      }
    },

    async _cargarEmpresasJson(){
      try{
        const resp = await fetch('empresas.json', { cache: 'no-store' });
        if(!resp.ok) throw new Error('empresas.json respondio ' + resp.status);
        const datos = await resp.json();
        if(!datos.empresas || !Object.keys(datos.empresas).length){
          throw new Error('empresas.json sin empresas validas');
        }
        return datos;
      }catch(e){
        console.warn('MARCA: no se pudo cargar empresas.json, usando fallback embebido.', e);
        return FALLBACK_EMPRESAS;
      }
    },

    async _cargarLogo(archivo){
      if(!archivo) return null;
      try{
        /* 'reload': siempre va a la red, nunca reutiliza una respuesta vieja
           guardada en el navegador (ej. un 404 de antes de que el logo
           existiera). Los logos son pequeños, no hay costo real en esto. */
        const resp = await fetch(archivo, { cache: 'reload' });
        if(!resp.ok) throw new Error('logo respondio ' + resp.status);
        const texto = (await resp.text()).trim();
        if(!texto.startsWith('data:image')) throw new Error('archivo de logo con formato inesperado');
        return texto;
      }catch(e){
        console.warn('MARCA: no se pudo cargar el logo ('+archivo+'), header quedara sin imagen.', e);
        return null;
      }
    },

    _leerEmpresaGuardada(){
      try{ return localStorage.getItem(LS_KEY_EMPRESA); }catch(e){ return null; }
    },

    _guardarEmpresa(id){
      try{ localStorage.setItem(LS_KEY_EMPRESA, id); }catch(e){}
    },

    /* Acento (títulos de sección, líneas divisorias, fillColor de tablas) */
    colorRGB(){
      return this.empresa.colorPrimarioRGB || [215, 38, 34];
    },

    /* Fondo del header (barra superior del PDF y del sitio) */
    colorHeaderRGB(){
      return this.empresa.colorFondoHeaderRGB || this.colorRGB();
    },

    esPlantilla(){
      return !!this.empresa.esPlantilla;
    },

    aplicarCSS(){
      const root = document.documentElement.style;
      const colorAcento = this.empresa.colorPrimario || '#D72622';
      const colorHeader = this.empresa.colorFondoHeader || colorAcento;
      const rgbAcento = this.colorRGB();
      const rgbHeader = this.colorHeaderRGB();

      root.setProperty('--color-primario', colorAcento);
      root.setProperty('--color-primario-rgb', rgbAcento.join(','));
      root.setProperty('--color-header', colorHeader);
      root.setProperty('--color-header-rgb', rgbHeader.join(','));

      /* Alias retrocompatible: el CSS legado usa var(--rojo) para el fondo
         del header. Se redefine con el color de header actual (rojo en
         Züblin, navy en QC Digital) para que el CSS existente cambie de
         color sin reescribir cada regla. */
      root.setProperty('--rojo', colorHeader);
    },

    pintarHeaderHTML(idImgLogo){
      const img = document.getElementById(idImgLogo || 'logoImg');
      if(!img) return;
      if(this.logoDataUrl){
        img.src = this.logoDataUrl;
        img.alt = this.empresa.nombreCorto || this.empresa.nombre;
      } else {
        /* Sin logo cargado (ej. logo-qcdigital.txt aun no subido, o
           empresa sin logoArchivo): se limpia para no dejar pegado el
           logo de la empresa anterior. */
        img.removeAttribute('src');
        img.alt = this.empresa.nombreCorto || this.empresa.nombre || '';
      }
    },

    textoContrato(){
      return (this.empresa.contrato && this.empresa.contrato.textoCompleto) || '';
    },

    /* Pinta la version de la app (VERSION, definida arriba, fuente unica)
       dentro de un elemento del footer. Uso tipico, dentro del
       .then() de MARCA.iniciar():
         MARCA.pintarVersion('qcdVersion');
       Si el elemento no existe (id mal escrito, footer sin span) no
       hace nada, no lanza error. */
    pintarVersion(idContenedor){
      const el = document.getElementById(idContenedor || 'qcdVersion');
      if(el) el.textContent = this.VERSION;
    },

    /* Correlativo interno por usuario + tipo de documento.
       Cada combinacion (iniciales del generador + tipo de documento) lleva
       su propio contador, guardado en localStorage del dispositivo.
       IMPORTANTE: cada pagina que llama a esto SUMA el contador. Los
       reportes deben llamarlo solo al cerrar turno / descargar el PDF
       final (nunca en "PDF previo"), para no gastar numeros en pruebas.
       Devuelve algo como "RM-2026-0007". */
    correlativo(nombreGenerador, tipoDoc){
      var iniciales = (nombreGenerador || '').trim().split(/\s+/)
        .map(function(p){ return p.charAt(0).toUpperCase(); })
        .join('').slice(0,3) || 'NN';
      var anio = new Date().getFullYear();
      var key = 'qcd_corr_' + iniciales + '_' + (tipoDoc || 'DOC');
      var n = 1;
      try{
        var guardado = parseInt(localStorage.getItem(key) || '0', 10);
        n = (isNaN(guardado) ? 0 : guardado) + 1;
        localStorage.setItem(key, String(n));
      }catch(e){ console.warn('MARCA.correlativo: no se pudo leer/guardar localStorage', e); }
      var nStr = String(n);
      while(nStr.length < 4) nStr = '0' + nStr;
      return iniciales + '-' + anio + '-' + nStr;
    },

    /* Inyecta el <select> de empresa. SIEMPRE visible (QC Digital es "la
       app", el selector es su cara visible). Las empresas con
       estado:"pendiente" (Acciona, OSSA) aparecen listadas para mostrar
       el roadmap, pero deshabilitadas y con sufijo "(próximamente)". */
    crearSelector(idContenedor){
      const cont = document.getElementById(idContenedor);
      if(!cont) return;

      const empresas = Object.values(this._datos.empresas);
      cont.style.display = '';
      const selectId = idContenedor + '_select';
      cont.innerHTML =
        '<label for="'+selectId+'" style="font-size:11px;color:#eee;display:block;margin-bottom:2px;">Empresa activa</label>' +
        '<select id="'+selectId+'" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #ccc;font-size:13px;background:#fff;color:#222;">' +
        empresas.map(e => {
          const pendiente = e.estado === 'pendiente';
          let etiqueta = e.esPlantilla ? (e.nombreCorto + ' (plantilla, sin contrato)') : e.nombreCorto;
          if(pendiente) etiqueta += ' (pr\u00f3ximamente)';
          return '<option value="'+e.id+'"'
            + (e.id===this.empresa.id ? ' selected' : '')
            + (pendiente ? ' disabled' : '')
            + '>'+etiqueta+'</option>';
        }).join('') +
        '</select>';

      document.getElementById(selectId).addEventListener('change', (ev) => {
        const idElegido = ev.target.value;
        const elegida = this._datos.empresas[idElegido];
        if(!elegida || elegida.estado === 'pendiente') return;

        /* Cambiar de empresa recarga la pagina (para que todo el PDF y el
           texto de contrato se regeneren con la marca correcta). Eso, sin
           mas, borraria lo que el usuario ya llevaba escrito. Si el
           reporte tiene su propio sistema de borrador (guardarBorrador +
           recuperarBorrador/restaurarBorrador), lo guardamos ANTES de
           recargar y dejamos una marca para restaurarlo solo, sin banner,
           apenas la pagina vuelva a cargar. Si el reporte no tiene
           borrador, se advierte antes de perder los datos. */
        const fnGuardar = (typeof window.guardarBorrador === 'function') ? window.guardarBorrador : null;
        const fnRestaurar = (typeof window.recuperarBorrador === 'function') ? window.recuperarBorrador
          : (typeof window.restaurarBorrador === 'function') ? window.restaurarBorrador : null;
        const tieneBorrador = !!(fnGuardar && fnRestaurar);

        const mensaje = tieneBorrador
          ? 'Cambiar de empresa recarga la p\u00e1gina. Se guardar\u00e1 un borrador autom\u00e1tico de lo que llevas y se restaurar\u00e1 solo apenas vuelva a cargar.\n\n\u00bfContinuar?'
          : 'Cambiar de empresa recarga la p\u00e1gina y este reporte no tiene guardado autom\u00e1tico: vas a PERDER lo que hayas llenado.\n\n\u00bfContinuar de todas formas?';

        if(!window.confirm(mensaje)){
          ev.target.value = this.empresa.id; // deja el selector como estaba
          return;
        }

        if(tieneBorrador){
          try{ fnGuardar(); }catch(e){}
          try{ sessionStorage.setItem('qcd_auto_restaurar', '1'); }catch(e){}
        }
        this._guardarEmpresa(idElegido);
        location.reload();
      });
    },
    /* Sello de firma digital (franja horizontal, diseño B).
       Colores y logo SIEMPRE de QC Digital, sin importar la empresa
       activa: es un sello de plataforma, no de contrato.

       Uso, justo despues de tener nombre/cargo/firma/correlativo/QR listos:
         y = MARCA.dibujarSelloFirma(doc, {
           x: izq, y: y, ancho: ancho,
           firmaDataUrl: firma.canvas.toDataURL('image/png'),
           qrDataUrl: qrUrl,          // opcional, si no hay QR se omite esa columna
           nombre: nombre, cargo: v('cargo') || '-',
           fecha: fecha, hora: horaTexto,
           correlativo: corr
         });

       Devuelve el nuevo Y (debajo del sello + leyenda), listo para seguir
       dibujando contenido despues. */
    /* Dibuja UNA caja de firma (34 mm de alto) con las 4 zonas del
       estandar QC Digital: placa-logo, datos apilados, firma manuscrita
       con su linea, y QR al extremo derecho. Devuelve el Y bajo la caja.
       Uso interno: lo llama dibujarSelloFirma para 1 o 2 firmantes. */
    _dibujarCajaFirma(doc, f){
      const NARANJA = [245, 133, 31];  // #f5851f - fijo QC Digital
      const x = f.x, y = f.y, ancho = f.ancho, boxH = 34;

      /* Caja contenedora */
      doc.setFillColor(250, 250, 250); doc.setDrawColor(225, 225, 225); doc.setLineWidth(0.3);
      doc.roundedRect(x, y, ancho, boxH, 2, 2, 'FD');

      /* Zona 1: logo QC Digital en placa blanca (sello cuadrado) */
      doc.setFillColor(255, 255, 255); doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3);
      doc.roundedRect(x + 5, y + 8, 18, 18, 2, 2, 'FD');
      const sello = this.logoQCDigitalSelloDataUrl || this.logoQCDigitalDataUrl;
      if(sello){ try{ doc.addImage(sello, 'PNG', x + 6.5, y + 9.5, 15, 15); }catch(e){} }

      /* Zona 2: datos apilados */
      const dx = x + 29;
      doc.setTextColor(25, 25, 25); doc.setFontSize(10.5); doc.setFont(undefined, 'bold');
      doc.text(f.nombre || '-', dx, y + 11);
      doc.setFontSize(8); doc.setTextColor(...NARANJA); doc.setFont(undefined, 'bold');
      doc.text(f.cargo || 'Inspector de Calidad', dx, y + 16);
      doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(95, 95, 95);
      doc.text('RUT: ' + (f.rut || '-'), dx, y + 22);
      doc.text('Firmado digitalmente \u00b7 ' + (f.fecha || '') + (f.hora ? ' ' + f.hora : '') + ' hrs', dx, y + 26);
      doc.setFont(undefined, 'bold'); doc.setTextColor(...NARANJA);
      doc.text('N\u00b0 ' + (f.correlativo || '-'), dx, y + 30);

      /* Zona 3: firma con recuadro y linea "Firma inspector" */
      const fx = x + ancho - 72, fw = 44, fyTop = y + 6;
      if(f.firmaDataUrl){ try{ doc.addImage(f.firmaDataUrl, 'PNG', fx, fyTop, fw, 16); }catch(e){} }
      doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.3); doc.line(fx, fyTop + 18, fx + fw, fyTop + 18);
      doc.setFontSize(6.5); doc.setFont(undefined, 'normal'); doc.setTextColor(120, 120, 120);
      doc.text(f.etiquetaFirma || 'Firma inspector', fx + fw / 2, fyTop + 22, { align: 'center' });

      /* Zona 4: QR al extremo derecho */
      if(f.qrDataUrl){ try{ doc.addImage(f.qrDataUrl, 'PNG', x + ancho - 22, y + 9, 16, 16); }catch(e){} }

      return y + boxH;
    },

    /* Dibuja el bloque de cierre/firma estandar QC Digital. Colores y logo
       SIEMPRE de QC Digital (sello de plataforma), sin importar la empresa.

       Uso con UN firmante (compatible con reportes ya migrados):
         y = MARCA.dibujarSelloFirma(doc, {
           x: izq, y: y, ancho: ancho,
           firmaDataUrl: firma.canvas.toDataURL('image/png'),
           qrDataUrl: qrUrl, nombre, cargo, rut, fecha, hora, correlativo
         });

       Uso con DOS firmantes (mismo diseno, dos cajas apiladas; el QR se
       repite en ambas):
         y = MARCA.dibujarSelloFirma(doc, {
           x: izq, y: y, ancho: ancho,
           firmantes: [ {nombre,cargo,rut,firmaDataUrl,etiquetaFirma}, {...} ],
           qrDataUrl: qrUrl, fecha, hora, correlativo
         });
       Cada firmante puede traer su propio correlativo/fecha/qr; si no,
       hereda los de nivel superior. */
    dibujarSelloFirma(doc, opts){
      opts = opts || {};
      const GRIS_TEXTO = [140, 140, 140];
      const x = opts.x, ancho = opts.ancho;

      /* Normalizar a un arreglo de firmantes */
      let firmantes = Array.isArray(opts.firmantes) && opts.firmantes.length
        ? opts.firmantes
        : [{ nombre: opts.nombre, cargo: opts.cargo, rut: opts.rut,
             firmaDataUrl: opts.firmaDataUrl, etiquetaFirma: opts.etiquetaFirma,
             correlativo: opts.correlativo, fecha: opts.fecha, hora: opts.hora,
             qrDataUrl: opts.qrDataUrl }];

      let y = opts.y;
      firmantes.forEach((fr, i) => {
        if(i > 0) y += 4; // separacion entre cajas
        y = this._dibujarCajaFirma(doc, {
          x: x, y: y, ancho: ancho,
          nombre: fr.nombre, cargo: fr.cargo, rut: fr.rut,
          firmaDataUrl: fr.firmaDataUrl,
          etiquetaFirma: fr.etiquetaFirma,
          correlativo: fr.correlativo != null ? fr.correlativo : opts.correlativo,
          fecha: fr.fecha != null ? fr.fecha : opts.fecha,
          hora: fr.hora != null ? fr.hora : opts.hora,
          qrDataUrl: fr.qrDataUrl != null ? fr.qrDataUrl : opts.qrDataUrl
        });
      });

      /* Leyenda inferior (una sola vez, bajo la ultima caja).
         Se puede omitir con opts.sinLeyenda para reportes que apilan
         varias cajas con salto de pagina y ponen la leyenda aparte. */
      if(opts.sinLeyenda){ return y + 2; }
      let yFinal = y + 5;
      doc.setFontSize(7); doc.setFont(undefined, 'normal'); doc.setTextColor(...GRIS_TEXTO);
      doc.text((this.empresa && this.empresa.nombreCorto ? this.empresa.nombreCorto : 'QC Digital') +
        ' \u00b7 Industry Quality Suite \u2014 documento trazable, generado autom\u00e1ticamente \u00b7 c\u00f3digo de verificaci\u00f3n en el QR.',
        x, yFinal);
      doc.setTextColor(30, 30, 30);

      return yFinal + 4;
    }
  };

  window.MARCA = MARCA;
})();
