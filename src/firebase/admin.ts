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
 *
 * DATABASE: Uses the default Firestore database. Named databases require
 * firebase-admin v11+. To use a named database, upgrade and pass the
 * database ID to getFirestore(app, databaseId).
 */

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
    const imported = await (Function(
      'm',
      'return import(m)'
    )(moduleName) as Promise<
      typeof import('firebase-admin') & {
        default?: typeof import('firebase-admin');
      }
    >);
    // Handle ESM default export
    adminModule = imported.default ?? imported;

    let app;
    if (adminModule.apps.length === 0) {
      // Always use only the projectId, never a service account, for default service account usage
      app = adminModule.initializeApp({
        projectId: 'termai-molly-55988354-f7535',
      });
    } else {
      app = adminModule.app();
    }

    // Use named database if configured (firebase-admin v11+ required).
    // Molly's data lives in 'mollydb', not '(default)'.
    const databaseId = process.env.FIREBASE_DATABASE_ID;
    if (databaseId) {
      const firestoreSubmodule = await (Function(
        'm',
        'return import(m)'
      )('firebase-admin/firestore') as Promise<{
        getFirestore: (
          app: unknown,
          dbId: string
        ) => FirebaseFirestore.Firestore;
      }>);
      firestoreInstance = firestoreSubmodule.getFirestore(app, databaseId);
    } else {
      firestoreInstance = adminModule.firestore(app);
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
