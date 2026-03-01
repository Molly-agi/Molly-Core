/**
 * @fileOverview Server-side memory logging for agent actions.
 */

import { getAdminFirestore } from '@/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function recordSensoryLogServer(
  userId: string,
  sensorType: 'vision' | 'voice' | 'vibe',
  description: string,
  metadata: Record<string, unknown>
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
/**
 * Server-side: Log a self-improvement event (code integration, capability gain, etc.)
 */
export async function logSelfImprovementServer(
  userId: string,
  request: {
    category: string;
    description: string;
    reasoning: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: 'requested' | 'in-progress' | 'completed' | 'deferred';
  }
): Promise<string> {
  const firestore = getAdminFirestore();
  const ref = firestore
    .collection('users')
    .doc(userId)
    .collection('selfImprovementRequests');

  const doc = await ref.add({
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
 * Server-side: Record a code modification for audit trail
 */
export async function recordCodeModificationServer(
  userId: string,
  agentId: string,
  filePath: string,
  originalCode: string | null,
  modifiedCode: string,
  description: string
): Promise<void> {
  const firestore = getAdminFirestore();
  const ref = firestore
    .collection('users')
    .doc(userId)
    .collection('codeModifications');

  await ref.add({
    filePath,
    originalCode: originalCode ?? 'N/A (new file)',
    modifiedCode: modifiedCode.substring(0, 10000), // cap storage
    modificationSuggestion: description,
    agentId,
    timestamp: Timestamp.now(),
  });
}
