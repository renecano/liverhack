import { createAdminClient } from '../src/lib/supabase/admin';
import type { Usuario } from '../src/lib/supabase/types';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'Liverhack2026!';

async function main() {
  const db = createAdminClient();
  const { data: perfiles, error: perfilesError } = await db
    .from('usuarios')
    .select('id, nombre, email, rol, area, activo')
    .eq('activo', true);
  if (perfilesError) throw new Error(`usuarios: ${perfilesError.message}`);

  const { data: lista, error: listaError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listaError) throw new Error(`auth.users: ${listaError.message}`);
  const porId = new Map(lista.users.map((user) => [user.id, user]));
  const porEmail = new Map(lista.users.filter((user) => user.email).map((user) => [user.email!.toLowerCase(), user]));

  for (const perfil of perfiles as Usuario[]) {
    const metadata = { nombre: perfil.nombre, rol: perfil.rol };
    const existentePorId = porId.get(perfil.id);
    const existentePorEmail = porEmail.get(perfil.email.toLowerCase());

    if (existentePorId) {
      const { error } = await db.auth.admin.updateUserById(perfil.id, {
        email: perfil.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error) throw new Error(`${perfil.email}: ${error.message}`);
      console.log(`actualizado  ${perfil.email}`);
      continue;
    }

    // Un email previo con otro UUID no puede enlazarse al perfil por FK; se elimina
    // únicamente el usuario de demo conflictivo y se recrea con el UUID del perfil.
    if (existentePorEmail) {
      const { error } = await db.auth.admin.deleteUser(existentePorEmail.id);
      if (error) throw new Error(`${perfil.email}: no se pudo reemplazar auth.user: ${error.message}`);
    }
    const { error } = await db.auth.admin.createUser({
      id: perfil.id,
      email: perfil.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw new Error(`${perfil.email}: ${error.message}`);
    console.log(`creado      ${perfil.email}`);
  }

  console.log(`Listo: ${perfiles.length} usuarios con contraseña demo.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
