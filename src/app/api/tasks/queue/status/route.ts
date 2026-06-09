/**
 * GET /api/tasks/queue/status — Queue status
 */

import { NextResponse } from 'next/server';
import { getTaskQueue } from '@/ai/agency/task-queue/queue';

export async function GET() {
  const queue = getTaskQueue();
  const status = queue.getStatus();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    ...status,
  });
}
