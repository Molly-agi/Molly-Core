/**
 * @fileOverview Firebase Admin initialization for server-side access.
 */

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let adminInitialized = false;

function getServiceAccount() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) return null;

  try {
    return JSON.parse(json);
  } catch (error) {
    console.warn(
      '[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:',
      error
    );
    return null;
  }
}

export function initializeFirebaseAdmin() {
  if (adminInitialized || getApps().length > 0) {
    return getFirestore();
  }

  const serviceAccount = getServiceAccount();
  if (serviceAccount) {
    initializeApp({ credential: cert(serviceAccount) });
  } else {
    initializeApp({ credential: applicationDefault() });
  }

  adminInitialized = true;
  return getFirestore();
}

export function getAdminFirestore() {
  return initializeFirebaseAdmin();
}
