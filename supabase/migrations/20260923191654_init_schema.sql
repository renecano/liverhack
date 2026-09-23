-- ============================================================================
-- LivHire — schema inicial
-- Fuente de verdad: docs/02-modelo-datos.md (+ 00-reto.md para el SLA base).
-- Correccion documentada: candidato_vacante.es_referido NO es GENERATED
-- (Postgres no permite columnas generadas que lean otra tabla); se implementa
-- con trigger. Ver seccion "Triggers de negocio".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
create type rol_usuario as enum ('hm', 'at', 'hrbp', 'entrevistador', 'admin');
create type nivel_posicion as enum ('medio', 'alto', 'complejo');
create type etapa_proceso as enum ('requisicion', 'alineacion', 'busqueda', 'atraccion', 'seleccion', 'oferta');
create type estatus_vacante as enum ('abierta', 'en_proceso', 'cubierta', 'cancelada');
create type tipo_no_negociable as enum ('estudios', 'habilidad_tecnica', 'competencia');
create type fuente_candidato as enum ('bolsa', 'referido', 'aira', 'directo');
create type tipo_evaluacion as enum ('psicometrica', 'assessfirst', 'otra');
create type estatus_candidato_vacante as enum ('activo', 'finalista', 'descartado', 'pool', 'contratado');
create type estado_no_negociable as enum ('cumple', 'parcial', 'no_cumple');
create type estatus_etapa as enum ('a_tiempo', 'en_riesgo', 'atrasada', 'completada');
create type tipo_entrevista as enum ('competencias', 'panel');
create type estatus_entrevista as enum ('programada', 'realizada', 'cancelada');
create type origen_contenido as enum ('ia', 'manual');
create type veredicto_entrevista as enum ('recomendado', 'no_recomendado');
create type tipo_decision as enum ('avanzar_oferta', 'reemparejar', 'pool', 'finalista', 'descartado');
create type destinatario_tipo as enum ('candidato', 'usuario');
create type tipo_notificacion as enum ('cambio_etapa', 'recordatorio', 'escalacion', 'resultado', 'reactivacion');
create type canal_notificacion as enum ('correo', 'portal');
create type estatus_notificacion as enum ('borrador', 'aprobada', 'enviada');
create type estatus_sugerencia as enum ('sugerida', 'aceptada', 'descartada');

comment on type estado_no_negociable is 'Semaforo de 3 estados para los no negociables del puesto.';

