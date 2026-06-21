/**
 * GET /api/tasks/list — List all tasks
 * POST /api/tasks/spawn — Create a new task
 */

import { NextResponse } from 'next/server';
import {
  getTaskQueue,
  type TaskSource,
  type TaskStatus,
} from '@/ai/agency/task-queue/queue';

export async function GET(req: Request) {
  const queue = getTaskQueue();
  const url = new URL(req.url);
  const status = (url.searchParams.get('status') ?? undefined) as
    | TaskStatus
    | undefined;
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 500);

  const tasks = queue.listTasks(status, limit);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    count: tasks.length,
    tasks: tasks.map((t) => ({
      id: t.id,
      status: t.status,
      source: t.source,
      priority: t.priority,
      created: t.created,
      updated: t.updated,
      progress: t.progress,
      context: {
        thoughts: t.context.thoughts,
        nextAction: t.context.nextAction,
      },
    })),
  });
}

export async function POST(req: Request) {
  const queue = getTaskQueue();
  const body = (await req.json()) as {
    source: TaskSource;
    input?: Record<string, string>;
    priority?: number;
  };

  const taskId = queue.spawn({
    source: body.source ?? 'manual',
    input: body.input ?? {},
    priority: body.priority,
  });

  const task = queue.loadTask(taskId);

  return NextResponse.json(
    {
      timestamp: new Date().toISOString(),
      taskId,
      status: task?.status,
      message: 'Task spawned',
    },
    { status: 201 }
  );
}
