# 02 · Modelo de datos (fuente única de verdad)

Postgres (Supabase). Nombres en snake_case. `jsonb` donde el schema interno lo maneja la IA. Todo id es `uuid` salvo catálogos cortos. No cambies campos sin avisar al equipo.

## Usuarios y directorio
```
usuarios(id, nombre, email UNIQUE, rol[hm|at|hrbp|entrevistador|admin], area, activo)
```
El directorio (req. 3) sale de join entre `vacantes` y `usuarios` (hm_id, hrbp_id, at_id).

## Catálogo de posiciones (candado)
```
posiciones(id, nombre_puesto, area, nivel[medio|alto|complejo], autorizada bool)
```
Regla: no se crea `vacante` si no existe una `posicion` con `autorizada = true`.

## Vacantes / requisición
```
vacantes(
  id, posicion_id -> posiciones,
  titulo, descripcion, rango_salarial_min, rango_salarial_max, nivel,
  hm_id -> usuarios, hrbp_id -> usuarios, at_id -> usuarios,
  estatus[abierta|en_proceso|cubierta|cancelada],
  etapa_actual[requisicion|alineacion|busqueda|atraccion|seleccion|oferta],
  fecha_apertura, fecha_estimada_cobertura,
  alineacion_ok bool, alineacion_notas text,   -- del agente de alineación
  fuente_referidos bool
)
no_negociables(id, vacante_id -> vacantes, texto, tipo[estudios|habilidad_tecnica|competencia])
```

## Candidatos
```
candidatos(
  id, nombre, email, telefono,
  fuente[bolsa|referido|aira|directo],   -- trazabilidad de origen
  puesto_actual, empresa_actual,
  compensacion_actual, compensacion_deseada,
  escolaridad, cv_url            -- Storage (PDF)
)
evaluaciones(id, candidato_id -> candidatos, tipo[psicometrica|assessfirst|otra],
             resultado_url, resumen text)
```

## Relación candidato ↔ vacante (la "ficha" del pipeline)
```
candidato_vacante(
  id, candidato_id, vacante_id,
  etapa[igual que vacantes.etapa_actual], estatus[activo|finalista|descartado|pool|contratado],
  fit_score int,                 -- 0-100, ajuste al perfil (NO permanencia por distancia)
  compatibilidad_nnn int,        -- 0-100 vs los 3 no negociables
  cumple_no_negociables jsonb,   -- semáforo: [{no_negociable_id, estado[cumple|parcial|no_cumple], evidencia, cita}]
  es_referido bool GENERATED,    -- derivado de candidatos.fuente = 'referido' (badge de prioridad)
  prioridad int,                 -- boost si es_referido (incentivo al programa de referidos)
  ficha jsonb,                   -- comparativa: {fortalezas, areas_oportunidad, estilo_liderazgo,
                                 --   vision_estrategica, analisis_toma_decisiones, idiomas[],
                                 --   otros_estudios[], descripcion, recomendaciones, citas[]}
  UNIQUE(candidato_id, vacante_id)
)
```
`ficha` y los scores los llena el `ia-service` a partir de CV + evaluaciones, **con citas de origen** (ver `04`).

## SLA por etapa
```
sla_config(id, nivel[medio|alto|complejo], etapa, dueno_rol, dias_habiles)  -- config base
vacante_etapas(
  id, vacante_id, etapa, dueno_id -> usuarios,
  fecha_inicio, fecha_limite, fecha_cierre,
  estatus[a_tiempo|en_riesgo|atrasada|completada]
)
```
El sla-engine calcula `fecha_limite` en días hábiles según `sla_config` y el `nivel` de la vacante.

## Entrevistas y feedback (tiempo real)
```
entrevistas(id, vacante_id, candidato_id, fecha, tipo[competencias|panel], calendar_event_id, estatus)
entrevista_participantes(entrevista_id, entrevistador_id -> usuarios)
preguntas_entrevista(id, vacante_id, candidato_id, preguntas jsonb, generado_por[ia|manual], ts)
feedback_entrevista(
  id, entrevista_id, entrevistador_id, candidato_id,
  scores jsonb,                  -- {competencia: 0-100}
  veredicto[recomendado|no_recomendado],
  notas text, ts
)  -- Supabase Realtime: varios entrevistadores escriben a la vez
```

## Decisiones (gobernanza)
```
decisiones(
  id, vacante_id, candidato_id, hm_id -> usuarios,
  decision[avanzar_oferta|reemparejar|pool|finalista|descartado],
  justificacion text NOT NULL,   -- obligatoria
  ts
)
```

## Notificaciones (cero ghosting)
```
notificaciones(
  id, destinatario_tipo[candidato|usuario], destinatario_id,
  vacante_id, tipo[cambio_etapa|recordatorio|escalacion|resultado|reactivacion],
  canal[correo|portal], contenido text,
  estatus[borrador|aprobada|enviada], aprobada_por -> usuarios, ts
)
```

## Sugerencia de vacantes (reubicación de no seleccionados)
```
sugerencias_vacante(
  id, candidato_id, vacante_id_sugerida -> vacantes,
  score int, motivo text, estatus[sugerida|aceptada|descartada], ts
)
```

## Auditoría
```
audit_log(id, ts, actor_id, actor_rol, accion, entidad, entidad_id, detalle jsonb, decision_id NULL)
```
Append-only. Toda decisión, envío de correo, cambio de etapa y salida de IA relevante deja registro.