-- ---------------------------------------------------------------------------
-- 2. Usuarios y directorio
-- ---------------------------------------------------------------------------
create table usuarios (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null,
  email      text not null unique,
  rol        rol_usuario not null,
  area       text,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table usuarios is 'Perfil interno enlazado 1:1 con auth.users (id = auth.users.id).';

-- ---------------------------------------------------------------------------
-- 3. Catalogo de posiciones (candado)
-- ---------------------------------------------------------------------------
create table posiciones (
  id            uuid primary key default gen_random_uuid(),
  nombre_puesto text not null,
  area          text not null,
  nivel         nivel_posicion not null,
  autorizada    boolean not null default false,
  created_at    timestamptz not null default now()
);
comment on table posiciones is 'Candado: solo posiciones con autorizada = true pueden originar una vacante.';

-- ---------------------------------------------------------------------------
-- 4. Vacantes / requisicion
-- ---------------------------------------------------------------------------
create table vacantes (
  id                        uuid primary key default gen_random_uuid(),
  posicion_id               uuid not null references posiciones (id) on delete restrict,
  titulo                    text not null,
  descripcion               text,
  rango_salarial_min        numeric(12,2),
  rango_salarial_max        numeric(12,2),
  nivel                     nivel_posicion not null,
  hm_id                     uuid references usuarios (id) on delete set null,
  hrbp_id                   uuid references usuarios (id) on delete set null,
  at_id                     uuid references usuarios (id) on delete set null,
  estatus                   estatus_vacante not null default 'abierta',
  etapa_actual              etapa_proceso not null default 'requisicion',
  fecha_apertura            date not null default current_date,
  fecha_estimada_cobertura  date,
  alineacion_ok             boolean,
  alineacion_notas          text,
  fuente_referidos          boolean not null default false,
  created_at                timestamptz not null default now(),
  constraint vacantes_rango_salarial_chk
    check (rango_salarial_min is null or rango_salarial_max is null
           or rango_salarial_min <= rango_salarial_max)
);
create index on vacantes (posicion_id);
create index on vacantes (hm_id);
create index on vacantes (at_id);
create index on vacantes (hrbp_id);
create index on vacantes (etapa_actual);

create table no_negociables (
  id         uuid primary key default gen_random_uuid(),
  vacante_id uuid not null references vacantes (id) on delete cascade,
  texto      text not null,
  tipo       tipo_no_negociable not null,
  created_at timestamptz not null default now()
);
create index on no_negociables (vacante_id);

-- ---------------------------------------------------------------------------
-- 5. Candidatos
-- ---------------------------------------------------------------------------
create table candidatos (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,
  email                text not null unique,
  telefono             text,
  fuente               fuente_candidato not null default 'bolsa',
  puesto_actual        text,
  empresa_actual       text,
  compensacion_actual  numeric(12,2),
  compensacion_deseada numeric(12,2),
  escolaridad          text,
  cv_url               text,
  created_at           timestamptz not null default now()
);
comment on column candidatos.fuente is 'Trazabilidad de origen; fuente = referido activa el badge de prioridad.';

create table evaluaciones (
  id            uuid primary key default gen_random_uuid(),
  candidato_id  uuid not null references candidatos (id) on delete cascade,
  tipo          tipo_evaluacion not null,
  resultado_url text,
  resumen       text,
  created_at    timestamptz not null default now()
);
create index on evaluaciones (candidato_id);

-- ---------------------------------------------------------------------------
-- 6. candidato_vacante (ficha del pipeline) — frontera A <-> B
-- ---------------------------------------------------------------------------
create table candidato_vacante (
  id                    uuid primary key default gen_random_uuid(),
  candidato_id          uuid not null references candidatos (id) on delete cascade,
  vacante_id            uuid not null references vacantes (id) on delete cascade,
  etapa                 etapa_proceso not null default 'busqueda',
  estatus               estatus_candidato_vacante not null default 'activo',
  fit_score             int check (fit_score between 0 and 100),
  compatibilidad_nnn    int check (compatibilidad_nnn between 0 and 100),
  cumple_no_negociables jsonb not null default '[]'::jsonb,
  es_referido           boolean not null default false,
  prioridad             int not null default 0,
  ficha                 jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint candidato_vacante_unico unique (candidato_id, vacante_id),
  constraint cumple_nnn_es_arreglo check (jsonb_typeof(cumple_no_negociables) = 'array')
);
create index on candidato_vacante (vacante_id);
create index on candidato_vacante (candidato_id);
create index on candidato_vacante (vacante_id, prioridad desc);

comment on column candidato_vacante.cumple_no_negociables is
  'Semaforo: [{no_negociable_id, estado[cumple|parcial|no_cumple], evidencia, cita}]';
comment on column candidato_vacante.ficha is
  'Comparativa (estructura del Excel): {fortalezas, areas_oportunidad, estilo_liderazgo, vision_estrategica, analisis_toma_decisiones, idiomas[], otros_estudios[], descripcion, recomendaciones, citas[]}';
comment on column candidato_vacante.es_referido is
  'Derivado de candidatos.fuente = referido via trigger (no GENERATED: lee otra tabla).';

-- ---------------------------------------------------------------------------
-- 7. SLA por etapa
-- ---------------------------------------------------------------------------
create table sla_config (
  id           uuid primary key default gen_random_uuid(),
  nivel        nivel_posicion not null,
  etapa        etapa_proceso not null,
  dueno_rol    rol_usuario not null,
  dias_habiles int not null check (dias_habiles > 0),
  constraint sla_config_unico unique (nivel, etapa)
);

create table vacante_etapas (
  id           uuid primary key default gen_random_uuid(),
  vacante_id   uuid not null references vacantes (id) on delete cascade,
  etapa        etapa_proceso not null,
  dueno_id     uuid references usuarios (id) on delete set null,
  fecha_inicio date,
  fecha_limite date,
  fecha_cierre date,
  estatus      estatus_etapa not null default 'a_tiempo',
  constraint vacante_etapas_unico unique (vacante_id, etapa)
);
create index on vacante_etapas (vacante_id);
create index on vacante_etapas (estatus);

-- ---------------------------------------------------------------------------
-- 8. Entrevistas y feedback (tiempo real)
-- ---------------------------------------------------------------------------
create table entrevistas (
  id                uuid primary key default gen_random_uuid(),
  vacante_id        uuid not null references vacantes (id) on delete cascade,
  candidato_id      uuid not null references candidatos (id) on delete cascade,
  fecha             timestamptz not null,
  tipo              tipo_entrevista not null default 'competencias',
  calendar_event_id text,
  estatus           estatus_entrevista not null default 'programada',
  created_at        timestamptz not null default now()
);
create index on entrevistas (vacante_id);
create index on entrevistas (candidato_id);

create table entrevista_participantes (
  entrevista_id    uuid not null references entrevistas (id) on delete cascade,
  entrevistador_id uuid not null references usuarios (id) on delete cascade,
  primary key (entrevista_id, entrevistador_id)
);
create index on entrevista_participantes (entrevistador_id);

create table preguntas_entrevista (
  id           uuid primary key default gen_random_uuid(),
  vacante_id   uuid not null references vacantes (id) on delete cascade,
  candidato_id uuid not null references candidatos (id) on delete cascade,
  preguntas    jsonb not null default '[]'::jsonb,
  generado_por origen_contenido not null default 'ia',
  ts           timestamptz not null default now(),
  constraint preguntas_es_arreglo check (jsonb_typeof(preguntas) = 'array')
);
create index on preguntas_entrevista (vacante_id, candidato_id);

create table feedback_entrevista (
  id               uuid primary key default gen_random_uuid(),
  entrevista_id    uuid not null references entrevistas (id) on delete cascade,
  entrevistador_id uuid not null references usuarios (id) on delete cascade,
  candidato_id     uuid not null references candidatos (id) on delete cascade,
  scores           jsonb not null default '{}'::jsonb,
  veredicto        veredicto_entrevista,
  notas            text,
  ts               timestamptz not null default now(),
  constraint feedback_unico_por_entrevistador unique (entrevista_id, entrevistador_id)
);
create index on feedback_entrevista (entrevista_id);
create index on feedback_entrevista (candidato_id);

-- ---------------------------------------------------------------------------
-- 9. Decisiones (gobernanza) — justificacion obligatoria
-- ---------------------------------------------------------------------------
create table decisiones (
  id            uuid primary key default gen_random_uuid(),
  vacante_id    uuid not null references vacantes (id) on delete cascade,
  candidato_id  uuid not null references candidatos (id) on delete cascade,
  hm_id         uuid references usuarios (id) on delete set null,
  decision      tipo_decision not null,
  justificacion text not null,
  ts            timestamptz not null default now(),
  constraint justificacion_no_vacia check (length(btrim(justificacion)) > 0)
);
create index on decisiones (vacante_id);
create index on decisiones (candidato_id);

-- ---------------------------------------------------------------------------
-- 10. Notificaciones (cero ghosting)
-- ---------------------------------------------------------------------------
create table notificaciones (
  id                uuid primary key default gen_random_uuid(),
  destinatario_tipo destinatario_tipo not null,
  destinatario_id   uuid not null,
  vacante_id        uuid references vacantes (id) on delete set null,
  tipo              tipo_notificacion not null,
  canal             canal_notificacion not null default 'correo',
  contenido         text,
  estatus           estatus_notificacion not null default 'borrador',
  aprobada_por      uuid references usuarios (id) on delete set null,
  ts                timestamptz not null default now()
);
create index on notificaciones (destinatario_tipo, destinatario_id);
create index on notificaciones (estatus);
create index on notificaciones (vacante_id);
comment on column notificaciones.destinatario_id is
  'Polimorfico: candidatos.id cuando destinatario_tipo = candidato, usuarios.id cuando = usuario.';

-- ---------------------------------------------------------------------------
-- 11. Sugerencias de vacante (reubicacion)
-- ---------------------------------------------------------------------------
create table sugerencias_vacante (
  id                  uuid primary key default gen_random_uuid(),
  candidato_id        uuid not null references candidatos (id) on delete cascade,
  vacante_id_sugerida uuid not null references vacantes (id) on delete cascade,
  score               int check (score between 0 and 100),
  motivo              text,
  estatus             estatus_sugerencia not null default 'sugerida',
  ts                  timestamptz not null default now()
);
create index on sugerencias_vacante (candidato_id);

-- ---------------------------------------------------------------------------
-- 12. Auditoria (append-only)
-- ---------------------------------------------------------------------------
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  ts          timestamptz not null default now(),
  actor_id    uuid references usuarios (id) on delete set null,
  actor_rol   rol_usuario,
  accion      text not null,
  entidad     text not null,
  entidad_id  uuid,
  detalle     jsonb not null default '{}'::jsonb,
  decision_id uuid references decisiones (id) on delete set null
);
create index on audit_log (entidad, entidad_id);
create index on audit_log (ts desc);

