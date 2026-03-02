'use client';

import React, {
  DependencyList,
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useState,
  useEffect,
  useRef,
} from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore } from 'firebase/firestore';
import {
  Auth,
  User,
  onAuthStateChanged,
  onIdTokenChanged,
  signInAnonymously,
} from 'firebase/auth';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

interface FirebaseProviderProps {
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
}

// Internal state for user authentication
interface UserAuthState {
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// Combined state for the Firebase context
export interface FirebaseContextState {
  areServicesAvailable: boolean; // True if core services (app, firestore, auth instance) are provided
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null; // The Auth service instance
  // User authentication state
  user: User | null;
  isUserLoading: boolean; // True during initial auth check
  userError: Error | null; // Error from auth listener
}

// Return type for useFirebase()
export interface FirebaseServicesAndUser {
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// Return type for useUser() - specific to user auth state
export interface UserHookResult {
  // Renamed from UserAuthHookResult for consistency if desired, or keep as UserAuthHookResult
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// React Context
export const FirebaseContext = createContext<FirebaseContextState | undefined>(
  undefined
);

/**
 * FirebaseProvider manages and provides Firebase services and user authentication state.
 */
export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
  children,
  firebaseApp,
  firestore,
  auth,
}) => {
  const [userAuthState, setUserAuthState] = useState<UserAuthState>({
    user: null,
    isUserLoading: true, // Start loading until first auth event
    userError: null,
  });

  // Effect to subscribe to Firebase auth state changes
  useEffect(() => {
    if (!auth) {
      // If no Auth service instance, cannot determine user state
      setUserAuthState({
        user: null,
        isUserLoading: false,
        userError: new Error('Auth service not provided.'),
      });
      return;
    }

    setUserAuthState({ user: null, isUserLoading: true, userError: null }); // Reset on auth instance change

    let authCheckComplete = false;

    // Add timeout for auth check (prevent infinite loading)
    const timeoutId: NodeJS.Timeout = setTimeout(() => {
      if (!authCheckComplete) {
        console.warn(
          '[FirebaseProvider] Auth state check timeout - proceeding anyway'
        );
        setUserAuthState({ user: null, isUserLoading: false, userError: null });
      }
    }, 10000); // 10 second timeout

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        // Auth state determined
        authCheckComplete = true;
        clearTimeout(timeoutId);
        console.log('[FirebaseProvider] Auth state resolved:', !!firebaseUser);
        setUserAuthState({
          user: firebaseUser,
          isUserLoading: false,
          userError: null,
        });
      },
      (error) => {
        // Auth listener error
        authCheckComplete = true;
        clearTimeout(timeoutId);
        console.error('[FirebaseProvider] onAuthStateChanged error:', error);
        setUserAuthState({
          user: null,
          isUserLoading: false,
          userError: error,
        });
      }
    );

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    }; // Cleanup
  }, [auth]); // Depends on the auth instance

  // Auto sign-in effect: if user is not authenticated after timeout, try anonymous sign-in
  const autoSignInAttempted = useRef(false);

  // Reset autoSignInAttempted when user becomes null (allows re-auth on token expiry)
  useEffect(() => {
    if (!userAuthState.user && !userAuthState.isUserLoading) {
      autoSignInAttempted.current = false;
    }
  }, [userAuthState.user, userAuthState.isUserLoading]);

  useEffect(() => {
    if (!auth) return;
    if (autoSignInAttempted.current) return;
    if (userAuthState.user) return; // Already authenticated
    if (userAuthState.isUserLoading) return; // Still checking auth state

    // Auth check completed with no user - attempt anonymous sign-in
    autoSignInAttempted.current = true;

    const performAutoSignIn = async () => {
      try {
        console.log(
          '[FirebaseProvider] Attempting automatic anonymous sign-in'
        );
        const trace = (globalThis as Record<string, unknown>).__MOLLY_TRACE as
          | ((...args: unknown[]) => void)
          | undefined;
        if (trace) trace('AUTH', 'Auto sign-in attempt', 'start');

        const result = await signInAnonymously(auth);

        if (trace)
          trace('AUTH', 'Auto sign-in successful', 'complete', {
            uid: result.user.uid,
          });
        console.log(
          '[FirebaseProvider] Auto sign-in successful:',
          result.user.uid
        );
      } catch (error) {
        console.error('[FirebaseProvider] Auto sign-in failed:', error);
        const trace = (globalThis as Record<string, unknown>).__MOLLY_TRACE as
          | ((...args: unknown[]) => void)
          | undefined;
        if (trace)
          trace('AUTH', 'Auto sign-in failed', 'error', {
            error: String(error),
          });
      }
    };

    performAutoSignIn();
  }, [auth, userAuthState.user, userAuthState.isUserLoading]);

  // Token resilience: monitor ID token changes and auto-recover on token loss
  useEffect(() => {
    if (!auth) return;

    const unsubscribeToken = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        // Token expired or was revoked — attempt re-authentication
        console.warn(
          '[FirebaseProvider] ID token lost — attempting auto-recovery'
        );
        const trace = (globalThis as Record<string, unknown>).__MOLLY_TRACE as
          | ((...args: unknown[]) => void)
          | undefined;
        if (trace) trace('AUTH', 'Token lost — auto-recovery', 'start');

        try {
          const result = await signInAnonymously(auth);
          console.log(
            '[FirebaseProvider] Token recovery successful:',
            result.user.uid
          );
          if (trace)
            trace('AUTH', 'Token recovery successful', 'complete', {
              uid: result.user.uid,
            });
        } catch (error) {
          console.error('[FirebaseProvider] Token recovery failed:', error);
          if (trace)
            trace('AUTH', 'Token recovery failed', 'error', {
              error: String(error),
            });
        }
      }
    });

    return () => unsubscribeToken();
  }, [auth]);

  // Memoize the context value
  const contextValue = useMemo((): FirebaseContextState => {
    const servicesAvailable = !!(firebaseApp && firestore && auth);
    return {
      areServicesAvailable: servicesAvailable,
      firebaseApp: servicesAvailable ? firebaseApp : null,
      firestore: servicesAvailable ? firestore : null,
      auth: servicesAvailable ? auth : null,
      user: userAuthState.user,
      isUserLoading: userAuthState.isUserLoading,
      userError: userAuthState.userError,
    };
  }, [firebaseApp, firestore, auth, userAuthState]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

/**
 * Hook to access core Firebase services and user authentication state.
 * Throws error if core services are not available or used outside provider.
 */
export const useFirebase = (): FirebaseServicesAndUser => {
  const context = useContext(FirebaseContext);

  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider.');
  }

  if (
    !context.areServicesAvailable ||
    !context.firebaseApp ||
    !context.firestore ||
    !context.auth
  ) {
    throw new Error(
      'Firebase core services not available. Check FirebaseProvider props.'
    );
  }

  return {
    firebaseApp: context.firebaseApp,
    firestore: context.firestore,
    auth: context.auth,
    user: context.user,
    isUserLoading: context.isUserLoading,
    userError: context.userError,
  };
};

/** Hook to access Firebase Auth instance. */
export const useAuth = (): Auth => {
  const { auth } = useFirebase();
  return auth;
};

/** Hook to access Firestore instance. */
export const useFirestore = (): Firestore => {
  const { firestore } = useFirebase();
  return firestore;
};

/** Hook to access Firebase App instance. */
export const useFirebaseApp = (): FirebaseApp => {
  const { firebaseApp } = useFirebase();
  return firebaseApp;
};

type MemoFirebase<T> = T & { __memo?: boolean };

export function useMemoFirebase<T>(
  factory: () => T,
  deps: DependencyList
): T | MemoFirebase<T> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoized = useMemo(factory, deps);

  if (typeof memoized !== 'object' || memoized === null) return memoized;
  (memoized as MemoFirebase<T>).__memo = true;

  return memoized;
}

/**
 * Hook specifically for accessing the authenticated user's state.
 * This provides the User object, loading status, and any auth errors.
 * @returns {UserHookResult} Object with user, isUserLoading, userError.
 */
export const useUser = (): UserHookResult => {
  // Renamed from useAuthUser
  const { user, isUserLoading, userError } = useFirebase(); // Leverages the main hook
  return { user, isUserLoading, userError };
};
