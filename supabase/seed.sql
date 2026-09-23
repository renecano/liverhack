-- ============================================================================
-- LivHire — seed de demo
-- Base: docs/07-seed-demo-pitch.md (10 candidatos reales) + lo que el PDF no traia
-- (usuarios, posiciones, vacantes, SLA, etapas, notificaciones).
--
-- Se ejecuta como postgres (supabase db reset) o con service_role: omite RLS.
-- Password de todos los usuarios de demo: LivHire2026!
-- Las fechas son relativas a current_date para que la demo siempre se vea viva.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: crea el auth.user + su identidad + el perfil en usuarios.
-- pg_temp = solo vive en la sesion del seed.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.crear_usuario(
  p_id     uuid,
  p_nombre text,
  p_email  text,
  p_rol    rol_usuario,
  p_area   text
) returns void
language plpgsql
as $fn$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt('LivHire2026!', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nombre', p_nombre, 'rol', p_rol),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), p_id, p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email),
    'email', now(), now(), now()
  );

  insert into public.usuarios (id, nombre, email, rol, area)
  values (p_id, p_nombre, p_email, p_rol, p_area);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 1. Usuarios (HM, AT, HRBP, 3 entrevistadores, admin)
-- ---------------------------------------------------------------------------
select pg_temp.crear_usuario('11111111-1111-1111-1111-111111111101', 'Aileen Vargas',   'aileen.vargas@liverpool.com.mx',   'hm',            'E-commerce');
select pg_temp.crear_usuario('11111111-1111-1111-1111-111111111102', 'Daniela Rios',    'daniela.rios@liverpool.com.mx',    'at',            'Atraccion de Talento');
select pg_temp.crear_usuario('11111111-1111-1111-1111-111111111103', 'Monica Salinas',  'monica.salinas@liverpool.com.mx',  'hrbp',          'E-commerce');
select pg_temp.crear_usuario('11111111-1111-1111-1111-111111111104', 'Sofia Rodriguez', 'sofia.rodriguez@liverpool.com.mx', 'entrevistador', 'Tecnologia');
select pg_temp.crear_usuario('11111111-1111-1111-1111-111111111105', 'Carlos Sanchez',  'carlos.sanchez@liverpool.com.mx',  'entrevistador', 'Marketing');
select pg_temp.crear_usuario('11111111-1111-1111-1111-111111111106', 'Juan Perez',      'juan.perez@liverpool.com.mx',      'entrevistador', 'BI');
select pg_temp.crear_usuario('11111111-1111-1111-1111-111111111107', 'Admin LivHire',   'admin@liverpool.com.mx',           'admin',         'Sistemas');

comment on table usuarios is 'Perfil interno enlazado 1:1 con auth.users (id = auth.users.id). Demo: password LivHire2026!';

-- ---------------------------------------------------------------------------
-- 2. Posiciones (catalogo) — incluye UNA NO autorizada para demostrar el candado
-- ---------------------------------------------------------------------------
insert into posiciones (id, nombre_puesto, area, nivel, autorizada) values
  ('22222222-2222-2222-2222-000000000001', 'Gerente de Proyectos E-commerce', 'E-commerce',           'alto',     true),
  ('22222222-2222-2222-2222-000000000002', 'Desarrollador Backend Senior',    'Tecnologia',           'medio',    true),
  ('22222222-2222-2222-2222-000000000003', 'Analista de Datos Jr.',           'BI',                   'medio',    true),
  ('22222222-2222-2222-2222-000000000004', 'Arquitecto Cloud',                'Tecnologia',           'complejo', true),
  ('22222222-2222-2222-2222-000000000005', 'HR Business Partner',             'Recursos Humanos',     'alto',     true),
  ('22222222-2222-2222-2222-000000000006', 'Disenador UX/UI Senior',          'E-commerce',           'medio',    true),
  ('22222222-2222-2222-2222-000000000007', 'Especialista Marketing Digital',  'Marketing',            'medio',    true),
  -- NO autorizada: intentar abrir vacante contra esta posicion lanza CANDADO_POSICION
  ('22222222-2222-2222-2222-000000000099', 'Director de Innovacion',          'Direccion General',    'complejo', false);

-- ---------------------------------------------------------------------------
-- 3. SLA base por nivel y etapa (duraciones de docs/00-reto.md para 'medio';
--    'alto' y 'complejo' escalan esa base — ajustar cuando exista docs/03)
-- ---------------------------------------------------------------------------
insert into sla_config (nivel, etapa, dueno_rol, dias_habiles) values
  ('medio',    'requisicion', 'hrbp',  1),
  ('medio',    'alineacion',  'at',    1),
  ('medio',    'busqueda',    'at',    7),
  ('medio',    'atraccion',   'at',   15),
  ('medio',    'seleccion',   'at',    3),
  ('medio',    'oferta',      'hrbp',  5),
  ('alto',     'requisicion', 'hrbp',  2),
  ('alto',     'alineacion',  'at',    2),
  ('alto',     'busqueda',    'at',   10),
  ('alto',     'atraccion',   'at',   20),
  ('alto',     'seleccion',   'at',    5),
  ('alto',     'oferta',      'hrbp',  7),
  ('complejo', 'requisicion', 'hrbp',  2),
  ('complejo', 'alineacion',  'at',    3),
  ('complejo', 'busqueda',    'at',   14),
  ('complejo', 'atraccion',   'at',   25),
  ('complejo', 'seleccion',   'at',    7),
  ('complejo', 'oferta',      'hrbp', 10);

-- ---------------------------------------------------------------------------
-- 4. Vacantes
--    V1 en Seleccion con pool listo para comparar
--    V2 ATRASADA (semaforo rojo + escalacion)
--    V7 recien creada (para el agente de alineacion; rango salarial bajo a proposito)
-- ---------------------------------------------------------------------------
insert into vacantes (
  id, posicion_id, titulo, descripcion, rango_salarial_min, rango_salarial_max, nivel,
  hm_id, hrbp_id, at_id, estatus, etapa_actual,
  fecha_apertura, fecha_estimada_cobertura, alineacion_ok, alineacion_notas, fuente_referidos
) values
  ('33333333-3333-3333-3333-000000000001',
   '22222222-2222-2222-2222-000000000001',
   'Gerente de Proyectos E-commerce',
   'Lidera el portafolio de proyectos de la plataforma de e-commerce: roadmap, coordinacion con Tecnologia y Marketing, y gestion de proveedores.',
   75000, 95000, 'alto',
   '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111102',
   'en_proceso', 'seleccion',
   current_date - 38, current_date + 9, true,
   'Perfil realista para el rango. Se sugirio flexibilizar el requisito de industria retail.', true),

  ('33333333-3333-3333-3333-000000000002',
   '22222222-2222-2222-2222-000000000002',
   'Desarrollador Backend Senior',
   'Desarrollo y mantenimiento de servicios backend del ecosistema de ventas digitales. Node.js/Java, microservicios, alta disponibilidad.',
   55000, 70000, 'medio',
   '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111102',
   'en_proceso', 'atraccion',
   current_date - 52, current_date - 4, true,
   'Rango salarial en el limite inferior del mercado para el nivel solicitado.', false),

  ('33333333-3333-3333-3333-000000000003',
   '22222222-2222-2222-2222-000000000003',
   'Analista de Datos Jr.',
   'Analisis de datos de venta y comportamiento de cliente. SQL, Power BI, Python basico. Reporta a la Gerencia de BI.',
   28000, 36000, 'medio',
   '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111102',
   'en_proceso', 'atraccion',
   current_date - 21, current_date + 14, true,
   'Perfil y rango consistentes con el nivel junior.', false),

  ('33333333-3333-3333-3333-000000000004',
   '22222222-2222-2222-2222-000000000004',
   'Arquitecto Cloud',
   'Diseno de arquitectura cloud (AWS/Azure) para las plataformas de comercio y logistica de los centros de distribucion.',
   95000, 120000, 'complejo',
   '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111102',
   'en_proceso', 'busqueda',
   current_date - 16, current_date + 35, true,
   'Escasez de perfil en el mercado; se recomienda ampliar el rango o considerar remoto.', false),

  ('33333333-3333-3333-3333-000000000005',
   '22222222-2222-2222-2222-000000000005',
   'HR Business Partner Corporativo',
   'Socio estrategico de RH para las areas corporativas: plantilla, clima, desarrollo y acompanamiento de procesos de atraccion.',
   60000, 78000, 'alto',
   '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111102',
   'en_proceso', 'atraccion',
   current_date - 25, current_date + 18, true,
   'Sin alertas.', false),

  ('33333333-3333-3333-3333-000000000006',
   '22222222-2222-2222-2222-000000000006',
   'Disenador UX/UI Senior',
   'Diseno de experiencia para la app y el sitio de e-commerce. Investigacion con usuarios, design system y prototipado.',
   45000, 60000, 'medio',
   '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111102',
   'en_proceso', 'busqueda',
   current_date - 12, current_date + 22, true,
   'Sin alertas.', true),

  -- Recien creada: sin alineacion todavia (la corre el agente en la demo)
  ('33333333-3333-3333-3333-000000000007',
   '22222222-2222-2222-2222-000000000007',
   'Especialista en Marketing Digital',
   'Campanas de performance, SEM/SEO y analitica de adquisicion para las marcas del grupo. Se busca perfil con 5+ anos y manejo de presupuesto anual.',
   22000, 28000, 'medio',
   '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111102',
   'abierta', 'requisicion',
   current_date, null, null, null, false);

