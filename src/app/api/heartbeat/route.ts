/**
 * @fileOverview Simple heartbeat endpoint for server liveness checks.
 *
 * GET is a pure liveness probe. It does NOT start Molly's scheduler.
 * Molly owns her own body — she starts/stops the scheduler through her
 * own tools (start_heartbeat / stop_heartbeat / enable_heartbeat_task / pulse_now).
 * Eric directive 2026-06-15: no autopilot.
 */

import { NextResponse } from 'next/server';
import { isHeartbeatRunning } from '@/ai/tools/heartbeat-scheduler';
import { runAutonomousCycle } from '@/ai/agency/planning/autonomous-cycle';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    schedulerRunning: isHeartbeatRunning(),
  });
}

export async function POST(req: Request) {
  if (process.env.MOLLY_ENABLE_AUTONOMOUS_CYCLE !== '1') {
    return NextResponse.json(
      {
        error: 'Autonomous cycle is disabled by policy',
      },
      { status: 403 }
    );
  }

  const secret = process.env.MOLLY_INTERNAL_KEY;
  if (secret) {
    const provided = req.headers.get('x-molly-key');
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  const result = await runAutonomousCycle(true);
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    ...result,
  });
}
