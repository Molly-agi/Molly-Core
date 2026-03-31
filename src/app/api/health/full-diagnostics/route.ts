/**
 * @fileOverview Health & Initialization Diagnostic API
 *
 * Single endpoint that checks ALL critical systems and returns their status
 * This tells us what's actually broken (root cause)
 */

import { NextResponse } from 'next/server';
import { isAdminConfigured, getAdminFirestoreAsync } from '@/firebase/admin';
import { getCircuitBreaker } from '@/ai/tools/circuit-breaker';
import { getRateLimiter } from '@/ai/tools/rate-limiter';
import { getStorageRouter } from '@/lib/storage-router';

export const dynamic = 'force-dynamic';

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    checks: {},
  };

  // 1. Check Firebase Admin SDK
  try {
    const configured = isAdminConfigured();
    if (configured) {
      const db = await getAdminFirestoreAsync();
      diagnostics.checks.firebase = {
        status: db ? 'ok' : 'error',
        adminConfigured: configured,
        firestoreConnected: !!db,
      };
    } else {
      diagnostics.checks.firebase = {
        status: 'unconfigured',
        adminConfigured: false,
        message: 'Firebase Admin SDK not configured (no credentials)',
      };
    }
  } catch (err) {
    diagnostics.checks.firebase = {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 2. Check Storage Router
  try {
    const router = getStorageRouter();
    const info = router.getProviderInfo();
    const healthy = await router.healthCheck();
    diagnostics.checks.storage = {
      status: healthy ? 'ok' : 'degraded',
      provider: info.name,
      mode: info.mode,
    };
  } catch (err) {
    diagnostics.checks.storage = {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 3. Check Circuit Breaker
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

  // 4. Check Rate Limiter
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

  // 5. Check Environment
  diagnostics.checks.environment = {
    status: 'ok',
    nodeEnv: process.env.NODE_ENV,
    hasGoogleKey: !!process.env.GOOGLE_GENAI_API_KEY,
    hasFirebaseCredentials: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    isCodespace: process.env.CODESPACES === 'true',
    isTermux: !!process.env.TERMUX_VERSION,
  };

  // Summary
  const failedChecks = Object.entries(diagnostics.checks)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter(([, check]: [string, any]) => check.status === 'error')
    .map(([name]) => name);

  diagnostics.summary = {
    healthy: failedChecks.length === 0,
    failedChecks,
    totalChecks: Object.keys(diagnostics.checks).length,
  };

  return NextResponse.json(diagnostics);
}