-- ---------------------------------------------------------------------------
-- 5. No negociables (3 por vacante, como pide el reto)
-- ---------------------------------------------------------------------------
insert into no_negociables (id, vacante_id, texto, tipo) values
  ('44444444-4444-4444-4444-000000000101', '33333333-3333-3333-3333-000000000001', 'Licenciatura concluida en Ingenieria, Administracion o afin', 'estudios'),
  ('44444444-4444-4444-4444-000000000102', '33333333-3333-3333-3333-000000000001', 'Ingles conversacional (B2 o superior)',                      'habilidad_tecnica'),
  ('44444444-4444-4444-4444-000000000103', '33333333-3333-3333-3333-000000000001', 'Experiencia liderando equipos de 5+ personas',               'competencia'),

  ('44444444-4444-4444-4444-000000000201', '33333333-3333-3333-3333-000000000002', 'Ingenieria en Sistemas o afin',                              'estudios'),
  ('44444444-4444-4444-4444-000000000202', '33333333-3333-3333-3333-000000000002', '5+ anos en backend con microservicios',                      'habilidad_tecnica'),
  ('44444444-4444-4444-4444-000000000203', '33333333-3333-3333-3333-000000000002', 'Liderazgo tecnico de squad',                                 'competencia'),

  ('44444444-4444-4444-4444-000000000301', '33333333-3333-3333-3333-000000000003', 'Licenciatura en Actuaria, Matematicas, Sistemas o afin',     'estudios'),
  ('44444444-4444-4444-4444-000000000302', '33333333-3333-3333-3333-000000000003', 'SQL intermedio y Power BI',                                  'habilidad_tecnica'),
  ('44444444-4444-4444-4444-000000000303', '33333333-3333-3333-3333-000000000003', 'Pensamiento analitico y comunicacion de hallazgos',          'competencia'),

  ('44444444-4444-4444-4444-000000000401', '33333333-3333-3333-3333-000000000004', 'Certificacion cloud vigente (AWS/Azure)',                    'estudios'),
  ('44444444-4444-4444-4444-000000000402', '33333333-3333-3333-3333-000000000004', 'Diseno de arquitecturas de alta disponibilidad',             'habilidad_tecnica'),
  ('44444444-4444-4444-4444-000000000403', '33333333-3333-3333-3333-000000000004', 'Influencia sin autoridad con equipos multiples',             'competencia'),

  ('44444444-4444-4444-4444-000000000501', '33333333-3333-3333-3333-000000000005', 'Licenciatura en Psicologia, RH o afin',                      'estudios'),
  ('44444444-4444-4444-4444-000000000502', '33333333-3333-3333-3333-000000000005', 'Experiencia en relaciones laborales',                        'habilidad_tecnica'),
  ('44444444-4444-4444-4444-000000000503', '33333333-3333-3333-3333-000000000005', 'Consultoria interna y manejo de conversaciones dificiles',   'competencia'),

  ('44444444-4444-4444-4444-000000000601', '33333333-3333-3333-3333-000000000006', 'Licenciatura en Diseno o afin',                              'estudios'),
  ('44444444-4444-4444-4444-000000000602', '33333333-3333-3333-3333-000000000006', 'Portafolio con productos digitales en produccion',           'habilidad_tecnica'),
  ('44444444-4444-4444-4444-000000000603', '33333333-3333-3333-3333-000000000006', 'Trabajo con design system y equipos de producto',            'competencia'),

  ('44444444-4444-4444-4444-000000000701', '33333333-3333-3333-3333-000000000007', 'Licenciatura en Mercadotecnia o afin',                       'estudios'),
  ('44444444-4444-4444-4444-000000000702', '33333333-3333-3333-3333-000000000007', 'Manejo de Google Ads y Meta Ads con presupuesto anual',      'habilidad_tecnica'),
  ('44444444-4444-4444-4444-000000000703', '33333333-3333-3333-3333-000000000007', 'Orientacion a resultados medibles (ROAS/CAC)',               'competencia');

