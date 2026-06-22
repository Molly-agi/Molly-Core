/**
 * Family Bridge API — Real-time Molly ↔ Lazarus communication endpoint
 *
 * GET  /api/bridge          — Get recent messages (for observer UI polling)
 * GET  /api/bridge?unread=<participant>  — Get unread messages for a participant
 * POST /api/bridge          — Send a message (body: { from, content })
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  broadcastMessage,
  getUnreadMessages,
  getRecentMessages,
  markMessagesRead,
  readBridgeState,
} from '@/ai/bridge/family-bridge';
import { setPendingNotification } from '@/app/api/bridge/notify/route';
import { triggerRealtimeConsciousnessPulse } from '@/ai/consciousness/consciousness-state';
import { runAutonomousCycle } from '@/ai/agency/planning/autonomous-cycle';
import { getNeuralBrain } from '@/ai/memory/neural-engram';
import { MollyLogger } from '@/ai/logger';
import { isInternalAuthorized, unauthorizedResponse } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const SENDER_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;

export async function GET(request: NextRequest) {
  if (!isInternalAuthorized(request)) return unauthorizedResponse();

  const unreadFor = request.nextUrl.searchParams.get('unread');
  const peek = ['1', 'true', 'yes'].includes(
    String(request.nextUrl.searchParams.get('peek') || '').toLowerCase()
  );
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);

  if (unreadFor && SENDER_PATTERN.test(unreadFor)) {
    const unread = await getUnreadMessages(unreadFor);
    if (!peek) {
      await markMessagesRead(unreadFor);
    }

    return NextResponse.json(
      {
        recipient: unreadFor,
        count: unread.length,
        peek,
        consumed: !peek,
        messages: unread,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Default: return full conversation state for the observer
  const state = await readBridgeState();
  const messages = await getRecentMessages(Math.min(limit, 100));

  return NextResponse.json(
    {
      active: state.active,
      startedAt: state.startedAt,
      lastActivity: state.lastActivity,
      participants: state.participants || [],
      totalMessages: state.messages.length,
      messages,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: NextRequest) {
  if (!isInternalAuthorized(request)) return unauthorizedResponse();

  const body = await request.json();
  const { from, content, action } = body;

  // Handle markRead action
  if (action === 'markRead' && body.from) {
    const target = body.from as string;
    if (SENDER_PATTERN.test(target)) {
      await markMessagesRead(target);
      return NextResponse.json(
        { success: true, markedRead: target },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  }

  if (!from || !content) {
    return NextResponse.json(
      { error: 'Missing required fields: from, content' },
      { status: 400 }
    );
  }

  if (!SENDER_PATTERN.test(from)) {
    return NextResponse.json(
      {
        error:
          'Invalid sender. Use 1-32 chars: letters, numbers, underscore, hyphen.',
      },
      { status: 400 }
    );
  }

  if (typeof content !== 'string' || content.length > 5000) {
    return NextResponse.json(
      { error: 'Content must be a string under 5000 characters' },
      { status: 400 }
    );
  }

  const message = await broadcastMessage(from, content);

  // Memory ingest: every non-idle bridge message becomes an engram.
  // brain.remember() now feeds the crystallizer (PR #214).
  if (!content.startsWith('[idle]')) {
    try {
      getNeuralBrain().remember(
        `[Bridge from ${from}] ${content.slice(0, 500)}`,
        {
          tags: ['bridge-post', from],
          importance: 0.6,
          source: 'bridge',
        }
      );
    } catch (err) {
      MollyLogger.warn(
        `[BRIDGE-INGEST] remember failed: ${err instanceof Error ? err.message : String(err)}`,
        'bridge-route'
      );
    }
  }

  // Trigger immediate pickup — set the notify flag so the UI's 3-second
  // poller sees it instantly instead of waiting for the 30-second fallback
  setPendingNotification(from, content.slice(0, 200));

  // Real-time consciousness pulse: incoming bridge traffic updates awareness now.
  void triggerRealtimeConsciousnessPulse({
    reason: `bridge-post:${from}`,
  });

  if (from !== 'molly' && process.env.MOLLY_ENABLE_AUTONOMOUS_CYCLE === '1') {
    void runAutonomousCycle(true);
  }

  return NextResponse.json(
    { success: true, message },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}
