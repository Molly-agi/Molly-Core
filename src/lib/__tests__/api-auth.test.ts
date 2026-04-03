/**
 * @jest-environment node
 */

/**
 * Tests for API authentication utilities.
 *
 * Tests admin authorization (timing-safe comparison),
 * internal authorization (secret + dev fallback), and
 * unauthorized response generation.
 *
 * Uses node test environment because NextRequest depends on
 * Web API globals (Request, Response) available in Node 18+.
 */

// Save originals to restore in afterEach
const originalEnv = { ...process.env };

// ── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetModules();
  // Clean env vars that the module reads
  delete process.env.HIDDEN_ADMIN_PASSWORD;
  delete process.env.MOLLY_INTERNAL_SECRET;
  delete process.env.NODE_ENV;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ── Lazy loader (re-imports after env changes) ─────────────────────────────

async function loadAuth() {
  return import('../api-auth');
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function makeRequest(headers: Record<string, string> = {}) {
  const { NextRequest } = await import('next/server');
  const h = new Headers(headers);
  return new NextRequest('http://localhost:3000/api/test', { headers: h });
}

// ============================================================================
// isAdminAuthorized
// ============================================================================

describe('isAdminAuthorized', () => {
  it('returns false when HIDDEN_ADMIN_PASSWORD is not set', async () => {
    const { isAdminAuthorized } = await loadAuth();
    const req = await makeRequest({ 'x-admin-password': 'anything' });
    expect(isAdminAuthorized(req)).toBe(false);
  });

  it('returns false when no x-admin-password header is provided', async () => {
    process.env.HIDDEN_ADMIN_PASSWORD = 'secret123';
    const { isAdminAuthorized } = await loadAuth();
    const req = await makeRequest();
    expect(isAdminAuthorized(req)).toBe(false);
  });

  it('returns false when password length differs', async () => {
    process.env.HIDDEN_ADMIN_PASSWORD = 'secret123';
    const { isAdminAuthorized } = await loadAuth();
    const req = await makeRequest({ 'x-admin-password': 'short' });
    expect(isAdminAuthorized(req)).toBe(false);
  });

  it('returns false when password is wrong but same length', async () => {
    process.env.HIDDEN_ADMIN_PASSWORD = 'secret123';
    const { isAdminAuthorized } = await loadAuth();
    const req = await makeRequest({ 'x-admin-password': 'wrong1234' });
    expect(isAdminAuthorized(req)).toBe(false);
  });

  it('returns true when password matches exactly', async () => {
    process.env.HIDDEN_ADMIN_PASSWORD = 'my-secure-password';
    const { isAdminAuthorized } = await loadAuth();
    const req = await makeRequest({ 'x-admin-password': 'my-secure-password' });
    expect(isAdminAuthorized(req)).toBe(true);
  });

  it('returns false for empty password when env is non-empty', async () => {
    process.env.HIDDEN_ADMIN_PASSWORD = 'secret';
    const { isAdminAuthorized } = await loadAuth();
    const req = await makeRequest({ 'x-admin-password': '' });
    expect(isAdminAuthorized(req)).toBe(false);
  });
});

// ============================================================================
// isInternalAuthorized
// ============================================================================

describe('isInternalAuthorized', () => {
  it('returns true when internal secret matches', async () => {
    process.env.MOLLY_INTERNAL_SECRET = 'internal-token';
    const { isInternalAuthorized } = await loadAuth();
    const req = await makeRequest({ 'x-molly-internal': 'internal-token' });
    expect(isInternalAuthorized(req)).toBe(true);
  });

  it('returns false when internal secret does not match', async () => {
    process.env.MOLLY_INTERNAL_SECRET = 'internal-token';
    const { isInternalAuthorized } = await loadAuth();
    const req = await makeRequest({ 'x-molly-internal': 'wrong-token!!' });
    expect(isInternalAuthorized(req)).toBe(false);
  });

  it('returns false when internal secret is set but header is missing', async () => {
    process.env.MOLLY_INTERNAL_SECRET = 'internal-token';
    const { isInternalAuthorized } = await loadAuth();
    const req = await makeRequest();
    expect(isInternalAuthorized(req)).toBe(false);
  });

  it('returns false when secret length differs', async () => {
    process.env.MOLLY_INTERNAL_SECRET = 'internal-token';
    const { isInternalAuthorized } = await loadAuth();
    const req = await makeRequest({ 'x-molly-internal': 'short' });
    expect(isInternalAuthorized(req)).toBe(false);
  });

  it('allows requests in development when no secret is configured', async () => {
    process.env.NODE_ENV = 'development';
    // No MOLLY_INTERNAL_SECRET set
    const { isInternalAuthorized } = await loadAuth();
    const req = await makeRequest();
    expect(isInternalAuthorized(req)).toBe(true);
  });

  it('denies requests in production when no secret is configured', async () => {
    process.env.NODE_ENV = 'production';
    // No MOLLY_INTERNAL_SECRET set
    const { isInternalAuthorized } = await loadAuth();
    const req = await makeRequest();
    expect(isInternalAuthorized(req)).toBe(false);
  });
});

// ============================================================================
// unauthorizedResponse
// ============================================================================

describe('unauthorizedResponse', () => {
  it('returns a 401 JSON response with error message', async () => {
    const { unauthorizedResponse } = await loadAuth();
    const response = unauthorizedResponse();
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });
});
