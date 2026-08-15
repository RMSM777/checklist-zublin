/* ============================================================
   PIWII-UNIFICADO.JS - Asistente Piwii unificado, QC Digital
   Reemplaza a piwii-widget.js (consulta por iframe) y a
   piwii-llenado.js (llenado embebido). Un solo boton, un solo
   panel embebido (sin iframe), con dos modos en pestanas:

     [ Consultar ]  [ Llenar ]

   - Consultar: base de conocimiento QC (modulo de falla DF/DT,
     criterios del PIE, siglas, niveles, guia de los 10 reportes).
     Es la misma logica que vivia en piwii.html, traida aca.
   - Llenar: guion conversacional que escribe en el formulario
     real del reporte. SOLO aparece si el reporte expone
     window.estados (hoy: checklist camioneta). En los demas
     reportes, el panel abre directo en Consultar sin pestanas.

   Hilo unico: el chat NO se limpia al cambiar de pestana. Cada
   mensaje se enruta al motor de la pestana ACTIVA en ese momento.
   El guion de llenado conserva su fase aunque el inspector se
   desvie a Consultar y vuelva.

   Se inyecta con una sola linea en el <head> de cada reporte:
     <script src="piwii-unificado.js" defer></script>

   Nota: piwii.html se conserva como archivo suelto (Piwii en
   pestana propia). Este modulo ya no depende de el.
   ============================================================ */

