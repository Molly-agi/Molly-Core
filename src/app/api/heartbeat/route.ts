/**
 * @fileOverview Simple heartbeat endpoint for server liveness checks.
 * Also ensures the heartbeat scheduler is running — Molly's autonomous pulse.
 */

import { NextResponse } from 'next/server';
import {
  getHeartbeatScheduler,
  isHeartbeatRunning,
} from '@/ai/tools/heartbeat-scheduler';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Auto-start the heartbeat scheduler on first ping
  if (!isHeartbeatRunning()) {
    const scheduler = getHeartbeatScheduler();
    scheduler.start();
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    schedulerRunning: isHeartbeatRunning(),
  });
}
