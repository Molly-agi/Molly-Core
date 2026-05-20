'use client';

import { useContext } from 'react';
import { FirebaseContext, type UserHookResult } from '@/firebase/provider';
import type { User } from 'firebase/auth';

// Dev fallback user when auth is unavailable
const DEV_USER: Partial<User> & { uid: string } = {
  uid: 'molly-dev-user',
  isAnonymous: true,
  emailVerified: false,
  metadata: {} as User['metadata'],
  providerData: [],
  refreshToken: '',
  tenantId: null,
  delete: async () => {},
  getIdToken: async () => 'dev-token',
  getIdTokenResult: async () =>
    ({}) as Awaited<ReturnType<User['getIdTokenResult']>>,
  reload: async () => {},
  toJSON: () => ({ uid: 'molly-dev-user' }),
};

/**
 * Hook to get the current user and auth state.
 * Uses the FirebaseProvider context to avoid duplicate listeners.
 * In development mode, returns a fallback dev user if auth fails.
 *
 * @returns {UserHookResult} Object with user, isUserLoading, and userError
 */
export function useUser(): UserHookResult {
  const context = useContext(FirebaseContext);

  if (!context) {
    throw new Error(
      'useUser must be used within a FirebaseProvider. ' +
        'Make sure your app is wrapped with <FirebaseProvider>.'
    );
  }

  // In dev mode, provide fallback user when auth is unavailable
  const isDev = process.env.NODE_ENV === 'development';
  const shouldUseFallback = isDev && !context.user && !context.isUserLoading;

  return {
    user: shouldUseFallback ? (DEV_USER as User) : context.user,
    isUserLoading: context.isUserLoading,
    userError: context.userError,
  };
}
