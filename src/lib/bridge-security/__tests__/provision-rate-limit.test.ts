/**
 * @fileOverview F2.1 — ProvisionRateLimiter tests
 *
 * Verifies that the rate-limiter blocks provisioning after maxAttempts
 * within the window and allows it again once the window expires.
 */

import {
  ProvisionRateLimiter,
  DEFAULT_PROVISION_CONFIG,
} from '../provision-rate-limit';

describe('ProvisionRateLimiter (F2.1)', () => {
  it('F2.1: allows up to maxAttempts within the window', () => {
    const limiter = new ProvisionRateLimiter({
      maxAttempts: 3,
      windowMs: 60_000,
    });
    const now = 1_000_000;
    expect(limiter.check('ip-a', now)).toEqual({ allowed: true });
    expect(limiter.check('ip-a', now + 1)).toEqual({ allowed: true });
    expect(limiter.check('ip-a', now + 2)).toEqual({ allowed: true });
  });

  it('F2.1: blocks on the (maxAttempts+1)-th attempt within the window', () => {
    const limiter = new ProvisionRateLimiter({
      maxAttempts: 3,
      windowMs: 60_000,
    });
    const now = 1_000_000;
    limiter.check('ip-b', now);
    limiter.check('ip-b', now + 1);
    limiter.check('ip-b', now + 2);
    const result = limiter.check('ip-b', now + 3);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('F2.1: different keys are independent', () => {
    const limiter = new ProvisionRateLimiter({
      maxAttempts: 1,
      windowMs: 60_000,
    });
    const now = 2_000_000;
    limiter.check('ip-x', now); // exhausts ip-x
    const result = limiter.check('ip-y', now);
    expect(result.allowed).toBe(true);
  });

  it('F2.1: allows provisioning again after the window expires', () => {
    const windowMs = 60_000;
    const limiter = new ProvisionRateLimiter({ maxAttempts: 1, windowMs });
    const start = 3_000_000;
    limiter.check('ip-c', start); // fill the bucket
    expect(limiter.check('ip-c', start + 1).allowed).toBe(false);
    // Advance past the window
    expect(limiter.check('ip-c', start + windowMs + 1).allowed).toBe(true);
  });

  it('F2.1: reset clears the bucket for a key', () => {
    const limiter = new ProvisionRateLimiter({
      maxAttempts: 1,
      windowMs: 60_000,
    });
    const now = 4_000_000;
    limiter.check('ip-d', now); // fill bucket
    limiter.reset('ip-d');
    expect(limiter.check('ip-d', now + 1).allowed).toBe(true);
  });

  it('F2.1: prune evicts fully-expired windows', () => {
    const windowMs = 60_000;
    const limiter = new ProvisionRateLimiter({ maxAttempts: 3, windowMs });
    const start = 5_000_000;
    limiter.check('ip-e', start);
    limiter.check('ip-e', start + 1);
    // Prune after window expires — bucket should be empty, allowing fresh attempts
    limiter.prune(start + windowMs + 1);
    expect(limiter.check('ip-e', start + windowMs + 2).allowed).toBe(true);
  });

  it('F2.1: default config has reasonable limits', () => {
    expect(DEFAULT_PROVISION_CONFIG.maxAttempts).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_PROVISION_CONFIG.windowMs).toBeGreaterThan(0);
  });
});
