'use client';

import {
  addDoc,
  collection,
  getDocs,
  limit as limitQuery,
  orderBy,
  query,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

export type SystemLogEntry = {
  kind: 'client-error' | 'session-event';
  event?: string;
  message?: string;
  stack?: string;
  source?: string;
  line?: number;
  column?: number;
  url?: string;
  userAgent?: string;
  details?: string;
  timestamp: string;
};

function getUserContext() {
  try {
    const { auth, firestore } = initializeFirebase();
    const user = auth.currentUser;
    if (!user) {
      return null;
    }
    return { user, firestore };
  } catch {
    return null;
  }
}

type SystemLogEntryInput = Omit<SystemLogEntry, 'kind' | 'timestamp'> & {
  timestamp?: string;
};

export async function logClientErrorToFirestore(entry: SystemLogEntryInput) {
  const context = getUserContext();
  if (!context) {
    return;
  }

  try {
    await addDoc(
      collection(context.firestore, `users/${context.user.uid}/systemLogs`),
      {
        ...entry,
        kind: 'client-error',
        timestamp: entry.timestamp || new Date().toISOString(),
      }
    );
  } catch {
    // Best-effort logging only.
  }
}

export async function logSessionEventToFirestore(entry: SystemLogEntryInput) {
  const context = getUserContext();
  if (!context) {
    return;
  }

  try {
    await addDoc(
      collection(context.firestore, `users/${context.user.uid}/systemLogs`),
      {
        ...entry,
        kind: 'session-event',
        timestamp: entry.timestamp || new Date().toISOString(),
      }
    );
  } catch {
    // Best-effort logging only.
  }
}

export async function fetchRecentSystemLogs(maxEntries: number = 25) {
  const context = getUserContext();
  if (!context) {
    return [] as SystemLogEntry[];
  }

  try {
    const logsQuery = query(
      collection(context.firestore, `users/${context.user.uid}/systemLogs`),
      orderBy('timestamp', 'desc'),
      limitQuery(maxEntries)
    );
    const snapshot = await getDocs(logsQuery);
    return snapshot.docs.map((doc) => doc.data() as SystemLogEntry);
  } catch {
    return [] as SystemLogEntry[];
  }
}
