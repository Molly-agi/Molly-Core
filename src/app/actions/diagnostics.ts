'use server';
import { getCircuitBreaker } from '@/ai/tools/circuit-breaker';
import { collectRuntimeSnapshot } from '@/ai/tools/runtime-snapshot';
import { timingSafeEqual } from 'node:crypto';

const SNAPSHOT_TIMEOUT_MS = 5000;

/**
 * Get circuit breaker status for all operations
 */
export async function getCircuitBreakerStatus() {
  const breaker = getCircuitBreaker();

  const operations = [
    'health-check',
    'conversational-chat',
    'immune-response',
    'contextual-guidance',
    'text-to-speech',
    'autonomous-solution',
    'evolution-loop',
    'interpreter-limb',
    'collaborative-hive',
  ];

  const status = {
    timestamp: new Date().toISOString(),
    operationStats: {} as Record<string, any>,
  };

  for (const op of operations) {
    const stats = breaker.getStats(op);
    status.operationStats[op] = {
      state: stats.state,
      errorRate: `${stats.errorRate.toFixed(1)}%`,
      successCount: stats.successCount,
      failureCount: stats.failureCount,
      consecutiveFailures: stats.consecutiveFailures,
    };
  }

  return status;
}

/**
 * Reset circuit breaker for a specific operation or all
 */
export async function resetCircuitBreaker(operationName?: string) {
  const breaker = getCircuitBreaker();

  if (operationName) {
    breaker.reset(operationName);
    return { message: `Circuit breaker reset for ${operationName}` };
  } else {
    breaker.reset(); // Reset all when called with no argument
    return { message: 'All circuit breakers reset' };
  }
}

/**
 * Phase 5C runtime snapshot for unified health visibility.
 */
export async function getRuntimeSnapshot(userId?: string) {
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    setTimeout(() => resolve({ timedOut: true }), SNAPSHOT_TIMEOUT_MS);
  });

  const snapshotPromise = collectRuntimeSnapshot(userId).then((snapshot) => ({
    timedOut: false as const,
    snapshot,
  }));

  const result = await Promise.race([snapshotPromise, timeoutPromise]);

  if (result.timedOut) {
    return {
      timestamp: new Date().toISOString(),
      status: 'warming',
      timeoutMs: SNAPSHOT_TIMEOUT_MS,
      message: 'Runtime snapshot timed out. Returning fallback status.',
    };
  }

  return result.snapshot;
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Validate hidden admin toolbar credentials against server environment values.
 */
export async function validateHiddenAdminCredentials(
  username: string,
  password: string
) {
  const configuredUsername = process.env.HIDDEN_ADMIN_USERNAME?.trim();
  const configuredPassword = process.env.HIDDEN_ADMIN_PASSWORD?.trim();

  if (!configuredUsername || !configuredPassword) {
    return {
      valid: false,
      error:
        'Hidden admin credentials are not configured. Set HIDDEN_ADMIN_USERNAME and HIDDEN_ADMIN_PASSWORD.',
    };
  }

  const usernameOk = safeEquals(username.trim(), configuredUsername);
  const passwordOk = safeEquals(password, configuredPassword);

  return {
    valid: usernameOk && passwordOk,
    error: usernameOk && passwordOk ? null : 'Invalid username or password.',
  };
}
