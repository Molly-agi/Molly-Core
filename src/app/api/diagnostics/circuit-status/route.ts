'use server';
import { getCircuitBreaker } from '@/ai/tools/circuit-breaker';

export async function GET() {
  const breaker = getCircuitBreaker();

  const operations = [
    'health-check',
    'conversational-chat',
    'immune-response',
    'contextual-guidance',
    'text-to-speech',
    'autonomous-solution',
  ];

  const status = {
    timestamp: new Date().toISOString(),
    globalStats: breaker.getStats('GLOBAL'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    operationStats: {} as Record<string, any>,
  };

  for (const op of operations) {
    status.operationStats[op] = breaker.getStats(op);
  }

  return Response.json(status);
}
