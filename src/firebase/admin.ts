/**
 * @fileOverview Firebase Admin — The Dam
 *
 * This module guards ALL access to firebase-admin. It NEVER imports
 * firebase-admin at the top level. Instead, it:
 *
 * 1. Detects if we're in a true Node.js server environment
 * 2. Only dynamically imports firebase-admin in that case
 * 3. Returns safe stubs/mocks for client/edge environments
 *
 * This one file prevents all firebase-admin bundler issues.
 */

// const MOLLY_DATABASE_ID = 'mollydb';

// ── Environment Detection ───────────────────────────────────────

const isNodeServer = (() => {
  // Must have process.versions.node (true Node.js runtime)
  if (typeof process === 'undefined') return false;
  if (!process.versions?.node) return false;
  // Must not be browser
  if (typeof window !== 'undefined') return false;
  // Must not be edge runtime
  if (process.env.NEXT_RUNTIME === 'edge') return false;
  return true;
})();

// ── State ───────────────────────────────────────────────────────

let adminModule: typeof import('firebase-admin') | null = null;
let firestoreInstance: FirebaseFirestore.Firestore | null = null;
let initialized = false;
let initAttempted = false;

// ── Configuration Check ─────────────────────────────────────────

export function isAdminConfigured(): boolean {
  if (!isNodeServer) return false;

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

// ── Private Helpers ─────────────────────────────────────────────

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, '\n');
}

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function getServiceAccountFromJson(): ServiceAccount | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) return null;

  try {
    return JSON.parse(json);
  } catch {
    console.warn(
      '[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON'
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

function getServiceAccount(): ServiceAccount | null {
  return getServiceAccountFromJson() ?? getServiceAccountFromSplitEnv();
}

// ── Lazy Initialization ─────────────────────────────────────────

async function ensureInitialized(): Promise<boolean> {
  if (initialized) return true;
  if (initAttempted) return false;
  if (!isNodeServer) {
    initAttempted = true;
    return false;
  }

  initAttempted = true;

  try {
    // Build the module name at runtime to prevent bundler analysis
    const moduleName = ['firebase', 'admin'].join('-');
    // Dynamic require that bundler cannot statically analyze
    adminModule = await (Function(
      'm',
      'return import(m)'
    )(moduleName) as Promise<typeof import('firebase-admin')>);

    if (adminModule.apps.length === 0) {
      const serviceAccount = getServiceAccount();

      if (serviceAccount) {
        const app = adminModule.initializeApp({
          credential: adminModule.credential.cert(serviceAccount),
        });
        firestoreInstance = adminModule.firestore(app);
        firestoreInstance.settings({ preferRest: true });
      } else {
        const app = adminModule.initializeApp({
          credential: adminModule.credential.applicationDefault(),
        });
        firestoreInstance = adminModule.firestore(app);
        firestoreInstance.settings({ preferRest: true });
      }
    } else {
      firestoreInstance = adminModule.firestore();
    }

    initialized = true;
    return true;
  } catch (error) {
    console.warn('[Firebase Admin] Initialization failed:', error);
    return false;
  }
}

// ── Synchronous API (returns stubs if not initialized) ──────────

/**
 * Synchronously init Firebase Admin.
 * Returns Firestore instance or throws if not on Node.js server.
 * Use getAdminFirestoreAsync() for safer access.
 */
export function initializeFirebaseAdmin(): FirebaseFirestore.Firestore {
  if (!isNodeServer) {
    throw new Error('Firebase Admin is only available on Node.js server');
  }
  if (firestoreInstance) {
    return firestoreInstance;
  }
  // Trigger async init but can't wait for it in sync context
  ensureInitialized();
  if (firestoreInstance) {
    return firestoreInstance;
  }
  throw new Error('Firebase Admin not yet initialized. Use async API.');
}

/**
 * Synchronous getter — returns instance if available, throws otherwise.
 * Prefer getAdminFirestoreAsync() for new code.
 */
export function getAdminFirestore(): FirebaseFirestore.Firestore {
  if (!isNodeServer) {
    throw new Error('Firebase Admin is only available on Node.js server');
  }
  if (!firestoreInstance) {
    return initializeFirebaseAdmin();
  }
  return firestoreInstance;
}

// ── Async API (recommended) ─────────────────────────────────────

/**
 * Async initialization — use this for safe access.
 * Returns Firestore instance or null if not available.
 */
export async function getAdminFirestoreAsync(): Promise<FirebaseFirestore.Firestore | null> {
  if (!isNodeServer) return null;
  const success = await ensureInitialized();
  return success ? firestoreInstance : null;
}

// ── Recovery Key Export ─────────────────────────────────────────

export const RECOVERY_KEY = 'molly-sovereign-recovery';
export const SOVEREIGN_RECOVERY_KEY = RECOVERY_KEY;
export const verifyHeartGate = isAdminConfigured;
