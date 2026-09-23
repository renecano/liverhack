import { createBrowserClient } from '@supabase/ssr';

/** Cliente exclusivo del navegador para iniciar/cerrar la sesión de Supabase. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
