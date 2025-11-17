import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface GitHubInstallation {
  id: string;
  github_user_id: number;
  github_username: string;
  access_token: string;
  created_at: string;
  updated_at: string;
}

interface UseGithubOAuthReturn {
  installation: GitHubInstallation | null;
  isLoading: boolean;
  error: string | null;
  hasGithubAuth: boolean;
  refreshInstallation: () => Promise<void>;
}

/**
 * Hook to manage GitHub OAuth installation and token
 * Automatically stores OAuth tokens from Supabase auth session
 */
export const useGithubOAuth = (session: Session | null): UseGithubOAuthReturn => {
  const [installation, setInstallation] = useState<GitHubInstallation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInstallation = useCallback(async () => {
    if (!session?.user?.id) {
      setInstallation(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('github_installations')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      setInstallation(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch GitHub installation:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch GitHub installation');
      setInstallation(null);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id]);

  const saveInstallation = useCallback(async () => {
    if (!session?.user?.id || !session.provider_token) {
      return;
    }

    // Only save if provider is GitHub
    if (session.user.app_metadata?.provider !== 'github') {
      return;
    }

    try {
      // Extract GitHub user info from session
      const githubUserId = session.user.user_metadata?.user_id || session.user.user_metadata?.sub;
      const githubUsername =
        session.user.user_metadata?.user_name ||
        session.user.user_metadata?.preferred_username ||
        session.user.user_metadata?.name;

      if (!githubUserId || !githubUsername) {
        console.warn('Missing GitHub user metadata');
        return;
      }

      // Upsert GitHub installation
      const { data, error: upsertError } = await supabase
        .from('github_installations')
        .upsert(
          {
            user_id: session.user.id,
            github_user_id: parseInt(githubUserId, 10),
            github_username: githubUsername,
            access_token: session.provider_token,
            token_type: 'oauth',
            scope: session.user.app_metadata?.provider_scopes?.join(' ') || '',
          },
          {
            onConflict: 'user_id,github_user_id',
          }
        )
        .select()
        .single();

      if (upsertError) {
        throw upsertError;
      }

      setInstallation(data);
      setError(null);
    } catch (err) {
      console.error('Failed to save GitHub installation:', err);
      setError(err instanceof Error ? err.message : 'Failed to save GitHub installation');
    }
  }, [session]);

  // Load installation on mount and when session changes
  useEffect(() => {
    let active = true;

    const initialize = async () => {
      if (!session) {
        if (active) {
          setInstallation(null);
          setIsLoading(false);
        }
        return;
      }

      // If we have a provider token (GitHub OAuth), save it first
      if (session.provider_token && session.user.app_metadata?.provider === 'github') {
        await saveInstallation();
      }

      // Then fetch the installation
      await fetchInstallation();
    };

    initialize();

    return () => {
      active = false;
    };
  }, [session, saveInstallation, fetchInstallation]);

  return {
    installation,
    isLoading,
    error,
    hasGithubAuth: Boolean(installation?.access_token),
    refreshInstallation: fetchInstallation,
  };
};
