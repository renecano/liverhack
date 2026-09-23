-- ============================================================================
-- Campos y constraints solicitados por Persona B (dominio IA).
-- Fuente de verdad: docs/02-modelo-datos.md.
--
-- Pre-check contra la base hosted antes de aplicar: 0 notificaciones en borrador,
-- sin duplicados de (vacante_id, candidato_id) en preguntas_entrevista ni de
-- (candidato_id, vacante_id_sugerida) en sugerencias_vacante. Por tanto los tres
-- índices únicos se crean sin conflicto sobre los datos existentes.
-- ============================================================================

-- --- preguntas_entrevista: tipo de sesión + origen de la pregunta -----------
-- `tipo` reutiliza el enum tipo_entrevista ('competencias' | 'panel'); default
-- 'competencias' rellena las filas existentes. `origen` explica qué motivó cada
-- pregunta (CV, no negociable, evaluación…); lo consume el dominio IA.
alter table preguntas_entrevista
  add column tipo tipo_entrevista not null default 'competencias';
alter table preguntas_entrevista
  add column origen text;

comment on column preguntas_entrevista.tipo is
  'Tipo de sesión de entrevista al que pertenece este juego de preguntas.';
comment on column preguntas_entrevista.origen is
  'Qué motivó las preguntas (p. ej. CV, no negociable, evaluación); trazabilidad para el dominio IA.';

-- Un solo juego de preguntas por (vacante, candidato, tipo de sesión).
alter table preguntas_entrevista
  add constraint preguntas_entrevista_unico unique (vacante_id, candidato_id, tipo);

-- --- sugerencias_vacante: una sugerencia por (candidato, vacante sugerida) ---
alter table sugerencias_vacante
  add constraint sugerencias_vacante_unico unique (candidato_id, vacante_id_sugerida);

-- --- notificaciones: no duplicar un borrador idéntico -----------------------
-- Cero ghosting sin spam: mientras un aviso siga en 'borrador' no se crea otro
-- igual para el mismo destinatario/vacante/tipo. Al aprobarse o enviarse deja de
-- ocupar el índice, de modo que un nuevo cambio de etapa sí puede volver a avisar.
-- vacante_id NULL se trata como distinto (NULLS DISTINCT, default de Postgres).
create unique index notificaciones_un_borrador
  on notificaciones (destinatario_tipo, destinatario_id, vacante_id, tipo)
  where estatus = 'borrador';
