jest.mock('@/ai/tools/circuit-breaker', () => ({
  getCircuitBreaker: () => ({
    getStats: () => ({
      state: 'closed',
      errorRate: 0,
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    }),
    reset: jest.fn(),
  }),
}));

jest.mock('@/ai/tools/runtime-snapshot', () => ({
  collectRuntimeSnapshot: jest.fn(async () => ({
    timestamp: new Date().toISOString(),
    status: 'ok',
  })),
}));

import { validateHiddenAdminCredentials } from '../diagnostics';

describe('validateHiddenAdminCredentials', () => {
  it('accepts the required hardcoded admin credentials', async () => {
    const result = await validateHiddenAdminCredentials('admin', '1276');

    expect(result).toEqual({
      valid: true,
      error: null,
    });
  });

  it('rejects invalid username/password combinations', async () => {
    const wrongUser = await validateHiddenAdminCredentials('root', '1276');
    const wrongPass = await validateHiddenAdminCredentials('admin', 'badpass');

    expect(wrongUser.valid).toBe(false);
    expect(wrongUser.error).toBe('Invalid username or password.');
    expect(wrongPass.valid).toBe(false);
    expect(wrongPass.error).toBe('Invalid username or password.');
  });
});
