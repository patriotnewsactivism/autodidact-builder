// FILE: src/integrations/supabase/client.ts
// Single source of truth. SSR-safe + lazy to avoid init order issues.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const storage =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
    ? window.localStorage
    : undefined;

let client: SupabaseClient<Database> | null = null;

export const supabase: SupabaseClient<Database> = (() => {
  if (client) return client;
  if (!url || !anon) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
  client = createClient<Database>(url, anon, {
    auth: { storage, persistSession: true, autoRefreshToken: true },
  });
  return client;
})();
