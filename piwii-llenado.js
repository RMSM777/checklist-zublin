/* ============================================================
   PIWII-LLENADO.JS - Modo llenado conversacional (prototipo)
   Especifico del Checklist Camioneta. QC Digital.

   A diferencia del widget de consulta (piwii-widget.js, que abre
   Piwii en un iframe para preguntas de calidad), este modulo va
   EMBEBIDO en el propio reporte porque necesita escribir en los
   campos reales del formulario.

   Filosofia del flujo: NO pregunta item por item (seria mas lento
   que marcar a mano). Pregunta POR EXCEPCION:
     1) Datos basicos por voz/texto (obra, patente, km...).
     2) "Esta todo el equipo en buen estado?" -> marca todo B de una.
     3) "Algun item con problema?" -> solo ajusta las excepciones.

   Es un PROTOTIPO sin IA: el guion es fijo. Si el concepto sirve,
   se extiende a fatiga, firmas y a otros reportes; la IA real
   (Claude API) es una fase futura que haria el guion flexible.

   Requiere que el reporte exponga en window:
     - window.estados      (objeto de items mecanicos: {key:{sistema,item,valor}})
     - los campos por id (obra, fecha, patente, interno, modelo, km...)
   ============================================================ */

(function(){
  'use strict';
  if(window.__qcdPiwiiLlenado) return;
  window.__qcdPiwiiLlenado = true;

  /* ---------- Guion: pasos que piden un campo de texto ---------- */
  /* Cada paso: pregunta + a que id del formulario escribe.
     tipo 'texto' escribe el valor tal cual; 'fecha' normaliza. */
  var PASOS_DATOS = [
    { campo:'obra',     pregunta:'\u00bfEn qu\u00e9 obra o faena est\u00e1s? (ej: Mina Chuquicamata Subterr\u00e1nea)' },
    { campo:'patente',  pregunta:'\u00bfPatente del veh\u00edculo?' },
    { campo:'interno',  pregunta:'\u00bfN\u00famero interno? (si no aplica, escribe "no")' },
    { campo:'modelo',   pregunta:'\u00bfModelo del veh\u00edculo?' },
    { campo:'km',       pregunta:'\u00bfKilometraje actual? (solo el n\u00famero)' }
  ];

  /* ---------- Estado del dialogo ---------- */
  var fase = 'inicio';   // inicio -> datos -> equipo_global -> equipo_excepciones -> fin
  var idxDato = 0;

  /* ---------- Utilidades para tocar el formulario ---------- */
  function setCampo(id, valor){
    var el = document.getElementById(id);
    if(el){ el.value = valor; el.dispatchEvent(new Event('input', {bubbles:true})); return true; }
    return false;
  }

  function marcarTodoBueno(){
    // Simula click en el boton "B" de cada item mecanico.
    var n = 0;
    document.querySelectorAll('#componentes .comp-fila').forEach(function(fila){
      var btnB = fila.querySelector('button[data-v="B"]');
      if(btnB){ btnB.click(); n++; }
    });
    return n;
  }

  function listaItems(){
    // Devuelve [{key, item, sistema}] para buscar por texto.
    var arr = [];
    if(window.estados){
      Object.keys(window.estados).forEach(function(k){
        arr.push({ key:k, item:window.estados[k].item, sistema:window.estados[k].sistema });
      });
    }
    return arr;
  }

  function marcarItemPorTexto(texto, valor){
    // Busca el item cuyo nombre/sistema contenga las palabras dadas y
    // hace click en el boton del valor (M/NA/B) correspondiente.
    var q = normaliza(texto);
    var candidatos = listaItems().filter(function(o){
      var t = normaliza(o.item + ' ' + o.sistema);
      // coincide si alguna palabra > 3 letras del query esta en el item
      return q.split(' ').some(function(w){ return w.length>3 && t.indexOf(w)!==-1; });
    });
    if(!candidatos.length) return null;
    var obj = candidatos[0];
    var fila = document.querySelector('.comp-fila button[data-k="'+obj.key+'"]');
    if(fila){
      var grupo = fila.parentElement;
      var btn = grupo.querySelector('button[data-v="'+valor+'"]');
      if(btn){ btn.click(); return obj; }
    }
    return null;
  }

  function normaliza(s){
    return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  /* ---------- Motor del dialogo ---------- */
  function responder(txt){
    var q = normaliza(txt);

    if(fase === 'inicio'){
      if(q.indexOf('si')===0 || q==='dale' || q==='ok' || q==='empezar' || q.indexOf('llen')!==-1){
        fase = 'datos'; idxDato = 0;
        return PASOS_DATOS[0].pregunta;
      }
      return 'Cuando quieras partir, escribe "s\u00ed" y te voy preguntando para llenar el checklist. Escribe "cancelar" para cerrar.';
    }

    if(q === 'cancelar' || q === 'salir'){
      fase = 'inicio';
      return 'Listo, cerramos el llenado asistido. Puedes seguir a mano o volver a empezar cuando quieras.';
    }

    if(fase === 'datos'){
      var paso = PASOS_DATOS[idxDato];
      var val = txt.trim();
      if(!(val.toLowerCase()==='no' && paso.campo==='interno')){
        setCampo(paso.campo, val);
      }
      idxDato++;
      if(idxDato < PASOS_DATOS.length){
        return '\u2713 Anotado. ' + PASOS_DATOS[idxDato].pregunta;
      }
      // pasar a estado del equipo
      fase = 'equipo_global';
      return '\u2713 Datos listos.\n\nAhora el estado mec\u00e1nico. \u00bfEst\u00e1 <b>todo el equipo en buen estado</b>? '
           + '(responde "s\u00ed" y marco todos en B; o "no" si hay algo con problema)';
    }

    if(fase === 'equipo_global'){
      if(q.indexOf('si')===0 || q==='ok' || q==='dale'){
        var n = marcarTodoBueno();
        fase = 'equipo_excepciones';
        return '\u2713 Marqu\u00e9 los ' + n + ' \u00edtems en <b>B (Bueno)</b>.\n\n'
             + '\u00bfHay alg\u00fan \u00edtem con problema o que no aplique? Dime cu\u00e1l y c\u00f3mo '
             + '(ej: "frenos malo" o "rueda repuesto no aplica"). Si est\u00e1 todo bien, escribe "listo".';
      }
      if(q.indexOf('no')===0){
        fase = 'equipo_excepciones';
        return 'Bien, no marco todo. Dime \u00edtem por \u00edtem los que tengan problema '
             + '(ej: "frenos malo"). Cuando termines, escribe "listo".';
      }
      return 'Responde "s\u00ed" para marcar todo en Bueno, o "no" para ir uno por uno.';
    }

    if(fase === 'equipo_excepciones'){
      if(q === 'listo' || q === 'fin' || q === 'terminado'){
        fase = 'fin';
        return '\u2713 Estado mec\u00e1nico registrado.\n\nEl resto (fatiga, observaciones y firmas) qued\u00f3 para que lo completes a mano. '
             + 'Revisa que todo est\u00e9 correcto antes de cerrar el reporte. \u00a1Buen turno!';
      }
      // detectar valor: malo / no aplica / bueno
      var valor = 'M';
      if(q.indexOf('no aplica')!==-1 || q.indexOf('na')!==-1 || q.indexOf('no corresponde')!==-1) valor = 'NA';
      else if(q.indexOf('bueno')!==-1 || q.indexOf(' ok')!==-1 || q.indexOf('bien')!==-1) valor = 'B';
      var res = marcarItemPorTexto(txt, valor);
      if(res){
        var etq = valor==='M' ? 'Malo' : (valor==='NA' ? 'No Aplica' : 'Bueno');
        return '\u2713 Marqu\u00e9 "' + res.item + '" como <b>' + etq + '</b>.\n\n\u00bfOtro \u00edtem? O escribe "listo" para terminar.';
      }
      return 'No identifiqu\u00e9 ese \u00edtem. Prueba con una palabra clave (ej: "frenos", "bater\u00eda", "neum\u00e1ticos") y el estado ("malo" / "no aplica").';
    }

    if(fase === 'fin'){
      return 'El llenado asistido termin\u00f3. Si quieres volver a empezar, escribe "empezar".';
    }

    return 'No te entend\u00ed. Escribe "cancelar" para cerrar el asistente.';
  }

  /* ---------- Interfaz de chat (panel embebido) ---------- */
  function inyectarUI(){
    if(document.getElementById('qcd-llenado-fab')) return;

    var css = ''
      + '#qcd-llenado-fab{position:fixed;bottom:136px;right:16px;z-index:9998;'
      + 'height:44px;padding:0 14px;border:none;border-radius:22px;cursor:pointer;'
      + 'background:#f5851f;color:#0d1526;font-weight:800;font-size:13px;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.4);display:flex;align-items:center;gap:6px;}'
      + '#qcd-llenado-fab:active{transform:scale(.96);}'
      + '#qcd-llenado-panel{position:fixed;bottom:0;left:0;right:0;z-index:10060;'
      + 'max-width:520px;margin:0 auto;background:#0d1526;color:#f1f5f9;'
      + 'border-top-left-radius:16px;border-top-right-radius:16px;'
      + 'box-shadow:0 -6px 30px rgba(0,0,0,.55);display:none;flex-direction:column;'
      + 'max-height:72vh;font-family:"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;}'
      + '#qcd-llenado-panel.abierto{display:flex;}'
      + '#qcd-llenado-panel .cab{padding:12px 14px;border-bottom:1px solid #243049;'
      + 'display:flex;align-items:center;gap:10px;}'
      + '#qcd-llenado-panel .cab b{color:#f5851f;font-size:15px;}'
      + '#qcd-llenado-panel .cab small{color:#94a3b8;font-size:11px;display:block;}'
      + '#qcd-llenado-panel .cerrar{margin-left:auto;background:rgba(255,255,255,.12);'
      + 'border:none;color:#f1f5f9;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;}'
      + '#qcd-llenado-chat{flex:1 1 auto;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;}'
      + '#qcd-llenado-chat .b{max-width:85%;padding:9px 12px;border-radius:13px;font-size:14px;line-height:1.45;white-space:pre-wrap;}'
      + '#qcd-llenado-chat .b.p{background:#1c2942;border:1px solid #243049;align-self:flex-start;border-bottom-left-radius:4px;}'
      + '#qcd-llenado-chat .b.u{background:#f5851f;color:#0d1526;font-weight:500;align-self:flex-end;border-bottom-right-radius:4px;}'
      + '#qcd-llenado-chat .b.p b{color:#ff9d3f;}'
      + '#qcd-llenado-ent{display:flex;gap:8px;padding:12px 14px;border-top:1px solid #243049;}'
      + '#qcd-llenado-ent input{flex:1;background:#151f36;border:1px solid #243049;color:#f1f5f9;'
      + 'border-radius:22px;padding:10px 14px;font-size:14px;outline:none;}'
      + '#qcd-llenado-ent button{background:#f5851f;border:none;color:#0d1526;width:42px;height:42px;'
      + 'border-radius:50%;font-size:17px;cursor:pointer;font-weight:800;}';
    var st = document.createElement('style');
    st.id = 'qcd-llenado-style';
    st.textContent = css;
    document.head.appendChild(st);

    var fab = document.createElement('button');
    fab.id = 'qcd-llenado-fab';
    fab.type = 'button';
    fab.innerHTML = '\u270d\ufe0f Llenar hablando';
    document.body.appendChild(fab);

    var panel = document.createElement('div');
    panel.id = 'qcd-llenado-panel';
    panel.innerHTML = ''
      + '<div class="cab"><div><b>Piwii</b><small>Llenado asistido \u00b7 Checklist camioneta</small></div>'
      + '<button class="cerrar" aria-label="Cerrar">&times;</button></div>'
      + '<div id="qcd-llenado-chat"></div>'
      + '<div id="qcd-llenado-ent"><input type="text" placeholder="Escribe tu respuesta\u2026" autocomplete="off">'
      + '<button aria-label="Enviar">\u27a4</button></div>';
    document.body.appendChild(panel);

    var chat = panel.querySelector('#qcd-llenado-chat');
    var input = panel.querySelector('#qcd-llenado-ent input');

    function burbuja(texto, quien){
      var d = document.createElement('div');
      d.className = 'b ' + (quien==='u'?'u':'p');
      if(quien==='u'){ d.textContent = texto; } else { d.innerHTML = texto; }
      chat.appendChild(d);
      chat.scrollTop = chat.scrollHeight;
    }

    function enviar(){
      var t = input.value.trim();
      if(!t) return;
      burbuja(t, 'u');
      input.value = '';
      setTimeout(function(){ burbuja(responder(t), 'p'); }, 180);
    }

    fab.addEventListener('click', function(){
      panel.classList.add('abierto');
      if(!chat.childElementCount){
        fase = 'inicio';
        burbuja('Hola, soy <b>Piwii</b>. Te ayudo a llenar el checklist conversando.\n\n'
              + 'Voy preguntando y marco los campos por ti. Al final revisas y firmas.\n\n'
              + '\u00bfEmpezamos? (escribe "s\u00ed")', 'p');
      }
    });
    panel.querySelector('.cerrar').addEventListener('click', function(){ panel.classList.remove('abierto'); });
    panel.querySelector('#qcd-llenado-ent button').addEventListener('click', enviar);
    input.addEventListener('keydown', function(e){ if(e.key==='Enter') enviar(); });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', inyectarUI);
  } else {
    inyectarUI();
  }
})();
