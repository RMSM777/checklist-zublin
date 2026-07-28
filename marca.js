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

  const MARCA = {
    _datos: null,
    empresa: null,
    logoDataUrl: null,
    _listo: false,

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
        const resp = await fetch(archivo, { cache: 'force-cache' });
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
      if(img && this.logoDataUrl){
        img.src = this.logoDataUrl;
        img.alt = this.empresa.nombreCorto || this.empresa.nombre;
      }
    },

    textoContrato(){
      return (this.empresa.contrato && this.empresa.contrato.textoCompleto) || '';
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
        if(!elegida || elegida.estado === 'pendiente') return; // blindaje extra
        this._guardarEmpresa(idElegido);
        location.reload();
      });
    }
  };

  window.MARCA = MARCA;
})();
