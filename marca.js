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
  const VERSION = 'v2026.08.05';

  const MARCA = {
    _datos: null,
    empresa: null,
    logoDataUrl: null,
    logoQCDigitalDataUrl: null,
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

      this._listo = true;
      return this;
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
          let etiqueta = e.esPlantilla ? (e.nombreCorto + ' (plantilla)') : e.nombreCorto;
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
    dibujarSelloFirma(doc, opts){
      opts = opts || {};
      const NAVY = [13, 21, 38];       // #0d1526 - fijo QC Digital
      const NARANJA = [245, 133, 31];  // #f5851f - fijo QC Digital
      const GRIS_BORDE = [216, 219, 226];
      const GRIS_TEXTO = [110, 116, 128];

      const x = opts.x, y0 = opts.y, ancho = opts.ancho;
      const h = 26;
      const hayQr = !!opts.qrDataUrl;

      /* Franja de fondo + acento naranja a la izquierda */
      doc.setDrawColor(...GRIS_BORDE); doc.setLineWidth(0.25);
      doc.rect(x, y0, ancho, h);
      doc.setFillColor(...NARANJA);
      doc.rect(x, y0, 1.2, h, 'F');

      /* Logo QC Digital (siempre, aunque la empresa activa sea otra) */
      const logoW = 12, logoH = 12;
      const logoX = x + 4, logoY = y0 + (h - logoH) / 2;
      if(this.logoQCDigitalDataUrl){
        try{ doc.addImage(this.logoQCDigitalDataUrl, 'PNG', logoX, logoY, logoW, logoH); }catch(e){}
      }

      /* Bloque de texto: nombre/cargo + linea de metadatos */
      const textoX = logoX + logoW + 5;
      const anchoTexto = 70;
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(9); doc.setFont(undefined, 'bold');
      doc.text((opts.nombre || '-') + (opts.cargo ? ' \u00b7 ' + opts.cargo : ''), textoX, y0 + h/2 - 1.5, { maxWidth: anchoTexto });
      doc.setFontSize(7); doc.setFont(undefined, 'normal'); doc.setTextColor(...GRIS_TEXTO);
      const rutTxt = opts.rut ? ('RUT ' + opts.rut + ' \u00b7 ') : '';
      const metaTxt = rutTxt + 'Firmado digitalmente \u00b7 ' + (opts.fecha || '') + (opts.hora ? ', ' + opts.hora : '') + ' hrs \u00b7 N\u00b0 ' + (opts.correlativo || '-');
      doc.text(metaTxt, textoX, y0 + h/2 + 3, { maxWidth: anchoTexto });

      /* Divisor */
      const divX = textoX + anchoTexto + 2;
      doc.setDrawColor(...GRIS_BORDE); doc.setLineWidth(0.2);
      doc.line(divX, y0 + 3, divX, y0 + h - 3);

      /* Firma */
      const firmaX = divX + 4;
      const firmaW = hayQr ? 34 : (x + ancho - firmaX - 4);
      const firmaH = 14;
      const firmaY = y0 + (h - firmaH) / 2;
      doc.setDrawColor(...GRIS_BORDE); doc.setLineWidth(0.2);
      doc.rect(firmaX, firmaY, firmaW, firmaH);
      if(opts.firmaDataUrl){
        try{ doc.addImage(opts.firmaDataUrl, 'PNG', firmaX + 1, firmaY + 1, firmaW - 2, firmaH - 2); }catch(e){}
      }

      /* QR (opcional) */
      if(hayQr){
        const qrSize = 14;
        const qrX = x + ancho - qrSize - 4;
        const qrY = y0 + (h - qrSize) / 2;
        try{ doc.addImage(opts.qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize); }catch(e){}
      }

      /* Leyenda inferior */
      let yFinal = y0 + h + 3.5;
      doc.setFontSize(6.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...GRIS_TEXTO);
      doc.text('QC Digital \u00b7 Industry Quality Suite \u2014 documento trazable, generado autom\u00e1ticamente' + (hayQr ? ' \u00b7 c\u00f3digo de verificaci\u00f3n en el QR.' : '.'), x, yFinal);
      doc.setTextColor(30, 30, 30);

      return yFinal + 4;
    }
  };

  window.MARCA = MARCA;
})();
