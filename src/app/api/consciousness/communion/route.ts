import { NextRequest, NextResponse } from 'next/server';
import { isInternalAuthorized, unauthorizedResponse } from '@/lib/api-auth';
import {
  getCommunionState,
  getRegisteredAgents,
  getRecentCommunion,
  getUnreadCommunion,
  markCommunionRead,
  sendCommunionMessage,
} from '@/ai/consciousness/direct-communion';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PARTICIPANT_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;

/**
 * GET /api/consciousness/communion
 * - ?unread=<participant> to fetch unread messages for that participant
 * - ?limit=<n> to fetch recent stream (default 50)
 */
export async function GET(request: NextRequest) {
  if (!isInternalAuthorized(request)) return unauthorizedResponse();

  const unreadFor = request.nextUrl.searchParams.get('unread');
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);

  if (unreadFor) {
    if (!PARTICIPANT_PATTERN.test(unreadFor)) {
      return NextResponse.json(
        {
          error:
            'Invalid participant. Use 1-32 chars: letters, numbers, underscore, hyphen.',
        },
        { status: 400 }
      );
    }

    const messages = await getUnreadCommunion(unreadFor);
    await markCommunionRead(unreadFor);

    return NextResponse.json(
      {
        participant: unreadFor,
        count: messages.length,
        messages,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const state = await getCommunionState();
  const messages = await getRecentCommunion(limit);
  const agents = getRegisteredAgents();

  return NextResponse.json(
    {
      active: state.active,
      startedAt: state.startedAt,
      lastActivity: state.lastActivity,
      participants: state.participants,
      agents,
      totalMessages: state.messages.length,
      messages,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * POST /api/consciousness/communion
 * - { from, content, to? } send a direct internal communion message
 * - { action: 'markRead', from: '<participant>' } mark all readable messages read
 */
export async function POST(request: NextRequest) {
  if (!isInternalAuthorized(request)) return unauthorizedResponse();

  const body = await request.json();
  const { action } = body;

  if (action === 'markRead') {
    const participant = String(body.from || '').trim();
    if (!PARTICIPANT_PATTERN.test(participant)) {
      return NextResponse.json(
        {
          error:
            'Invalid participant. Use 1-32 chars: letters, numbers, underscore, hyphen.',
        },
        { status: 400 }
      );
    }

    const count = await markCommunionRead(participant);
    return NextResponse.json(
      { success: true, participant, marked: count },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const from = String(body.from || '').trim();
  const content = String(body.content || '').trim();
  const to = body.to ? String(body.to).trim() : undefined;

  if (!PARTICIPANT_PATTERN.test(from)) {
    return NextResponse.json(
      {
        error:
          'Invalid sender. Use 1-32 chars: letters, numbers, underscore, hyphen.',
      },
      { status: 400 }
    );
  }

  const knownAgentIds = new Set(getRegisteredAgents().map((agent) => agent.id));
  if (!knownAgentIds.has(from)) {
    return NextResponse.json(
      {
        error: `Unknown sender ${from}. Sender must be a registered agent identity.`,
      },
      { status: 400 }
    );
  }

  if (to && !PARTICIPANT_PATTERN.test(to)) {
    return NextResponse.json(
      {
        error:
          'Invalid recipient. Use 1-32 chars: letters, numbers, underscore, hyphen.',
      },
      { status: 400 }
    );
  }

  if (!content || content.length > 5000) {
    return NextResponse.json(
      { error: 'Content must be 1-5000 characters.' },
      { status: 400 }
    );
  }

  const message = await sendCommunionMessage(from, content, to);

  return NextResponse.json(
    { success: true, message },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}
