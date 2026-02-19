/**
 * @fileOverview Firebase Admin initialization for server-side access.
 */

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import type { ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let adminInitialized = false;

export function isAdminConfigured() {
  const hasServiceAccountJson = Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  );
  const hasSplitServiceAccount = Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );

  return Boolean(
    hasServiceAccountJson ||
      hasSplitServiceAccount ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.FIREBASE_PROJECT_ID
  );
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, '\n');
}

function getServiceAccountFromJson(): ServiceAccount | null {
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

function getServiceAccountFromSplitEnv(): ServiceAccount | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
  };
}

function getServiceAccount() {
  return getServiceAccountFromJson() ?? getServiceAccountFromSplitEnv();
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
