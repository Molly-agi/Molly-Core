/**
 * @fileOverview Admin Route Rate Limiting
 *
 * Simple in-memory rate limiter for admin API routes.
 * Protects against:
 * - Brute force attacks
 * - DoS attempts on expensive operations
 * - Runaway scripts accidentally hammering admin endpoints
 *
 * Uses a sliding window counter per IP address.
 */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory store (resets on server restart - acceptable for rate limiting)
const ipLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes to prevent memory leak
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function cleanupOldEntries(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  lastCleanup = now;
  const cutoff = now - windowMs * 2; // Keep entries for 2x window

  for (const [key, entry] of ipLimitStore) {
    if (entry.windowStart < cutoff) {
      ipLimitStore.delete(key);
    }
  }
}

export interface AdminRateLimitConfig {
  /** Max requests per window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Route identifier for logging */
  routeName: string;
}

const DEFAULT_CONFIG: AdminRateLimitConfig = {
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
  routeName: 'admin',
};

/**
 * Extract client IP from request headers.
 * Handles various proxy configurations.
 */
function getClientIP(request: NextRequest): string {
  // Try various headers in order of reliability
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be comma-separated; take the first (client) IP
    return forwarded.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP;

  // Fallback for local development
  return '127.0.0.1';
}

/**
 * Check rate limit and return error response if exceeded.
 * Returns null if request is allowed.
 */
export function checkAdminRateLimit(
  request: NextRequest,
  config: Partial<AdminRateLimitConfig> = {}
): NextResponse | null {
  const { maxRequests, windowMs, routeName } = { ...DEFAULT_CONFIG, ...config };

  const ip = getClientIP(request);
  const key = `${routeName}:${ip}`;
  const now = Date.now();

  // Cleanup periodically
  cleanupOldEntries(windowMs);

  // Get or create entry
  let entry = ipLimitStore.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    // New window
    entry = { count: 1, windowStart: now };
    ipLimitStore.set(key, entry);
    return null; // Allowed
  }

  // Increment count
  entry.count++;

  if (entry.count > maxRequests) {
    const retryAfterSeconds = Math.ceil(
      (entry.windowStart + windowMs - now) / 1000
    );

    console.warn(
      `[AdminRateLimit] Rate limit exceeded: ${routeName} from ${ip} (${entry.count}/${maxRequests})`
    );

    return NextResponse.json(
      {
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
        retryAfter: retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(entry.windowStart + windowMs),
        },
      }
    );
  }

  return null; // Allowed
}

/**
 * Higher-order function to wrap an admin route handler with rate limiting.
 */
export function withAdminRateLimit<T>(
  handler: (request: NextRequest) => Promise<T>,
  config: Partial<AdminRateLimitConfig> = {}
): (request: NextRequest) => Promise<T | NextResponse> {
  return async (request: NextRequest) => {
    const limitResponse = checkAdminRateLimit(request, config);
    if (limitResponse) {
      return limitResponse;
    }
    return handler(request);
  };
}

/**
 * Preset configurations for different admin route types
 */
export const ADMIN_RATE_LIMITS = {
  /** Destructive operations (delete, nuke) - very strict */
  destructive: {
    maxRequests: 5,
    windowMs: 60 * 1000, // 5 per minute
  },
  /** Write operations (seed, upload) - moderate */
  write: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 10 per minute
  },
  /** Read operations (list, status) - lenient */
  read: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 30 per minute
  },
} as const;
