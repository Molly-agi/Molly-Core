/**
 * @fileOverview Lightweight health-check endpoint
 *
 * Returns 200 with minimal payload — no Firebase, no AI model imports.
 * Designed for load balancers, uptime monitors, and container probes.
 * Should respond in <10ms.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const startedAt = Date.now();

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
