import {
  AuthenticationError,
  EmergencyHaltError,
  FlowError,
  GenerativeAIError,
  MollyError,
  NetworkError,
  RateLimitError,
  TimeoutError,
} from '@/ai/errors';

describe('ai/errors', () => {
  it('serializes MollyError metadata to JSON', () => {
    const err = new MollyError(
      'TEST_CODE',
      'test message',
      'medium',
      { source: 'unit-test' },
      'trace-1'
    );

    expect(err.name).toBe('MollyError');
    expect(err.toJSON()).toMatchObject({
      name: 'MollyError',
      code: 'TEST_CODE',
      message: 'test message',
      severity: 'medium',
      traceId: 'trace-1',
      context: { source: 'unit-test' },
    });
    expect(typeof err.timestamp).toBe('number');
  });

  it('builds specialized error types with expected codes and messages', () => {
    const flow = new FlowError('memory-sync', 'failed write', { step: 2 });
    const auth = new AuthenticationError('invalid token');
    const rateLimit = new RateLimitError(3000, { bucket: 'global' });
    const timeout = new TimeoutError('search', 5000, { userId: 'u-1' });
    const network = new NetworkError('gateway timeout', 504);
    const genai = new GenerativeAIError('quota reached', 429);
    const halt = new EmergencyHaltError('trace-halt');

    expect(flow.code).toBe('FLOW_ERROR_MEMORY-SYNC');
    expect(flow.message).toContain("Flow 'memory-sync' failed: failed write");
    expect(flow.context).toMatchObject({ flowName: 'memory-sync', step: 2 });

    expect(auth.code).toBe('AUTH_ERROR');
    expect(auth.severity).toBe('critical');

    expect(rateLimit.code).toBe('RATE_LIMIT_ERROR');
    expect(rateLimit.retryAfterMs).toBe(3000);
    expect(rateLimit.context).toMatchObject({ retryAfterMs: 3000, bucket: 'global' });

    expect(timeout.code).toBe('TIMEOUT_ERROR');
    expect(timeout.context).toMatchObject({ operation: 'search', timeoutMs: 5000, userId: 'u-1' });

    expect(network.code).toBe('NETWORK_ERROR');
    expect(network.context).toMatchObject({ statusCode: 504 });

    expect(genai.code).toBe('GENERATIVE_AI_ERROR');
    expect(genai.context).toMatchObject({ statusCode: 429 });

    expect(halt.code).toBe('EMERGENCY_HALT');
    expect(halt.severity).toBe('critical');
    expect(halt.context).toMatchObject({ source: 'kill_switch' });
  });
});