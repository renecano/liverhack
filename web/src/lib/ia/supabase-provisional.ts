import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// PROVISIONAL — se reemplaza por el cliente oficial de Persona A
// (web/src/lib/supabase/admin.ts) al hacer merge. Es el único punto de acceso
// a Supabase del dominio IA: al integrar, basta con re-exportar el de A aquí
// o cambiar los imports de "./supabase-provisional". No agregar lógica.
//
// Cliente de servidor con service_role (omite RLS). Nunca importarlo desde un
// Client Component.
let cliente: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }
  cliente = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}