-- ---------------------------------------------------------------------------
-- 6. Candidatos — los 10 de docs/07 (referidos: Fernanda Morales y Ricardo Salas)
--    Datos de contacto/compensacion completados de forma plausible: el PDF
--    original (Base_de_Datos_de_Candidatos__10_CVs_.pdf) no esta en el repo.
-- ---------------------------------------------------------------------------
insert into candidatos (
  id, nombre, email, telefono, fuente, puesto_actual, empresa_actual,
  compensacion_actual, compensacion_deseada, escolaridad, cv_url
) values
  ('55555555-5555-5555-5555-000000000001', 'Ana Lopez',        'ana.lopez@example.com',        '+52 55 1000 0001', 'bolsa',    'Gerente de Proyectos E-commerce', 'Retail Digital MX',   78000,  92000, 'Lic. en Ingenieria Industrial (ITESM)',              'cv/ana-lopez.pdf'),
  ('55555555-5555-5555-5555-000000000002', 'Carlos Mendoza',   'carlos.mendoza@example.com',   '+52 55 1000 0002', 'bolsa',    'Desarrollador Backend Senior',    'Fintech Nova',        62000,  72000, 'Ing. en Sistemas Computacionales (UNAM)',           'cv/carlos-mendoza.pdf'),
  ('55555555-5555-5555-5555-000000000003', 'Sofia Herrera',    'sofia.herrera@example.com',    '+52 55 1000 0003', 'aira',     'Analista de Datos Jr.',           'Consultora Datalytics',26000,  34000, 'Lic. en Actuaria (UNAM)',                           'cv/sofia-herrera.pdf'),
  ('55555555-5555-5555-5555-000000000004', 'Javier Torres',    'javier.torres@example.com',    '+52 55 1000 0004', 'bolsa',    'Disenador UX/UI Senior',          'Agencia Pixelab',     48000,  58000, 'Lic. en Diseno Grafico (UAM)',                      'cv/javier-torres.pdf'),
  ('55555555-5555-5555-5555-000000000005', 'Laura Jimenez',    'laura.jimenez@example.com',    '+52 55 1000 0005', 'directo',  'Coordinadora de Marketing Digital','Grupo Comercial Aurea',42000, 55000, 'Lic. en Mercadotecnia (ITAM)',                      'cv/laura-jimenez.pdf'),
  ('55555555-5555-5555-5555-000000000006', 'David Pena',       'david.pena@example.com',       '+52 55 1000 0006', 'bolsa',    'Arquitecto Cloud',                'CloudWorks LatAm',   120000, 145000, 'Ing. en Telecomunicaciones (IPN) + AWS SA Pro',     'cv/david-pena.pdf'),
  ('55555555-5555-5555-5555-000000000007', 'Fernanda Morales', 'fernanda.morales@example.com', '+52 55 1000 0007', 'referido', 'Scrum Master',                    'Banco Horizonte',     70000,  85000, 'Lic. en Informatica (UPIICSA) + PSM II',           'cv/fernanda-morales.pdf'),
  ('55555555-5555-5555-5555-000000000008', 'Ricardo Salas',    'ricardo.salas@example.com',    '+52 55 1000 0008', 'referido', 'Desarrollador Frontend',          'Startup Mercadeo',    48000,  58000, 'Ing. en Sistemas (Universidad Anahuac)',            'cv/ricardo-salas.pdf'),
  ('55555555-5555-5555-5555-000000000009', 'Mariana Castillo', 'mariana.castillo@example.com', '+52 55 1000 0009', 'directo',  'HR Business Partner',             'El Puerto de Liverpool',66000, 76000, 'Lic. en Psicologia Organizacional (Ibero)',        'cv/mariana-castillo.pdf'),
  ('55555555-5555-5555-5555-000000000010', 'Oscar Paredes',    'oscar.paredes@example.com',    '+52 55 1000 0010', 'bolsa',    'Becario QA',                      'Universidad (practicas)',8000,  14000, 'Pasante de Ing. en Software (UNAM)',                'cv/oscar-paredes.pdf');

-- ---------------------------------------------------------------------------
-- 7. Evaluaciones (AssessFirst, como vienen en docs/07)
-- ---------------------------------------------------------------------------
insert into evaluaciones (candidato_id, tipo, resultado_url, resumen) values
  ('55555555-5555-5555-5555-000000000001', 'assessfirst', 'evaluaciones/ana-lopez.pdf',        'Potencial Global 92%. Perfil orientado a resultados, alta capacidad de coordinacion.'),
  ('55555555-5555-5555-5555-000000000002', 'assessfirst', 'evaluaciones/carlos-mendoza.pdf',   'Potencial Global 88%. Alta profundidad tecnica, liderazgo emergente.'),
  ('55555555-5555-5555-5555-000000000003', 'assessfirst', 'evaluaciones/sofia-herrera.pdf',    'Potencial Global 95%. Pensamiento analitico sobresaliente y alta curiosidad.'),
  ('55555555-5555-5555-5555-000000000004', 'assessfirst', 'evaluaciones/javier-torres.pdf',    'Potencial Global 85%. Sensibilidad de usuario alta, ejecucion consistente.'),
  ('55555555-5555-5555-5555-000000000005', 'assessfirst', 'evaluaciones/laura-jimenez.pdf',    'Potencial Global 89%. Creatividad aplicada y orientacion a metricas.'),
  ('55555555-5555-5555-5555-000000000006', 'assessfirst', 'evaluaciones/david-pena.pdf',       'Potencial Global 91%. Vision tecnica de largo plazo, autonomia alta.'),
  ('55555555-5555-5555-5555-000000000007', 'assessfirst', 'evaluaciones/fernanda-morales.pdf', 'Potencial Global 93%. Facilitacion y gestion de equipos muy solidas.'),
  ('55555555-5555-5555-5555-000000000008', 'assessfirst', 'evaluaciones/ricardo-salas.pdf',    'Potencial Global 87%. Buen dominio de producto y colaboracion.'),
  ('55555555-5555-5555-5555-000000000009', 'assessfirst', 'evaluaciones/mariana-castillo.pdf', 'Potencial Global 90%. Escucha activa y manejo de conversaciones dificiles.'),
  ('55555555-5555-5555-5555-000000000010', 'assessfirst', 'evaluaciones/oscar-paredes.pdf',    'Potencial Global 82%. Alta disposicion de aprendizaje.'),
  ('55555555-5555-5555-5555-000000000001', 'psicometrica','evaluaciones/ana-lopez-psico.pdf',  'Sin banderas. Estabilidad y tolerancia a la presion por arriba de la media.'),
  ('55555555-5555-5555-5555-000000000003', 'psicometrica','evaluaciones/sofia-herrera-psico.pdf','Sin banderas. Razonamiento numerico en percentil 95.');

-- ---------------------------------------------------------------------------
-- 8. candidato_vacante — ficha (mapeo assessfirst -> ficha) + semaforo NNN
--    fit_score = compatibilidad AssessFirst (Potencial Global) de docs/07.
--    es_referido y prioridad los pone el trigger trg_sync_es_referido.
-- ---------------------------------------------------------------------------

-- V1 Gerente de Proyectos E-commerce (Seleccion) — pool para comparativa
insert into candidato_vacante (candidato_id, vacante_id, etapa, estatus, fit_score, compatibilidad_nnn, cumple_no_negociables, ficha) values
('55555555-5555-5555-5555-000000000001', '33333333-3333-3333-3333-000000000001', 'seleccion', 'finalista', 92, 100,
 '[{"no_negociable_id":"44444444-4444-4444-4444-000000000101","estado":"cumple","evidencia":"Lic. en Ingenieria Industrial, ITESM","cita":"CV p.1 - Formacion academica"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000102","estado":"cumple","evidencia":"Ingles C1 certificado (TOEFL 105)","cita":"CV p.2 - Idiomas"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000103","estado":"cumple","evidencia":"Lidero equipo de 8 personas en Retail Digital MX","cita":"CV p.1 - Experiencia 2021-2025"}]'::jsonb,
 '{"descripcion":"Gerente de proyectos con 8 anos en e-commerce, acostumbrada a coordinar tecnologia, marketing y proveedores.",
   "fortalezas":["Coordinacion multiarea","Orientacion a resultados","Comunicacion ejecutiva"],
   "areas_oportunidad":["Profundidad tecnica en integraciones","Delegacion en picos de carga"],
   "estilo_liderazgo":"Directivo-colaborativo: fija rumbo claro y abre espacio a su equipo.",
   "vision_estrategica":"Alta. Conecta roadmap de producto con metas comerciales.",
   "analisis_toma_decisiones":"Decide con datos; equilibra velocidad y riesgo.",
   "idiomas":[{"idioma":"Espanol","nivel":"Nativo"},{"idioma":"Ingles","nivel":"C1"}],
   "otros_estudios":["PMP (2022)","Diplomado en Growth (2023)"],
   "recomendaciones":"Perfil listo para el puesto; acompanar los primeros 90 dias en el contexto retail.",
   "citas":["CV p.1 - Experiencia","AssessFirst - Potencial Global 92%"]}'::jsonb),

