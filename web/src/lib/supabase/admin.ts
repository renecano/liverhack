import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente con service_role: omite RLS. SOLO para código de servidor confiable
// (orquestador, sla-engine, scripts). Nunca importarlo desde un componente cliente.
//
// Nota: no se añade `import "server-only"` aquí porque este módulo lo importan, vía
// el orquestador, los scripts que corren bajo tsx/Node (verify:proceso, seed:auth) y
// tsx no resuelve el paquete `server-only` (falla la resolución del módulo). Ver la
// nota entregada al equipo. La key sigue protegida: solo se lee de process.env en el
// servidor y este archivo nunca se importa desde componentes cliente.

// Instancia única a nivel módulo: en el servidor un solo cliente basta y evita abrir
// una conexión nueva por cada llamada. La firma pública no cambia (Persona B depende
// del nombre createAdminClient).
let clienteAdmin: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (clienteAdmin) return clienteAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno",
    );
  }
  clienteAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return clienteAdmin;
}
