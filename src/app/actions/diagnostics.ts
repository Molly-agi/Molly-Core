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
    operationStats: {} as Record<string, Record<string, unknown>>,
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
export async function getRuntimeSnapshot(userId: string = 'molly') {
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
 * Validate hidden admin toolbar credentials against env-configured values.
 *
 * Credentials are read from process.env at call time (NOT cached) so an
 * operator rotating them does not require a server restart. Both
 * HIDDEN_ADMIN_USERNAME and HIDDEN_ADMIN_PASSWORD must be set, non-empty,
 * and match. If either env var is missing or empty, the panel fails
 * CLOSED — no credential combination is accepted. This matches the
 * canonical pattern used by `src/middleware.ts` and every route under
 * `src/app/api/admin/`, and the optional-env-var declaration in
 * `src/instrumentation.ts` ("Admin panel will be inaccessible without
 * credentials").
 *
 * Audit history: prior to 2026-06-24 this function hardcoded the
 * username and password as source literals — flagged P0 by the
 * post-finale codebase audit and replaced with this env-driven path.
 */
export async function validateHiddenAdminCredentials(
  username: string,
  password: string
) {
  const expectedUsername = (process.env.HIDDEN_ADMIN_USERNAME ?? '').trim();
  const expectedPassword = (process.env.HIDDEN_ADMIN_PASSWORD ?? '').trim();

  // Fail closed: missing or empty env → panel locked, regardless of input.
  if (!expectedUsername || !expectedPassword) {
    return {
      valid: false,
      error: 'Admin panel is not configured on this deployment.',
    };
  }

  const usernameOk = safeEquals(username.trim(), expectedUsername);
  const passwordOk = safeEquals(password.trim(), expectedPassword);

  return {
    valid: usernameOk && passwordOk,
    error: usernameOk && passwordOk ? null : 'Invalid username or password.',
  };
}
