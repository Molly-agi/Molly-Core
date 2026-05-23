'use server';

import { getStorageRouter } from '@/lib/storage-router';

/**
 * Persists an agent's specific subroutine finding to the database.
 */
export async function recordAgentFinding(
  userId: string,
  agentType: string,
  finding: string
) {
  const storage = await getStorageRouter();
  const ref = `users/${userId}/aiResponses`;

  await storage.add(ref, {
    responseText: finding,
    responseType: agentType,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Records a synthesized code modification or command to the user's permanent memory.
 */
export async function recordCodeModification(
  userId: string,
  agentId: string,
  code: string,
  suggestion: string
) {
  const storage = await getStorageRouter();
  const ref = `users/${userId}/codeModifications`;

  await storage.add(ref, {
    filePath: 'Termux_Shell_Context',
    originalCode: 'N/A',
    modifiedCode: code,
    modificationSuggestion: suggestion,
    timestamp: new Date().toISOString(),
    agentId: agentId,
  });
}

/**
 * Stages a sensory metadata entry (Stage 3 prep).
 * Storing the "Vibe" and hardware context for experience retrieval.
 */
export async function recordSensoryLog(
  userId: string,
  sensorType: 'vision' | 'voice' | 'vibe',
  description: string,
  metadata: Record<string, unknown>
) {
  const storage = await getStorageRouter();
  const ref = `users/${userId}/sensoryMemory`;

  // Enhanced metadata structure for future vector embeddings
  const logEntry = {
    sensorType,
    description,
    metadata: {
      ...metadata,
      vibeScore: metadata.vibeScore || 0.5,
      isHardened: true,
    },
    timestamp: new Date().toISOString(),
  };

  await storage.add(ref, logEntry);
}
