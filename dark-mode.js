/* ============================================================
   DARK-MODE.JS - Toggle de modo oscuro compartido, QC Digital
   La preferencia se guarda en localStorage y aplica a todas las
   paginas de la app (misma clave para todos los reportes + home).

   El tema en si (colores) vive en dark-mode.css, que debe estar
   incluido con <link rel="stylesheet" href="dark-mode.css"> en
   el <head> de cada pagina, DESPUES del <style> propio del
   reporte para que sus reglas ganen especificidad natural.

   Este archivo se encarga de:
     1) Inyectar el boton flotante sol/luna.
     2) Alternar la clase "dark" en <html> al hacer click.
     3) Guardar y leer la preferencia.

   Nota: para evitar parpadeo (FOUC) al cargar la pagina, cada
   reporte tambien debe tener este snippet INLINE en el <head>,
   antes de cualquier CSS, para aplicar la clase apenas se pueda:

     <script>
     try{ if(localStorage.getItem('qcd_dark')==='1') document.documentElement.classList.add('dark'); }catch(e){}
     </script>
   ============================================================ */

(function(){
  const LS_KEY = 'qcd_dark';

  function estaActivo(){
    try{ return localStorage.getItem(LS_KEY) === '1'; }catch(e){ return false; }
  }

  function guardar(activo){
    try{ localStorage.setItem(LS_KEY, activo ? '1' : '0'); }catch(e){}
  }

  function aplicar(activo){
    document.documentElement.classList.toggle('dark', activo);
    const btn = document.querySelector('.qcd-theme-toggle');
    if(btn) btn.textContent = activo ? '\u2600\uFE0F' : '\u{1F319}';
  }

  function inyectarBoton(){
    if(document.querySelector('.qcd-theme-toggle')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qcd-theme-toggle';
    btn.setAttribute('aria-label', 'Cambiar tema claro/oscuro');
    btn.textContent = estaActivo() ? '\u2600\uFE0F' : '\u{1F319}';
    btn.addEventListener('click', function(){
      const nuevoEstado = !document.documentElement.classList.contains('dark');
      aplicar(nuevoEstado);
      guardar(nuevoEstado);
    });
    document.body.appendChild(btn);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', inyectarBoton);
  } else {
    inyectarBoton();
  }
})();
