import { renderHook, act, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { useSecureGithubToken } from './useSecureGithubToken';

const createMockSession = (overrides?: Partial<Session>): Session => ({
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  provider_token: 'gho_mock-token',
  provider_refresh_token: 'ghr_mock-refresh',
  user: {
    id: 'user-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'user@example.com',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'github', providers: ['github'] },
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
    factors: [],
  },
  ...overrides,
});

describe('useSecureGithubToken', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('falls back to the provider token when none is stored', async () => {
    const session = createMockSession();
    const { result } = renderHook(() => useSecureGithubToken(session));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.token).toBe('gho_mock-token');
    expect(result.current.hasStoredToken).toBe(false);
    expect(result.current.providerToken).toBe('gho_mock-token');
  });

  it('syncs the provider token into secure storage on request', async () => {
    const session = createMockSession();
    const { result } = renderHook(() => useSecureGithubToken(session));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      const saved = await result.current.syncProviderToken();
      expect(saved).toBe(true);
    });

    await waitFor(() => expect(result.current.hasStoredToken).toBe(true));

    const storageKey = `autodidact-builder:github-token:${session.user.id}`;
    expect(window.localStorage.getItem(storageKey)).toBeTruthy();
  });
});
