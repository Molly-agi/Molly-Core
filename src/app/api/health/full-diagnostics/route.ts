/**
 * @fileOverview Health & Initialization Diagnostic API
 *
 * Single endpoint that checks ALL critical systems and returns their status
 * This tells us what's actually broken (root cause)
 */

import { NextResponse } from 'next/server';
import { initializeFirebaseServer } from '@/firebase/server';
import { getCircuitBreaker } from '@/ai/tools/circuit-breaker';
import { getRateLimiter } from '@/ai/tools/rate-limiter';
import { getLatencyStats } from '@/ai/tools/latency-cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    checks: {},
  };

  // 1. Check Firebase
  try {
    const { firebaseApp, auth, firestore } = initializeFirebaseServer();
    diagnostics.checks.firebase = {
      status: 'ok',
      app: !!firebaseApp,
      auth: !!auth,
      firestore: !!firestore,
    };
  } catch (err) {
    diagnostics.checks.firebase = {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 2. Check Circuit Breaker
  try {
    const breaker = getCircuitBreaker();
    const status = breaker.getStatus();
    diagnostics.checks.circuitBreaker = {
      status: 'ok',
      global: status.global?.state,
      operationCount: Object.keys(status.operations || {}).length,
      operations: status.operations,
    };
  } catch (err) {
    diagnostics.checks.circuitBreaker = {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 3. Check Rate Limiter
  try {
    const limiter = getRateLimiter();
    const limitStatus = limiter.getStatus();
    diagnostics.checks.rateLimiter = {
      status: 'ok',
      budgetRemaining: limitStatus.budgetRemaining,
      percentageUsed: limitStatus.percentageUsed,
      tokensUsed: limitStatus.globalQuota.tokensUsedToday,
      cost: limitStatus.globalQuota.costIncurredUSD,
    };
  } catch (err) {
    diagnostics.checks.rateLimiter = {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 4. Check Environment
  diagnostics.checks.environment = {
    status: 'ok',
    nodeEnv: process.env.NODE_ENV,
    hasGoogleKey: !!process.env.GOOGLE_GENAI_API_KEY,
  };

  // 5. Check Neural Bridge Latency Cache
  try {
    diagnostics.checks.latencyCache = {
      status: 'ok',
      ...getLatencyStats(),
    };
  } catch (err) {
    diagnostics.checks.latencyCache = {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Summary
  const failedChecks = Object.entries(diagnostics.checks)
    .filter(([_, check]: [string, any]) => check.status === 'error')
    .map(([name]) => name);

  diagnostics.summary = {
    healthy: failedChecks.length === 0,
    failedChecks,
    totalChecks: Object.keys(diagnostics.checks).length,
  };

  return NextResponse.json(diagnostics);
}
