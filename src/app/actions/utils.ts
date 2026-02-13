import { initializeFirebase } from '@/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { MollyLogger } from '@/ai/logger';
import { AuthenticationError } from '@/ai/errors';
import { getRateLimiter } from '@/ai/tools/rate-limiter';
import { getCircuitBreaker } from '@/ai/tools/circuit-breaker';

/**
 * Hardened gatekeeper to ensure environment stability.
 */
export function ensureApiKey() {
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    const error = new AuthenticationError(
      'GOOGLE_GENAI_API_KEY is not configured in the environment.'
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
  // Check circuit breaker first - if it's open, fail fast
  const breaker = getCircuitBreaker();
  if (!breaker.canProceed(flowName)) {
    // Log the circuit breaker state for debugging
    const stats = breaker.getStats(flowName);
    MollyLogger.warn(
      `Circuit breaker blocked ${flowName}: ${stats.state}`,
      'checkRateLimit',
      {
        flowName,
        state: stats.state,
        errorRate: `${stats.errorRate.toFixed(1)}%`,
        failures: stats.failureCount,
      }
    );
    const error = new Error(
      `Circuit breaker is ${stats.state} for ${flowName}. Retry in a moment.`
    );
    throw error;
  }

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

/**
 * Serialize complex history items into a format safe for Server Actions
 * Next.js Server Actions can only pass serializable types
 */
export function serializeHistoryForServer(
  history: any[]
): Array<string | { type: string; data: any }> {
  return history.map((item) => {
    // Already a string, safe to pass
    if (typeof item === 'string') {
      return item;
    }

    // Handle complex objects by converting to a serializable format
    if (item !== null && typeof item === 'object') {
      // Solution responses
      if ('creativeSolution' in item || 'vibeCheck' in item) {
        return { type: 'solution', data: { vibeCheck: item.vibeCheck } };
      }

      // Script responses
      if ('filename' in item || 'content' in item) {
        return { type: 'script', data: { filename: item.filename } };
      }

      // Immune reports
      if ('immuneReport' in item) {
        return { type: 'immune', data: { status: item.isHealthy } };
      }

      // Synthetic synthesis reports
      if ('syntheticReport' in item) {
        return { type: 'synthetic', data: {} };
      }

      // Hive outputs or other objects - summarize them
      return { type: 'response', data: {} };
    }

    return String(item);
  });
}
