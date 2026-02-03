'use client';

import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  doc, 
  getFirestore 
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

/**
 * Persists an agent's specific subroutine finding to the database.
 */
export async function recordAgentFinding(userId: string, agentType: string, finding: string) {
  const { firestore } = initializeFirebase();
  const ref = collection(firestore, 'users', userId, 'aiResponses');
  
  await addDoc(ref, {
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
  const { firestore } = initializeFirebase();
  const ref = collection(firestore, 'users', userId, 'codeModifications');
  
  await addDoc(ref, {
    filePath: 'Termux_Shell_Context',
    originalCode: 'N/A',
    modifiedCode: code,
    modificationSuggestion: suggestion,
    timestamp: new Date().toISOString(),
  });
}
