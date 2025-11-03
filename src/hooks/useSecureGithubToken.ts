import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

const STORAGE_PREFIX = 'autodidact-builder:github-token';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const detectStorageAvailability = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const testKey = `${STORAGE_PREFIX}:__availability_test__`;
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch (error) {
    console.warn('Secure storage is unavailable', error);
    return false;
  }
};

const bufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToArrayBuffer = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
};

const deriveKey = async (secret: string) => {
  const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['encrypt', 'decrypt']);
};

const encryptValue = async (value: string, secret: string) => {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value));
  return `${bufferToBase64(iv.buffer)}.${bufferToBase64(cipherBuffer)}`;
};

const decryptValue = async (payload: string, secret: string) => {
  const [ivPart, cipherPart] = payload.split('.');
  if (!ivPart || !cipherPart) {
    throw new Error('Invalid payload format');
  }
  const key = await deriveKey(secret);
  const iv = new Uint8Array(base64ToArrayBuffer(ivPart));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    base64ToArrayBuffer(cipherPart)
  );
  return decoder.decode(decrypted);
};

interface SecureTokenState {
  token: string;
  setToken: React.Dispatch<React.SetStateAction<string>>;
  hasStoredToken: boolean;
  isLoading: boolean;
  isSaving: boolean;
  lastUpdated: Date | null;
  error: string | null;
  persistToken: (value?: string) => Promise<boolean>;
  clearToken: () => void;
  storageAvailable: boolean;
}

export const useSecureGithubToken = (session: Session | null): SecureTokenState => {
  const [token, setToken] = useState('');
  const [hasStoredToken, setHasStoredToken] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const storageKey = useMemo(() => {
    if (!session?.user?.id) return null;
    return `${STORAGE_PREFIX}:${session.user.id}`;
  }, [session?.user?.id]);

  const storageAvailable = useMemo(detectStorageAvailability, []);

  useEffect(() => {
    if (!storageAvailable) {
      setIsLoading(false);
      setToken('');
      setHasStoredToken(false);
      setLastUpdated(null);
      setError('Secure storage is not available in this environment.');
      return;
    }
    if (!storageKey) {
      setIsLoading(false);
      setToken('');
      setHasStoredToken(false);
      setLastUpdated(null);
      return;
    }

    let active = true;
    const loadToken = async () => {
      setIsLoading(true);
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (!stored) {
          if (active) {
            setToken('');
            setHasStoredToken(false);
            setLastUpdated(null);
            setError(null);
          }
          return;
        }

        const record = JSON.parse(stored) as { payload: string; updatedAt?: string };
        if (!session?.access_token) {
          if (active) {
            setHasStoredToken(true);
            setError('Sign in again to unlock your stored GitHub token.');
          }
          return;
        }

        const decrypted = await decryptValue(record.payload, session.access_token);
        if (active) {
          setToken(decrypted);
          setHasStoredToken(true);
          setLastUpdated(record.updatedAt ? new Date(record.updatedAt) : new Date());
          setError(null);
        }
      } catch (loadError) {
        console.error('Failed to load secure GitHub token', loadError);
        if (active) {
          setToken('');
          setHasStoredToken(false);
          setLastUpdated(null);
          setError('Failed to load stored token. Please re-save it.');
          if (storageKey) {
            window.localStorage.removeItem(storageKey);
          }
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadToken();

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== storageKey) return;
      void loadToken();
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      active = false;
      window.removeEventListener('storage', handleStorage);
    };
  }, [session?.access_token, storageAvailable, storageKey]);

  const persistToken = useCallback(
    async (value?: string) => {
      if (!storageAvailable) {
        setError('Secure storage is not available in this environment.');
        return false;
      }
      if (!storageKey) {
        setError('Sign in to store a GitHub token securely.');
        return false;
      }
      const tokenToStore = (value ?? token).trim();
      if (!tokenToStore) {
        setError('Enter a personal access token before saving.');
        return false;
      }
      if (!session?.access_token) {
        setError('Unable to encrypt token without an active Supabase session.');
        return false;
      }

      setIsSaving(true);
      try {
        const payload = await encryptValue(tokenToStore, session.access_token);
        const record = {
          payload,
          updatedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(storageKey, JSON.stringify(record));
        setToken(tokenToStore);
        setHasStoredToken(true);
        setLastUpdated(new Date(record.updatedAt));
        setError(null);
        return true;
      } catch (persistError) {
        console.error('Failed to persist secure GitHub token', persistError);
        setError('Unable to store token securely. Please try again.');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [session?.access_token, storageAvailable, storageKey, token]
  );

  const clearToken = useCallback(() => {
    if (!storageAvailable) return;
    if (storageKey) {
      window.localStorage.removeItem(storageKey);
    }
    setHasStoredToken(false);
    setToken('');
    setLastUpdated(null);
    setError(null);
  }, [storageAvailable, storageKey]);

  return {
    token,
    setToken,
    hasStoredToken,
    isLoading,
    isSaving,
    lastUpdated,
    error,
    persistToken,
    clearToken,
    storageAvailable,
  };
};
