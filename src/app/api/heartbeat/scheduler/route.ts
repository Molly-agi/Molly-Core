/**
 * @fileOverview Heartbeat Scheduler API — Control Molly's autonomous pulse
 *
 * GET  — Legacy status endpoint (event-driven mode)
 * POST — Start/resume are disabled in event-driven mode
 */

import { NextRequest, NextResponse } from 'next/server';
import { getHeartbeatScheduler } from '@/ai/tools/heartbeat-scheduler';

export const dynamic = 'force-dynamic';

export async function GET() {
  const scheduler = getHeartbeatScheduler();

  const status = scheduler.getStatus();
  const history = scheduler.getHistory().slice(-10); // Last 10 cycles

  return NextResponse.json({
    eventDrivenMode: true,
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
        return NextResponse.json(
          {
            success: false,
            action: 'start-disabled',
            message:
              'Heartbeat scheduler start is disabled. Runtime is event-driven.',
            status: scheduler.getStatus(),
          },
          { status: 409 }
        );

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
        return NextResponse.json(
          {
            success: false,
            action: 'resume-disabled',
            message:
              'Heartbeat scheduler resume is disabled. Runtime is event-driven.',
            status: scheduler.getStatus(),
          },
          { status: 409 }
        );

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
