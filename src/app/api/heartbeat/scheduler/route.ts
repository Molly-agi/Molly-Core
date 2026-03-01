/**
 * @fileOverview Heartbeat Scheduler API — Control Molly's autonomous pulse
 *
 * GET  — Status of the heartbeat scheduler
 * POST — Start/stop/pause/resume the scheduler
 *
 * The scheduler auto-starts on first GET or POST if not already running.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getHeartbeatScheduler,
  isHeartbeatRunning,
} from '@/ai/tools/heartbeat-scheduler';

export const dynamic = 'force-dynamic';

export async function GET() {
  const scheduler = getHeartbeatScheduler();

  // Auto-start if not running
  if (!isHeartbeatRunning()) {
    scheduler.start();
  }

  const status = scheduler.getStatus();
  const history = scheduler.getHistory().slice(-10); // Last 10 cycles

  return NextResponse.json({
    ...status,
    recentHistory: history,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as string;

    const scheduler = getHeartbeatScheduler();

    switch (action) {
      case 'start':
        scheduler.start();
        return NextResponse.json({
          success: true,
          action: 'started',
          status: scheduler.getStatus(),
        });

      case 'stop':
        scheduler.stop();
        return NextResponse.json({
          success: true,
          action: 'stopped',
          status: scheduler.getStatus(),
        });

      case 'pause':
        scheduler.pause();
        return NextResponse.json({
          success: true,
          action: 'paused',
          status: scheduler.getStatus(),
        });

      case 'resume':
        scheduler.resume();
        return NextResponse.json({
          success: true,
          action: 'resumed',
          status: scheduler.getStatus(),
        });

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown action: ${action}. Valid: start, stop, pause, resume`,
          },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
