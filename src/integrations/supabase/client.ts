import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

type SupportedStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const createMemoryStorage = (): SupportedStorage => {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
};

const resolveAuthStorage = (): SupportedStorage => {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return window.localStorage;
  }
  return createMemoryStorage();
};

let client: SupabaseClient<Database> | null = null;

export const getSupabaseClient = (): SupabaseClient<Database> => {
  if (client) {
    return client;
  }

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

  if (!url || !anon) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
  }

  client = createClient<Database>(url, anon, {
    auth: {
      storage: resolveAuthStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return client;
};

export const supabase = getSupabaseClient();
