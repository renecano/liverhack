import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente con service_role: omite RLS. SOLO para código de servidor confiable
// (orquestador, sla-engine, scripts). Nunca importarlo desde un componente cliente.
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
