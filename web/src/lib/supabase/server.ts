import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente de servidor con la sesión del usuario (cookies): respeta RLS.
// Para Server Components, Route Handlers y Server Actions.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component: no puede escribir cookies.
            // El refresh de sesión lo hará el proxy/middleware.
          }
        },
      },
    },
  );
}
