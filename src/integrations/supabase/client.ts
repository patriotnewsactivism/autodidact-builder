// FILE: src/integrations/supabase/client.ts
// Minimal, dependency-free, SSR-safe Supabase client singleton.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// Guard window APIs for SSR/edge builds.
const storage =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
    ? window.localStorage
    : undefined;

let _client: SupabaseClient<Database> | null = null;

/** Why: lazy-create to avoid "read before init" during circular eval */
export const supabase = (() => {
  if (_client) return _client;

  if (!url || !anon) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
  }

  _client = createClient<Database>(url, anon, {
    auth: {
      storage,               // undefined is OK in SSR
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return _client;
})();
