/**
 * @fileOverview F2.1 — Provision rate-limiter (W0.2)
 *
 * Prevents the key bootstrap gap: an unauthenticated caller can request
 * device provisioning for arbitrarily many deviceIds. A token bucket
 * (sliding window) throttles provisioning to maxAttempts per windowMs
 * per bucket key (typically the remote IP address).
 */

import type { ProvisionRateLimitConfig } from './schema';

export const DEFAULT_PROVISION_CONFIG: ProvisionRateLimitConfig = {
  maxAttempts: 3,
  windowMs: 10 * 60 * 1000, // 10 minutes
};

export class ProvisionRateLimiter {
  private readonly windows = new Map<string, number[]>();
  private readonly config: ProvisionRateLimitConfig;

  constructor(config: ProvisionRateLimitConfig = DEFAULT_PROVISION_CONFIG) {
    this.config = config;
  }

  /**
   * Check whether `key` is allowed to trigger a new provisioning.
   * Records the attempt if allowed.
   *
   * @param key  Bucket key — caller supplies the remote IP or any stable token.
   * @param now  Current epoch ms (injectable for testing).
   * @returns `{ allowed: true }` or `{ allowed: false, retryAfterMs: number }`.
   */
  check(
    key: string,
    now: number = Date.now()
  ): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const { maxAttempts, windowMs } = this.config;
    const cutoff = now - windowMs;

    // Retrieve and prune stale timestamps.
    const timestamps = (this.windows.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= maxAttempts) {
      const oldest = timestamps[0]!;
      const retryAfterMs = oldest + windowMs - now;
      this.windows.set(key, timestamps);
      return { allowed: false, retryAfterMs };
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);
    return { allowed: true };
  }

  /** Remove all state for a key (e.g. after successful auth). */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /** Evict all windows that have fully expired — keeps memory bounded. */
  prune(now: number = Date.now()): void {
    const cutoff = now - this.config.windowMs;
    for (const [key, timestamps] of this.windows.entries()) {
      if (timestamps.every((t) => t <= cutoff)) {
        this.windows.delete(key);
      }
    }
  }
}
