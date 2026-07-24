/* ============================================================
   MARCA.JS - Módulo central de marca / multi-empresa (Fase 2)
   QCDigital / checklist-zublin

   Qué hace:
   - Carga empresas.json (fetch, con fallback embebido si falla)
   - Determina la empresa activa: localStorage > "activa" del JSON
   - Expone window.MARCA con todo lo que cada página necesita:
       MARCA.empresa        -> objeto completo de la empresa activa
       MARCA.logoDataUrl     -> logo ya cargado como data URL, listo para <img> o doc.addImage()
       MARCA.colorRGB()      -> [r,g,b] para jsPDF (setFillColor, setTextColor, etc.)
       MARCA.aplicarCSS()    -> pinta --color-primario y --color-primario-rgb en :root
       MARCA.pintarHeaderHTML(selectorLogoImg) -> setea el <img> del logo en el header
       MARCA.crearSelector(contenedorId) -> inyecta el <select> de empresa y lo deja funcionando
   - Al cambiar de empresa en el selector: guarda en localStorage y recarga la página
     (recarga simple y segura; evita tener que re-pintar todo en caliente).

   Cómo se usa en cada página (ver README al final de este archivo):
     <script src="marca.js"></script>
     <script>
       MARCA.iniciar().then(() => {
         MARCA.aplicarCSS();
         MARCA.pintarHeaderHTML('logoImg');
         MARCA.crearSelector('selectorEmpresaContainer');
         // ... resto del script de la página, ya con MARCA.empresa disponible
       });
     </script>
   ============================================================ */

