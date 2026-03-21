/**
 * Firebase Admin Facade — The Dam
 *
 * This is the ONLY file that should ever import firebase-admin.
 * Everything else imports from here. If we're not in a true Node.js
 * server environment, we return stubs that do nothing.
 *
 * This fixes all bundler issues in one place.
 */

// Detect if we're in a real Node.js server environment
const isNodeServer =
  typeof process !== 'undefined' &&
  process.versions?.node &&
  typeof window === 'undefined' &&
  // Not edge runtime
  !process.env.NEXT_RUNTIME?.includes('edge');

// Lazy-loaded admin instance
let adminInstance: typeof import('firebase-admin') | null = null;
let firestoreInstance: FirebaseFirestore.Firestore | null = null;
let configured = false;

/**
 * Get the real firebase-admin module, or null if not available.
 * This is the ONLY place firebase-admin is ever required.
 */
async function getAdmin(): Promise<typeof import('firebase-admin') | null> {
  if (!isNodeServer) return null;
  if (adminInstance) return adminInstance;

  try {
    // Dynamic require to prevent bundler from analyzing
    adminInstance = await import('firebase-admin');
    return adminInstance;
  } catch {
    return null;
  }
}

/**
 * Initialize Firebase Admin if we're on a real server with credentials.
 */
export async function initializeAdmin(): Promise<boolean> {
  if (configured) return true;
  if (!isNodeServer) {
    configured = false;
    return false;
  }

  const admin = await getAdmin();
  if (!admin) return false;

  try {
    const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccount) {
      configured = false;
      return false;
    }

    const parsed = JSON.parse(serviceAccount);

    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(parsed),
      });
    }

    firestoreInstance = admin.firestore();
    configured = true;
    return true;
  } catch {
    configured = false;
    return false;
  }
}

/**
 * Check if admin is configured and available.
 */
export function isAdminConfigured(): boolean {
  return configured && firestoreInstance !== null;
}

/**
 * Get Firestore instance. Returns null if not available.
 */
export function getFirestore(): FirebaseFirestore.Firestore | null {
  if (!configured || !firestoreInstance) return null;
  return firestoreInstance;
}

// ── Stub types for when firebase isn't available ──

export interface StubDocRef {
  set: (data: unknown) => Promise<void>;
  get: () => Promise<{ exists: boolean; data: () => null }>;
  update: (data: unknown) => Promise<void>;
  delete: () => Promise<void>;
}

export interface StubCollection {
  doc: (id: string) => StubDocRef;
  add: (data: unknown) => Promise<{ id: string }>;
  get: () => Promise<{ docs: never[] }>;
}

const stubDoc: StubDocRef = {
  set: async () => {},
  get: async () => ({ exists: false, data: () => null }),
  update: async () => {},
  delete: async () => {},
};

const stubCollection: StubCollection = {
  doc: () => stubDoc,
  add: async () => ({ id: 'stub' }),
  get: async () => ({ docs: [] }),
};

/**
 * Safe Firestore access that returns stubs if not available.
 * Use this for non-critical persistence that can gracefully degrade.
 */
export function getSafeFirestore(): {
  collection: (name: string) => StubCollection;
} {
  if (isAdminConfigured() && firestoreInstance) {
    return firestoreInstance as unknown as {
      collection: (name: string) => StubCollection;
    };
  }
  return {
    collection: () => stubCollection,
  };
}
