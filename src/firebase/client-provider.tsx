'use client';

import React, { useMemo, useEffect, useRef, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase } from '@/firebase';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

export function FirebaseClientProvider({
  children,
}: FirebaseClientProviderProps) {
  const firebaseServices = useMemo(() => {
    return initializeFirebase();
  }, []);

  // Trace initialization after mount (not during render)
  const tracedRef = useRef(false);
  useEffect(() => {
    if (tracedRef.current) return;
    tracedRef.current = true;

    const trace = (globalThis as Record<string, unknown>).__MOLLY_TRACE as
      | ((...args: unknown[]) => void)
      | undefined;
    if (trace) {
      trace('FIREBASE', 'Initialization complete', 'complete');
    }
  }, []);

  return (
    <FirebaseProvider
      firebaseApp={firebaseServices.firebaseApp}
      auth={firebaseServices.auth}
      firestore={firebaseServices.firestore}
    >
      {children}
    </FirebaseProvider>
  );
}
