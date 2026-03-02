/**
 * @fileOverview Scheduler API — Molly's Autonomous Timer Control
 *
 * POST: Create a scheduled job
 * DELETE: Remove a job
 * PATCH: Enable/disable a job
 * GET: List all jobs and recent history
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAutonomousScheduler } from '@/ai/tools/autonomous-scheduler';
import type { JobActionType } from '@/ai/tools/autonomous-scheduler';

// POST — Create a job
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { name, description, schedule, action, createdBy } = body;

    if (!name || !schedule || !action?.type) {
      return NextResponse.json(
        { error: 'Missing required fields: name, schedule, action.type' },
        { status: 400 }
      );
    }

    // Validate schedule format
    if (
      !schedule.startsWith('cron:') &&
      !schedule.startsWith('interval:') &&
      !schedule.startsWith('once:')
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid schedule format. Use: cron:EXPR, interval:MS, or once:ISO_TIMESTAMP',
        },
        { status: 400 }
      );
    }

    const scheduler = getAutonomousScheduler();
    const job = scheduler.createJob({
      name,
      description: description || name,
      schedule,
      action: {
        type: action.type as JobActionType,
        language: action.language,
        code: action.code,
        flowName: action.flowName,
        url: action.url,
        method: action.method,
        body: action.body,
        headers: action.headers,
      },
      createdBy,
    });

    return NextResponse.json({ created: true, job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}

// DELETE — Remove a job
export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Missing required parameter: id' },
      { status: 400 }
    );
  }

  const scheduler = getAutonomousScheduler();
  const removed = scheduler.removeJob(id);

  return NextResponse.json({ removed });
}

// PATCH — Enable/disable a job
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, enabled } = body;

    if (!id || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required fields: id, enabled (boolean)' },
        { status: 400 }
      );
    }

    const scheduler = getAutonomousScheduler();
    const updated = scheduler.setJobEnabled(id, enabled);

    return NextResponse.json({ updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}

// GET — List jobs and history
export async function GET(request: NextRequest) {
  const scheduler = getAutonomousScheduler();
  const url = new URL(request.url);

  const view = url.searchParams.get('view') || 'jobs';

  if (view === 'history') {
    const limit = parseInt(url.searchParams.get('limit') || '20');
    return NextResponse.json({
      history: scheduler.getHistory(limit),
    });
  }

  return NextResponse.json({
    jobs: scheduler.getJobs(),
    summary: scheduler.getSummary(),
  });
}
