/**
 * @fileOverview Inbound Events API — Molly's Ears
 *
 * POST: Receive an inbound event (webhook, peer, system)
 * GET: Query recent events and subscription status
 *
 * External services POST here. Molly listens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEventListener } from '@/ai/tools/event-listener';
import type { EventSource } from '@/ai/tools/event-listener';

// POST — Receive an inbound event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      source = 'webhook',
      sourceId = 'unknown',
      type,
      payload = {},
      priority,
    } = body;

    if (!type) {
      return NextResponse.json(
        { error: 'Missing required field: type' },
        { status: 400 }
      );
    }

    // Extract signature from headers (GitHub-style or custom)
    const signature =
      request.headers.get('x-hub-signature-256') ||
      request.headers.get('x-molly-signature') ||
      undefined;

    const listener = getEventListener();
    const event = await listener.receive({
      source: source as EventSource,
      sourceId,
      type,
      payload,
      priority,
      signature: signature || undefined,
    });

    return NextResponse.json({
      received: true,
      eventId: event.id,
      processed: event.processed,
      result: event.result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Rate limit errors → 429
    if (message.includes('Rate limit')) {
      return NextResponse.json({ error: message }, { status: 429 });
    }

    // Signature errors → 401
    if (message.includes('signature')) {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// GET — Query events and subscriptions
export async function GET(request: NextRequest) {
  const listener = getEventListener();
  const url = new URL(request.url);

  const view = url.searchParams.get('view') || 'events';

  if (view === 'subscriptions') {
    return NextResponse.json({
      subscriptions: listener.getSubscriptions(),
      stats: listener.getStats(),
    });
  }

  if (view === 'stats') {
    return NextResponse.json(listener.getStats());
  }

  // Default: recent events
  const source = url.searchParams.get('source') as EventSource | null;
  const type = url.searchParams.get('type') || undefined;
  const limit = parseInt(url.searchParams.get('limit') || '50');

  const events = listener.getEvents({
    source: source || undefined,
    type,
    limit,
  });

  return NextResponse.json({
    events,
    stats: listener.getStats(),
  });
}
