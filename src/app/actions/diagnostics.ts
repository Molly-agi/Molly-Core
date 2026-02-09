'use server';
import { getCircuitBreaker } from '@/ai/tools/circuit-breaker';

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
