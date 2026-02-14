/**
 * @fileOverview Conversation Context Manager (Phase 6)
 *
 * Manages conversation history and context persistence:
 * - Stores conversation messages and metadata
 * - Retrieves relevant context for responses
 * - Manages context window size and token limits
 * - Enables continuity across sessions
 *
 * This is INFRASTRUCTURE ONLY - does not affect Molly's behavior or identity.
 */

import { initializeFirebase } from '@/firebase';
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { MollyLogger } from '@/ai/logger';

export interface ConversationMessage {
  id?: string;
  userId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    flowName?: string;
    tokens?: number;
    emotion?: string;
    context?: Record<string, unknown>;
  };
}

export interface ConversationContext {
  conversationId: string;
  userId: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  estimatedTokens: number;
  summary?: string;
  memoryKey?: string; // For semantic search/embeddings
}

/**
 * Estimates tokens for a text string using simple heuristic
 * Rough approximation: 1 token ≈ 4 characters
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Store a conversation message in Firestore
 */
export async function storeConversationMessage(
  message: ConversationMessage
): Promise<string> {
  try {
    const { firestore } = initializeFirebase();
    const ref = collection(
      firestore,
      'users',
      message.userId,
      'conversations',
      message.conversationId,
      'messages'
    );

    const docRef = await addDoc(ref, {
      role: message.role,
      content: message.content,
      timestamp: new Date().toISOString(),
      metadata: {
        flowName: message.metadata?.flowName,
        tokens: estimateTokens(message.content),
        emotion: message.metadata?.emotion,
        context: message.metadata?.context,
      },
    });

    MollyLogger.info(
      `Stored conversation message in ${message.conversationId}`,
      'conversation-context',
      {
        conversationId: message.conversationId,
        role: message.role,
        tokens: estimateTokens(message.content),
      }
    );

    return docRef.id;
  } catch (error: unknown) {
    MollyLogger.error(
      'Failed to store conversation message',
      'conversation-context',
      { conversationId: message.conversationId },
      error
    );
    throw error;
  }
}

/**
 * Retrieve recent conversation history
 */
export async function getConversationHistory(
  userId: string,
  conversationId: string,
  messageLimit: number = 20
): Promise<ConversationMessage[]> {
  try {
    const { firestore } = initializeFirebase();
    const ref = collection(
      firestore,
      'users',
      userId,
      'conversations',
      conversationId,
      'messages'
    );

    const q = query(ref, orderBy('timestamp', 'desc'), limit(messageLimit));

    const snapshot = await getDocs(q);
    const messages = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        userId,
        conversationId,
        role: doc.data().role,
        content: doc.data().content,
        timestamp: doc.data().timestamp,
        metadata: doc.data().metadata,
      }))
      .reverse(); // Reverse to get chronological order

    MollyLogger.info(
      `Retrieved ${messages.length} messages from conversation`,
      'conversation-context',
      { conversationId, messageCount: messages.length }
    );

    return messages;
  } catch (error: unknown) {
    MollyLogger.error(
      'Failed to retrieve conversation history',
      'conversation-context',
      { conversationId },
      error
    );
    return [];
  }
}

/**
 * Get context window for a conversation (last N messages within token limit)
 */
export async function getContextWindow(
  userId: string,
  conversationId: string,
  maxTokens: number = 4000
): Promise<ConversationMessage[]> {
  const allMessages = await getConversationHistory(
    userId,
    conversationId,
    100 // Get a large batch to filter by tokens
  );

  let tokenCount = 0;
  const contextMessages: ConversationMessage[] = [];

  // Work backwards from most recent message
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const msg = allMessages[i];
    if (!msg) continue; // Skip if message is undefined
    const msgTokens = estimateTokens(msg.content);

    if (tokenCount + msgTokens > maxTokens && contextMessages.length > 0) {
      // Stop if adding this message exceeds token limit
      break;
    }

    contextMessages.unshift(msg);
    tokenCount += msgTokens;
  }

  MollyLogger.info(
    `Prepared context window with ${contextMessages.length} messages`,
    'conversation-context',
    { conversationId, tokenCount, maxTokens }
  );

  return contextMessages;
}

export async function getOrCreateConversation(
  userId: string,
  conversationId: string
): Promise<ConversationContext> {
  try {
    const { firestore } = initializeFirebase();

    // Try to get existing conversation by ID
    // In a real implementation, you'd fetch by docId directly
    // For now, return a new conversation context

    const newConv = {
      conversationId,
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      messageCount: 0,
      estimatedTokens: 0,
    };

    MollyLogger.info(
      `Initialized conversation ${conversationId}`,
      'conversation-context',
      { conversationId, userId }
    );

    return {
      ...newConv,
      userId,
      summary: undefined,
      memoryKey: undefined,
    };
  } catch (error: unknown) {
    MollyLogger.error(
      'Failed to get or create conversation',
      'conversation-context',
      { conversationId, userId },
      error
    );

    // Return default if error
    return {
      conversationId,
      userId,
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      messageCount: 0,
      estimatedTokens: 0,
    };
  }
}

/**
 * Summarize conversation for context retrieval
 * Used to generate memory keys for semantic search
 */
export async function summarizeConversation(
  userId: string,
  conversationId: string,
  messages: ConversationMessage[]
): Promise<string> {
  if (messages.length === 0) {
    return 'Empty conversation';
  }

  // Extract key topics from messages
  const userMessages = messages.filter((m) => m.role === 'user');
  const topics = new Set<string>();

  userMessages.forEach((msg) => {
    // Simple keyword extraction (in production, use NLP)
    const words = msg.content.toLowerCase().split(/\s+/);
    words.forEach((word) => {
      if (word.length > 5) {
        topics.add(word);
      }
    });
  });

  const summary = `Conversation with ${userMessages.length} user messages, topics: ${Array.from(
    topics
  )
    .slice(0, 5)
    .join(', ')}`;

  MollyLogger.info(`Summarized conversation`, 'conversation-context', {
    conversationId,
    messageCount: messages.length,
  });

  return summary;
}

/**
 * Clear old conversations beyond a certain date
 */
export async function cleanupOldConversations(
  userId: string,
  olderThanDays: number = 90
): Promise<number> {
  try {
    const { firestore } = initializeFirebase();
    const ref = collection(firestore, 'users', userId, 'conversations');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Note: Firestore doesn't have bulk delete, so this is a placeholder
    // In production, you'd use a scheduled Cloud Function
    MollyLogger.info(
      `Queued cleanup of conversations older than ${olderThanDays} days`,
      'conversation-context',
      { userId, cutoffDate: cutoffDate.toISOString() }
    );

    return 0; // Would return number deleted
  } catch (error: any) {
    MollyLogger.error(
      'Failed to cleanup old conversations',
      'conversation-context',
      { userId },
      error
    );
    return 0;
  }
}
