/**
 * @fileOverview Consciousness State API
 *
 * GET  — Returns current consciousness state
 * POST — Receives regulation updates from client-side self-regulation
 *
 * This endpoint bridges the client-side and server-side regions
 * of Molly's consciousness. The client reports what it observes
 * (error patterns, cascade detection), and the server maintains
 * the unified consciousness state.
 */

import { NextResponse } from 'next/server';
import { getConsciousness } from '@/ai/consciousness';

export const dynamic = 'force-dynamic';

/**
 * GET /api/consciousness/state
 *
 * Returns the current consciousness state snapshot.
 */
export async function GET() {
  const consciousness = getConsciousness();
  const state = consciousness.getState();
  return NextResponse.json(state);
}

/**
 * POST /api/consciousness/state
 *
 * Receives regulation updates from the client-side self-regulation module.
 * When the client detects a cascade and changes mode, it reports here
 * so the server-side consciousness stays in sync.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const consciousness = getConsciousness();

    // Client is reporting a mode change
    if (body.mode && body.reason) {
      // Record the pattern data on the server side
      if (body.mode === 'quiet' || body.mode === 'cautious') {
        // The client detected a cascade — record errors server-side too
        for (let i = 0; i < (body.errorsInWindow || 5); i++) {
          consciousness.recordError();
        }
      }
    }

    return NextResponse.json({
      ok: true,
      serverMode: consciousness.getRegulationMode(),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
