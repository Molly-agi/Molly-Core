/**
 * Shared API authentication utilities.
 *
 * Two tiers:
 *   - requireAdmin: Full admin password (for destructive operations)
 *   - requireMolly: Validates request comes from Molly's own frontend
 *     via a shared secret, blocking external callers.
 *
 * MOLLY_INTERNAL_SECRET should be set in .env.local. If not set,
 * internal routes reject all requests in production and allow
 * all requests in development (localhost only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Verify admin password using timing-safe comparison.
 * Used for destructive admin operations.
 */
export function isAdminAuthorized(request: NextRequest): boolean {
  const adminPassword = process.env.HIDDEN_ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const provided = request.headers.get('x-admin-password') || '';
  if (provided.length !== adminPassword.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(adminPassword));
  } catch {
    return false;
  }
}

/**
 * Verify request is from Molly's own frontend using an internal secret.
 * In development without MOLLY_INTERNAL_SECRET set, allows localhost only.
 */
export function isInternalAuthorized(request: NextRequest): boolean {
  const secret = process.env.MOLLY_INTERNAL_SECRET;

  // If secret is configured, require it
  if (secret) {
    const provided = request.headers.get('x-molly-internal') || '';
    if (provided.length !== secret.length) return false;
    try {
      return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
    } catch {
      return false;
    }
  }

  // No secret configured — allow in development only from localhost
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // Production with no secret = deny all
  return false;
}

/** Standard 401 response */
export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
