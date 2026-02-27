'use client';

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

/**
 * Persists an agent's specific subroutine finding to the database.
 */
export async function recordAgentFinding(
  userId: string,
  agentType: string,
  finding: string
) {
  const { firestore } = initializeFirebase();
  const ref = collection(firestore, 'users', userId, 'aiResponses');

  await addDoc(ref, {
    responseText: finding,
    responseType: agentType,
    timestamp: serverTimestamp(),
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
  const { firestore } = initializeFirebase();
  const ref = collection(firestore, 'users', userId, 'codeModifications');

  await addDoc(ref, {
    filePath: 'Termux_Shell_Context',
    originalCode: 'N/A',
    modifiedCode: code,
    modificationSuggestion: suggestion,
    timestamp: serverTimestamp(),
    agentId: agentId, // Added for iteration lineage
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
  const { firestore } = initializeFirebase();
  const ref = collection(firestore, 'users', userId, 'sensoryMemory');

  // Enhanced metadata structure for future vector embeddings
  const logEntry = {
    sensorType,
    description,
    metadata: {
      ...metadata,
      vibeScore: metadata.vibeScore || 0.5,
      isHardened: true,
    },
    timestamp: serverTimestamp(),
  };

  await addDoc(ref, logEntry);
}
