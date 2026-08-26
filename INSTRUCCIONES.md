# Fix: QR de verificación mostraba el documento equivocado

## El bug (confirmado, no solo sospechado)

`verificar.html` busca el código del QR **solo por correlativo** (columna D de
la Sheet) y se queda con la **primera fila que encuentra**. El correlativo
(`RM-2026-0007`, `RMS-2026-0001`, etc.) se guarda en `localStorage` **por
dispositivo y por tipo de documento**, así que no es un número global único:
se repite entre equipos, entre días, e incluso entre distintos tipos de
reporte del mismo inspector.

Ejemplo real que encontré en la Sheet "QC Digital - Repositorio": el
correlativo `RMS-2026-0001` para "Reporte DT" aparece en **tres** documentos
distintos (03-ago NOCHE, 05-ago DÍA, y el de prueba del 23-ago). Si alguien
escanea HOY el QR del PDF de prueba del 23-ago, `verificar.html` no muestra
ese PDF: muestra el primero que encuentra en la hoja, que es del 3 de agosto.
Lo probé simulando la búsqueda con los datos reales — confirmado.

## El fix

Cada documento ahora tiene, además del correlativo (que se sigue imprimiendo
igual en el PDF, "N° RM-2026-0007", sin cambios visuales), una **clave de
verificación única** = correlativo + sufijo de milisegundos
(`MARCA.claveVerificacion()` en `marca.js`). Esa clave es la que va codificada
en el QR y la que se guarda en una columna nueva (I) de la Sheet.
`verificar.html` busca primero por esa clave (exacta, nunca se repite); si no
la encuentra —porque el QR es de un documento generado antes de este
cambio— cae de vuelta a buscar por correlativo como antes, pero avisando
"Coincidencia aproximada" en vez de presentarlo como una confirmación exacta.

Probé la lógica nueva contra los datos reales de la Sheet (simulado en Node,
no en el navegador) y confirma: el QR del PDF de prueba del 23-ago ahora
resuelve al documento correcto, no al del 3 de agosto.

## Archivos modificados (16)

- `marca.js` — nuevo método `MARCA.claveVerificacion()`.
- `drive-integration.js` — agrega columna I (`claveVerificacion`) a la fila
  que se registra en la Sheet.
- `verificar.html` — búsqueda en dos pasadas (clave exacta, luego
  correlativo como respaldo con aviso de "aproximado").
- Los 10 reportes que generan QR (cada uno con 1-2 cambios chicos: usar la
  clave en vez del correlativo al armar el QR, y mandarla junto al
  correlativo al subir a Drive/Sheet):
  `cambio-turno-general.html`, `caminata-avance-index.html`,
  `checklist-camioneta.html`, `ic-mi-plano-index.html`,
  `informe-procesos-constructivos.html`, `listado-firmas-digitales.html`,
  `reporte-diario.html`, `reporte-dt-index.html` (2 sitios: reporte + listado
  DT), `reporte-liberacion-frente.html`, `reporte-programa-semanal.html`.
- `service-worker.js` — `CACHE_NAME` v16 → v17, y las entradas de precache
  de `marca.js` y `drive-integration.js` suben de versión.
- `home.html` y `reporte-pnc-rnc-index.html` — solo el `<script
  src="marca.js?v=2">` (sin cambio funcional; ese último reporte todavía no
  tiene la subida a Drive activada, sigue como estaba en el backlog).

Validé sintaxis de los 3 archivos `.js` sueltos con `node --check` y de cada
bloque `<script>` inline en los 11 HTML tocados (extraídos y chequeados uno
por uno). Todos pasan. Esto NO reemplaza probar en el navegador — sigue
aplicando la regla de la casa de verificar en incógnito antes de dar por
buena la actualización.

## Lo que tienes que hacer tú (Rodrigo)

1. **Un paso manual en Google Sheets** (no lo puedo hacer yo, no tengo una
   herramienta de escritura de celdas): abre "QC Digital - Repositorio"
   (`1YTi7y50sFsj3RPHIqRuHPbzxyctflSKBl_jue6FyaRs`) y escribe en la celda
   **I1** el encabezado `Clave verificación`. Las filas nuevas van a llenar
   esa columna solas; las filas viejas la dejan vacía (por eso el fallback en
   `verificar.html`).
2. Reemplaza los 16 archivos en tu copia local del repo por los de este zip
   (o aplica `qc-digital-fix-verificacion-qr.diff` con `git apply`).
3. `git add -A && git commit -m "Fix: QR de verificacion con clave unica por documento" && git push`.
4. Purga caché de Cloudflare (regla de la casa: cualquier cambio a
   `marca.js`/`drive-integration.js` la requiere).
5. Prueba en incógnito: genera un PDF de cualquier reporte, escanea el QR (o
   copia el link `c=...` a mano) y confirma que `verificar.html` muestra ESE
   documento, no otro.
6. Si tienes a mano algún PDF viejo (de antes de este cambio) con QR
   impreso, escanéalo también: debería seguir funcionando, mostrando el aviso
   amarillo de "coincidencia aproximada".

## Nota sobre QR ya impresos

Los QR de documentos generados ANTES de este cambio no se pueden arreglar
retroactivamente (el código ya quedó impreso en el papel/PDF). Van a seguir
funcionando por el mecanismo de respaldo, pero con el mismo riesgo de
ambigüedad que tenían antes si su correlativo se repite. Los documentos
generados DESDE este cambio en adelante no tienen ese problema.
