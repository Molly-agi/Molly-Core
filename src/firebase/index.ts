'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export function initializeFirebase() {
  if (!getApps().length) {
    // DO NOT rely on auto-detection after v4.0 upgrade
    // Explicitly set projectId to ensure correct project connection
    let firebaseApp;
    try {
      // Attempt to initialize via Firebase App Hosting environment variables
      firebaseApp = initializeApp();
    } catch (e) {
      // Fallback to explicit config with projectId specified
      if (process.env.NODE_ENV === 'production') {
        console.warn(
          'Automatic initialization failed. Falling back to firebase config with explicit projectId.',
          e
        );
      }

      // Check for FIREBASE_CONFIG environment variable first
      let configToUse = firebaseConfig;
      if (process.env.FIREBASE_CONFIG) {
        try {
          const envConfig = JSON.parse(process.env.FIREBASE_CONFIG);
          configToUse = { ...firebaseConfig, ...envConfig };
          console.log('[Firebase] Using FIREBASE_CONFIG from environment');
        } catch (parseErr) {
          console.warn('[Firebase] Invalid FIREBASE_CONFIG JSON:', parseErr);
        }
      }

      // Ensure projectId is explicitly set
      const configWithProjectId = {
        ...configToUse,
        projectId: configToUse.projectId || 'termai-molly-55988354-f7535',
      };
      firebaseApp = initializeApp(configWithProjectId);
    }

    return getSdks(firebaseApp);
  }

  // If already initialized, return the SDKs with the already initialized App
  return getSdks(getApp());
}

export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp),
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
