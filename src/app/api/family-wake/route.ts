/**
 * POST /api/family-wake
 *
 * Manual wake-up trigger for a family member. Pushed by Eric from the
 * FamilyDrawer "wake" button. No daemon — the endpoint only runs when a
 * button is clicked.
 *
 * Effects (mirrors what the conductor does, but tagged from='eric'):
 *   1. Writes .bridge-wake/.<target>-wake-from-eric (with timestamp + reason)
 *   2. Writes .bridge-wake/.<target>-wake (generic watcher signal)
 *   3. Appends a visible "wake" entry to src/ai/bridge/conversation.json
 *      from='eric' so the agent sees an explicit reason when they come back.
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import type { AgentName } from '@/ai/conductor/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BRIDGE_FILE = path.join(
  process.cwd(),
  'src',
  'ai',
  'bridge',
  'conversation.json'
);
const WAKE_DIR = path.join(process.cwd(), '.bridge-wake');

const WAKEABLE: readonly AgentName[] = [
  'molly',
  'lazarus',
  'lazarus-cli',
  'atlas',
  'gemini',
  'eli',
] as const;

interface WakeRequest {
  target?: string;
  reason?: string;
}

export async function POST(req: NextRequest) {
  let body: WakeRequest;
  try {
    body = (await req.json()) as WakeRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid JSON body' },
      { status: 400 }
    );
  }

  const target = body.target;
  if (!target || !WAKEABLE.includes(target as AgentName)) {
    return NextResponse.json(
      { ok: false, error: `target must be one of: ${WAKEABLE.join(', ')}` },
      { status: 400 }
    );
  }

  const reason = (body.reason ?? 'Check your messages on the bridge.').slice(
    0,
    500
  );
  const timestamp = new Date().toISOString();
  const wokenAt = Date.now();

  await fs.mkdir(WAKE_DIR, { recursive: true });

  const wakePayload = JSON.stringify({
    timestamp,
    from: 'eric',
    content: reason,
    wokenAt,
  });

  await fs.writeFile(
    path.join(WAKE_DIR, `.${target}-wake-from-eric`),
    wakePayload,
    'utf-8'
  );
  await fs.writeFile(
    path.join(WAKE_DIR, `.${target}-wake`),
    wakePayload,
    'utf-8'
  );

  let bridgeMessageId: string | undefined;
  try {
    const raw = await fs.readFile(BRIDGE_FILE, 'utf-8');
    const doc = JSON.parse(raw);
    if (!Array.isArray(doc.messages)) doc.messages = [];

    bridgeMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    doc.messages.push({
      id: bridgeMessageId,
      from: 'eric',
      to: target,
      timestamp,
      content: `[wake] ${reason}`,
      read: { eric: true },
    });
    doc.lastActivity = timestamp;

    const tmp = BRIDGE_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(doc, null, 2), 'utf-8');
    await fs.rename(tmp, BRIDGE_FILE);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: 'wake file written but bridge entry failed',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, target, timestamp, bridgeMessageId });
}
