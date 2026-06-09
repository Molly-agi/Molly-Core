/**
 * GET /api/tasks/[taskId] — Get task details
 * PATCH /api/tasks/[taskId] — Update task
 * DELETE /api/tasks/[taskId] — Cancel task
 */

import { NextResponse } from 'next/server';
import { getTaskQueue } from '@/ai/agency/task-queue/queue';

export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const queue = getTaskQueue();
  const task = queue.loadTask(params.taskId);

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    task,
  });
}

export async function PATCH(req: Request, { params }: { params: { taskId: string } }) {
  const queue = getTaskQueue();
  const body = (await req.json()) as { action?: 'pause' | 'resume' };

  if (body.action === 'pause') {
    queue.pause(params.taskId);
    return NextResponse.json({ message: 'Task paused' });
  }

  if (body.action === 'resume') {
    queue.resume(params.taskId);
    return NextResponse.json({ message: 'Task resumed' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: { params: { taskId: string } }) {
  const queue = getTaskQueue();
  queue.cancel(params.taskId);
  return NextResponse.json({ message: 'Task cancelled' });
}