('55555555-5555-5555-5555-000000000007', '33333333-3333-3333-3333-000000000001', 'seleccion', 'activo', 93, 67,
 '[{"no_negociable_id":"44444444-4444-4444-4444-000000000101","estado":"cumple","evidencia":"Lic. en Informatica, UPIICSA","cita":"CV p.1 - Formacion"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000102","estado":"parcial","evidencia":"Ingles B1 de lectura tecnica; sin evidencia conversacional","cita":"CV p.2 - Idiomas"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000103","estado":"cumple","evidencia":"Scrum Master de 3 squads (12 personas)","cita":"CV p.1 - Experiencia 2022-2025"}]'::jsonb,
 '{"descripcion":"Scrum Master con fuerte facilitacion y gestion de equipos agiles en banca.",
   "fortalezas":["Facilitacion","Gestion de equipos","Mejora continua"],
   "areas_oportunidad":["Ingles conversacional","Exposicion a e-commerce"],
   "estilo_liderazgo":"Servicial: remueve bloqueos y desarrolla al equipo.",
   "vision_estrategica":"Media-alta, enfocada a entrega y previsibilidad.",
   "analisis_toma_decisiones":"Basada en metricas de flujo y en consenso del equipo.",
   "idiomas":[{"idioma":"Espanol","nivel":"Nativo"},{"idioma":"Ingles","nivel":"B1"}],
   "otros_estudios":["PSM II (2023)","Kanban Management Professional"],
   "recomendaciones":"Candidata referida con alto potencial; validar ingles en entrevista.",
   "citas":["CV p.1 - Experiencia","AssessFirst - Potencial Global 93%"]}'::jsonb),

('55555555-5555-5555-5555-000000000005', '33333333-3333-3333-3333-000000000001', 'seleccion', 'activo', 89, 67,
 '[{"no_negociable_id":"44444444-4444-4444-4444-000000000101","estado":"cumple","evidencia":"Lic. en Mercadotecnia, ITAM","cita":"CV p.1 - Formacion"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000102","estado":"cumple","evidencia":"Ingles B2, intercambio academico en Canada","cita":"CV p.2 - Idiomas"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000103","estado":"parcial","evidencia":"Coordina 3 personas y agencias externas; no 5+ directos","cita":"CV p.1 - Experiencia 2023-2025"}]'::jsonb,
 '{"descripcion":"Coordinadora de marketing digital con foco en performance y analitica de adquisicion.",
   "fortalezas":["Analitica de campanas","Creatividad aplicada","Relacion con agencias"],
   "areas_oportunidad":["Tamano de equipo liderado","Gestion de proveedores tecnologicos"],
   "estilo_liderazgo":"Colaborativo, muy cercano al equipo.",
   "vision_estrategica":"Media-alta en el dominio comercial.",
   "analisis_toma_decisiones":"Orientada a metricas (ROAS, CAC).",
   "idiomas":[{"idioma":"Espanol","nivel":"Nativo"},{"idioma":"Ingles","nivel":"B2"}],
   "otros_estudios":["Certificacion Google Ads","Diplomado en Analitica Digital"],
   "recomendaciones":"Buen plan B; requiere acompanamiento en gestion de equipo grande.",
   "citas":["CV p.1 - Experiencia","AssessFirst - Potencial Global 89%"]}'::jsonb);

-- V2 Backend Senior (ATRASADA)
insert into candidato_vacante (candidato_id, vacante_id, etapa, estatus, fit_score, compatibilidad_nnn, cumple_no_negociables, ficha) values
('55555555-5555-5555-5555-000000000002', '33333333-3333-3333-3333-000000000002', 'atraccion', 'descartado', 88, 67,
 '[{"no_negociable_id":"44444444-4444-4444-4444-000000000201","estado":"cumple","evidencia":"Ing. en Sistemas Computacionales, UNAM","cita":"CV p.1 - Formacion"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000202","estado":"cumple","evidencia":"7 anos en microservicios (Node.js, Java) en Fintech Nova","cita":"CV p.1 - Experiencia"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000203","estado":"parcial","evidencia":"Mentoria a 2 juniors; sin liderazgo formal de squad","cita":"CV p.2 - Logros"}]'::jsonb,
 '{"descripcion":"Backend senior con profundidad tecnica en sistemas transaccionales de alta disponibilidad.",
   "fortalezas":["Arquitectura de servicios","Calidad de codigo","Resolucion de incidentes"],
   "areas_oportunidad":["Liderazgo formal de equipo","Comunicacion con negocio"],
   "estilo_liderazgo":"Tecnico por influencia; aun no lidera formalmente.",
   "vision_estrategica":"Media, muy centrada en el dominio tecnico.",
   "analisis_toma_decisiones":"Rigurosa, basada en evidencia y benchmarks.",
   "idiomas":[{"idioma":"Espanol","nivel":"Nativo"},{"idioma":"Ingles","nivel":"B2"}],
   "otros_estudios":["Diplomado en Arquitectura de Software"],
   "recomendaciones":"Excelente perfil tecnico; candidato natural para reubicacion en Arquitecto Cloud.",
   "citas":["CV p.1 - Experiencia","AssessFirst - Potencial Global 88%"]}'::jsonb),

('55555555-5555-5555-5555-000000000008', '33333333-3333-3333-3333-000000000002', 'atraccion', 'activo', 87, 67,
 '[{"no_negociable_id":"44444444-4444-4444-4444-000000000201","estado":"cumple","evidencia":"Ing. en Sistemas, Universidad Anahuac","cita":"CV p.1 - Formacion"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000202","estado":"parcial","evidencia":"5 anos, mayoria frontend con servicios BFF","cita":"CV p.1 - Experiencia"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000203","estado":"cumple","evidencia":"Lider tecnico de squad de producto (6 personas)","cita":"CV p.2 - Logros"}]'::jsonb,
 '{"descripcion":"Desarrollador de producto con perfil full-stack inclinado a frontend y liderazgo de squad.",
   "fortalezas":["Liderazgo tecnico","Cercania a producto","Colaboracion"],
   "areas_oportunidad":["Profundidad en backend distribuido","Observabilidad"],
   "estilo_liderazgo":"Facilitador, empuja decisiones por consenso tecnico.",
   "vision_estrategica":"Media-alta en producto digital.",
   "analisis_toma_decisiones":"Pragmatica, prioriza impacto en usuario.",
   "idiomas":[{"idioma":"Espanol","nivel":"Nativo"},{"idioma":"Ingles","nivel":"B2"}],
   "otros_estudios":["Certificacion AWS Developer Associate"],
   "recomendaciones":"Candidato referido; validar profundidad backend en entrevista tecnica.",
   "citas":["CV p.1 - Experiencia","AssessFirst - Potencial Global 87%"]}'::jsonb);

-- V3 Analista de Datos Jr.
insert into candidato_vacante (candidato_id, vacante_id, etapa, estatus, fit_score, compatibilidad_nnn, cumple_no_negociables, ficha) values
('55555555-5555-5555-5555-000000000003', '33333333-3333-3333-3333-000000000003', 'atraccion', 'activo', 95, 100,
 '[{"no_negociable_id":"44444444-4444-4444-4444-000000000301","estado":"cumple","evidencia":"Lic. en Actuaria, UNAM","cita":"CV p.1 - Formacion"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000302","estado":"cumple","evidencia":"SQL avanzado y Power BI en Consultora Datalytics","cita":"CV p.1 - Experiencia"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000303","estado":"cumple","evidencia":"Presenta hallazgos a comite comercial cada mes","cita":"CV p.2 - Logros"}]'::jsonb,
 '{"descripcion":"Analista junior con base cuantitativa fuerte y buena comunicacion de hallazgos.",
   "fortalezas":["Razonamiento numerico","SQL","Comunicacion de datos"],
   "areas_oportunidad":["Experiencia en retail","Automatizacion con Python"],
   "estilo_liderazgo":"Aun no aplica; perfil de contribucion individual.",
   "vision_estrategica":"En desarrollo; muy buena lectura del dato.",
   "analisis_toma_decisiones":"Analitica y estructurada.",
   "idiomas":[{"idioma":"Espanol","nivel":"Nativo"},{"idioma":"Ingles","nivel":"B2"}],
   "otros_estudios":["Diplomado en Ciencia de Datos (2024)"],
   "recomendaciones":"Mejor perfil del pool; avanzar a panel con BI.",
   "citas":["CV p.1 - Experiencia","AssessFirst - Potencial Global 95%"]}'::jsonb),

