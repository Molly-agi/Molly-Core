'use client';

import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  limit,
  serverTimestamp,
  type Firestore,
  orderBy,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import type { SecurityRuleContext } from '@/firebase/errors';

export type LearnedCommand = {
  id?: string;
  prompt: string;
  command: string;
  createdAt: Date;
};

/**
 * Saves a successfully generated command to the user's personal memory in Firestore.
 */
export function saveLearnedCommand(
  db: Firestore,
  userId: string,
  prompt: string,
  command: string
) {
  const memoryCollectionRef = collection(
    db,
    'users',
    userId,
    'learnedCommands'
  );
  const newMemory = {
    prompt,
    command,
    createdAt: serverTimestamp(),
  };

  addDoc(memoryCollectionRef, newMemory).catch(async (serverError) => {
    const permissionError = new FirestorePermissionError({
      path: memoryCollectionRef.path,
      operation: 'create',
      requestResourceData: newMemory,
    } satisfies SecurityRuleContext);
    errorEmitter.emit('permission-error', permissionError);
  });
}

/**
 * Retrieves a learned command from the user's memory based on an exact prompt match.
 * @returns The command string if found, otherwise null.
 */
export async function getLearnedCommand(
  db: Firestore,
  userId: string,
  prompt: string
): Promise<string | null> {
  try {
    const memoryCollectionRef = collection(
      db,
      'users',
      userId,
      'learnedCommands'
    );
    const q = query(
      memoryCollectionRef,
      where('prompt', '==', prompt),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    return doc.data().command as string;
  } catch (serverError: any) {
    // Check if the error is due to a missing index
    if (serverError.code === 'failed-precondition') {
      console.warn(
        'Firestore index not found. Please create a composite index for the `learnedCommands` collection on `prompt` and `createdAt`.'
      );
      // You can try a query without the ordering as a fallback, though less ideal
      return getLearnedCommandWithoutOrder(db, userId, prompt);
    }
    const permissionError = new FirestorePermissionError({
      path: `users/${userId}/learnedCommands`,
      operation: 'list',
    } satisfies SecurityRuleContext);
    errorEmitter.emit('permission-error', permissionError);
    return null;
  }
}

// Fallback function without ordering to avoid index-related crashes on first query
async function getLearnedCommandWithoutOrder(
  db: Firestore,
  userId: string,
  prompt: string
): Promise<string | null> {
  try {
    const memoryCollectionRef = collection(
      db,
      'users',
      userId,
      'learnedCommands'
    );
    const q = query(memoryCollectionRef, where('prompt', '==', prompt), limit(1));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }
    return querySnapshot.docs[0].data().command as string;
  } catch (e) {
     const permissionError = new FirestorePermissionError({
      path: `users/${userId}/learnedCommands`,
      operation: 'list',
    } satisfies SecurityRuleContext);
    errorEmitter.emit('permission-error', permissionError);
    return null;
  }
}
