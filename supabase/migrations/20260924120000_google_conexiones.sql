-- Conexión de Google Calendar por usuario (OAuth, scope calendar.events).
-- Guarda el refresh_token para que el servidor cree eventos después (y el access_token
-- vigente para no refrescar en cada llamada). Los tokens son secretos: RLS activado y
-- SIN policies, así que solo el service_role (código de servidor) lee y escribe; nunca
-- llegan al navegador.
create table if not exists public.google_conexiones (
  usuario_id     uuid primary key references public.usuarios (id) on delete cascade,
  google_email   text,
  refresh_token  text not null,
  access_token   text,
  expira_en      timestamptz,
  scope          text,
  actualizado_en timestamptz not null default now()
);

alter table public.google_conexiones enable row level security;

comment on table public.google_conexiones is
  'OAuth de Google Calendar por usuario (AT). Solo service_role: sin policies para authenticated/anon.';
