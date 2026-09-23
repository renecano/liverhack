# 00 · El reto (verdad de referencia)

Fuente: presentación oficial LiverHack 2026 + sesión de dolores con el área de Atracción de Talento de El Puerto de Liverpool.

## Objetivo
> "Crear un ecosistema digital de atracción de talento que estandarice la gestión de candidatos, garantice la trazabilidad de la información y promueva la colaboración y comunicación entre reclutadores."

Desarrollar un **prototipo funcional de plataforma web** que permita a Reclutadores, Hiring Managers y HRBPs gestionar de forma centralizada y eficiente **todo el ciclo de vida de una vacante, de la requisición a la oferta**. Reclutamiento es centralizado desde corporativo para todos los centros de distribución. ~180 vacantes activas. Time-to-fill promedio: **45 días**.

## Actores
- **Reclutamiento / AT (Atracción de Talento).**
- **Hiring Manager (HM):** jefe del proceso, abre la vacante, acompaña todas las etapas, decide (no hace la oferta, pero decide finalista).
- **HR Business Partner (HRBP):** socio estratégico por área, conoce a las personas, conecta áreas, cubre posiciones.
- **Candidato.**

## Flujo y acuerdo de servicios (6 etapas, SLA en días hábiles, adaptable por nivel: medio/alto/complejo)
| # | Etapa | Dueño | Duración base | Sub-pasos |
|---|---|---|---|---|
| 1 | Requisición | HRBP | 1 día | Realiza la requisición; comparte descripción de puesto y rango salarial. → HM valida no negociables (2 días). |
| 2 | Alineación | AT | 1 día | Cierra perfil y no negociables. → HM selecciona perfiles de interés y confirma equipo de AT. |
| 3 | Búsqueda | AT | 7 días | Búsqueda en bolsas, primer contacto, envío de CVs. Pool de 3-5 candidatos viables. |
| 4 | Atracción | AT | 15 días | Entrevista por competencias, aplicación de evaluaciones, presentación del pool. → HM define candidatos que pasan (2 días). |
| 5 | Selección | AT | 3 días | Agenda entrevistas/panel con el pool. → HM entrevista, elige finalista, da feedback (5 días). |
| 6 | Oferta | HRBP | 5 días | Solicita carta-oferta. → AT realiza oferta, recibe oferta firmada, confirma fecha de ingreso. |

El candidato se "suelta" (contrata) el día de su ingreso.

## Requerimientos obligatorios
1. **Flujo/SLA:** 6 etapas con dueño, días hábiles ajustables por nivel, indicador por etapa, fechas y estatus actualizables por el reclutador.
2. **Candado:** si la posición no existe, no se puede iniciar el proceso (no gastar tiempo de nadie).
3. **Directorio:** que todos sepan quién es el HRBP, el reclutador y el HM de cada vacante, y quién da seguimiento.
4. **Lista de candidatos:** CV cargado + campos clave en tabla muy visible; visor de CV en PDF integrado; compensación actual y deseada; resultados de evaluaciones (psicométricas, AssessFirst); **3 no negociables del puesto y su cumplimiento**; % de compatibilidad; habilidades soft; **comparativa lado a lado** con la estructura de su Excel (ver abajo).
5. **Entrevistas y feedback:** agendar entrevistas con **múltiples entrevistadores** en una misma sesión; los entrevistadores capturan notas y **califican en tiempo real y de forma simultánea**; veredicto explícito **Recomendado / No recomendado**; el HM toma la **decisión final** (Finalista / Descartado) **con justificación obligatoria**.
6. **Notificaciones:** alertas automáticas en cada etapa para garantizar trazabilidad y tiempos; recordatorios (ej. el HM tiene 2 días para elegir perfiles → si no, recordatorio y escalación).
7. **Comunicación con todos:** de ~300 candidatos, a todos se les informa si siguen o no. Nunca se declina sin avisar. Buena experiencia incluso a quien no queda ("no me quedé, pero qué buena experiencia").
8. **Trazabilidad de origen** de los candidatos; referidos como extra.
9. **Plan B:** si el finalista no firma, poder volver con los candidatos anteriores.

## Estructura de la comparativa (su Excel / AssessFirst)
Aspectos a evaluar por candidato: Escolaridad (solo educación formal), Otros estudios (diplomados, certificaciones), Idiomas y nivel, **% de compatibilidad (Potencial Global)**, Descripción del candidato, Fortalezas, Áreas de oportunidad, Estilo de liderazgo, Visión estratégica, Análisis y toma de decisiones, Recomendaciones. Función para seleccionar varios candidatos y generar la vista comparativa lado a lado.

## Contexto ATS
El ATS actual se llama **Aira**: repositorio principal de vacantes y candidatos (el pool). La postulación ya está resuelta por otra empresa. Nuestro sistema puede complementar Aira, pero les interesa tener el sistema propio del flujo.

## Criterios de evaluación
- **Prototipo funcional:** app web desplegada y demostrable.
- **Código fuente:** acceso al repositorio.
- **Pitch ejecutivo:** máximo **5 minutos** (problema, solución, tecnología, impacto para Liverpool).
- **Documentación técnica:** breve descripción de arquitectura (frontend, backend, BD) y tecnologías.
- **Datos de prueba (seed):** BD precargada con **≥10 candidatos**, **3 con historial de múltiples entrevistas y feedback**, y **alertas** activas en distintos puntos.
- **Entrega:** jueves, hora límite **[CONFIRMAR — quedó tapada en la lámina]**.
