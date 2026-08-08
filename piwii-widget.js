/* ============================================================
   PIWII-WIDGET.JS - Boton flotante del asistente Piwii, QC Digital
   Se inyecta en todos los reportes con una sola linea en el <head>:
     <script src="piwii-widget.js" defer></script>

   Que hace:
     1) Inyecta un boton flotante (esquina inferior derecha, sobre el
        toggle de tema sol/luna que pone dark-mode.js).
     2) Al tocarlo, abre Piwii en un panel modal a pantalla completa
        (iframe a piwii.html) SIN salir del reporte que se esta
        llenando. Se cierra con la X o tocando el fondo.

   Piwii funciona 100% offline (Modo Aprendiz, base local), asi que
   este widget no depende de conexion. La integracion con la API
   (IA real) es una fase futura y no afecta a este widget.

   Nota de posicion: el toggle de tema vive en bottom:16px/right:16px.
   Este boton va en bottom:76px/right:16px para apilarse encima sin
   solaparse.
   ============================================================ */

(function(){
  'use strict';

  // Evitar doble inyeccion si el script se incluye dos veces
  if(window.__qcdPiwiiWidget) return;
  window.__qcdPiwiiWidget = true;

  var URL_PIWII = 'piwii.html';

  // ---- Estilos del widget (inyectados una sola vez) ----
  function inyectarEstilos(){
    if(document.getElementById('qcd-piwii-style')) return;
    var css = ''
      + '.qcd-piwii-fab{position:fixed;bottom:76px;right:16px;z-index:9998;'
      + 'width:52px;height:52px;border:none;border-radius:50%;cursor:pointer;'
      + 'background:linear-gradient(160deg,#1c2942,#0d1526);'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.45);'
      + 'display:flex;align-items:center;justify-content:center;padding:0;'
      + 'transition:transform .15s ease,box-shadow .15s ease;}'
      + '.qcd-piwii-fab:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.5);}'
      + '.qcd-piwii-fab:active{transform:scale(.94);}'
      + '.qcd-piwii-fab svg{width:30px;height:30px;display:block;}'
      + '.qcd-piwii-fab .ring{position:absolute;inset:-3px;border-radius:50%;'
      + 'border:2px solid #f5851f;opacity:.0;pointer-events:none;}'
      + '.qcd-piwii-overlay{position:fixed;inset:0;z-index:10050;'
      + 'background:rgba(6,10,20,.72);backdrop-filter:blur(2px);'
      + 'display:none;align-items:stretch;justify-content:center;}'
      + '.qcd-piwii-overlay.abierto{display:flex;}'
      + '.qcd-piwii-panel{position:relative;width:100%;max-width:520px;height:100%;'
      + 'background:#0d1526;display:flex;flex-direction:column;'
      + 'box-shadow:0 0 40px rgba(0,0,0,.6);animation:qcdPiwiiUp .22s ease;}'
      + '@keyframes qcdPiwiiUp{from{transform:translateY(14px);opacity:.4}to{transform:none;opacity:1}}'
      + '.qcd-piwii-cerrar{position:absolute;top:8px;right:10px;z-index:2;'
      + 'width:34px;height:34px;border:none;border-radius:50%;cursor:pointer;'
      + 'background:rgba(255,255,255,.12);color:#f1f5f9;font-size:18px;line-height:1;'
      + 'display:flex;align-items:center;justify-content:center;}'
      + '.qcd-piwii-cerrar:hover{background:rgba(255,255,255,.22);}'
      + '.qcd-piwii-frame{flex:1 1 auto;width:100%;border:0;}'
      + '@media(min-width:560px){.qcd-piwii-overlay{align-items:center;padding:20px;}'
      + '.qcd-piwii-panel{height:88vh;border-radius:16px;overflow:hidden;}}';
    var st = document.createElement('style');
    st.id = 'qcd-piwii-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---- SVG del boton: hexagono navy + check naranja (sello QC Digital) ----
  var SVG_ICONO = ''
    + '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<polygon points="256,40 462,158 462,354 256,472 50,354 50,158" fill="#f5851f"/>'
    + '<polygon points="256,86 422,182 422,330 256,426 90,330 90,182" fill="#0d1526"/>'
    + '<path d="M188 262 l44 46 l96 -104" fill="none" stroke="#f5851f" '
    + 'stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</svg>';

  var overlay = null;
  var frameCargado = false;

  function construirOverlay(){
    if(overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'qcd-piwii-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Piwii, asistente de calidad');

    var panel = document.createElement('div');
    panel.className = 'qcd-piwii-panel';

    var cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'qcd-piwii-cerrar';
    cerrar.setAttribute('aria-label', 'Cerrar Piwii');
    cerrar.innerHTML = '&times;';
    cerrar.addEventListener('click', cerrarPanel);

    var frame = document.createElement('iframe');
    frame.className = 'qcd-piwii-frame';
    frame.title = 'Piwii';
    // el src se asigna al abrir por primera vez (lazy) para no cargar
    // Piwii si el inspector nunca lo abre.
    frame.setAttribute('data-src', URL_PIWII);

    panel.appendChild(cerrar);
    panel.appendChild(frame);
    overlay.appendChild(panel);

    // cerrar tocando el fondo (fuera del panel)
    overlay.addEventListener('click', function(e){
      if(e.target === overlay) cerrarPanel();
    });

    document.body.appendChild(overlay);
  }

  function abrirPanel(){
    construirOverlay();
    var frame = overlay.querySelector('.qcd-piwii-frame');
    if(!frameCargado){
      frame.src = frame.getAttribute('data-src');
      frameCargado = true;
    }
    overlay.classList.add('abierto');
    document.documentElement.style.overflow = 'hidden'; // bloquea scroll de fondo
  }

  function cerrarPanel(){
    if(!overlay) return;
    overlay.classList.remove('abierto');
    document.documentElement.style.overflow = '';
  }

  // cerrar con Escape
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && overlay && overlay.classList.contains('abierto')){
      cerrarPanel();
    }
  });

  function inyectarBoton(){
    if(document.querySelector('.qcd-piwii-fab')) return;
    inyectarEstilos();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qcd-piwii-fab';
    btn.setAttribute('aria-label', 'Abrir Piwii, asistente de calidad');
    btn.innerHTML = SVG_ICONO + '<span class="ring"></span>';
    btn.addEventListener('click', abrirPanel);
    document.body.appendChild(btn);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', inyectarBoton);
  } else {
    inyectarBoton();
  }
})();