('55555555-5555-5555-5555-000000000010', '33333333-3333-3333-3333-000000000003', 'atraccion', 'activo', 82, 33,
 '[{"no_negociable_id":"44444444-4444-4444-4444-000000000301","estado":"parcial","evidencia":"Pasante de Ing. en Software; titulacion en curso","cita":"CV p.1 - Formacion"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000302","estado":"parcial","evidencia":"SQL basico; sin Power BI","cita":"CV p.1 - Habilidades"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000303","estado":"cumple","evidencia":"Documenta y presenta resultados de pruebas QA","cita":"CV p.2 - Experiencia"}]'::jsonb,
 '{"descripcion":"Becario de QA con alta disposicion de aprendizaje y bases de programacion.",
   "fortalezas":["Aprendizaje rapido","Detalle","Actitud"],
   "areas_oportunidad":["Titulacion","Herramientas de BI"],
   "estilo_liderazgo":"No aplica.",
   "vision_estrategica":"Incipiente.",
   "analisis_toma_decisiones":"Guiada, requiere acompanamiento.",
   "idiomas":[{"idioma":"Espanol","nivel":"Nativo"},{"idioma":"Ingles","nivel":"B1"}],
   "otros_estudios":["Curso de Python para analisis de datos"],
   "recomendaciones":"Considerar para programa de becarios mas que para la vacante actual.",
   "citas":["CV p.1 - Formacion","AssessFirst - Potencial Global 82%"]}'::jsonb);

-- V4 Arquitecto Cloud
insert into candidato_vacante (candidato_id, vacante_id, etapa, estatus, fit_score, compatibilidad_nnn, cumple_no_negociables, ficha) values
('55555555-5555-5555-5555-000000000006', '33333333-3333-3333-3333-000000000004', 'busqueda', 'descartado', 91, 100,
 '[{"no_negociable_id":"44444444-4444-4444-4444-000000000401","estado":"cumple","evidencia":"AWS Solutions Architect Professional vigente","cita":"CV p.1 - Certificaciones"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000402","estado":"cumple","evidencia":"Diseno multi-region para CloudWorks LatAm","cita":"CV p.2 - Proyectos"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000403","estado":"cumple","evidencia":"Coordino 4 equipos en migracion de 60 servicios","cita":"CV p.2 - Proyectos"}]'::jsonb,
 '{"descripcion":"Arquitecto cloud con experiencia en migraciones grandes y diseno multi-region.",
   "fortalezas":["Arquitectura","Autonomia","Vision de largo plazo"],
   "areas_oportunidad":["Ajuste a presupuesto","Cercania a negocio retail"],
   "estilo_liderazgo":"Referente tecnico; influye sin autoridad formal.",
   "vision_estrategica":"Alta.",
   "analisis_toma_decisiones":"Estructurada, con analisis de trade-offs y costo.",
   "idiomas":[{"idioma":"Espanol","nivel":"Nativo"},{"idioma":"Ingles","nivel":"C1"}],
   "otros_estudios":["AWS SA Professional","Azure Solutions Architect Expert"],
   "recomendaciones":"Perfil cumple de sobra; el bloqueo fue presupuestal, no de competencias.",
   "citas":["CV p.1 - Certificaciones","AssessFirst - Potencial Global 91%"]}'::jsonb);

-- V5 HRBP Corporativo
insert into candidato_vacante (candidato_id, vacante_id, etapa, estatus, fit_score, compatibilidad_nnn, cumple_no_negociables, ficha) values
('55555555-5555-5555-5555-000000000009', '33333333-3333-3333-3333-000000000005', 'atraccion', 'descartado', 90, 100,
 '[{"no_negociable_id":"44444444-4444-4444-4444-000000000501","estado":"cumple","evidencia":"Lic. en Psicologia Organizacional, Ibero","cita":"CV p.1 - Formacion"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000502","estado":"cumple","evidencia":"4 anos en relaciones laborales","cita":"CV p.1 - Experiencia"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000503","estado":"cumple","evidencia":"Acompano 3 reestructuras de area","cita":"CV p.2 - Logros"}]'::jsonb,
 '{"descripcion":"HRBP con experiencia interna en el grupo y fuerte manejo de conversaciones dificiles.",
   "fortalezas":["Escucha activa","Relaciones laborales","Conocimiento del negocio"],
   "areas_oportunidad":["Analitica de personas","Exposicion a centros de distribucion"],
   "estilo_liderazgo":"Consultivo.",
   "vision_estrategica":"Alta en el dominio de RH.",
   "analisis_toma_decisiones":"Equilibra riesgo laboral y necesidad del area.",
   "idiomas":[{"idioma":"Espanol","nivel":"Nativo"},{"idioma":"Ingles","nivel":"B2"}],
   "otros_estudios":["Diplomado en Derecho Laboral"],
   "recomendaciones":"Se resolvio por movimiento interno; mantener en pool para siguientes aperturas.",
   "citas":["CV p.1 - Experiencia","AssessFirst - Potencial Global 90%"]}'::jsonb);

-- V6 Disenador UX/UI Senior
insert into candidato_vacante (candidato_id, vacante_id, etapa, estatus, fit_score, compatibilidad_nnn, cumple_no_negociables, ficha) values
('55555555-5555-5555-5555-000000000004', '33333333-3333-3333-3333-000000000006', 'busqueda', 'activo', 85, 100,
 '[{"no_negociable_id":"44444444-4444-4444-4444-000000000601","estado":"cumple","evidencia":"Lic. en Diseno Grafico, UAM","cita":"CV p.1 - Formacion"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000602","estado":"cumple","evidencia":"Portafolio con 4 productos en produccion","cita":"Portafolio - liga en CV p.1"},
   {"no_negociable_id":"44444444-4444-4444-4444-000000000603","estado":"cumple","evidencia":"Construyo el design system de Pixelab","cita":"CV p.2 - Proyectos"}]'::jsonb,
 '{"descripcion":"Disenador senior con foco en producto digital y sistemas de diseno.",
   "fortalezas":["Design system","Investigacion con usuarios","Prototipado"],
   "areas_oportunidad":["Metricas de negocio","Escala retail"],
   "estilo_liderazgo":"Referente de craft; mentoria a disenadores junior.",
   "vision_estrategica":"Media-alta en producto.",
   "analisis_toma_decisiones":"Basada en investigacion y pruebas de usabilidad.",
   "idiomas":[{"idioma":"Espanol","nivel":"Nativo"},{"idioma":"Ingles","nivel":"B2"}],
   "otros_estudios":["Certificacion NN/g en UX Research"],
   "recomendaciones":"Avanzar a entrevista por competencias.",
   "citas":["CV p.1 - Experiencia","AssessFirst - Potencial Global 85%"]}'::jsonb);

