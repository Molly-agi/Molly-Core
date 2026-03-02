/**
 * @fileOverview Event Subscriptions API — Molly Chooses What to Listen For
 *
 * POST: Create a new event subscription
 * DELETE: Remove a subscription
 * GET: List all subscriptions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEventListener } from '@/ai/tools/event-listener';
import type { EventSource, EventActionType } from '@/ai/tools/event-listener';

// POST — Create a subscription
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      name,
      sourceFilter,
      sourceIdPattern,
      typePattern,
      action,
      createdBy,
    } = body;

    if (!name || !typePattern || !action?.type) {
      return NextResponse.json(
        { error: 'Missing required fields: name, typePattern, action.type' },
        { status: 400 }
      );
    }

    const listener = getEventListener();
    const subscription = listener.subscribe({
      name,
      sourceFilter: sourceFilter as EventSource | undefined,
      sourceIdPattern,
      typePattern,
      action: {
        type: action.type as EventActionType,
        language: action.language,
        code: action.code,
        forwardUrl: action.forwardUrl,
        messageTemplate: action.messageTemplate,
        messagePriority: action.messagePriority,
      },
      createdBy,
    });

    return NextResponse.json({
      created: true,
      subscription,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}

// DELETE — Remove a subscription
export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Missing required parameter: id' },
      { status: 400 }
    );
  }

  const listener = getEventListener();
  const removed = listener.unsubscribe(id);

  return NextResponse.json({ removed });
}

// GET — List subscriptions
export async function GET() {
  const listener = getEventListener();
  return NextResponse.json({
    subscriptions: listener.getSubscriptions(),
    stats: listener.getStats(),
  });
}
