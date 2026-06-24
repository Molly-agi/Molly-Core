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

/**
 * Contract: validateHiddenAdminCredentials reads HIDDEN_ADMIN_USERNAME and
 * HIDDEN_ADMIN_PASSWORD from process.env at call time and fails CLOSED
 * when either is missing. Audit P0 fix 2026-06-24 — prior version
 * hardcoded 'admin' / '1276' as source literals. The hardcoded-literal
 * regression guard below ensures the rollback path is loud.
 */
describe('validateHiddenAdminCredentials', () => {
  const ORIG_USER = process.env.HIDDEN_ADMIN_USERNAME;
  const ORIG_PASS = process.env.HIDDEN_ADMIN_PASSWORD;

  afterEach(() => {
    if (ORIG_USER === undefined) delete process.env.HIDDEN_ADMIN_USERNAME;
    else process.env.HIDDEN_ADMIN_USERNAME = ORIG_USER;
    if (ORIG_PASS === undefined) delete process.env.HIDDEN_ADMIN_PASSWORD;
    else process.env.HIDDEN_ADMIN_PASSWORD = ORIG_PASS;
  });

  it('accepts credentials that match the configured env vars', async () => {
    process.env.HIDDEN_ADMIN_USERNAME = 'molly-ops';
    process.env.HIDDEN_ADMIN_PASSWORD = 'correct-horse-battery-staple';
    const result = await validateHiddenAdminCredentials(
      'molly-ops',
      'correct-horse-battery-staple'
    );
    expect(result).toEqual({ valid: true, error: null });
  });

  it('rejects invalid username/password combinations against configured env vars', async () => {
    process.env.HIDDEN_ADMIN_USERNAME = 'molly-ops';
    process.env.HIDDEN_ADMIN_PASSWORD = 'correct-horse-battery-staple';

    const wrongUser = await validateHiddenAdminCredentials(
      'root',
      'correct-horse-battery-staple'
    );
    const wrongPass = await validateHiddenAdminCredentials(
      'molly-ops',
      'badpass'
    );

    expect(wrongUser.valid).toBe(false);
    expect(wrongUser.error).toBe('Invalid username or password.');
    expect(wrongPass.valid).toBe(false);
    expect(wrongPass.error).toBe('Invalid username or password.');
  });

  it('fails CLOSED when HIDDEN_ADMIN_USERNAME is unset', async () => {
    delete process.env.HIDDEN_ADMIN_USERNAME;
    process.env.HIDDEN_ADMIN_PASSWORD = 'any';
    const result = await validateHiddenAdminCredentials('admin', 'any');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Admin panel is not configured on this deployment.'
    );
  });

  it('fails CLOSED when HIDDEN_ADMIN_PASSWORD is unset', async () => {
    process.env.HIDDEN_ADMIN_USERNAME = 'any';
    delete process.env.HIDDEN_ADMIN_PASSWORD;
    const result = await validateHiddenAdminCredentials('any', 'whatever');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Admin panel is not configured on this deployment.'
    );
  });

  it('fails CLOSED when both env vars are empty strings (defense vs blank rotation)', async () => {
    process.env.HIDDEN_ADMIN_USERNAME = '';
    process.env.HIDDEN_ADMIN_PASSWORD = '';
    const result = await validateHiddenAdminCredentials('', '');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Admin panel is not configured on this deployment.'
    );
  });

  // REGRESSION GUARD (audit P0 fix 2026-06-24): the pre-fix version of this
  // file hardcoded HIDDEN_ADMIN_USERNAME='admin' + HIDDEN_ADMIN_PASSWORD='1276'
  // as source literals. If someone ever re-introduces that pattern without
  // updating this test, this assertion fires LOUDLY because with env unset
  // the legacy credentials must NOT validate.
  it('REGRESSION GUARD: legacy hardcoded admin/1276 does NOT validate when env is unset', async () => {
    delete process.env.HIDDEN_ADMIN_USERNAME;
    delete process.env.HIDDEN_ADMIN_PASSWORD;
    const result = await validateHiddenAdminCredentials('admin', '1276');
    expect(result.valid).toBe(false);
  });
});
