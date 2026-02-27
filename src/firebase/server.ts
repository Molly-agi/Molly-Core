/**
 * @fileOverview Server-side Firebase initialization
 *
 * This module handles Firebase initialization for server-side contexts (API routes, etc.)
 * It's NOT marked as 'use client', so it can be imported and used from server code.
 */

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Cache for server-side initialization
let _serverInitialized = false;

export function initializeFirebaseServer() {
  if (_serverInitialized || getApps().length > 0) {
    return getSdksServer(getApp());
  }

  try {
    // Attempt to initialize via Firebase App Hosting environment variables
    const firebaseApp = initializeApp();
    _serverInitialized = true;
    return getSdksServer(firebaseApp);
  } catch {
    // Fallback to firebase config
    try {
      const firebaseApp = initializeApp(firebaseConfig);
      _serverInitialized = true;
      return getSdksServer(firebaseApp);
    } catch (err) {
      console.error('[Firebase] Server initialization failed:', err);
      throw new Error(
        `Firebase initialization failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

export function getSdksServer(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp),
  };
}