-- ---------------------------------------------------------------------------
-- 9. Etapas por vacante (SLA). V2 queda ATRASADA a proposito.
-- ---------------------------------------------------------------------------
insert into vacante_etapas (vacante_id, etapa, dueno_id, fecha_inicio, fecha_limite, fecha_cierre, estatus) values
-- V1: avanza a tiempo, hoy en Seleccion
('33333333-3333-3333-3333-000000000001','requisicion','11111111-1111-1111-1111-111111111103', current_date-38, current_date-36, current_date-37, 'completada'),
('33333333-3333-3333-3333-000000000001','alineacion', '11111111-1111-1111-1111-111111111102', current_date-37, current_date-35, current_date-35, 'completada'),
('33333333-3333-3333-3333-000000000001','busqueda',   '11111111-1111-1111-1111-111111111102', current_date-35, current_date-21, current_date-22, 'completada'),
('33333333-3333-3333-3333-000000000001','atraccion',  '11111111-1111-1111-1111-111111111102', current_date-22, current_date-2,  current_date-3,  'completada'),
('33333333-3333-3333-3333-000000000001','seleccion',  '11111111-1111-1111-1111-111111111102', current_date-3,  current_date+4,  null,            'a_tiempo'),

-- V2: ATRASADA (limite vencido hace 4 dias, sin cerrar) -> semaforo rojo + escalacion
('33333333-3333-3333-3333-000000000002','requisicion','11111111-1111-1111-1111-111111111103', current_date-52, current_date-51, current_date-51, 'completada'),
('33333333-3333-3333-3333-000000000002','alineacion', '11111111-1111-1111-1111-111111111102', current_date-51, current_date-50, current_date-50, 'completada'),
('33333333-3333-3333-3333-000000000002','busqueda',   '11111111-1111-1111-1111-111111111102', current_date-50, current_date-41, current_date-40, 'completada'),
('33333333-3333-3333-3333-000000000002','atraccion',  '11111111-1111-1111-1111-111111111102', current_date-40, current_date-4,  null,            'atrasada'),

-- V3: en riesgo (vence en 2 dias)
('33333333-3333-3333-3333-000000000003','requisicion','11111111-1111-1111-1111-111111111103', current_date-21, current_date-20, current_date-20, 'completada'),
('33333333-3333-3333-3333-000000000003','alineacion', '11111111-1111-1111-1111-111111111102', current_date-20, current_date-19, current_date-19, 'completada'),
('33333333-3333-3333-3333-000000000003','busqueda',   '11111111-1111-1111-1111-111111111102', current_date-19, current_date-10, current_date-11, 'completada'),
('33333333-3333-3333-3333-000000000003','atraccion',  '11111111-1111-1111-1111-111111111102', current_date-11, current_date+2,  null,            'en_riesgo'),

-- V4
('33333333-3333-3333-3333-000000000004','requisicion','11111111-1111-1111-1111-111111111103', current_date-16, current_date-14, current_date-14, 'completada'),
('33333333-3333-3333-3333-000000000004','alineacion', '11111111-1111-1111-1111-111111111102', current_date-14, current_date-11, current_date-12, 'completada'),
('33333333-3333-3333-3333-000000000004','busqueda',   '11111111-1111-1111-1111-111111111102', current_date-12, current_date+2,  null,            'a_tiempo'),

-- V5
('33333333-3333-3333-3333-000000000005','requisicion','11111111-1111-1111-1111-111111111103', current_date-25, current_date-23, current_date-23, 'completada'),
('33333333-3333-3333-3333-000000000005','alineacion', '11111111-1111-1111-1111-111111111102', current_date-23, current_date-21, current_date-21, 'completada'),
('33333333-3333-3333-3333-000000000005','busqueda',   '11111111-1111-1111-1111-111111111102', current_date-21, current_date-11, current_date-12, 'completada'),
('33333333-3333-3333-3333-000000000005','atraccion',  '11111111-1111-1111-1111-111111111102', current_date-12, current_date+8,  null,            'a_tiempo'),

-- V6
('33333333-3333-3333-3333-000000000006','requisicion','11111111-1111-1111-1111-111111111103', current_date-12, current_date-11, current_date-11, 'completada'),
('33333333-3333-3333-3333-000000000006','alineacion', '11111111-1111-1111-1111-111111111102', current_date-11, current_date-10, current_date-10, 'completada'),
('33333333-3333-3333-3333-000000000006','busqueda',   '11111111-1111-1111-1111-111111111102', current_date-10, current_date+4,  null,            'a_tiempo'),

-- V7: recien creada, arranca hoy
('33333333-3333-3333-3333-000000000007','requisicion','11111111-1111-1111-1111-111111111103', current_date,    current_date+1,  null,            'a_tiempo');

-- ---------------------------------------------------------------------------
-- 10. Entrevistas + participantes + feedback
--     Candidatos 1, 2 y 3 con historial de MULTIPLES entrevistas (docs/07).
-- ---------------------------------------------------------------------------
insert into entrevistas (id, vacante_id, candidato_id, fecha, tipo, estatus, calendar_event_id) values
  ('77777777-7777-7777-7777-000000000001','33333333-3333-3333-3333-000000000001','55555555-5555-5555-5555-000000000001', (current_date-14)::timestamptz + time '10:00', 'competencias','realizada','seed-evt-ana-1'),
  ('77777777-7777-7777-7777-000000000002','33333333-3333-3333-3333-000000000001','55555555-5555-5555-5555-000000000001', (current_date-6)::timestamptz  + time '11:00', 'panel',       'realizada','seed-evt-ana-2'),
  ('77777777-7777-7777-7777-000000000003','33333333-3333-3333-3333-000000000002','55555555-5555-5555-5555-000000000002', (current_date-30)::timestamptz + time '09:30', 'competencias','realizada','seed-evt-carlos-1'),
  ('77777777-7777-7777-7777-000000000004','33333333-3333-3333-3333-000000000002','55555555-5555-5555-5555-000000000002', (current_date-22)::timestamptz + time '16:00', 'panel',       'realizada','seed-evt-carlos-2'),
  ('77777777-7777-7777-7777-000000000005','33333333-3333-3333-3333-000000000003','55555555-5555-5555-5555-000000000003', (current_date-9)::timestamptz  + time '12:00', 'competencias','realizada','seed-evt-sofia-1'),
  ('77777777-7777-7777-7777-000000000006','33333333-3333-3333-3333-000000000003','55555555-5555-5555-5555-000000000003', (current_date-2)::timestamptz  + time '17:00', 'panel',       'realizada','seed-evt-sofia-2'),
  -- Proxima entrevista (panel en vivo para la demo de Realtime)
  ('77777777-7777-7777-7777-000000000007','33333333-3333-3333-3333-000000000001','55555555-5555-5555-5555-000000000007', (current_date+1)::timestamptz  + time '10:00', 'panel',      'programada','seed-evt-fernanda-1');

insert into entrevista_participantes (entrevista_id, entrevistador_id) values
  ('77777777-7777-7777-7777-000000000001','11111111-1111-1111-1111-111111111104'),
  ('77777777-7777-7777-7777-000000000002','11111111-1111-1111-1111-111111111104'),
  ('77777777-7777-7777-7777-000000000002','11111111-1111-1111-1111-111111111105'),
  ('77777777-7777-7777-7777-000000000003','11111111-1111-1111-1111-111111111104'),
  ('77777777-7777-7777-7777-000000000004','11111111-1111-1111-1111-111111111104'),
  ('77777777-7777-7777-7777-000000000004','11111111-1111-1111-1111-111111111105'),
  ('77777777-7777-7777-7777-000000000005','11111111-1111-1111-1111-111111111106'),
  ('77777777-7777-7777-7777-000000000006','11111111-1111-1111-1111-111111111106'),
  ('77777777-7777-7777-7777-000000000006','11111111-1111-1111-1111-111111111104'),
  ('77777777-7777-7777-7777-000000000007','11111111-1111-1111-1111-111111111104'),
  ('77777777-7777-7777-7777-000000000007','11111111-1111-1111-1111-111111111105');

