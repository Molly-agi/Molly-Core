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
