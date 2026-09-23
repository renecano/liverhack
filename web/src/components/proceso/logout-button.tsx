'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const router = useRouter();
  return <button className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:border-[#c8105a] hover:text-[#c8105a]" onClick={async () => { await createClient().auth.signOut(); router.replace('/login'); router.refresh(); }}>Salir</button>;
}
