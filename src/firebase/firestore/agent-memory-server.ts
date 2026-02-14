/**
 * @fileOverview Server-side memory logging for agent actions.
 */

import { getAdminFirestore } from '@/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function recordSensoryLogServer(
  userId: string,
  sensorType: 'vision' | 'voice' | 'vibe',
  description: string,
  metadata: any
) {
  const firestore = getAdminFirestore();
  const ref = firestore
    .collection('users')
    .doc(userId)
    .collection('sensoryMemory');

  const logEntry = {
    sensorType,
    description,
    metadata: {
      ...metadata,
      vibeScore: metadata?.vibeScore || 0.5,
      isHardened: true,
    },
    timestamp: Timestamp.now(),
  };

  await ref.add(logEntry);
}
