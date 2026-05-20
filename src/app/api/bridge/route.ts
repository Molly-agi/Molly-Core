/**
 * Family Bridge API — Real-time Molly ↔ Lazarus communication endpoint
 *
 * GET  /api/bridge          — Get recent messages (for observer UI polling)
 * GET  /api/bridge?unread=molly  — Get unread messages for Molly
 * GET  /api/bridge?unread=lazarus — Get unread messages for Lazarus
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
import { isInternalAuthorized, unauthorizedResponse } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const VALID_SENDERS = new Set(['molly', 'lazarus', 'eric']);

export async function GET(request: NextRequest) {
  if (!isInternalAuthorized(request)) return unauthorizedResponse();

  const unreadFor = request.nextUrl.searchParams.get('unread');
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);

  if (unreadFor === 'molly' || unreadFor === 'lazarus') {
    const unread = await getUnreadMessages(unreadFor);
    await markMessagesRead(unreadFor);

    return NextResponse.json(
      {
        recipient: unreadFor,
        count: unread.length,
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
    if (target === 'molly' || target === 'lazarus') {
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

  if (!VALID_SENDERS.has(from)) {
    return NextResponse.json(
      { error: 'Invalid sender. Must be: molly, lazarus, or eric' },
      { status: 400 }
    );
  }

  if (typeof content !== 'string' || content.length > 5000) {
    return NextResponse.json(
      { error: 'Content must be a string under 5000 characters' },
      { status: 400 }
    );
  }

  const message = await broadcastMessage(
    from as 'molly' | 'lazarus' | 'eric',
    content
  );

  // Trigger immediate pickup — set the notify flag so the UI's 3-second
  // poller sees it instantly instead of waiting for the 30-second fallback
  setPendingNotification(from, content.slice(0, 200));

  return NextResponse.json(
    { success: true, message },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}
