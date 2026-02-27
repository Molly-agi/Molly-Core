'use client';

import React, { useMemo, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase } from '@/firebase';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

export function FirebaseClientProvider({
  children,
}: FirebaseClientProviderProps) {
  const firebaseServices = useMemo(() => {
    // Trace Firebase initialization
    const trace = (globalThis as Record<string, unknown>).__MOLLY_TRACE as
      | ((...args: unknown[]) => void)
      | undefined;
    if (trace) trace('FIREBASE', 'Starting initialization', 'start');

    const startTime = performance.now();
    const services = initializeFirebase();
    const duration = performance.now() - startTime;

    if (trace)
      trace('FIREBASE', 'Initialization complete', 'complete', {
        duration: duration.toFixed(0) + 'ms',
      });

    return services;
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
