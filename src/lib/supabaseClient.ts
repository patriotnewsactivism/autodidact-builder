// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

// Why: keep this module dependency-free to avoid cycles.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);
