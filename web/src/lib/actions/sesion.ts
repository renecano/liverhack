"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Cierra la sesión de Supabase (borra las cookies de auth vía el cliente de servidor)
 * y devuelve al login. Tras esto, proxy.ts vuelve a bloquear las rutas internas.
 */
export async function cerrarSesion(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
