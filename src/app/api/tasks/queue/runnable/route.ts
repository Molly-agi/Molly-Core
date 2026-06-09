/**
 * GET /api/tasks/queue/runnable — Get next batch of runnable tasks
 * Used by autonomous cycle to pull tasks for execution
 */

import { NextResponse } from 'next/server';
import { getTaskQueue } from '@/ai/agency/task-queue/queue';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const max = Math.min(parseInt(url.searchParams.get('max') ?? '3'), 10);

  const queue = getTaskQueue();
  const runnable = queue.getRunnable(max);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    count: runnable.length,
    tasks: runnable.map((t) => ({
      id: t.id,
      status: t.status,
      source: t.source,
      input: t.input,
      context: t.context,
    })),
  });
}
