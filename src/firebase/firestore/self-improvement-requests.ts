'use client';

import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

export interface SelfImprovementRequest {
  id?: string;
  userId: string;
  category: string;
  description: string;
  reasoning: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'requested' | 'in-progress' | 'completed' | 'deferred';
  submittedAt: string;
  completedAt?: string;
}

/**
 * Log Molly's self-improvement requests
 * These are capabilities she believes would help her serve better
 */
export async function logSelfImprovementRequest(
  userId: string,
  request: Omit<SelfImprovementRequest, 'id' | 'userId' | 'submittedAt'>
): Promise<string> {
  const { firestore } = initializeFirebase();
  const ref = collection(firestore, 'users', userId, 'selfImprovementRequests');

  const doc = await addDoc(ref, {
    userId,
    category: request.category,
    description: request.description,
    reasoning: request.reasoning,
    priority: request.priority,
    status: request.status,
    submittedAt: new Date().toISOString(),
  });

  return doc.id;
}

/**
 * Get Molly's pending improvement requests
 */
export async function getPendingImprovements(
  userId: string,
  limitCount: number = 20
): Promise<SelfImprovementRequest[]> {
  const { firestore } = initializeFirebase();
  const ref = collection(firestore, 'users', userId, 'selfImprovementRequests');

  const q = query(ref, orderBy('submittedAt', 'desc'), limit(limitCount));

  const snapshot = await getDocs(q);
  const requests: SelfImprovementRequest[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    requests.push({
      id: doc.id,
      userId: data.userId,
      category: data.category,
      description: data.description,
      reasoning: data.reasoning,
      priority: data.priority,
      status: data.status,
      submittedAt: data.submittedAt,
      completedAt: data.completedAt,
    });
  });

  return requests;
}

/**
 * Mark an improvement request as completed
 */
export async function markImprovementCompleted(
  userId: string,
  requestId: string
): Promise<void> {
  const { firestore } = initializeFirebase();
  const docRef = doc(
    firestore,
    'users',
    userId,
    'selfImprovementRequests',
    requestId
  );

  await updateDoc(docRef, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  });
}