-- ============================================================================
-- 13. Triggers de negocio
-- ============================================================================

-- --- 13.1 Candado de posicion (regla de oro 3) -------------------------------
-- No se abre proceso si la posicion no existe o no esta autorizada.
-- Se refuerza en BD, no solo en el frontend.
create or replace function public.fn_candado_posicion()
returns trigger
language plpgsql
as $$
declare
  v_posicion public.posiciones%rowtype;
begin
  select * into v_posicion from public.posiciones where id = new.posicion_id;

  if not found then
    raise exception 'CANDADO_POSICION: la posicion % no existe en el catalogo', new.posicion_id
      using errcode = 'check_violation';
  end if;

  if not v_posicion.autorizada then
    raise exception 'CANDADO_POSICION: la posicion "%" no esta autorizada; no se puede abrir el proceso',
      v_posicion.nombre_puesto
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_candado_posicion
  before insert or update of posicion_id on vacantes
  for each row execute function public.fn_candado_posicion();

-- --- 13.2 es_referido + prioridad -------------------------------------------
-- docs/02 lo describe como GENERATED, pero Postgres no permite columnas
-- generadas que lean otra tabla. Se deriva aqui de candidatos.fuente.
create or replace function public.fn_sync_es_referido()
returns trigger
language plpgsql
as $$
declare
  boost    constant int := 10;  -- +N de prioridad para referidos
  v_referido boolean;
