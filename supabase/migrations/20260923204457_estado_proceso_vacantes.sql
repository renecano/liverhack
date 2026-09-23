-- ============================================================================
-- vacantes.estado_proceso — estado del orquestador como columna (fuente de verdad).
-- Antes se derivaba del último evento `cambio_estado` en audit_log; audit_log sigue
-- registrando cada cambio, pero ya no es la fuente del estado.
-- Valores = ESTADOS de web/src/lib/orquestador/estados.ts (mismo orden).
-- ============================================================================

create type estado_proceso as enum (
  'REQUISICION_EN_CURSO',
  'ESPERANDO_HM_VALIDA_NNN',
  'ALINEACION_EN_CURSO',
  'ESPERANDO_HM_SELECCIONA_PERFILES',
  'BUSQUEDA_EN_CURSO',
  'ATRACCION_EN_CURSO',
  'ESPERANDO_HM_DEFINE_POOL',
  'SELECCION_EN_CURSO',
  'ESPERANDO_HM_DECIDE_FINALISTA',
  'OFERTA_EN_CURSO',
  'CUBIERTA',
  'CANCELADA'
);
comment on type estado_proceso is
  'Sub-paso del orquestador dentro de la etapa: *_EN_CURSO (AT/HRBP) o compuerta ESPERANDO_HM_* (solo el HM la cruza).';

-- Estado de arranque de una etapa (el tramo de trabajo, antes de cualquier compuerta).
create or replace function public.estado_inicial_de(p_etapa etapa_proceso, p_estatus estatus_vacante)
returns estado_proceso
language sql immutable
as $$
  select case
    when p_estatus = 'cancelada' then 'CANCELADA'
    when p_estatus = 'cubierta'  then 'CUBIERTA'
    else case p_etapa
      when 'requisicion' then 'REQUISICION_EN_CURSO'
      when 'alineacion'  then 'ALINEACION_EN_CURSO'
      when 'busqueda'    then 'BUSQUEDA_EN_CURSO'
      when 'atraccion'   then 'ATRACCION_EN_CURSO'
      when 'seleccion'   then 'SELECCION_EN_CURSO'
      when 'oferta'      then 'OFERTA_EN_CURSO'
    end
  end::estado_proceso;
$$;

alter table vacantes add column estado_proceso estado_proceso;

-- Relleno de las vacantes existentes (seed) a partir de su etapa_actual / estatus.
update vacantes set estado_proceso = public.estado_inicial_de(etapa_actual, estatus);

alter table vacantes alter column estado_proceso set not null;
create index on vacantes (estado_proceso);

-- Default coherente con la etapa: si el insert no trae estado_proceso, se toma el
-- estado inicial de su etapa_actual (etapa por defecto requisicion → REQUISICION_EN_CURSO).
-- Un DEFAULT de columna no puede leer otra columna; por eso es trigger.
create or replace function public.fn_estado_proceso_default()
returns trigger
language plpgsql
as $$
begin
  if new.estado_proceso is null then
    new.estado_proceso := public.estado_inicial_de(new.etapa_actual, new.estatus);
  end if;
  return new;
end;
$$;

create trigger trg_estado_proceso_default
  before insert on vacantes
  for each row execute function public.fn_estado_proceso_default();

-- Coherencia estado ↔ etapa ↔ estatus (CANCELADA puede ocurrir en cualquier etapa).
alter table vacantes add constraint vacantes_estado_etapa_chk check (
  (estatus = 'cancelada') = (estado_proceso = 'CANCELADA')
  and (estatus = 'cubierta') = (estado_proceso = 'CUBIERTA')
  and case estado_proceso
    when 'REQUISICION_EN_CURSO'             then etapa_actual = 'requisicion'
    when 'ESPERANDO_HM_VALIDA_NNN'          then etapa_actual = 'requisicion'
    when 'ALINEACION_EN_CURSO'              then etapa_actual = 'alineacion'
    when 'ESPERANDO_HM_SELECCIONA_PERFILES' then etapa_actual = 'alineacion'
    when 'BUSQUEDA_EN_CURSO'                then etapa_actual = 'busqueda'
    when 'ATRACCION_EN_CURSO'               then etapa_actual = 'atraccion'
    when 'ESPERANDO_HM_DEFINE_POOL'         then etapa_actual = 'atraccion'
    when 'SELECCION_EN_CURSO'               then etapa_actual = 'seleccion'
    when 'ESPERANDO_HM_DECIDE_FINALISTA'    then etapa_actual = 'seleccion'
    when 'OFERTA_EN_CURSO'                  then etapa_actual = 'oferta'
    when 'CUBIERTA'                         then etapa_actual = 'oferta'
    when 'CANCELADA'                        then true
  end
);
