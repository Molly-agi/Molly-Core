/**
 * @fileOverview API endpoint to record session runtime events
 */

import { NextRequest, NextResponse } from 'next/server';
import { appendSessionEvent } from '@/lib/session-manager';
import { MollyLogger } from '@/ai/logger';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      event?: string;
      url?: string;
      details?: string;
      timestamp?: string;
    };

    if (!body.event) {
      return NextResponse.json(
        { success: false, error: 'Missing event name' },
        { status: 400 }
      );
    }

    appendSessionEvent({
      event: body.event,
      url: body.url,
      details: body.details,
      timestamp: body.timestamp || new Date().toISOString(),
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    MollyLogger.error(
      'Session event recording failed',
      'session-event-api',
      {},
      error
    );
    return NextResponse.json(
      { success: false, error: 'Failed to record session event' },
      { status: 500 }
    );
  }
}
