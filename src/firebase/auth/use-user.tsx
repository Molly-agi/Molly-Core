'use client';

import { useContext } from 'react';
import { FirebaseContext, type UserHookResult } from '@/firebase/provider';

/**
 * Hook to get the current user and auth state.
 * Uses the FirebaseProvider context to avoid duplicate listeners.
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

  return {
    user: context.user,
    isUserLoading: context.isUserLoading,
    userError: context.userError,
  };
}
