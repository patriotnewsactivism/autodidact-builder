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
    console.error('Supabase environment variables missing:', {
      hasUrl: !!url,
      hasAnon: !!anon
    });
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
  }

  try {
    client = createClient<Database>(url, anon, {
      auth: {
        storage: resolveAuthStorage(),
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    throw error;
  }

  return client;
};

// Lazy initialization - only create when first accessed
let supabaseInstance: SupabaseClient<Database> | null = null;

export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    if (!supabaseInstance) {
      supabaseInstance = getSupabaseClient();
    }
    const instance = supabaseInstance;
    const value = instance[prop as keyof SupabaseClient<Database>];
    return typeof value === 'function' ? value.bind(instance) : value;
  }
});
