import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { createAuthErrorState, type AuthErrorState } from '@/auth/auth-errors';

type AuthCtx = {
  session: Session | null;
  user: Session['user'] | null;
  loading: boolean;
  error: AuthErrorState | null;
};

const AuthContext = createContext<AuthCtx>({
  session: null,
  user: null,
  loading: true,
  error: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<AuthErrorState | null>(null);

  useEffect(() => {
    let active = true;

    const initialiseSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!active) return;

        if (error) {
          console.error('Failed to fetch Supabase session', error);
          setAuthError(createAuthErrorState(error));
          setSession(null);
          setLoading(false);
          return;
        }

        setSession(data?.session ?? null);
        setLoading(false);
        setAuthError(null);
      } catch (error) {
        if (active) {
          setLoading(false);
          setAuthError(createAuthErrorState(error));
        }
        console.error('Unexpected Supabase auth error', error);
      }
    };

    initialiseSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      if (nextSession) {
        setAuthError(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      error: authError,
    }),
    [session, loading, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
