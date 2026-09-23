# 03 · Estados, SLA y gobernanza

## Máquina de estados (orquestador, determinista)
Cada vacante avanza por las 6 etapas. Cada etapa tiene dueño y SLA; algunas incluyen un sub-estado `ESPERANDO_HUMANO` cuando toca decidir al HM.

```
REQUISICION (HRBP) ──> ESPERANDO_HM_VALIDA_NN ──> ALINEACION (AT)
ALINEACION ──[agente de alineación: ok?]──> ESPERANDO_HM_SELECCIONA_PERFILES ──> BUSQUEDA (AT)
BUSQUEDA ──> ATRACCION (AT: entrevistas competencias + evaluaciones) ──> ESPERANDO_HM_DEFINE_POOL
ESPERANDO_HM_DEFINE_POOL ──> SELECCION (AT agenda panel) ──> ESPERANDO_HM_DECIDE_FINALISTA
ESPERANDO_HM_DECIDE_FINALISTA ──[decision]──>
      finalista        -> OFERTA (HRBP/AT)
      reemparejar      -> sugerencias_vacante (ver 04) 
      descartado/pool  -> POOL  (+ notificación de cierre digno)
OFERTA ──[firma?]──> si: CUBIERTA (candidato contratado)
                     no: REACTIVACION -> vuelve a ESPERANDO_HM_DECIDE_FINALISTA con los siguientes mejor evaluados
```
- Cada transición: persiste estado, escribe `audit_log` y **dispara notificación** al candidato (borrador IA → aprobación humana → envío). Cero ghosting por construcción.
- La IA nunca ejecuta `finalista`/`descartado`/`oferta` sola: son decisiones humanas con justificación.

## Motor de SLA (sla-engine, código)
- Al abrir la vacante, genera `vacante_etapas` con `fecha_limite` en **días hábiles** según `sla_config` filtrado por `nivel`.
- Recalcula estatus por etapa: `a_tiempo` / `en_riesgo` (queda ≤1 día) / `atrasada` (venció) / `completada`.
- **Predicción de cobertura:** suma de días hábiles restantes de las etapas pendientes → `fecha_estimada_cobertura`. Compara contra el promedio de 45 días.
- **Semáforo por etapa** para el dashboard (verde/amarillo/rojo).

## Alertas y escalación (Comunicador)
- Recordatorio al dueño de la etapa antes de vencer (ej. HM tiene 2 días para elegir perfiles).
- Si vence el SLA: correo de escalación automático y el directorio muestra en tiempo real quién bloquea (HM/HRBP responsable).
- Toda alerta se registra en `notificaciones` y `audit_log`.

## Gobernanza (Human-in-the-Loop)
- **Decisiones humanas obligatorias con justificación:** validar no negociables, definir pool, elegir finalista, descartar, aprobar oferta.
- **La IA solo asiste:** extrae, compara, sugiere preguntas, consolida feedback, redacta comunicaciones y sugiere vacantes. Nunca decide ni envía sin aprobación.
- **Estados `ESPERANDO_HUMANO`:** el orquestador se detiene y no avanza hasta recibir la decisión de la persona autenticada con el rol correcto.
- Cuando la IA detecta señales relevantes (ej. desacuerdo fuerte entre entrevistadores, o no negociable no cumplido), **sugiere** al HM y delega la decisión, nunca la toma.

## SLA base (config inicial, ajustable por nivel)
| Etapa | Dueño | Base (días háb.) | Sub-paso HM |
|---|---|---|---|
| Requisición | HRBP | 1 | valida no negociables: 2 |
| Alineación | AT | 1 | selecciona perfiles: 2 |
| Búsqueda | AT | 7 | — |
| Atracción | AT | 15 | define pool: 2 |
| Selección | AT | 3 | entrevista + feedback: 5 |
| Oferta | HRBP/AT | 5 | — |

Para `alto` y `complejo`, multiplicar duraciones (config en `sla_config`).
