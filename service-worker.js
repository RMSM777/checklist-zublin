-- ============================================================================
-- Limpieza de caminatas duplicadas (Bastián/Celso, 06-09-2026)
-- Diagnóstico: la caminata "FRONTONES FR-INS-N51-05_07_08_10_11" (6 hallazgos,
-- iniciales CF/BH, fecha 04-09-2026) quedó duplicada 27 veces por un bug de
-- la cola offline (ver claude/TRASPASO-06sep-duplicacion-caminatas-offline.md
-- en el Proyecto). Códigos generados: CFBH-SCI-0001 .. CFBH-SCI-0027, con
-- Punch aprox. 000262 a 000423 (162 DT en total, todas en estado ABIERTA).
--
-- Este script deja SOLO la primera (CFBH-SCI-0001) y borra las otras 26.
-- Ejecutar en Supabase → SQL Editor, paso por paso, en este orden.
-- ============================================================================

-- 1) Verificar el problema antes de borrar nada (debe mostrar 27 filas de a 6)
select codigo_caminata, count(*) as dt_count
from avances_caminata a
join detalles_terminacion d on d.caminata_id = a.id
where a.codigo_caminata like 'CFBH-SCI-%'
group by codigo_caminata
order by codigo_caminata;

-- 2) Revisar si alguna de las duplicadas SÍ alcanzó a subir fotos
--    (si esta consulta devuelve filas, avisar antes de seguir: puede haber
--    fotos reales que valga la pena conservar en vez de borrar a ciegas)
select f.*, a.codigo_caminata
from fotos_dt f
join detalles_terminacion d on d.id = f.dt_id
join avances_caminata a on a.id = d.caminata_id
where a.codigo_caminata like 'CFBH-SCI-%'
  and a.codigo_caminata <> 'CFBH-SCI-0001';

-- 3) Borrar los duplicados (deja únicamente CFBH-SCI-0001)
begin;

delete from fotos_dt
where dt_id in (
  select d.id from detalles_terminacion d
  join avances_caminata a on a.id = d.caminata_id
  where a.codigo_caminata like 'CFBH-SCI-%'
    and a.codigo_caminata <> 'CFBH-SCI-0001'
);

delete from detalles_terminacion
where caminata_id in (
  select id from avances_caminata
  where codigo_caminata like 'CFBH-SCI-%'
    and codigo_caminata <> 'CFBH-SCI-0001'
);

delete from avances_caminata
where codigo_caminata like 'CFBH-SCI-%'
  and codigo_caminata <> 'CFBH-SCI-0001';

commit;

-- 4) Confirmar: debe quedar solo CFBH-SCI-0001 con 6 filas
select codigo_caminata, count(*) as dt_count
from avances_caminata a
join detalles_terminacion d on d.caminata_id = a.id
where a.codigo_caminata like 'CFBH-SCI-%'
group by codigo_caminata;

-- Nota: los números de Punch que quedaron "quemados" en los registros
-- borrados (aprox. 000268 a 000423, salvo los 6 de CFBH-SCI-0001) no se
-- reutilizan -- el correlativo es atómico y no vuelve atrás. Es solo un
-- salto en la numeración, no afecta nada funcional.
