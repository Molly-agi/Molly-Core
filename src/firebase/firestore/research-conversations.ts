'use client';

import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  Timestamp,
  deleteDoc,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

export interface ResearchMessage {
  role: 'user' | 'bot';
  content: string;
  timestamp: string;
  toolsUsed?: string[];
  savedTool?: boolean;
}

/**
 * Save a message to the research conversation history
 */
export async function saveResearchMessage(
  userId: string,
  message: ResearchMessage
): Promise<string> {
  try {
    const { firestore } = initializeFirebase();
    const ref = collection(firestore, 'users', userId, 'researchConversations');

    const doc = await addDoc(ref, {
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      toolsUsed: message.toolsUsed || [],
      savedTool: message.savedTool || false,
    });

    return doc.id;
  } catch (error) {
    console.error('Error saving research message:', error);
    // Return empty string instead of throwing
    return '';
  }
}

/**
 * Load recent research conversation history
 */
export async function loadResearchHistory(
  userId: string,
  messageLimit: number = 50
): Promise<ResearchMessage[]> {
  try {
    const { firestore } = initializeFirebase();
    const ref = collection(firestore, 'users', userId, 'researchConversations');

    const q = query(ref, orderBy('timestamp', 'desc'), limit(messageLimit));

    const snapshot = await getDocs(q);
    const messages: ResearchMessage[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      messages.push({
        role: data.role as 'user' | 'bot',
        content: data.content,
        timestamp: data.timestamp,
        toolsUsed: data.toolsUsed,
        savedTool: data.savedTool,
      });
    });

    // Return in chronological order (oldest first)
    return messages.reverse();
  } catch (error) {
    console.error('Error loading research history:', error);
    // Return empty array instead of throwing to prevent UI crashes
    return [];
  }
}

/**
 * Clear old conversation history (keep last N days)
 */
export async function clearOldResearchHistory(
  userId: string,
  keepDays: number = 7
): Promise<number> {
  const { firestore } = initializeFirebase();
  const ref = collection(firestore, 'users', userId, 'researchConversations');

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);

  const q = query(ref, where('timestamp', '<', cutoffDate.toISOString()));

  const snapshot = await getDocs(q);
  const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));

  await Promise.all(deletePromises);

  return deletePromises.length;
}
