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
  createdAt: unknown;
};

export type SavedRepo = {
  id?: string;
  name: string;
  url: string;
  description: string | null;
  stars: number;
  voiceCommandId?: string;
  createdAt: unknown;
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
    userId: userId,
    prompt,
    command,
    createdAt: serverTimestamp(),
  };

  addDoc(memoryCollectionRef, newMemory).catch(async () => {
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

    if (querySnapshot.empty || !querySnapshot.docs[0]) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    return doc.data().command as string;
  } catch (serverError: unknown) {
    if (
      (serverError as Record<string, unknown>).code === 'failed-precondition'
    ) {
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
    const q = query(
      memoryCollectionRef,
      where('prompt', '==', prompt),
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty || !querySnapshot.docs[0]) {
      return null;
    }
    return querySnapshot.docs[0].data().command as string;
  } catch {
    const permissionError = new FirestorePermissionError({
      path: `users/${userId}/learnedCommands`,
      operation: 'list',
    } satisfies SecurityRuleContext);
    errorEmitter.emit('permission-error', permissionError);
    return null;
  }
}

/**
 * Saves a GitHub repository to the user's profile for future reference.
 */
export function saveGitHubRepoMemory(
  db: Firestore,
  userId: string,
  repo: Omit<SavedRepo, 'id' | 'createdAt'>
) {
  const repoCollectionRef = collection(db, 'users', userId, 'gitHubRepos');
  const data = {
    ...repo,
    createdAt: serverTimestamp(),
  };

  addDoc(repoCollectionRef, data).catch(async () => {
    const permissionError = new FirestorePermissionError({
      path: repoCollectionRef.path,
      operation: 'create',
      requestResourceData: data,
    } satisfies SecurityRuleContext);
    errorEmitter.emit('permission-error', permissionError);
  });
}
