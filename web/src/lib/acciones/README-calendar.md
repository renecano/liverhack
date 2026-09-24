# Google Calendar en LivHire

El AT agenda entrevistas en **/at/entrevistas**. Con Google conectado, LivHire crea el evento
en el Google Calendar del AT con los entrevistadores como invitados. Sin Google, la entrevista
se guarda igual en LivHire con su fecha (**modo interno**). La demo nunca se rompe.

| Situación | Resultado |
|---|---|
| `ACTIONS_MODE` distinto de `real` | modo interno (sin aviso) |
| Faltan `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | modo interno |
| Falta la tabla `google_conexiones` | modo interno + aviso |
| El AT no conectó su cuenta | modo interno + aviso "Conecta Google Calendar" |
| Google falla (sin red, token revocado, sin permiso, 429) | modo interno + aviso + `agendar_calendar_fallo` en audit_log |
| Todo en orden | evento real + "Ver en Google Calendar" |

Código: `google.ts` (OAuth y tokens), `calendar.ts` (`agendarEnCalendar`),
`web/src/lib/actions/entrevistas.ts` (agendar), rutas `web/src/app/api/google/{auth,callback}`.

## 1. Google Cloud (una vez)

1. Entra a <https://console.cloud.google.com/> y crea o elige un proyecto.
2. **APIs y servicios → Biblioteca** → busca **Google Calendar API** → **Habilitar**.
3. **APIs y servicios → Pantalla de consentimiento de OAuth** (Google Auth Platform):
   - Tipo de usuario: **Externo** (o Interno si es un Workspace propio).
   - Nombre de la app (p. ej. "LivHire demo"), correo de soporte y de contacto.
   - **Acceso a datos / Scopes**: agrega `.../auth/calendar.events`, `openid` y `email`.
   - **Público → Usuarios de prueba**: agrega la cuenta de Gmail con la que vas a conectar.
     Mientras la app esté en modo *Prueba*, solo esos usuarios pueden autorizarla.
4. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación web**.
   - **URIs de redireccionamiento autorizados**: `http://localhost:3000/api/google/callback`
     (y la de producción si aplica, p. ej. `https://tu-app.vercel.app/api/google/callback`).
   - Guarda el **ID de cliente** y el **Secreto**.

## 2. Variables (`web/.env.local`, nunca en el repo)

```
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback   # idéntica a la de Google Cloud
ACTIONS_MODE=real                                               # si no es "real", modo interno
# Opcional: enviar correo de invitación a los entrevistadores (por defecto NO; los usuarios
# demo tienen correos @liverpool.com.mx que parecen reales).
GOOGLE_CALENDAR_SEND_UPDATES=none
```

`GOOGLE_REDIRECT_URI` debe apuntar al mismo host y puerto donde corre la app.

## 3. Base de datos (una vez)

Corre `supabase/migrations/20260924120000_google_conexiones.sql` en el SQL Editor del hosted.
Crea `google_conexiones` con RLS activado y **sin policies**: solo el servidor
(service_role) lee los tokens; nunca llegan al navegador.

## 4. Probar

1. `npm run dev`, entra como AT (`daniela.rios@liverpool.com.mx`) → **Entrevistas**.
2. **Conectar Google Calendar** → elige la cuenta de prueba → acepta el permiso de calendario.
   Vuelves a LivHire con "Google Calendar conectado" y el correo de la cuenta.
3. Agenda una entrevista (candidato, fecha, entrevistadores) → "Entrevista agendada y creada
   en Google Calendar" con el enlace **Ver en Google Calendar**.
4. Abre tu Google Calendar: el evento aparece a esa hora (zona CDMX) con los entrevistadores
   como invitados y el enlace al scorecard en la descripción.

Si Google dice *"Acceso bloqueado: la app no completó la verificación"*, la cuenta no está en
**Usuarios de prueba**. Si dice *redirect_uri_mismatch*, la URI de `.env.local` no coincide
exactamente con la registrada.