begin
  select (c.fuente = 'referido') into v_referido
  from public.candidatos c
  where c.id = new.candidato_id;

  v_referido := coalesce(v_referido, false);
  new.es_referido := v_referido;

  if tg_op = 'INSERT' then
    new.prioridad := coalesce(new.prioridad, 0) + case when v_referido then boost else 0 end;
  else
    new.updated_at := now();
    if v_referido is distinct from old.es_referido then
      new.prioridad := coalesce(new.prioridad, 0) + case when v_referido then boost else -boost end;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_sync_es_referido
  before insert or update on candidato_vacante
  for each row execute function public.fn_sync_es_referido();

-- Si cambia candidatos.fuente, se re-deriva en todas sus fichas.
create or replace function public.fn_propaga_fuente_referido()
returns trigger
language plpgsql
as $$
begin
  update public.candidato_vacante
     set updated_at = now()
   where candidato_id = new.id;
  return null;
end;
$$;

create trigger trg_propaga_fuente_referido
  after update of fuente on candidatos
  for each row
  when (old.fuente is distinct from new.fuente)
  execute function public.fn_propaga_fuente_referido();

-- --- 13.3 audit_log append-only (regla de oro 4) ----------------------------
create or replace function public.fn_audit_log_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log es append-only: % no permitido', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger trg_audit_log_sin_update
  before update on audit_log
  for each statement execute function public.fn_audit_log_append_only();

create trigger trg_audit_log_sin_delete
  before delete on audit_log
  for each statement execute function public.fn_audit_log_append_only();

