import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AuthErrorState } from '@/auth/auth-errors';

export type AuthCtx = {
  session: Session | null;
  user: Session['user'] | null;
  loading: boolean;
  error: AuthErrorState | null;
};

export const AuthContext = createContext<AuthCtx>({
  session: null,
  user: null,
  loading: true,
  error: null,
});

