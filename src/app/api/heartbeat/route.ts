/**
 * @fileOverview Simple heartbeat endpoint for server liveness checks.
 * Also ensures the heartbeat scheduler is running — Molly's autonomous pulse.
 */

import { NextResponse } from 'next/server';
import {
  getHeartbeatScheduler,
  isHeartbeatRunning,
} from '@/ai/tools/heartbeat-scheduler';
import { getNeuralBrain } from '@/ai/memory/neural-engram';
import { runAutonomousCycle } from '@/ai/agency/planning/autonomous-cycle';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Auto-start the heartbeat scheduler on first ping
  if (!isHeartbeatRunning()) {
    const scheduler = getHeartbeatScheduler();

    // Attach the engram system for memory consolidation
    try {
      const brain = getNeuralBrain();
      scheduler.attachEngramSystem(brain);
    } catch {
      // Non-fatal - engram system may not be ready yet
    }

    scheduler.start();
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    schedulerRunning: isHeartbeatRunning(),
  });
}

export async function POST(req: Request) {
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