revoke update, delete on public.audit_log from anon, authenticated;

-- ============================================================================
-- 14. Helpers de autorizacion (SECURITY DEFINER para no recursar en RLS)
-- ============================================================================
create or replace function public.rol_actual()
returns rol_usuario
language sql stable security definer set search_path = public
as $$
  select u.rol from public.usuarios u where u.id = auth.uid();
$$;

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'
  );
$$;

-- El candidato no es usuario interno: se identifica por el email del JWT.
create or replace function public.candidato_actual()
returns uuid
language sql stable security definer set search_path = public
as $$
  select c.id
  from public.candidatos c
  where c.email = nullif(auth.jwt() ->> 'email', '')
  limit 1;
$$;

create or replace function public.puede_ver_vacante(p_vacante_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    -- admin ve todo
    exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin')
    -- HM / AT / HRBP duenos de la vacante
    or exists (
      select 1 from public.vacantes v
      where v.id = p_vacante_id
        and (v.hm_id = auth.uid() or v.at_id = auth.uid() or v.hrbp_id = auth.uid())
    )
    -- HRBP ve su area (directorio y tablero de SLA)
    or exists (
      select 1
      from public.vacantes v
      join public.posiciones p on p.id = v.posicion_id
      join public.usuarios u on u.id = auth.uid()
      where v.id = p_vacante_id and u.rol = 'hrbp' and u.area = p.area
    )
    -- Entrevistador: solo vacantes donde participa en alguna entrevista
    or exists (
      select 1
      from public.entrevistas e
      join public.entrevista_participantes ep on ep.entrevista_id = e.id
      where e.vacante_id = p_vacante_id and ep.entrevistador_id = auth.uid()
    );
$$;

create or replace function public.participa_en_entrevista(p_entrevista_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.entrevista_participantes ep
    where ep.entrevista_id = p_entrevista_id and ep.entrevistador_id = auth.uid()
  );
$$;

create or replace function public.puede_ver_candidato(p_candidato_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol in ('admin', 'at'))
    or p_candidato_id = public.candidato_actual()
    or exists (
      select 1 from public.candidato_vacante cv
      where cv.candidato_id = p_candidato_id and public.puede_ver_vacante(cv.vacante_id)
    );
$$;

grant execute on function
  public.rol_actual(),
  public.es_admin(),
  public.candidato_actual(),
  public.puede_ver_vacante(uuid),
  public.participa_en_entrevista(uuid),
  public.puede_ver_candidato(uuid)
to authenticated;

-- ============================================================================
-- 15. RLS — habilitada en todas las tablas
-- (service_role la omite: el seed y los jobs server-side no se bloquean)
-- ============================================================================
alter table usuarios                 enable row level security;
alter table posiciones               enable row level security;
alter table vacantes                 enable row level security;
alter table no_negociables           enable row level security;
alter table candidatos               enable row level security;
alter table evaluaciones             enable row level security;
alter table candidato_vacante        enable row level security;
alter table sla_config               enable row level security;
alter table vacante_etapas           enable row level security;
alter table entrevistas              enable row level security;
alter table entrevista_participantes enable row level security;
alter table preguntas_entrevista     enable row level security;
alter table feedback_entrevista      enable row level security;
alter table decisiones               enable row level security;
alter table notificaciones           enable row level security;
alter table sugerencias_vacante      enable row level security;
alter table audit_log                enable row level security;

-- --- usuarios: el directorio (req. 3) es visible para todo usuario interno ---
create policy usuarios_select on usuarios
  for select to authenticated using (true);
create policy usuarios_insert on usuarios
  for insert to authenticated with check (public.es_admin());
create policy usuarios_update on usuarios
  for update to authenticated
  using (id = auth.uid() or public.es_admin())
  with check (id = auth.uid() or public.es_admin());
create policy usuarios_delete on usuarios
  for delete to authenticated using (public.es_admin());

-- --- posiciones: catalogo visible; solo HRBP/admin lo administran ------------
create policy posiciones_select on posiciones
  for select to authenticated using (true);
create policy posiciones_write on posiciones
  for all to authenticated
  using (public.rol_actual() in ('hrbp', 'admin'))
  with check (public.rol_actual() in ('hrbp', 'admin'));

-- --- vacantes ---------------------------------------------------------------
create policy vacantes_select on vacantes
  for select to authenticated using (public.puede_ver_vacante(id));
create policy vacantes_insert on vacantes
  for insert to authenticated with check (public.rol_actual() in ('hrbp', 'admin'));
create policy vacantes_update on vacantes
  for update to authenticated
  using (public.puede_ver_vacante(id) and public.rol_actual() in ('hm', 'at', 'hrbp', 'admin'))
  with check (public.puede_ver_vacante(id) and public.rol_actual() in ('hm', 'at', 'hrbp', 'admin'));
create policy vacantes_delete on vacantes
  for delete to authenticated using (public.es_admin());

-- --- no_negociables ---------------------------------------------------------
create policy no_negociables_select on no_negociables
  for select to authenticated using (public.puede_ver_vacante(vacante_id));
create policy no_negociables_write on no_negociables
  for all to authenticated
  using (public.puede_ver_vacante(vacante_id) and public.rol_actual() in ('hm', 'at', 'hrbp', 'admin'))
  with check (public.puede_ver_vacante(vacante_id) and public.rol_actual() in ('hm', 'at', 'hrbp', 'admin'));

-- --- candidatos / evaluaciones ----------------------------------------------
create policy candidatos_select on candidatos
  for select to authenticated using (public.puede_ver_candidato(id));
create policy candidatos_insert on candidatos
  for insert to authenticated with check (public.rol_actual() in ('at', 'admin'));
create policy candidatos_update on candidatos
  for update to authenticated
  using (public.rol_actual() in ('at', 'admin'))
  with check (public.rol_actual() in ('at', 'admin'));
create policy candidatos_delete on candidatos
  for delete to authenticated using (public.es_admin());

create policy evaluaciones_select on evaluaciones
  for select to authenticated using (public.puede_ver_candidato(candidato_id));
create policy evaluaciones_write on evaluaciones
  for all to authenticated
  using (public.rol_actual() in ('at', 'admin'))
  with check (public.rol_actual() in ('at', 'admin'));

-- --- candidato_vacante: el candidato ve su propio expediente -----------------
create policy candidato_vacante_select on candidato_vacante
  for select to authenticated
  using (public.puede_ver_vacante(vacante_id) or candidato_id = public.candidato_actual());
create policy candidato_vacante_insert on candidato_vacante
  for insert to authenticated with check (public.rol_actual() in ('at', 'admin'));
create policy candidato_vacante_update on candidato_vacante
  for update to authenticated
  using (public.puede_ver_vacante(vacante_id) and public.rol_actual() in ('at', 'hm', 'admin'))
  with check (public.puede_ver_vacante(vacante_id) and public.rol_actual() in ('at', 'hm', 'admin'));
create policy candidato_vacante_delete on candidato_vacante
  for delete to authenticated using (public.es_admin());

-- --- SLA --------------------------------------------------------------------
create policy sla_config_select on sla_config
  for select to authenticated using (true);
create policy sla_config_write on sla_config
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy vacante_etapas_select on vacante_etapas
  for select to authenticated using (public.puede_ver_vacante(vacante_id));
create policy vacante_etapas_write on vacante_etapas
  for all to authenticated
  using (public.puede_ver_vacante(vacante_id) and public.rol_actual() in ('at', 'hrbp', 'admin'))
  with check (public.puede_ver_vacante(vacante_id) and public.rol_actual() in ('at', 'hrbp', 'admin'));

-- --- entrevistas ------------------------------------------------------------
create policy entrevistas_select on entrevistas
  for select to authenticated using (public.puede_ver_vacante(vacante_id));
create policy entrevistas_write on entrevistas
  for all to authenticated
  using (public.rol_actual() in ('at', 'admin'))
  with check (public.rol_actual() in ('at', 'admin'));

create policy entrevista_participantes_select on entrevista_participantes
  for select to authenticated
  using (
    entrevistador_id = auth.uid()
    or exists (
      select 1 from entrevistas e
      where e.id = entrevista_id and public.puede_ver_vacante(e.vacante_id)
    )
  );
create policy entrevista_participantes_write on entrevista_participantes
  for all to authenticated
  using (public.rol_actual() in ('at', 'admin'))
  with check (public.rol_actual() in ('at', 'admin'));

create policy preguntas_entrevista_select on preguntas_entrevista
  for select to authenticated using (public.puede_ver_vacante(vacante_id));
create policy preguntas_entrevista_write on preguntas_entrevista
  for all to authenticated
  using (public.puede_ver_vacante(vacante_id) and public.rol_actual() in ('at', 'entrevistador', 'admin'))
  with check (public.puede_ver_vacante(vacante_id) and public.rol_actual() in ('at', 'entrevistador', 'admin'));

-- --- feedback: cada entrevistador escribe el suyo (Realtime, simultaneo) -----
create policy feedback_select on feedback_entrevista
  for select to authenticated
  using (
    entrevistador_id = auth.uid()
    or exists (
      select 1 from entrevistas e
      where e.id = entrevista_id and public.puede_ver_vacante(e.vacante_id)
    )
  );
create policy feedback_insert on feedback_entrevista
  for insert to authenticated
  with check (
    public.es_admin()
    or (entrevistador_id = auth.uid() and public.participa_en_entrevista(entrevista_id))
  );
create policy feedback_update on feedback_entrevista
  for update to authenticated
  using (entrevistador_id = auth.uid() or public.es_admin())
  with check (entrevistador_id = auth.uid() or public.es_admin());

-- --- decisiones: solo el HM decide, y quedan inmutables ---------------------
create policy decisiones_select on decisiones
  for select to authenticated using (public.puede_ver_vacante(vacante_id));
create policy decisiones_insert on decisiones
  for insert to authenticated
  with check (
    public.es_admin()
    or (public.rol_actual() = 'hm' and hm_id = auth.uid() and public.puede_ver_vacante(vacante_id))
  );
-- sin policies de UPDATE/DELETE: una decision no se reescribe (trazabilidad).

-- --- notificaciones ---------------------------------------------------------
create policy notificaciones_select on notificaciones
  for select to authenticated
  using (
    public.rol_actual() in ('at', 'admin')
    or (destinatario_tipo = 'usuario' and destinatario_id = auth.uid())
    or (destinatario_tipo = 'candidato' and destinatario_id = public.candidato_actual())
    or (vacante_id is not null and public.puede_ver_vacante(vacante_id))
  );
create policy notificaciones_insert on notificaciones
  for insert to authenticated with check (public.rol_actual() in ('at', 'hrbp', 'admin'));
create policy notificaciones_update on notificaciones
  for update to authenticated
  using (public.rol_actual() in ('at', 'admin'))
  with check (public.rol_actual() in ('at', 'admin'));

-- --- sugerencias de vacante -------------------------------------------------
create policy sugerencias_select on sugerencias_vacante
  for select to authenticated
  using (
    public.rol_actual() in ('at', 'admin')
    or candidato_id = public.candidato_actual()
    or public.puede_ver_vacante(vacante_id_sugerida)
  );
create policy sugerencias_write on sugerencias_vacante
  for all to authenticated
  using (public.rol_actual() in ('at', 'admin'))
  with check (public.rol_actual() in ('at', 'admin'));

-- --- audit_log: lectura para gobernanza, insert para todo usuario interno ----
create policy audit_log_select on audit_log
  for select to authenticated using (public.es_admin() or public.rol_actual() = 'hrbp');
create policy audit_log_insert on audit_log
  for insert to authenticated with check (auth.uid() is not null);
-- sin policies de UPDATE/DELETE (ademas de los triggers y el revoke).

-- ============================================================================
-- 16. Realtime — calificacion simultanea de entrevistadores
-- ============================================================================
alter publication supabase_realtime add table feedback_entrevista;
alter publication supabase_realtime add table entrevistas;
alter publication supabase_realtime add table candidato_vacante;
alter publication supabase_realtime add table notificaciones;
