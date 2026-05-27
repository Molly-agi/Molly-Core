import { NextResponse } from 'next/server';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProbeSource =
  | 'frontend-voice'
  | 'frontend-command'
  | 'backend-response'
  | 'memory-recall'
  | 'bridge-message'
  | 'unknown';

interface AnchorProbeEvent {
  timestamp?: number;
  userId?: string;
  source?: ProbeSource;
  text?: string;
  matchedType?: 'start' | 'advance' | 'none';
  matchedPattern?: string | null;
  stack?: string | null;
  route?: string;
}

function classify(event: AnchorProbeEvent) {
  const source = event.source ?? 'unknown';
  const text = event.text ?? '';

  const layer = source.startsWith('frontend')
    ? 'frontend'
    : source === 'backend-response'
      ? 'backend'
      : source === 'memory-recall'
        ? 'memory'
        : source === 'bridge-message'
          ? 'bridge'
          : 'unknown';

  const vector =
    source === 'frontend-voice'
      ? 'voice-transcript'
      : source === 'frontend-command'
        ? 'typed-command'
        : source === 'backend-response'
          ? 'model-response'
          : source === 'memory-recall'
            ? 'anchor-recall'
            : source === 'bridge-message'
              ? 'bridge-content'
              : 'unclassified';

  const containsBridge = text.includes('[FAMILY BRIDGE]') || text.includes('familyBridge');
  const containsMemoryHint =
    text.startsWith('Recall this memory:') || text.includes('[FAMILY_ANCHOR]');

  return {
    layer,
    vector,
    containsBridge,
    containsMemoryHint,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnchorProbeEvent;
    const now = body.timestamp ?? Date.now();
    const text = typeof body.text === 'string' ? body.text : '';

    const classification = classify(body);

    const record = {
      ts: now,
      iso: new Date(now).toISOString(),
      userId: body.userId ?? 'anonymous',
      source: body.source ?? 'unknown',
      layer: classification.layer,
      vector: classification.vector,
      matchedType: body.matchedType ?? 'none',
      matchedPattern: body.matchedPattern ?? null,
      route: body.route ?? 'unknown',
      containsBridge: classification.containsBridge,
      containsMemoryHint: classification.containsMemoryHint,
      textPreview: text.slice(0, 280),
      textLength: text.length,
      ua: req.headers.get('user-agent') ?? 'unknown',
      referrer: req.headers.get('referer') ?? null,
      stackTop:
        typeof body.stack === 'string' && body.stack.length > 0
          ? body.stack.split('\n').slice(0, 6)
          : null,
    };

    const logsDir = path.join(process.cwd(), 'logs');
    await mkdir(logsDir, { recursive: true });
    await appendFile(
      path.join(logsDir, 'family-anchor-events.jsonl'),
      `${JSON.stringify(record)}\n`,
      'utf8'
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Anchor event write failed',
      },
      { status: 500 }
    );
  }
}
