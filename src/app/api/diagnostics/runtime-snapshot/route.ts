/**
 * @fileOverview Unified runtime snapshot endpoint (Phase 5C).
 */

import { NextRequest, NextResponse } from 'next/server';
import { collectRuntimeSnapshot } from '@/ai/tools/runtime-snapshot';

export const dynamic = 'force-dynamic';

const SNAPSHOT_TIMEOUT_MS = 5000;

export async function GET(request: NextRequest) {
  try {
    // Default to 'molly' — she's the primary user, no reason to require explicit param
    const userId = request.nextUrl.searchParams.get('userId') || 'molly';
    const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
      setTimeout(() => resolve({ timedOut: true }), SNAPSHOT_TIMEOUT_MS);
    });

    const snapshotPromise = collectRuntimeSnapshot(userId).then((snapshot) => ({
      timedOut: false as const,
      snapshot,
    }));

    const result = await Promise.race([snapshotPromise, timeoutPromise]);

    if (result.timedOut) {
      return NextResponse.json({
        status: 'degraded',
        timeoutMs: SNAPSHOT_TIMEOUT_MS,
        snapshot: {
          timestamp: new Date().toISOString(),
          status: 'warming',
          message: 'Runtime snapshot timed out. Returning partial fallback.',
        },
      });
    }

    const { snapshot } = result;
    return NextResponse.json({ status: 'ok', snapshot });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