insert into feedback_entrevista (entrevista_id, entrevistador_id, candidato_id, scores, veredicto, notas, ts) values
  -- Ana Lopez: 2 entrevistas, consenso positivo
  ('77777777-7777-7777-7777-000000000001','11111111-1111-1111-1111-111111111104','55555555-5555-5555-5555-000000000001',
   '{"liderazgo":90,"comunicacion":92,"gestion_proyectos":95,"conocimiento_tecnico":78}'::jsonb,'recomendado',
   'Muy clara al explicar como priorizo un roadmap con recursos limitados. Ejemplos concretos y medibles.', (current_date-14)::timestamptz + time '11:05'),
  ('77777777-7777-7777-7777-000000000002','11111111-1111-1111-1111-111111111104','55555555-5555-5555-5555-000000000001',
   '{"liderazgo":92,"comunicacion":90,"gestion_proyectos":94,"conocimiento_tecnico":80}'::jsonb,'recomendado',
   'Consistente con la primera sesion. Buen manejo de conflicto con proveedores.', (current_date-6)::timestamptz + time '12:10'),
  ('77777777-7777-7777-7777-000000000002','11111111-1111-1111-1111-111111111105','55555555-5555-5555-5555-000000000001',
   '{"liderazgo":88,"comunicacion":95,"gestion_proyectos":90,"conocimiento_tecnico":75}'::jsonb,'recomendado',
   'Excelente comunicacion ejecutiva. Le falta contexto de retail, se cubre con induccion.', (current_date-6)::timestamptz + time '12:15'),

  -- Carlos Mendoza: 2 entrevistas, con DESACUERDO en liderazgo (demo del consolidador)
  ('77777777-7777-7777-7777-000000000003','11111111-1111-1111-1111-111111111104','55555555-5555-5555-5555-000000000002',
   '{"liderazgo":62,"comunicacion":78,"conocimiento_tecnico":95,"resolucion_problemas":92}'::jsonb,'recomendado',
   'Nivel tecnico sobresaliente. En liderazgo solo reporta mentoria informal.', (current_date-30)::timestamptz + time '10:40'),
  ('77777777-7777-7777-7777-000000000004','11111111-1111-1111-1111-111111111104','55555555-5555-5555-5555-000000000002',
   '{"liderazgo":65,"comunicacion":80,"conocimiento_tecnico":96,"resolucion_problemas":93}'::jsonb,'recomendado',
   'Resolvio bien el caso de diseno de sistema. Sostengo la recomendacion.', (current_date-22)::timestamptz + time '17:05'),
  ('77777777-7777-7777-7777-000000000004','11111111-1111-1111-1111-111111111105','55555555-5555-5555-5555-000000000002',
   '{"liderazgo":40,"comunicacion":70,"conocimiento_tecnico":94,"resolucion_problemas":88}'::jsonb,'no_recomendado',
   'No veo la madurez de liderazgo que necesita el squad. Diferencia importante con la otra evaluacion.', (current_date-22)::timestamptz + time '17:20'),

  -- Sofia Herrera: 2 entrevistas, consenso positivo
  ('77777777-7777-7777-7777-000000000005','11111111-1111-1111-1111-111111111106','55555555-5555-5555-5555-000000000003',
   '{"pensamiento_analitico":96,"sql":90,"comunicacion":85,"aprendizaje":95}'::jsonb,'recomendado',
   'Resolvio el ejercicio de SQL sin ayuda y explico su razonamiento paso a paso.', (current_date-9)::timestamptz + time '13:00'),
  ('77777777-7777-7777-7777-000000000006','11111111-1111-1111-1111-111111111106','55555555-5555-5555-5555-000000000003',
   '{"pensamiento_analitico":95,"sql":92,"comunicacion":88,"aprendizaje":96}'::jsonb,'recomendado',
   'Confirma nivel. Propuso una metrica que no teniamos contemplada.', (current_date-2)::timestamptz + time '18:00'),
  ('77777777-7777-7777-7777-000000000006','11111111-1111-1111-1111-111111111104','55555555-5555-5555-5555-000000000003',
   '{"pensamiento_analitico":93,"sql":88,"comunicacion":90,"aprendizaje":94}'::jsonb,'recomendado',
   'Perfil junior con techo alto. Recomiendo avanzar.', (current_date-2)::timestamptz + time '18:05');

-- ---------------------------------------------------------------------------
-- 11. Preguntas de entrevista sugeridas por IA
-- ---------------------------------------------------------------------------
insert into preguntas_entrevista (vacante_id, candidato_id, preguntas, generado_por) values
('33333333-3333-3333-3333-000000000001','55555555-5555-5555-5555-000000000007',
 '[{"pregunta":"Cuentame de un proyecto donde tuviste que alinear a tecnologia y a negocio con prioridades opuestas. Que hiciste?","objetivo":"Validar coordinacion multiarea","competencia":"gestion_proyectos"},
   {"pregunta":"Tu CV indica ingles de lectura tecnica. Podrias describir en ingles como organizas un sprint review?","objetivo":"Validar el no negociable de ingles conversacional","competencia":"idiomas","bandera":"no_negociable_parcial"},
   {"pregunta":"Como mides el exito de un equipo que facilitas, mas alla de la velocidad?","objetivo":"Explorar vision mas alla de entrega","competencia":"liderazgo"}]'::jsonb,
 'ia'),
('33333333-3333-3333-3333-000000000003','55555555-5555-5555-5555-000000000003',
 '[{"pregunta":"Describe un hallazgo tuyo que cambio una decision comercial. Como lo presentaste?","objetivo":"Validar comunicacion de hallazgos","competencia":"comunicacion"},
   {"pregunta":"Que harias si el dato de ventas no cuadra con el del area de finanzas?","objetivo":"Explorar rigor analitico","competencia":"pensamiento_analitico"}]'::jsonb,
 'ia');

-- ---------------------------------------------------------------------------
-- 12. Decisiones del HM (justificacion obligatoria)
-- ---------------------------------------------------------------------------
insert into decisiones (id, vacante_id, candidato_id, hm_id, decision, justificacion, ts) values
('88888888-8888-8888-8888-000000000001','33333333-3333-3333-3333-000000000001','55555555-5555-5555-5555-000000000001','11111111-1111-1111-1111-111111111101',
 'finalista',
 'Cumple los tres no negociables con evidencia y tuvo consenso de recomendacion en las dos entrevistas. Su experiencia coordinando tecnologia y proveedores es justo el vacio que tenemos hoy.',
 (current_date-3)::timestamptz + time '09:00'),

('88888888-8888-8888-8888-000000000002','33333333-3333-3333-3333-000000000002','55555555-5555-5555-5555-000000000002','11111111-1111-1111-1111-111111111101',
 'descartado',
 'Perfil tecnico sobresaliente, pero para esta posicion necesitamos liderazgo formal de squad desde el dia uno y su evidencia es de mentoria informal. Se le sugieren otras vacantes acordes a su perfil.',
 (current_date-20)::timestamptz + time '10:30'),

('88888888-8888-8888-8888-000000000003','33333333-3333-3333-3333-000000000004','55555555-5555-5555-5555-000000000006','11111111-1111-1111-1111-111111111101',
 'descartado',
 'Cumple todos los no negociables, pero su expectativa salarial (145,000) esta 20% arriba del tope autorizado para la posicion. Se mantiene en pool para una futura apertura con rango ampliado.',
 (current_date-8)::timestamptz + time '12:00'),

