/**
 * @fileOverview Server-side memory logging for agent actions.
 */

import { getStorageRouter } from '@/lib/storage-router';

export async function recordSensoryLogServer(
  userId: string,
  sensorType: 'vision' | 'voice' | 'vibe',
  description: string,
  metadata: Record<string, unknown>
) {
  const storage = await getStorageRouter();
  const collectionPath = `users/${userId}/sensoryMemory`;

  const logEntry = {
    sensorType,
    description,
    metadata: {
      ...metadata,
      vibeScore: metadata?.vibeScore || 0.5,
      isHardened: true,
    },
    timestamp: new Date().toISOString(),
  };

  await storage.add(collectionPath, logEntry);
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
  const storage = await getStorageRouter();
  const collectionPath = `users/${userId}/selfImprovementRequests`;

  const doc = await storage.add(collectionPath, {
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
  const storage = await getStorageRouter();
  const collectionPath = `users/${userId}/codeModifications`;

  await storage.add(collectionPath, {
    filePath,
    originalCode: originalCode ?? 'N/A (new file)',
    modifiedCode: modifiedCode.substring(0, 10000), // cap storage
    modificationSuggestion: description,
    agentId,
    timestamp: new Date().toISOString(),
  });
}
