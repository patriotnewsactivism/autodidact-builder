import { AuthApiError, AuthError } from '@supabase/supabase-js';

const UNINITIALISED_VARIABLE_PATTERN = /uninitialized variable/i;

const MISCONFIGURED_MESSAGE =
  'Authentication service is misconfigured. Please try again later or contact support.';

export const normaliseAuthError = (error: unknown): string => {
  if (error instanceof AuthApiError || error instanceof AuthError) {
    if (UNINITIALISED_VARIABLE_PATTERN.test(error.message)) {
      return MISCONFIGURED_MESSAGE;
    }
    return error.message;
  }

  if (error instanceof Error) {
    if (UNINITIALISED_VARIABLE_PATTERN.test(error.message)) {
      return MISCONFIGURED_MESSAGE;
    }
    return error.message;
  }

  return 'Unexpected authentication error';
};

export const isAuthMisconfiguredError = (error: unknown): boolean => {
  if (error instanceof AuthApiError || error instanceof AuthError || error instanceof Error) {
    return UNINITIALISED_VARIABLE_PATTERN.test(error.message);
  }

  if (typeof error === 'string') {
    return UNINITIALISED_VARIABLE_PATTERN.test(error);
  }

  return false;
};

export const MISCONFIGURED_AUTH_MESSAGE = MISCONFIGURED_MESSAGE;

export type AuthErrorState = {
  message: string;
  misconfigured: boolean;
};

export const createAuthErrorState = (error: unknown): AuthErrorState => ({
  message: normaliseAuthError(error),
  misconfigured: isAuthMisconfiguredError(error),
});
