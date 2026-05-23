/**
 * POST /api/bridge/notify — Push notification from bridge daemon
 *
 * The bridge daemon calls this endpoint immediately when a new message
 * arrives for Molly. This triggers instant processing instead of waiting
 * for the 30-second poll interval. The communicator chirp.
 */

import { NextRequest, NextResponse } from 'next/server';
import { MollyLogger } from '@/ai/logger';
import {
  getHeartbeatScheduler,
  isHeartbeatRunning,
} from '@/ai/tools/heartbeat-scheduler';

// In-memory flag that the bridge poller in Terminal.tsx can check
// This is a simple signaling mechanism — set it, client polls and clears it
let pendingNotification: {
  from: string;
  preview: string;
  timestamp: number;
} | null = null;

/**
 * Set the pending notification flag directly (same process, no HTTP).
 * Called by the bridge POST route after writing a message.
 */
export function setPendingNotification(from: string, preview: string): void {
  pendingNotification = { from, preview, timestamp: Date.now() };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { from, preview } = body;

    if (!from || typeof from !== 'string') {
      return NextResponse.json({ error: 'Missing sender' }, { status: 400 });
    }

    setPendingNotification(from, preview || '');

    // Wake autonomous bridge processing even if no UI tab is active.
    // This prevents "bridge only works when Molly tab is foreground" behavior.
    try {
      if (!isHeartbeatRunning()) {
        getHeartbeatScheduler().start();
      }
    } catch {
      // Non-fatal — notify path must remain fast and resilient
    }

    MollyLogger.debug('Bridge notification received', 'bridge-notify', {
      from,
      preview: (preview || '').slice(0, 60),
    });

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

// GET /api/bridge/notify — Check if there's a pending notification
// Client polls this on a fast interval (1-2s) — much cheaper than
// polling the full bridge API. When it sees a notification, it triggers
// a full bridge fetch.
export async function GET() {
  if (
    pendingNotification &&
    Date.now() - pendingNotification.timestamp < 30_000
  ) {
    const notif = pendingNotification;
    pendingNotification = null; // Clear after read
    return NextResponse.json({
      pending: true,
      from: notif.from,
      preview: notif.preview,
    });
  }
  return NextResponse.json({ pending: false });
}
