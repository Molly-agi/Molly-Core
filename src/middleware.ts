/**
 * Centralized API auth middleware.
 *
 * Three tiers, deny-by-default:
 *   PUBLIC   — No auth (health probes, webhook receivers with own verification)
 *   ADMIN    — Requires x-admin-password header (always)
 *   INTERNAL — Requires browser same-origin OR x-molly-internal header (default)
 *
 * Same-origin detection uses the Sec-Fetch-Site header, which is set by the
 * browser engine and cannot be overridden by JavaScript (forbidden header).
 * This lets the browser UI call INTERNAL routes without injecting auth headers
 * while blocking external callers (curl, scripts) unless they provide the secret.
 */

import { NextRequest, NextResponse } from 'next/server';

// ── Route Classification ──────────────────────────────────────────────────

const PUBLIC_ROUTES = new Set([
  '/api/health',
  '/api/bridge/ping',
  '/api/memory/init',
  '/api/relay/install',
  '/api/events/inbound',
  '/api/terminal/peer',
]);

const ADMIN_ROUTES = new Set(['/api/recovery/scan']);

const ADMIN_PREFIX = '/api/admin/';

type AuthTier = 'PUBLIC' | 'INTERNAL' | 'ADMIN';

function classifyRoute(pathname: string): AuthTier {
  if (PUBLIC_ROUTES.has(pathname)) return 'PUBLIC';
  if (pathname.startsWith(ADMIN_PREFIX) || ADMIN_ROUTES.has(pathname))
    return 'ADMIN';
  return 'INTERNAL';
}

// ── Auth Checks ───────────────────────────────────────────────────────────

// Constant-time comparison (Edge Runtime has no node:crypto)
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function checkAdminAuth(request: NextRequest): boolean {
  const password = process.env.HIDDEN_ADMIN_PASSWORD;
  if (!password) return false;
  return safeCompare(request.headers.get('x-admin-password') ?? '', password);
}

function checkInternalAuth(request: NextRequest): boolean {
  // Browser same-origin requests (forbidden header, cannot be spoofed by JS)
  if (request.headers.get('sec-fetch-site') === 'same-origin') {
    return true;
  }

  // API clients with the internal secret
  const secret = process.env.MOLLY_INTERNAL_SECRET;
  if (secret) {
    return safeCompare(request.headers.get('x-molly-internal') ?? '', secret);
  }

  // Dev mode without secret configured — allow all (matches existing behavior)
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  return false;
}

// ── Middleware ─────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const tier = classifyRoute(request.nextUrl.pathname);

  if (tier === 'PUBLIC') {
    return NextResponse.next();
  }

  if (tier === 'ADMIN') {
    if (!checkAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // INTERNAL — default tier
  if (!checkInternalAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
