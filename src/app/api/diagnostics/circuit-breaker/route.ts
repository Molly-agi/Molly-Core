/**
 * @fileOverview Circuit Breaker Diagnostics API
 * Provides status and reset capabilities for circuit breakers
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCircuitBreaker } from '@/ai/tools/circuit-breaker';
import { isInternalAuthorized, unauthorizedResponse } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/diagnostics/circuit-breaker - Get circuit breaker status
 */

export async function GET(_request: NextRequest) {
  try {
    const breaker = getCircuitBreaker();
    const status = breaker.getStatus();

    return NextResponse.json({
      success: true,
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/diagnostics/circuit-breaker - Reset all circuit breakers
 * Protected — only Molly's frontend or admin can reset breakers.
 */

export async function POST(request: NextRequest) {
  if (!isInternalAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const breaker = getCircuitBreaker();

    const beforeStatus = breaker.getStatus();
    breaker.reset(); // Reset all breakers
    const afterStatus = breaker.getStatus();

    return NextResponse.json({
      success: true,
      message: 'All circuit breakers reset successfully',
      before: beforeStatus,
      after: afterStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
