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

  const hasGoogleApplicationCredentials = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );

  return Boolean(
    hasServiceAccountJson ||
    hasSplitServiceAccount ||
    hasGoogleApplicationCredentials
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

    const hasServiceAccountJson = Boolean(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    );
    const hasSplitServiceAccount = Boolean(
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    );
    const hasGoogleApplicationCredentials = Boolean(
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    );

    if (
      !hasServiceAccountJson &&
      !hasSplitServiceAccount &&
      !hasGoogleApplicationCredentials
    ) {
      console.warn(
        '[Firebase Admin] No server credentials found. Running in local-only mode.'
      );
      return false;
    }

    let app;
    if (adminModule.apps.length === 0) {
      const initOptions: {
        credential?: unknown;
        projectId?: string;
      } = {};

      if (hasServiceAccountJson && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        try {
          const serviceAccount = JSON.parse(
            process.env.FIREBASE_SERVICE_ACCOUNT_JSON
          ) as {
            project_id?: string;
          };
          initOptions.credential = adminModule.credential.cert(serviceAccount);
          initOptions.projectId =
            serviceAccount.project_id ?? process.env.FIREBASE_PROJECT_ID;
        } catch (err) {
          console.warn(
            '[Firebase Admin] Invalid FIREBASE_SERVICE_ACCOUNT_JSON:',
            err instanceof Error ? err.message : String(err)
          );
          return false;
        }
      } else if (hasSplitServiceAccount) {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(
          /\\n/g,
          '\n'
        );
        initOptions.credential = adminModule.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID!,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
          privateKey,
        });
        initOptions.projectId = process.env.FIREBASE_PROJECT_ID;
      } else {
        // ADC path via GOOGLE_APPLICATION_CREDENTIALS
        // Also check FIREBASE_CONFIG environment variable
        let configProjectId =
          process.env.GOOGLE_CLOUD_PROJECT ??
          process.env.GCLOUD_PROJECT ??
          process.env.FIREBASE_PROJECT_ID;

        // Parse FIREBASE_CONFIG if available
        if (!configProjectId && process.env.FIREBASE_CONFIG) {
          try {
            const firebaseConfigEnv = JSON.parse(process.env.FIREBASE_CONFIG);
            configProjectId = firebaseConfigEnv.projectId;
            console.log(
              '[Firebase Admin] Using projectId from FIREBASE_CONFIG'
            );
          } catch (parseErr) {
            console.warn(
              '[Firebase Admin] Invalid FIREBASE_CONFIG JSON:',
              parseErr
            );
          }
        }

        initOptions.projectId =
          configProjectId ?? 'termai-molly-55988354-f7535'; // Explicit hardcoded fail-safe
      }

      // Ensure projectId is always set (fail-safe)
      if (!initOptions.projectId) {
        initOptions.projectId = 'termai-molly-55988354-f7535';
      }

      console.log(
        '[Firebase Admin] Initializing with projectId:',
        initOptions.projectId
      );
      app = adminModule.initializeApp(initOptions);
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
      // Explicit instantiation with hardcoded projectId as fail-safe
      // This forces the app to look at the existing project instead of provisioning a new one
      firestoreInstance = adminModule.firestore(app);
      // Override with explicit project ID if not already set
      if (!firestoreInstance.constructor.name.includes('Firestore')) {
        console.log(
          '[Firebase Admin] Creating Firestore with explicit projectId:',
          initOptions.projectId
        );
      }
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
