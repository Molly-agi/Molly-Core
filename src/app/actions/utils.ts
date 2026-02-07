import { initializeFirebase } from '@/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { MollyLogger } from '@/ai/logger';
import { AuthenticationError } from '@/ai/errors';
import { getRateLimiter } from '@/ai/tools/rate-limiter';

/**
 * Hardened gatekeeper to ensure environment stability.
 */
export function ensureApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    const error = new AuthenticationError(
      'GEMINI_API_KEY is not configured in the environment.'
    );
    MollyLogger.error('API key check failed', 'ensureApiKey', {}, error);
    throw error;
  }
}

/**
 * Rate limiting guard to prevent CPU overload from rapid API calls
 */
export async function checkRateLimit(
  flowName: string,
  estimatedTokens: number = 500
) {
  const limiter = getRateLimiter();
  await limiter.checkLimit(flowName, estimatedTokens);
}

/**
 * Fetch the last context from user's AI responses for continuity
 */
export async function fetchLastContext(userId: string): Promise<string> {
  try {
    const { firestore } = initializeFirebase();
    const ref = collection(firestore, 'users', userId, 'aiResponses');
    const q = query(ref, orderBy('timestamp', 'desc'), limit(1));
    const snapshot = await getDocs(q);
    return snapshot.docs[0]?.data()?.responseText || 'First ignition.';
  } catch (e) {
    MollyLogger.warn('Failed to fetch last context', 'fetchLastContext', {
      userId,
    });
    return 'First ignition.';
  }
}