(function(){
  'use strict';
  if(window.__qcdPiwiiUnificado) return;
  window.__qcdPiwiiUnificado = true;

  /* ============================================================
     PARTE 1 - MOTOR DE CONSULTA (base de conocimiento QC)
     Traido verbatim desde piwii.html. Funcion: responderConsulta.
     ============================================================ */

  // Modulo de falla RE-1001-1027: clasificacion DF / DT
  var MODULO = [
    {k:["malla dañada","malla abierta","malla sin instalar","fortificacion incompleta de malla","fortificación incompleta de malla"], clase:"DF", txt:"Malla dañada, abierta o sin instalar es <b>Detención de Frente</b>. La fortificación de avance perno-malla se desfasa en las cajas según la calidad geotécnica (RMR, GSI, Q); malla en techo y springline hasta 2 m sobre el piso."},
    {k:["malla mal afianzada","mal afianzada"], clase:"DF", txt:"Malla mal afianzada a la sección es <b>Detención de Frente</b>. No se acepta continuar sin reparar previamente la desviación."},
    {k:["malla cargada"], clase:"DT", txt:"Malla cargada es <b>Detalle de Terminación</b>. Excepción: si hay condición de riesgo se descarga de inmediato; esa condición la levanta supervisión de Operaciones, Calidad, Geomecánica o APR."},
    {k:["traslape"], clase:"DF", txt:"El traslape de malla es <b>Detención de Frente</b> si no cumple. Debe cumplirse siempre lo indicado en planos: <b>30 a 40 cm</b>, centrado en la parada de pernos."},
    {k:["perno doblado","perno diagonal","perno sin planchuela","perno sin tuerca","perno largo","perno cortado","perno corto","perno bajo malla","perno sobre gradiente","perno sobregradiente"], clase:"DT", txt:"Pernos con esos defectos (doblado, diagonal, sin planchuela/tuerca, largo, cortado, corto, bajo malla, sobre gradiente) son <b>Detalle de Terminación</b>. Excepción: se acepta máximo <b>10% de pernos fallidos por parada</b>, ingresados como DT."},
    {k:["perno equivocado","perno instalado equivocado","instalacion de perno equivocado"], clase:"DF", txt:"Instalación de perno equivocado es <b>Detención de Frente</b>. No se acepta continuar sin reparar previamente."},
    {k:["perno faltante","fortificacion incompleta de perno","perno falta"], clase:"DF", txt:"Fortificación incompleta de perno (perno faltante en la parada) es <b>Detención de Frente</b>. Excepción: se acepta máximo <b>10% de pernos faltantes por parada</b>, ingresados como DT."},
    {k:["perno cable","largo sobresaliente","fuera de tolerancia","equipo tensor"], clase:"DT", txt:"Pernos cables con largo sobresaliente o fuera de tolerancia son <b>Detalle de Terminación</b>. Se acepta tolerancia máxima de <b>50 cm</b> por motivo de instalación del equipo tensor."},
    {k:["tuerca sin apriete","tuerca sin ajuste","ausencia de tuerca","sin tuerca"], clase:"DT", txt:"Tuerca sin apriete o ausencia de tuerca es <b>Detalle de Terminación</b>. Excepción: máximo <b>10% de desviación por parada</b>, ingresado como DT."},
    {k:["ausencia de planchuela","planchuela invertida","planchuelas sueltas","planchuela doblada","planchuela bajo malla","sin planchuela"], clase:"DT", txt:"Problemas de planchuela (ausencia, invertida, suelta, doblada, bajo malla) son <b>Detalle de Terminación</b>. Excepción: máximo <b>10% de desviación por parada</b>, ingresado como DT."},
    {k:["shotcrete soplado","nidos","soplado"], clase:"DT", txt:"Shotcrete soplado o con nidos es <b>Detalle de Terminación</b>. Excepción: sujeto a evaluación del Inspector de Calidad o Geomecánico, que puede pedir el saneamiento del área como detención de frente."},
    {k:["shotcrete con grietas","grietas","grieta"], clase:"DT", txt:"Shotcrete con grietas es <b>Detalle de Terminación</b>. Excepción: según la magnitud, Geomecánica evalúa la grieta y puede pedir saneamiento o instalación de medición de convergencia como detención de frente."},
    {k:["falta de shotcrete","falta shotcrete","sin shotcrete en tramos"], clase:"DF", txt:"Falta de shotcrete en tramos o sectores es <b>Detención de Frente</b>. Cumplir el criterio teórico por frente y tipo de roca; controlar espesor por laboratorio según PIE o colocar método preventivo (calibradores de espesor)."},
    {k:["shotcrete dañado","shotcrete danado"], clase:"DF", txt:"Shotcrete dañado es <b>Detención de Frente</b>. Se regulariza el sector o labor según diseño o planos de construcción."},
    {k:["sub-excavacion","sub excavacion","subexcavacion","subexcavación"], clase:"DF", txt:"Sub-excavación es <b>Detención de Frente</b>. Con el levantamiento topográfico se recupera la sección inmediatamente, previo al siguiente avance."},
    {k:["acuñadura deficiente","acunadura deficiente","acuñadura","acunadura"], clase:"DF", txt:"Acuñadura deficiente es <b>Detención de Frente</b>. No se acepta continuar con el avance si se detecta acuñadura deficiente o condición de riesgo."},
    {k:["lechada incompleta","lechada","columna completa"], clase:"DF", txt:"Lechada incompleta es <b>Detención de Frente</b>. No se acepta continuar si la lechada no está a columna completa."},
    {k:["afloramiento de agua","agua en perno","perno no galvanizado"], clase:"DT", txt:"Afloramiento de agua en perno no galvanizado es <b>Detalle de Terminación</b>. Según casos de geomecánicos: reposición de conjunto planchuela-perno galvanizado, o barbacana / canalización de aguas."}
  ];

  // Criterios con umbral numerico
  var CRITERIOS_NUM = [
    {k:["traslape"], min:30, unidad:"cm", ok:"El traslape cumple: mínimo 30 cm (rango 30–40 según planos).", falla:"El traslape NO cumple. El mínimo es 30 cm. Esto es Detención de Frente.", clase_falla:"DF"},
    {k:["angulo","ángulo","perforacion","perforación","desviacion","desviación","inclinacion","inclinación"], max:15, unidad:"°", ok:"El ángulo cumple: la desviación debe ser menor a 15°.", falla:"El ángulo NO cumple. La desviación debe ser menor a 15°.", clase_falla:"DT"},
    {k:["perno fuera","largo de perno","fuera de la roca"], max:10, unidad:"cm", ok:"El largo del perno fuera de la roca cumple: Ø22 mm debe quedar ≤ 10 cm.", falla:"El largo del perno fuera de la roca NO cumple: debe ser ≤ 10 cm.", clase_falla:"DT"},
    {k:["recubrimiento","espesor de malla","cubre malla"], min:5, unidad:"cm", ok:"El recubrimiento cumple: no inferior a 5,0 cm (o según planos).", falla:"El recubrimiento NO cumple: no debe ser inferior a 5,0 cm.", clase_falla:"DF"}
  ];

  var SIGLAS = {
    "dt":"DT = Detalle de Terminación. Pendiente que se genera en las caminatas y vive en SIC3PRO.",
    "pnc":"PNC = Producto No Conforme.",
    "rnc":"RNC = Reporte de No Conformidad.",
    "art":"ART = Análisis de Riesgo del Trabajo.",
    "pie":"PIE = Plan de Inspección y Ensayos. Define qué se controla, con qué frecuencia y bajo qué criterio de aceptación.",
    "sic3pro":"SIC3PRO = sistema donde viven los DT.",
    "pec":"PEC = Paquete / Carpeta de Entrega por Construcción, donde se archivan los protocolos formales.",
    "df":"DF = Detención de Frente. La desviación obliga a parar: no se sigue avanzando sin resolver.",
    "pd":"PD = Punto de Detención en el PIE (control que detiene el proceso).",
    "po":"PO = Punto de Observación (control sin detención).",
    "eime":"EIME = Equipo/Instrumento de Medición y Ensayo, con control de calibración vigente.",
    "ppye":"PPyE = Puntos de Parada y Espera.",
    "sgdoc":"SGDOC = Sistema de Gestión Documental de la VP de Proyectos de Codelco.",
    "ppod":"PoD = Planning of Day, minutas diarias de terreno.",
    "pod":"PoD = Planning of Day, minutas diarias de terreno."
  };

  var NIVELES = "Niveles de la mina:\n<b>Superiores:</b> NP (Producción), NH (Hundimiento).\n<b>Inferiores:</b> EXS (Extracción), INS (Inyección), ACA (Acarreo).";

  var REPORTES = {
    "procesos constructivos":{desc:"Informe de Procesos Constructivos. Registra el avance y control de cada proceso ejecutado en el turno.", campos:["Fecha y turno","Nivel/labor y frente","Proceso ejecutado (excavación, fortificación, etc.)","Controles verificados","Observaciones y evidencia fotográfica"]},
    "diario":{desc:"Reporte Diario. Resumen de lo hecho en el día: frentes, avances y pendientes.", campos:["Fecha y turno","Frentes trabajados","Avance del día","Pendientes / DT generados","Novedades del turno"]},
    "dt":{desc:"Reporte de Detalle de Terminación (DT). Pendientes detectados en caminatas, que van a SIC3PRO.", campos:["Nivel/labor y frente","Descripción del detalle","Clasificación (¿es DT o DF?)","Responsable","Fecha compromiso de cierre"]},
    "pnc":{desc:"Reporte PNC/RNC. Producto No Conforme o No Conformidad del proceso.", campos:["Identificación del producto/proceso","Descripción de la no conformidad","Criterio incumplido (referencia PIE / planos)","Disposición (reparar, rechazar, retrabajar)","Firma y seguimiento hasta el cierre"]},
    "programa semanal":{desc:"Reporte Programa Semanal. Planificación e inspecciones de la semana.", campos:["Semana","Frentes y actividades programadas","Inspecciones y ensayos previstos","Responsables","Estado de cumplimiento"]},
    "cambio de turno":{desc:"Operativo: Cambio de Turno. Traspaso de novedades entre turnos.", campos:["Turno saliente / entrante","Frentes en curso","Pendientes críticos","Equipos y condiciones","Firma de ambos turnos"]},
    "caminata de avance":{desc:"Operativo: Caminata de Avance. Inspección formal en terreno que genera los DT.", campos:["Nivel/labor recorrido","Detalles detectados","Clasificación DF / DT de cada uno","Registro fotográfico","Firma del inspector"]},
    "checklist camioneta":{desc:"Operativo: Checklist Camioneta. Chequeo del vehículo antes de terreno.", campos:["Patente / móvil","Niveles y neumáticos","Luces y frenos","Extintor y elementos de seguridad","Observaciones"]},
    "ic mi plano":{desc:"Operativo: IC Mi Plano. Ubicación e identificación de labores en plano.", campos:["Nivel","Labor / código WBS","Frente identificado","Referencia de plano","Notas"]},
    "liberacion de frente":{desc:"Protocolo de Recepción de Fortificación (liberación de frente). Consolida los 13 puntos de control y libera el frente si no hay DF pendiente.", campos:["Identificación (obra, contrato, fechas)","Tipos empleados (perno, malla, shotcrete)","Avance desarrollo (PK) y fortificación","13 puntos de control (Cumple / No cumple)","Doble firma: Inspección y Jefe de Turno"]}
  };

  var NOMBRE_REPORTE = {
    "procesos constructivos":"Procesos Constructivos",
    "diario":"Reporte Diario",
    "dt":"Reporte DT (Detalle de Terminación)",
    "pnc":"Reporte PNC / RNC",
    "programa semanal":"Programa Semanal",
    "cambio de turno":"Cambio de Turno",
    "caminata de avance":"Caminata de Avance",
    "checklist camioneta":"Checklist Camioneta",
    "ic mi plano":"IC Mi Plano",
    "liberacion de frente":"Liberación de Frente"
  };
  function nombreRep(k){ return NOMBRE_REPORTE[k] || capitaliza(k); }

  function normalizaC(s){
    return s.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[¿?¡!.,;:]/g," ").replace(/\s+/g," ").trim();
  }
  function extraeNumero(s){
    var m = s.match(/(\d+([.,]\d+)?)/);
    return m ? parseFloat(m[1].replace(",",".")) : null;
  }
  function capitaliza(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

  function responderConsulta(textoUsuario){
    var q = normalizaC(textoUsuario);

    if(/^(hola|buenas|buenos dias|buenas tardes|hey|que tal|holi)/.test(q)){
      return {txt:"Piwii, asistente de control de calidad de QC Digital. Apoyo la clasificación de desviaciones (Detención de Frente o Detalle de Terminación), la verificación de criterios de aceptación del PIE, la consulta de siglas y niveles, y la confección guiada de los reportes de la suite. Indíqueme la consulta."};
    }

    if(/(que|cuales|lista).*(reporte|informe|herramienta)/.test(q) || q==="reportes" || q==="ayuda"){
      var lista = Object.keys(REPORTES).map(function(k){ return "• "+nombreRep(k); }).join("\n");
      return {txt:"Reportes disponibles en QC Digital para confección guiada:\n\n"+lista+"\n\nIndique el reporte requerido y se detallarán sus campos. Ejemplo: \"reporte DT\"."};
    }

    if(/que (es|significa)|significa|sigla/.test(q)){
      for(var sig in SIGLAS){
        var reS = new RegExp("(^|\\s)"+sig+"($|\\s)");
        if(reS.test(q)){ return {txt:SIGLAS[sig], fuente:"Glosario QC"}; }
      }
    }
    if(SIGLAS[q]){ return {txt:SIGLAS[q], fuente:"Glosario QC"}; }

    for(var rk in REPORTES){
      if(q.indexOf(rk)!==-1 || (rk==="dt" && /reporte dt|detalle de terminacion/.test(q)) || (rk==="pnc" && /pnc|rnc|no conformidad/.test(q)) || (rk==="liberacion de frente" && /liberacion|liberar frente|recepcion de fortificacion|protocolo de fortificacion/.test(q))){
        var r = REPORTES[rk];
        var pasos = r.campos.map(function(c,i){ return (i+1)+". "+c; }).join("\n");
        return {txt:"<b>"+nombreRep(rk)+"</b>\n"+r.desc+"\n\nCampos que componen el registro:\n\n"+pasos+"\n\nComplete los campos en orden. Ante cualquier dato que requiera clasificación (por ejemplo, si una desviación corresponde a Detención de Frente o Detalle de Terminación), consúltelo y le indicaré el criterio aplicable.", fuente:"Suite QC Digital"};
      }
    }

    if(/nivel(es)?/.test(q) && !/liberar|reporte/.test(q)){
      return {txt:NIVELES, fuente:"Bases Técnicas / WBS"};
    }

    var num = extraeNumero(q);
    if(num!==null){
      for(var i=0;i<CRITERIOS_NUM.length;i++){
        var c = CRITERIOS_NUM[i];
        if(c.k.some(function(kw){ return q.indexOf(kw)!==-1; })){
          var cumple;
          if(c.min!==undefined) cumple = num >= c.min;
          if(c.max!==undefined) cumple = num <= c.max;
          if(cumple){
            return {txt:"Con "+num+" "+c.unidad+": "+c.ok, badge:"ok", fuente:"PIE / Módulo de falla"};
          } else {
            return {txt:"Con "+num+" "+c.unidad+": "+c.falla, badge:(c.clase_falla==="DF"?"df":"dt"), fuente:"PIE / Módulo de falla"};
          }
        }
      }
    }

    for(var m=0;m<MODULO.length;m++){
      if(MODULO[m].k.some(function(kw){ return q.indexOf(normalizaC(kw))!==-1; })){
        return {txt:MODULO[m].txt, badge:(MODULO[m].clase==="DF"?"df":"dt"), fuente:"Módulo de falla RE-1001-1027"};
      }
    }

    if(/(df|detencion de frente|detalle de terminacion|dt).*(o|vs|es)/.test(q) || /es (df|dt)/.test(q)){
      return {txt:"Para determinar si corresponde a <b>Detención de Frente</b> o <b>Detalle de Terminación</b>, especifique la desviación observada. Indique la condición concreta (por ejemplo: \"malla cargada\", \"lechada incompleta\", \"traslape 25 cm\") y se entregará la clasificación según el módulo de falla."};
    }

    return {txt:"Esa consulta no se encuentra en la base de conocimiento actual, por lo que no se entregará una respuesta para evitar información no verificada.\n\nConsultas disponibles: clasificación de desviaciones (Detención de Frente / Detalle de Terminación), verificación de criterios de aceptación (traslape, ángulo de perforación, recubrimiento, entre otros), glosario técnico, niveles de la mina y confección guiada de los reportes de la suite.\n\nPara análisis de casos no contemplados en la base, se requiere la integración con la API.", fuente:null};
  }

  /* ============================================================
     PARTE 2 - MOTOR DE LLENADO (guion por fases)
     Traido desde piwii-llenado.js. Funcion: responderLlenado.
     Solo tiene efecto si el reporte expone window.estados.
     ============================================================ */

  var PASOS_DATOS = [
    { campo:'obra',     pregunta:'\u00bfEn qu\u00e9 obra o faena est\u00e1s? (ej: Mina Chuquicamata Subterr\u00e1nea)' },
    { campo:'patente',  pregunta:'\u00bfPatente del veh\u00edculo?' },
    { campo:'interno',  pregunta:'\u00bfN\u00famero interno? (si no aplica, escribe "no")' },
    { campo:'modelo',   pregunta:'\u00bfModelo del veh\u00edculo?' },
    { campo:'km',       pregunta:'\u00bfKilometraje actual? (solo el n\u00famero)' }
  ];

  var faseLlenado = 'inicio';   // inicio -> datos -> equipo_global -> equipo_excepciones -> fin
  var idxDato = 0;

  /* ------------------------------------------------------------
     MOTOR GENERICO (para los reportes que NO son el checklist
     camioneta). Se activa si el reporte expone
     window.QCD_LLENADO_CONFIG = { campos:[ ... ] }.

     Tipos de campo soportados:
       'campo'   -> input/textarea simple: setCampo(id, texto tal cual)
       'toggle'  -> boton dentro de un contenedor con data-v (o el
                    atributo indicado en "attr"), se hace click al
                    boton cuyo valor calza con palabras clave dichas
                    por el inspector.
                    { id, tipo:'toggle', pregunta, contenedorId,
                      attr:'data-v' (opcional, default 'data-v'),
                      valores:[{v:'TURNO DIA', palabras:['dia','d\u00eda']}, ...] }
       'botones' -> igual que toggle pero sin contenedor com\u00fan:
                    cada opcion es un boton suelto por su propio id.
                    { id, tipo:'botones', pregunta,
                      opciones:[{elId:'btn-dia', palabras:['dia']}, ...] }
     ------------------------------------------------------------ */

  var faseLlenadoGen = 'inicio';   // inicio -> preguntas -> fin
  var idxCampoGen = 0;

  function campoActualGen(){
    var cfg = window.QCD_LLENADO_CONFIG;
    return (cfg && cfg.campos) ? cfg.campos[idxCampoGen] : null;
  }

  function aplicarToggleCampo(campo, textoOriginal){
    var q = normalizaL(textoOriginal);
    var cont = document.getElementById(campo.contenedorId);
    if(!cont) return false;
    var candidatos = (campo.valores || []).filter(function(o){
      return (o.palabras || []).some(function(p){ return q.indexOf(normalizaL(p))!==-1; });
    });
    if(!candidatos.length) return false;
    var attr = campo.attr || 'data-v';
    var btn = cont.querySelector('button['+attr+'="'+candidatos[0].v+'"]');
    if(btn){ btn.click(); return true; }
    return false;
  }

  function aplicarBotonesCampo(campo, textoOriginal){
    var q = normalizaL(textoOriginal);
    var candidatos = (campo.opciones || []).filter(function(o){
      return (o.palabras || []).some(function(p){ return q.indexOf(normalizaL(p))!==-1; });
    });
    if(!candidatos.length) return false;
    var btn = document.getElementById(candidatos[0].elId);
    if(btn){ btn.click(); return true; }
    return false;
  }

  function aplicarRespuestaCampoGen(campo, textoOriginal){
    if(campo.tipo === 'toggle')  return aplicarToggleCampo(campo, textoOriginal);
    if(campo.tipo === 'botones') return aplicarBotonesCampo(campo, textoOriginal);
    return setCampo(campo.id, textoOriginal.trim());
  }

  function responderLlenadoGenerico(txt){
    var q = normalizaL(txt);

    if(faseLlenadoGen === 'inicio'){
      if(q.indexOf('si')===0 || q==='dale' || q==='ok' || q==='empezar' || q.indexOf('llen')!==-1){
        faseLlenadoGen = 'preguntas'; idxCampoGen = 0;
        var c0 = campoActualGen();
        if(!c0){ faseLlenadoGen = 'fin'; return 'Este reporte todav\u00eda no tiene preguntas configuradas para el llenado asistido.'; }
        return c0.pregunta;
      }
      return 'Cuando quieras partir, escribe "s\u00ed" y te voy preguntando para llenar el reporte. Escribe "cancelar" para cerrar.';
    }

    if(q === 'cancelar' || q === 'salir'){
      faseLlenadoGen = 'inicio';
      return 'Listo, cerramos el llenado asistido. Puedes seguir a mano o volver a empezar cuando quieras.';
    }

    if(faseLlenadoGen === 'preguntas'){
      var campo = campoActualGen();
      if(campo){
        // "no" solo se trata como "omitir campo" en campos de texto: en
        // toggles/botones "no" puede ser una opcion valida (ej: "¿hubo
        // movimientos?" -> "no"), asi que ahi solo "omitir"/"saltar" saltan.
        var esToggleOBotones = (campo.tipo === 'toggle' || campo.tipo === 'botones');
        var esOmitir = esToggleOBotones ? (q==='omitir' || q==='saltar') : (q==='no' || q==='omitir' || q==='saltar');
        if(!esOmitir){ aplicarRespuestaCampoGen(campo, txt); }
        idxCampoGen++;
      }
      var siguiente = campoActualGen();
      if(siguiente){
        return '\u2713 Anotado. ' + siguiente.pregunta;
      }
      faseLlenadoGen = 'fin';
      return '\u2713 Listo, complet\u00e9 los campos b\u00e1sicos del reporte.\n\nLo que falta (fotos, archivos subidos, tablas de detalle y firma) qued\u00f3 para que lo hagas a mano. Revisa todo antes de cerrar el reporte. \u00a1Buen turno!';
    }

    if(faseLlenadoGen === 'fin'){
      return 'El llenado asistido termin\u00f3. Si quieres volver a empezar, escribe "empezar".';
    }

    return 'No te entend\u00ed. Escribe "cancelar" para cerrar el asistente.';
  }

  function setCampo(id, valor){
    var el = document.getElementById(id);
    if(el){ el.value = valor; el.dispatchEvent(new Event('input', {bubbles:true})); return true; }
    return false;
  }

  function marcarTodoBueno(){
    var n = 0;
    document.querySelectorAll('#componentes .comp-fila').forEach(function(fila){
      var btnB = fila.querySelector('button[data-v="B"]');
      if(btnB){ btnB.click(); n++; }
    });
    return n;
  }

  function listaItems(){
    var arr = [];
    if(window.estados){
      Object.keys(window.estados).forEach(function(k){
        arr.push({ key:k, item:window.estados[k].item, sistema:window.estados[k].sistema });
      });
    }
    return arr;
  }

  function marcarItemPorTexto(texto, valor){
    var q = normalizaL(texto);
    var candidatos = listaItems().filter(function(o){
      var t = normalizaL(o.item + ' ' + o.sistema);
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

  function normalizaL(s){
    return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  function responderLlenado(txt){
    var q = normalizaL(txt);

    if(faseLlenado === 'inicio'){
      if(q.indexOf('si')===0 || q==='dale' || q==='ok' || q==='empezar' || q.indexOf('llen')!==-1){
        faseLlenado = 'datos'; idxDato = 0;
        return PASOS_DATOS[0].pregunta;
      }
      return 'Cuando quieras partir, escribe "s\u00ed" y te voy preguntando para llenar el checklist. Escribe "cancelar" para cerrar.';
    }

    if(q === 'cancelar' || q === 'salir'){
      faseLlenado = 'inicio';
      return 'Listo, cerramos el llenado asistido. Puedes seguir a mano o volver a empezar cuando quieras.';
    }

    if(faseLlenado === 'datos'){
      var paso = PASOS_DATOS[idxDato];
      var val = txt.trim();
      if(!(val.toLowerCase()==='no' && paso.campo==='interno')){
        setCampo(paso.campo, val);
      }
      idxDato++;
      if(idxDato < PASOS_DATOS.length){
        return '\u2713 Anotado. ' + PASOS_DATOS[idxDato].pregunta;
      }
      faseLlenado = 'equipo_global';
      return '\u2713 Datos listos.\n\nAhora el estado mec\u00e1nico. \u00bfEst\u00e1 <b>todo el equipo en buen estado</b>? '
           + '(responde "s\u00ed" y marco todos en B; o "no" si hay algo con problema)';
    }

    if(faseLlenado === 'equipo_global'){
      if(q.indexOf('si')===0 || q==='ok' || q==='dale'){
        var n = marcarTodoBueno();
        faseLlenado = 'equipo_excepciones';
        return '\u2713 Marqu\u00e9 los ' + n + ' \u00edtems en <b>B (Bueno)</b>.\n\n'
             + '\u00bfHay alg\u00fan \u00edtem con problema o que no aplique? Dime cu\u00e1l y c\u00f3mo '
             + '(ej: "frenos malo" o "rueda repuesto no aplica"). Si est\u00e1 todo bien, escribe "listo".';
      }
      if(q.indexOf('no')===0){
        faseLlenado = 'equipo_excepciones';
        return 'Bien, no marco todo. Dime \u00edtem por \u00edtem los que tengan problema '
             + '(ej: "frenos malo"). Cuando termines, escribe "listo".';
      }
      return 'Responde "s\u00ed" para marcar todo en Bueno, o "no" para ir uno por uno.';
    }

    if(faseLlenado === 'equipo_excepciones'){
      if(q === 'listo' || q === 'fin' || q === 'terminado'){
        faseLlenado = 'fin';
        return '\u2713 Estado mec\u00e1nico registrado.\n\nEl resto (fatiga, observaciones y firmas) qued\u00f3 para que lo completes a mano. '
             + 'Revisa que todo est\u00e9 correcto antes de cerrar el reporte. \u00a1Buen turno!';
      }
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

    if(faseLlenado === 'fin'){
      return 'El llenado asistido termin\u00f3. Si quieres volver a empezar, escribe "empezar".';
    }

    return 'No te entend\u00ed. Escribe "cancelar" para cerrar el asistente.';
  }

  /* ============================================================
     PARTE 3 - UI: boton + panel embebido con pestanas
     ============================================================ */

  // El modo Llenar existe si el reporte expone window.estados (checklist
  // camioneta, motor especifico) O window.QCD_LLENADO_CONFIG con campos
  // (motor generico, para el resto de los reportes de la suite).
  function llenadoDisponible(){
    return !!window.estados
        || !!(window.QCD_LLENADO_CONFIG && window.QCD_LLENADO_CONFIG.campos && window.QCD_LLENADO_CONFIG.campos.length);
  }

  // Enruta al motor especifico del checklist camioneta o al generico,
  // segun lo que exponga el reporte. window.estados tiene prioridad
  // (asi el checklist camioneta sigue igual que siempre).
  function responderLlenadoDispatch(txt){
    if(window.estados) return responderLlenado(txt);
    if(window.QCD_LLENADO_CONFIG) return responderLlenadoGenerico(txt);
    return 'Este reporte no tiene llenado conversacional configurado todavía.';
  }

  var modoActivo = 'consulta';   // 'consulta' | 'llenado'
  var llenadoIniciado = false;   // para lanzar el saludo del guion una sola vez

  var SVG_ICONO = ''
    + '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<polygon points="256,40 462,158 462,354 256,472 50,354 50,158" fill="#f5851f"/>'
    + '<polygon points="256,86 422,182 422,330 256,426 90,330 90,182" fill="#0d1526"/>'
    + '<path d="M188 262 l44 46 l96 -104" fill="none" stroke="#f5851f" '
    + 'stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</svg>';

  function inyectarEstilos(){
    if(document.getElementById('qcd-piwii-u-style')) return;
    var css = ''
      // Boton flotante (unico). Va sobre el toggle de tema (bottom:16px).
      + '.qcdu-fab{position:fixed;bottom:76px;right:16px;z-index:9998;'
      + 'width:52px;height:52px;border:none;border-radius:50%;cursor:pointer;'
      + 'background:linear-gradient(160deg,#1c2942,#0d1526);'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.45);'
      + 'display:flex;align-items:center;justify-content:center;padding:0;'
      + 'transition:transform .15s ease,box-shadow .15s ease;}'
      + '.qcdu-fab:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.5);}'
      + '.qcdu-fab:active{transform:scale(.94);}'
      + '.qcdu-fab svg{width:30px;height:30px;display:block;}'
      // Overlay + panel
      + '.qcdu-overlay{position:fixed;inset:0;z-index:10050;'
      + 'background:rgba(6,10,20,.72);backdrop-filter:blur(2px);'
      + 'display:none;align-items:stretch;justify-content:center;}'
      + '.qcdu-overlay.abierto{display:flex;}'
      + '.qcdu-panel{position:relative;width:100%;max-width:520px;height:100%;'
      + 'background:#0d1526;color:#f1f5f9;display:flex;flex-direction:column;'
      + 'box-shadow:0 0 40px rgba(0,0,0,.6);animation:qcduUp .22s ease;'
      + 'font-family:"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;}'
      + '@keyframes qcduUp{from{transform:translateY(14px);opacity:.4}to{transform:none;opacity:1}}'
      // Cabecera
      + '.qcdu-cab{padding:11px 14px;border-bottom:2px solid #f5851f;'
      + 'background:linear-gradient(160deg,#151f36,#0d1526);display:flex;align-items:center;gap:10px;flex:0 0 auto;}'
      + '.qcdu-cab .tit b{color:#f5851f;font-size:15px;}'
      + '.qcdu-cab .tit small{color:#94a3b8;font-size:11px;display:block;}'
      + '.qcdu-cerrar{margin-left:auto;background:rgba(255,255,255,.12);border:none;'
      + 'color:#f1f5f9;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:17px;}'
      + '.qcdu-cerrar:hover{background:rgba(255,255,255,.22);}'
      // Pestanas
      + '.qcdu-tabs{display:flex;gap:0;flex:0 0 auto;background:#151f36;border-bottom:1px solid #243049;}'
      + '.qcdu-tab{flex:1;background:none;border:none;color:#94a3b8;font-family:inherit;'
      + 'font-size:13px;font-weight:700;padding:11px 8px;cursor:pointer;'
      + 'border-bottom:2px solid transparent;transition:color .15s,border-color .15s;}'
      + '.qcdu-tab.activa{color:#ff9d3f;border-bottom-color:#f5851f;}'
      // Chat
      + '.qcdu-chat{flex:1 1 auto;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;}'
      + '.qcdu-chat::-webkit-scrollbar{width:8px;}'
      + '.qcdu-chat::-webkit-scrollbar-thumb{background:#243049;border-radius:8px;}'
      + '.qcdu-b{max-width:85%;padding:9px 12px;border-radius:13px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;}'
      + '.qcdu-b.p{background:#1c2942;border:1px solid #243049;align-self:flex-start;border-bottom-left-radius:4px;}'
      + '.qcdu-b.u{background:#f5851f;color:#0d1526;font-weight:500;align-self:flex-end;border-bottom-right-radius:4px;}'
      + '.qcdu-b.p b{color:#ff9d3f;}'
      // Etiqueta de origen (que pestana genero el mensaje)
      + '.qcdu-org{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;'
      + 'opacity:.55;margin-bottom:3px;display:block;}'
      + '.qcdu-b.p .qcdu-org{color:#94a3b8;}'
      + '.qcdu-b.u .qcdu-org{color:#0d1526;}'
      // Badges DF/DT/OK y fuente (consulta)
      + '.qcdu-badge{display:inline-block;font-size:11px;font-weight:800;padding:2px 9px;border-radius:20px;'
      + 'margin:0 4px 4px 0;text-transform:uppercase;letter-spacing:.5px;}'
      + '.qcdu-badge.df{background:rgba(224,92,74,.2);color:#e05c4a;border:1px solid #e05c4a;}'
      + '.qcdu-badge.dt{background:rgba(245,133,31,.18);color:#f5851f;border:1px solid #f5851f;}'
      + '.qcdu-badge.ok{background:rgba(79,157,105,.18);color:#4f9d69;border:1px solid #4f9d69;}'
      + '.qcdu-fuente{display:block;margin-top:7px;font-size:11px;color:#94a3b8;border-top:1px solid #243049;padding-top:5px;}'
      // Chips (solo consulta)
      + '.qcdu-chips{flex:0 0 auto;padding:8px 12px;display:flex;gap:7px;overflow-x:auto;'
      + 'border-top:1px solid #243049;background:#151f36;}'
      + '.qcdu-chips::-webkit-scrollbar{height:0;}'
      + '.qcdu-chip{white-space:nowrap;background:#1c2942;border:1px solid #243049;color:#f1f5f9;'
      + 'font-size:12px;padding:7px 13px;border-radius:20px;cursor:pointer;font-family:inherit;flex:0 0 auto;}'
      + '.qcdu-chip:hover{border-color:#f5851f;}'
      // Entrada
      + '.qcdu-ent{display:flex;gap:8px;padding:11px 12px;border-top:1px solid #243049;background:#151f36;flex:0 0 auto;}'
      + '.qcdu-ent input{flex:1;background:#1c2942;border:1px solid #243049;color:#f1f5f9;'
      + 'border-radius:22px;padding:10px 14px;font-size:14px;outline:none;font-family:inherit;}'
      + '.qcdu-ent input:focus{border-color:#f5851f;}'
      + '.qcdu-ent button{background:#f5851f;border:none;color:#0d1526;width:42px;height:42px;'
      + 'border-radius:50%;font-size:17px;cursor:pointer;font-weight:800;flex:0 0 auto;'
      + 'display:flex;align-items:center;justify-content:center;}'
      + '.qcdu-ent button:active{transform:scale(.92);}'
      // Microfono: navy por defecto, rojo pulsante mientras graba
      + '.qcdu-mic{background:#1c2942 !important;color:#f1f5f9 !important;border:1px solid #243049 !important;}'
      + '.qcdu-mic.grabando{background:#e05c4a !important;color:#fff !important;border-color:#e05c4a !important;'
      + 'animation:qcduPulso 1.1s ease-in-out infinite;}'
      + '@keyframes qcduPulso{0%,100%{box-shadow:0 0 0 0 rgba(224,92,74,.55)}50%{box-shadow:0 0 0 7px rgba(224,92,74,0)}}'
      + '@media(min-width:560px){.qcdu-overlay{align-items:center;padding:20px;}'
      + '.qcdu-panel{height:88vh;border-radius:16px;overflow:hidden;}}';
    var st = document.createElement('style');
    st.id = 'qcd-piwii-u-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  var overlay = null, chat = null, input = null, chipsBar = null, tabsBar = null;

  function escapa(s){ var d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

  function burbuja(texto, quien, extra){
    var div = document.createElement('div');
    div.className = 'qcdu-b ' + (quien==='u' ? 'u' : 'p');
    var html = '';
    // etiqueta de origen: distingue en el hilo unico de que modo vino
    var org = extra && extra.origen;
    if(org){ html += '<span class="qcdu-org">'+org+'</span>'; }
    if(extra && extra.badge){
      var etq = extra.badge==='df'?'df':(extra.badge==='ok'?'ok':'dt');
      var label = extra.badge==='df'?'Detención de Frente':(extra.badge==='ok'?'Cumple':'Detalle de Terminación');
      html += '<span class="qcdu-badge '+etq+'">'+label+'</span><br>';
    }
    if(quien==='u'){ html += escapa(texto); }
    else { html += texto; }
    if(extra && extra.fuente){
      html += '<span class="qcdu-fuente">Fuente: '+extra.fuente+'</span>';
    }
    div.innerHTML = html;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  var CHIPS = [
    {t:"Reportes disponibles", q:"¿qué reportes hay?"},
    {t:"Traslape 25 cm", q:"traslape de malla quedó en 25 cm"},
    {t:"Malla cargada", q:"malla cargada"},
    {t:"Lechada incompleta", q:"lechada incompleta"},
    {t:"Definición: DT", q:"qué es un DT"},
    {t:"Niveles de la mina", q:"niveles de la mina"}
  ];

  function pintarChips(){
    chipsBar.innerHTML = '';
    // Los chips son atajos de consulta; se muestran solo en esa pestana.
    if(modoActivo !== 'consulta'){ chipsBar.style.display='none'; return; }
    chipsBar.style.display = 'flex';
    CHIPS.forEach(function(c){
      var b = document.createElement('button');
      b.className = 'qcdu-chip';
      b.textContent = c.t;
      b.onclick = function(){ enviar(c.q); };
      chipsBar.appendChild(b);
    });
  }

  function actualizarTabs(){
    if(!tabsBar) return;
    Array.prototype.forEach.call(tabsBar.children, function(btn){
      btn.classList.toggle('activa', btn.getAttribute('data-modo')===modoActivo);
    });
    input.placeholder = (modoActivo==='consulta')
      ? 'Formule su consulta de calidad\u2026'
      : 'Escribe tu respuesta\u2026';
  }

  function cambiarModo(m){
    if(m===modoActivo) return;
    if(m==='llenado' && !llenadoDisponible()) return;
    modoActivo = m;
    actualizarTabs();
    pintarChips();
    // Al entrar por primera vez a llenado, lanzar el saludo del guion.
    if(m==='llenado' && !llenadoIniciado){
      llenadoIniciado = true;
      faseLlenado = 'inicio';
      faseLlenadoGen = 'inicio'; idxCampoGen = 0;
      burbuja('Hola, soy <b>Piwii</b>. Te ayudo a llenar el checklist conversando.\n\n'
            + 'Voy preguntando y marco los campos por ti. Al final revisas y firmas.\n\n'
            + '\u00bfEmpezamos? (escribe "s\u00ed")', 'p', {origen:'Llenar'});
    }
  }

  function enviar(texto){
    var t = (texto!==undefined ? texto : input.value).trim();
    if(!t) return;
    burbuja(t, 'u', {origen: modoActivo==='consulta'?'Consulta':'Llenar'});
    input.value = '';
    // Enrutamiento segun pestana ACTIVA en este momento (hilo unico).
    setTimeout(function(){
      if(modoActivo==='consulta'){
        var r = responderConsulta(t);
        r.origen = 'Consulta';
        burbuja(r.txt, 'p', r);
      } else {
        var txt = responderLlenadoDispatch(t);
        burbuja(txt, 'p', {origen:'Llenar'});
      }
    }, 220);
  }
  window.__qcduEnviar = enviar; // expuesto para chips

  function construirOverlay(){
    if(overlay) return;
    inyectarEstilos();

    overlay = document.createElement('div');
    overlay.className = 'qcdu-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-label','Piwii, asistente de calidad');

    var panel = document.createElement('div');
    panel.className = 'qcdu-panel';

    // Cabecera
    var cab = document.createElement('div');
    cab.className = 'qcdu-cab';
    cab.innerHTML = SVG_ICONO_MINI()
      + '<div class="tit"><b>Piwii</b><small>Asistente QC \u00b7 QC Digital</small></div>';
    var cerrar = document.createElement('button');
    cerrar.className = 'qcdu-cerrar';
    cerrar.type = 'button';
    cerrar.setAttribute('aria-label','Cerrar Piwii');
    cerrar.innerHTML = '&times;';
    cerrar.addEventListener('click', cerrarPanel);
    cab.appendChild(cerrar);
    panel.appendChild(cab);

    // Pestanas (solo si el llenado esta disponible)
    if(llenadoDisponible()){
      tabsBar = document.createElement('div');
      tabsBar.className = 'qcdu-tabs';
      [['consulta','Consultar'],['llenado','Llenar']].forEach(function(par){
        var b = document.createElement('button');
        b.className = 'qcdu-tab';
        b.type = 'button';
        b.setAttribute('data-modo', par[0]);
        b.textContent = par[1];
        b.addEventListener('click', function(){ cambiarModo(par[0]); });
        tabsBar.appendChild(b);
      });
      panel.appendChild(tabsBar);
    }

    // Chat
    chat = document.createElement('div');
    chat.className = 'qcdu-chat';
    panel.appendChild(chat);

    // Chips
    chipsBar = document.createElement('div');
    chipsBar.className = 'qcdu-chips';
    panel.appendChild(chipsBar);

    // Entrada
    var ent = document.createElement('div');
    ent.className = 'qcdu-ent';
    input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('autocomplete','off');
    var btnEnviar = document.createElement('button');
    btnEnviar.type = 'button';
    btnEnviar.setAttribute('aria-label','Enviar');
    btnEnviar.innerHTML = '\u27a4';
    btnEnviar.addEventListener('click', function(){ enviar(); });
    input.addEventListener('keydown', function(e){ if(e.key==='Enter') enviar(); });

    // Boton de microfono (dictado). Solo se muestra si hay soporte de
    // reconocimiento Y hay conexion. En terreno sin senal se oculta solo
    // y el inspector sigue escribiendo. Ver capa de voz mas abajo.
    btnMic = document.createElement('button');
    btnMic.type = 'button';
    btnMic.className = 'qcdu-mic';
    btnMic.setAttribute('aria-label','Dictar por voz');
    btnMic.innerHTML = SVG_MIC();
    btnMic.addEventListener('click', alternarDictado);

    ent.appendChild(input);
    ent.appendChild(btnMic);
    ent.appendChild(btnEnviar);
    panel.appendChild(ent);

    actualizarVisibilidadMic();

    overlay.appendChild(panel);
    overlay.addEventListener('click', function(e){ if(e.target===overlay) cerrarPanel(); });
    document.body.appendChild(overlay);

    modoActivo = 'consulta';
    actualizarTabs();
    pintarChips();

    // Bienvenida de consulta (una vez)
    burbuja("<b>Piwii</b> — Asistente de Control de Calidad de QC Digital.\n\n"
          + "Opera en modo Aprendiz sobre la base de conocimiento de la faena: módulo de falla (RE-1001-1027), "
          + "criterios de aceptación del PIE, glosario técnico y los reportes de la suite.\n\n"
          + "Seleccione una consulta frecuente o formule su pregunta directamente."
          + (llenadoDisponible() ? "\n\nPara llenar este checklist conversando, use la pestaña <b>Llenar</b> de arriba." : ""),
          'p', {origen:'Consulta'});
  }

  function SVG_ICONO_MINI(){
    return '<svg width="30" height="30" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<rect width="512" height="512" rx="100" fill="#0d1526"/>'
      + '<polygon points="256,66 420.5,161 420.5,351 256,446 91.5,351 91.5,161" fill="none" stroke="#f5851f" stroke-width="10"/>'
      + '<path d="M181,260 L231,310 L339,194" fill="none" stroke="#f5851f" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>';
  }

  /* ============================================================
     PARTE 3.5 - CAPA DE VOZ (dictado)
     Regla: ONLINE -> se puede dictar; OFFLINE -> solo escrito.
     La voz NO envia sola: transcribe al campo de entrada y el
     inspector confirma con enviar. Asi un mal reconocimiento no
     marca un item equivocado en el checklist.
     ============================================================ */

  var btnMic = null;
  var reconociendo = false;
  var recog = null;

  // Constructor de reconocimiento (Chrome/Android usa prefijo webkit).
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  // Soporta voz = existe el API + navegador en linea.
  // navigator.onLine no es infalible (puede dar true sin salida real),
  // pero como el reconocimiento necesita red, si falla la peticion el
  // handler onerror degrada a texto igual. Doble red de seguridad.
  function vozSoportada(){
    return !!SR && navigator.onLine === true;
  }

  function actualizarVisibilidadMic(){
    if(!btnMic) return;
    btnMic.style.display = vozSoportada() ? 'flex' : 'none';
  }

  // Si cambia la conectividad con el panel abierto, mostrar/ocultar mic.
  window.addEventListener('online',  actualizarVisibilidadMic);
  window.addEventListener('offline', function(){
    detenerDictado();
    actualizarVisibilidadMic();
  });

  function crearRecog(){
    var r = new SR();
    r.lang = 'es-CL';
    r.interimResults = true;   // muestra transcripcion parcial en vivo
    r.continuous = false;      // una frase por activacion (mas robusto)
    r.maxAlternatives = 1;

    r.onresult = function(e){
      var txt = '';
      for(var i=0;i<e.results.length;i++){ txt += e.results[i][0].transcript; }
      input.value = txt;   // rellena el campo; NO envia
    };
    r.onerror = function(e){
      // no-speech, audio-capture, not-allowed, network...
      reconociendo = false;
      pintarMicEstado();
      var msg;
      if(e && e.error === 'not-allowed'){
        msg = 'No tengo permiso para el micrófono. Actívalo en el navegador o escribe tu respuesta.';
      } else if(e && e.error === 'network'){
        msg = 'El dictado necesita conexión y no la hay. Escribe tu respuesta.';
        actualizarVisibilidadMic();
      } else if(e && e.error === 'no-speech'){
        msg = 'No te escuché. Toca el micrófono de nuevo o escríbelo.';
      } else {
        msg = 'No pude usar el micrófono. Escribe tu respuesta.';
      }
      burbuja(msg, 'p', {origen: modoActivo==='consulta'?'Consulta':'Llenar'});
    };
    r.onend = function(){
      reconociendo = false;
      pintarMicEstado();
    };
    return r;
  }

  function alternarDictado(){
    if(!vozSoportada()){ actualizarVisibilidadMic(); return; }
    if(reconociendo){ detenerDictado(); return; }
    try{
      if(!recog) recog = crearRecog();
      input.value = '';
      recog.start();
      reconociendo = true;
      pintarMicEstado();
    }catch(err){
      // start() lanza si ya estaba corriendo; lo reseteamos.
      reconociendo = false;
      pintarMicEstado();
    }
  }

  function detenerDictado(){
    if(recog && reconociendo){
      try{ recog.stop(); }catch(err){}
    }
    reconociendo = false;
    pintarMicEstado();
  }

  function pintarMicEstado(){
    if(!btnMic) return;
    btnMic.classList.toggle('grabando', reconociendo);
    btnMic.setAttribute('aria-label', reconociendo ? 'Detener dictado' : 'Dictar por voz');
  }

  function SVG_MIC(){
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" '
      + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<rect x="9" y="2" width="6" height="12" rx="3"/>'
      + '<path d="M5 10a7 7 0 0 0 14 0"/>'
      + '<line x1="12" y1="17" x2="12" y2="21"/>'
      + '<line x1="8" y1="21" x2="16" y2="21"/>'
      + '</svg>';
  }

  function abrirPanel(){
    construirOverlay();
    actualizarVisibilidadMic();
    overlay.classList.add('abierto');
    document.documentElement.style.overflow = 'hidden';
    if(input){ setTimeout(function(){ input.focus(); }, 60); }
  }

  function cerrarPanel(){
    if(!overlay) return;
    overlay.classList.remove('abierto');
    document.documentElement.style.overflow = '';
  }

  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && overlay && overlay.classList.contains('abierto')){ cerrarPanel(); }
  });

  function inyectarBoton(){
    if(document.querySelector('.qcdu-fab')) return;
    inyectarEstilos();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qcdu-fab';
    btn.setAttribute('aria-label','Abrir Piwii, asistente de calidad');
    btn.innerHTML = SVG_ICONO;
    btn.addEventListener('click', abrirPanel);
    document.body.appendChild(btn);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', inyectarBoton);
  } else {
    inyectarBoton();
  }
})();
