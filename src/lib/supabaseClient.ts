// FILE: src/lib/supabaseClient.ts
// SSR-safe, lazy, dependency-free Supabase client singleton.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// Guard browser storage for SSR/Edge builds.
const storage =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
    ? window.localStorage
    : undefined;

let client: SupabaseClient<Database> | null = null;

/** Lazily create to avoid "read before init" in circular eval scenarios. */
export const supabase: SupabaseClient<Database> = (() => {
  if (client) return client;
  if (!url || !anon) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
  }
  client = createClient<Database>(url, anon, {
    auth: {
      storage,               // undefined is OK outside the browser
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
})();