(function(){
  const LS_KEY_EMPRESA = 'qcd_empresa_activa';

  /* Fallback embebido: si empresas.json no carga por algún motivo (red, CORS
     en file://, etc.), la app sigue funcionando con Züblin igual que antes
     de la Fase 2. El logo fallback es un 1x1 transparente; si esto se activa,
     el <img> del header queda vacío pero el resto del reporte funciona. */
  const FALLBACK_EMPRESAS = {
    activa: 'zublin',
    empresas: {
      zublin: {
        id: 'zublin',
        nombre: 'ZÜBLIN',
        nombreCorto: 'Züblin',
        colorPrimario: '#D72622',
        colorPrimarioRGB: [215, 38, 34],
        logoArchivo: 'logo-zublin.txt',
        contrato: {
          numero: '4600031460',
          codigoProyecto: 'GCC-003',
          textoCompleto: 'Contrato N\u00b0 4600031460 / GCC-003 \u2014 "Desarrollo y Construcci\u00f3n Nivel Superior e Inferior Mina Norte" \u2014 Divisi\u00f3n Chuquicamata \u2014 Empresa Contratista: Z\u00dcBLIN',
          obra: 'Mina Chuquicamata Subterr\u00e1nea - Mina Norte',
          division: 'Chuquicamata'
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

    /* Punto de entrada. Devuelve una Promise; el resto de MARCA.* no debe
       usarse hasta que esta promesa resuelva. */
    async iniciar(){
      if(this._listo) return this;

      this._datos = await this._cargarEmpresasJson();

      const empresaGuardada = this._leerEmpresaGuardada();
      const empresaValida = empresaGuardada && this._datos.empresas[empresaGuardada];
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

    /* [r,g,b] listo para doc.setFillColor(...MARCA.colorRGB()) en jsPDF */
    colorRGB(){
      return this.empresa.colorPrimarioRGB || [215, 38, 34];
    },

    /* Pinta --color-primario y --color-primario-rgb en :root para que el CSS
       existente (que hoy usa var(--rojo)) siga funcionando sin tocar cada
       regla: basta con que el CSS de cada página también lea
       var(--color-primario) en vez de var(--rojo), o se mantiene --rojo
       como alias (ver marca.css). */
    aplicarCSS(){
      const root = document.documentElement.style;
      const color = this.empresa.colorPrimario || '#D72622';
      const rgb = this.colorRGB();
      root.setProperty('--color-primario', color);
      root.setProperty('--color-primario-rgb', rgb.join(','));
      /* Alias retrocompatible: el CSS legado de los 8 reportes usa var(--rojo).
         Redefinirla aquí permite que todo el CSS existente cambie de color
         sin tener que reescribir cada regla .header-rojo, .seccion-tit, etc. */
      root.setProperty('--rojo', color);
    },

    /* Ubica un <img id="..."> (el logo del header) y le pone el logo cargado. */
    pintarHeaderHTML(idImgLogo){
      const img = document.getElementById(idImgLogo || 'logoImg');
      if(img && this.logoDataUrl){
        img.src = this.logoDataUrl;
        img.alt = this.empresa.nombreCorto || this.empresa.nombre;
      }
    },

    /* Texto de contrato listo para usar en header HTML y en el PDF,
       reemplazando el TEXTO_CONTRATO / CONTRATO hardcodeado de cada archivo. */
    textoContrato(){
      return this.empresa.contrato.textoCompleto;
    },

    /* Inyecta el <select> de empresa dentro de un contenedor existente.
       Solo aparecen empresas de datos.empresas (nunca las "pendientes").
       Al cambiar, guarda la eleccion y recarga la pagina para que todo
       (header, PDF, colores) se repinte de forma consistente. */
    crearSelector(idContenedor){
      const cont = document.getElementById(idContenedor);
      if(!cont) return;

      const empresas = Object.values(this._datos.empresas);
      if(empresas.length <= 1){
        /* Con una sola empresa activa no tiene sentido mostrar un selector;
           esto se activa solo automaticamente cuando se agregue una segunda
           empresa autorizada a empresas.json. */
        cont.innerHTML = '';
        cont.style.display = 'none';
        return;
      }

      cont.style.display = '';
      const selectId = idContenedor + '_select';
      cont.innerHTML =
        '<label for="'+selectId+'" style="font-size:11px;color:#eee;display:block;margin-bottom:2px;">Empresa</label>' +
        '<select id="'+selectId+'" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #ccc;font-size:13px;">' +
        empresas.map(e => '<option value="'+e.id+'"'+(e.id===this.empresa.id?' selected':'')+'>'+e.nombreCorto+'</option>').join('') +
        '</select>';

      document.getElementById(selectId).addEventListener('change', (ev) => {
        this._guardarEmpresa(ev.target.value);
        location.reload();
      });
    }
  };

  window.MARCA = MARCA;
})();

/* ============================================================
   README rápido de integración en cada uno de los 8 reportes
   ============================================================

   1. Agregar antes de </head> o antes del primer <script> propio:
        <script src="marca.js"></script>

   2. Al inicio del script principal de cada página (reemplazando las
      líneas hardcodeadas actuales: const LOGO = "data:image/png..."; 
      const CODIGO_DOC = '...'; const TEXTO_CONTRATO = '...';):

        MARCA.iniciar().then(() => {
          MARCA.aplicarCSS();
          MARCA.pintarHeaderHTML('logoImg');
          MARCA.crearSelector('selectorEmpresa');
          iniciarPagina(); // el resto del código actual de la página, envuelto
                            // en una función para que corra DESPUÉS de que
                            // MARCA esté lista (logo y colores cargados)
        });

        function iniciarPagina(){
          // ... todo el código que ya existía en cada archivo, sin cambios
          // de lógica, solo reemplazando los usos de LOGO / CODIGO_DOC /
          // TEXTO_CONTRATO por MARCA.logoDataUrl / (el CODIGO_DOC propio del
          // reporte, que NO se toca) / MARCA.textoContrato()
        }

   3. En la función que dibuja el encabezado del PDF (dibujarEncabezado /
      encabezado), reemplazar:
        doc.addImage(LOGO, 'PNG', ...)          ->  doc.addImage(MARCA.logoDataUrl, 'PNG', ...)
        doc.setFillColor(215,38,34)              ->  doc.setFillColor(...MARCA.colorRGB())
        TEXTO_CONTRATO                            ->  MARCA.textoContrato()
      El CODIGO_DOC de cada reporte (ej. 'INF-GOMS-CL-001 REV.0') se mantiene
      igual: es el código del TIPO de documento, no de la empresa, y no
      cambia entre Fase 1 y Fase 2.

   4. En el HTML del header, agregar el contenedor del selector (se oculta
      solo si hay una sola empresa activa):
        <div id="selectorEmpresa" style="padding:6px 16px;background:#2a2a2a;"></div>

   5. El texto estático "Contrato N° 4600031460..." que hoy vive directo en
      el HTML (.header-contrato) pasa a pintarse por JS:
        document.querySelector('.header-contrato').textContent = MARCA.textoContrato();
      en vez de dejarlo como texto fijo en el HTML.
   ============================================================ */