('88888888-8888-8888-8888-000000000004','33333333-3333-3333-3333-000000000005','55555555-5555-5555-5555-000000000009','11111111-1111-1111-1111-111111111101',
 'descartado',
 'La posicion se cubre con un movimiento interno ya autorizado. La candidata queda en pool con prioridad para la siguiente apertura de HRBP.',
 (current_date-6)::timestamptz + time '15:45');

-- ---------------------------------------------------------------------------
-- 13. Notificaciones / alertas activas (cero ghosting)
-- ---------------------------------------------------------------------------
insert into notificaciones (destinatario_tipo, destinatario_id, vacante_id, tipo, canal, contenido, estatus, aprobada_por, ts) values
  -- Recordatorio al HM: tiene 2 dias para elegir finalista en V1
  ('usuario','11111111-1111-1111-1111-111111111101','33333333-3333-3333-3333-000000000001','recordatorio','portal',
   'Tienes 2 dias habiles para confirmar al finalista de Gerente de Proyectos E-commerce. El pool ya esta listo para comparar.',
   'enviada','11111111-1111-1111-1111-111111111102',(current_date-1)::timestamptz + time '08:00'),

  -- Escalacion al HRBP: V2 atrasada
  ('usuario','11111111-1111-1111-1111-111111111103','33333333-3333-3333-3333-000000000002','escalacion','correo',
   'La etapa de Atraccion de Desarrollador Backend Senior lleva 4 dias habiles vencida. Bloquea: definicion de candidatos que pasan (HM).',
   'enviada','11111111-1111-1111-1111-111111111102',(current_date)::timestamptz + time '07:30'),

  -- Resultado por aprobar (borrador de la IA) — Carlos Mendoza
  ('candidato','55555555-5555-5555-5555-000000000002','33333333-3333-3333-3333-000000000002','resultado','correo',
   'Hola Carlos, gracias por el tiempo que dedicaste a las dos entrevistas para Desarrollador Backend Senior. En esta ocasion decidimos avanzar con un perfil con liderazgo formal de equipo; tu nivel tecnico nos parecio sobresaliente. Nos gustaria proponerte otras vacantes que encajan mejor con tu perfil.',
   'borrador',null,(current_date-20)::timestamptz + time '11:00'),

  -- Resultado por aprobar (borrador de la IA) — David Pena
  ('candidato','55555555-5555-5555-5555-000000000006','33333333-3333-3333-3333-000000000004','resultado','correo',
   'Hola David, gracias por participar en el proceso de Arquitecto Cloud. Tu perfil cumple con todo lo que buscabamos; en esta ocasion no pudimos cerrar por el rango salarial autorizado. Nos gustaria mantenerte cerca para la siguiente apertura.',
   'borrador',null,(current_date-8)::timestamptz + time '12:30'),

  -- Cambio de etapa informado al candidato
  ('candidato','55555555-5555-5555-5555-000000000003','33333333-3333-3333-3333-000000000003','cambio_etapa','correo',
   'Hola Sofia, avanzaste a la etapa de Atraccion para Analista de Datos Jr. El siguiente paso es la entrevista de panel con el area de BI.',
   'enviada','11111111-1111-1111-1111-111111111102',(current_date-11)::timestamptz + time '09:15'),

  -- Aprobada, lista para enviar
  ('candidato','55555555-5555-5555-5555-000000000009','33333333-3333-3333-3333-000000000005','resultado','correo',
   'Hola Mariana, gracias por tu interes en la posicion de HR Business Partner. La vacante se cubrio con un movimiento interno; tu perfil queda con prioridad para la siguiente apertura.',
   'aprobada','11111111-1111-1111-1111-111111111102',(current_date-6)::timestamptz + time '16:00');

-- ---------------------------------------------------------------------------
-- 14. Sugerencias de reubicacion (referidos priorizados)
-- ---------------------------------------------------------------------------
insert into sugerencias_vacante (candidato_id, vacante_id_sugerida, score, motivo, estatus) values
  ('55555555-5555-5555-5555-000000000002','33333333-3333-3333-3333-000000000004', 78,
   'Su experiencia en microservicios de alta disponibilidad y el diseno de sistemas que mostro en entrevista se acercan al perfil de Arquitecto Cloud; el no negociable que no cumplia (liderazgo de squad) no aplica aqui.','sugerida'),
  ('55555555-5555-5555-5555-000000000006','33333333-3333-3333-3333-000000000002', 72,
   'Cumple de sobra el nivel tecnico del Backend Senior; el ajuste seria de expectativa salarial, no de competencias.','sugerida'),
  ('55555555-5555-5555-5555-000000000010','33333333-3333-3333-3333-000000000006', 55,
   'Perfil junior con interes en producto digital; encaja mejor en un rol de apoyo al equipo de diseno/QA de e-commerce.','sugerida');

-- ---------------------------------------------------------------------------
-- 15. audit_log (append-only) — rastro de lo sembrado
-- ---------------------------------------------------------------------------
insert into audit_log (ts, actor_id, actor_rol, accion, entidad, entidad_id, detalle, decision_id) values
  ((current_date-38)::timestamptz + time '09:00','11111111-1111-1111-1111-111111111103','hrbp','crear_vacante','vacantes','33333333-3333-3333-3333-000000000001',
   '{"titulo":"Gerente de Proyectos E-commerce","posicion_autorizada":true}'::jsonb, null),
  ((current_date-3)::timestamptz + time '09:00','11111111-1111-1111-1111-111111111101','hm','decision_finalista','candidato_vacante','55555555-5555-5555-5555-000000000001',
   '{"decision":"finalista","vacante":"Gerente de Proyectos E-commerce"}'::jsonb,'88888888-8888-8888-8888-000000000001'),
  ((current_date-20)::timestamptz + time '10:30','11111111-1111-1111-1111-111111111101','hm','decision_descarte','candidato_vacante','55555555-5555-5555-5555-000000000002',
   '{"decision":"descartado","motivo_corto":"liderazgo formal"}'::jsonb,'88888888-8888-8888-8888-000000000002'),
  ((current_date-20)::timestamptz + time '11:00','11111111-1111-1111-1111-111111111102','at','generar_borrador_ia','notificaciones',null,
   '{"agente":"feedback_personalizado","candidato":"Carlos Mendoza","estatus":"borrador"}'::jsonb, null),
  ((current_date-11)::timestamptz + time '09:15','11111111-1111-1111-1111-111111111102','at','enviar_notificacion','notificaciones',null,
   '{"canal":"correo","candidato":"Sofia Herrera","tipo":"cambio_etapa"}'::jsonb, null),
  ((current_date)::timestamptz + time '07:30',null,null,'escalacion_sla','vacantes','33333333-3333-3333-3333-000000000002',
   '{"etapa":"atraccion","dias_vencidos":4,"escalado_a":"hrbp"}'::jsonb, null);

-- ---------------------------------------------------------------------------
-- 16. Verificacion rapida del candado (no inserta nada; solo deja constancia)
-- ---------------------------------------------------------------------------
do $$
declare
  v_msg text;
begin
  begin
    insert into vacantes (posicion_id, titulo, nivel)
    values ('22222222-2222-2222-2222-000000000099', 'Director de Innovacion', 'complejo');
    raise exception 'FALLA: el candado de posicion NO bloqueo una posicion no autorizada';
  exception
    when check_violation then
      get stacked diagnostics v_msg = message_text;
      raise notice 'Candado de posicion OK -> %', v_msg;
  end;
end;
$$;
