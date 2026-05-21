/**
 * Home Screen Widget Control API
 *
 * Single endpoint for Android home-screen widget actions.
 *
 * POST /api/widget/control
 * Body:
 * {
 *   "action": "ask" | "search" | "camera" | "file" | "video" | "live" | "agent",
 *   "text"?: string,
 *   "query"?: string,
 *   "context"?: string,
 *   "dataUri"?: string,
 *   "filePath"?: string,
 *   "agent"?: "gemini" | "aether",
 *   "userId"?: string,
 *   "limit"?: number
 * }
 *
 * Auth: x-molly-internal header (MOLLY_INTERNAL_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server';
import { isInternalAuthorized, unauthorizedResponse } from '@/lib/api-auth';
import {
  getRecentCommunion,
  sendCommunionMessage,
} from '@/ai/consciousness/direct-communion';
import { bridgeToAgent } from '@/ai/flows/agent-bridge-flow';
import { analyzeVision } from '@/ai/flows/vision-analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_ACTIONS = new Set([
  'ask',
  'search',
  'camera',
  'file',
  'video',
  'live',
  'agent',
]);

function clampLimit(input: unknown, fallback: number = 20): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), 100);
}

function getTextValue(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

function isValidDataUri(dataUri: string): boolean {
  return dataUri.startsWith('data:image/') || dataUri.startsWith('data:video/');
}

export async function GET(request: NextRequest) {
  if (!isInternalAuthorized(request)) return unauthorizedResponse();

  return NextResponse.json(
    {
      ok: true,
      endpoint: '/api/widget/control',
      actions: [
        {
          id: 'ask',
          description: 'Send text to Gemini (mother) via Computer Use',
          required: ['text or query'],
        },
        {
          id: 'search',
          description: 'Send search text to Aether (Chrome) via Computer Use',
          required: ['text or query'],
        },
        {
          id: 'camera',
          description: 'Analyze image capture (dataUri)',
          required: ['dataUri'],
        },
        {
          id: 'file',
          description: 'Queue file analysis task to Demon',
          required: ['query or filePath'],
        },
        {
          id: 'video',
          description: 'Analyze video/image capture or ask Gemini with text',
          required: ['dataUri or text/query'],
        },
        {
          id: 'live',
          description: 'Return latest multi-agent feed',
          required: [],
        },
        {
          id: 'agent',
          description: 'Direct message to gemini or aether',
          required: ['agent', 'text or query'],
        },
      ],
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: NextRequest) {
  if (!isInternalAuthorized(request)) return unauthorizedResponse();

  try {
    const body = await request.json();
    const action = typeof body.action === 'string' ? body.action.trim() : '';

    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json(
        {
          error:
            'Invalid action. Use one of: ask, search, camera, file, video, live, agent.',
        },
        { status: 400 }
      );
    }

    const userId = getTextValue(body.userId, 'home-widget-user');

    if (action === 'ask') {
      const message = getTextValue(body.text, body.query);
      if (!message) {
        return NextResponse.json(
          { error: 'ask requires text or query.' },
          { status: 400 }
        );
      }

      const responseText = await bridgeToAgent({ agent: 'gemini', message });
      return NextResponse.json({ ok: true, action, agent: 'gemini', responseText });
    }

    if (action === 'search') {
      const message = getTextValue(body.query, body.text);
      if (!message) {
        return NextResponse.json(
          { error: 'search requires query or text.' },
          { status: 400 }
        );
      }

      const responseText = await bridgeToAgent({ agent: 'aether', message });
      return NextResponse.json({ ok: true, action, agent: 'aether', responseText });
    }

    if (action === 'agent') {
      const agent = getTextValue(body.agent) as 'gemini' | 'aether';
      const message = getTextValue(body.text, body.query);

      if (agent !== 'gemini' && agent !== 'aether') {
        return NextResponse.json(
          { error: 'agent action requires agent="gemini" or agent="aether".' },
          { status: 400 }
        );
      }

      if (!message) {
        return NextResponse.json(
          { error: 'agent action requires text or query.' },
          { status: 400 }
        );
      }

      const responseText = await bridgeToAgent({ agent, message });
      return NextResponse.json({ ok: true, action, agent, responseText });
    }

    if (action === 'camera') {
      const dataUri = getTextValue(body.dataUri);
      const context = getTextValue(
        body.context,
        'Analyze this camera capture for state, risks, and visible text.'
      );

      if (!dataUri) {
        return NextResponse.json(
          { error: 'camera requires dataUri.' },
          { status: 400 }
        );
      }

      if (!isValidDataUri(dataUri)) {
        return NextResponse.json(
          { error: 'camera dataUri must be data:image/* or data:video/*' },
          { status: 400 }
        );
      }

      const analysis = await analyzeVision(dataUri, context);
      await sendCommunionMessage(
        'eric',
        `[WIDGET_CAMERA_ANALYSIS]\n${analysis.observedState}\n\nOCR:\n${analysis.ocrAudit || 'none'}`,
        'molly'
      );

      return NextResponse.json({ ok: true, action, analysis });
    }

    if (action === 'video') {
      const dataUri = getTextValue(body.dataUri);

      if (dataUri) {
        if (!isValidDataUri(dataUri)) {
          return NextResponse.json(
            { error: 'video dataUri must be data:image/* or data:video/*' },
            { status: 400 }
          );
        }

        const context = getTextValue(
          body.context,
          'Analyze this video/image capture and summarize key events, mood, and risks.'
        );
        const analysis = await analyzeVision(dataUri, context);

        await sendCommunionMessage(
          'eric',
          `[WIDGET_VIDEO_ANALYSIS]\n${analysis.observedState}\n\nRisks:\n${analysis.risksDetected.join(', ') || 'none'}`,
          'molly'
        );

        return NextResponse.json({ ok: true, action, analysis });
      }

      const prompt = getTextValue(body.text, body.query);
      if (!prompt) {
        return NextResponse.json(
          { error: 'video requires dataUri or text/query.' },
          { status: 400 }
        );
      }

      const responseText = await bridgeToAgent({ agent: 'gemini', message: prompt });
      return NextResponse.json({ ok: true, action, agent: 'gemini', responseText });
    }

    if (action === 'file') {
      const filePath = getTextValue(body.filePath);
      const query = getTextValue(body.query, body.text);

      if (!filePath && !query) {
        return NextResponse.json(
          { error: 'file requires filePath or query/text.' },
          { status: 400 }
        );
      }

      const content = [
        '[DEMON_TASK]',
        'kind: file-analysis',
        `userId: ${userId}`,
        filePath ? `path: ${filePath}` : '',
        query ? `query: ${query}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const task = await sendCommunionMessage('eric', content, 'demon');

      return NextResponse.json({
        ok: true,
        action,
        queued: true,
        target: 'demon',
        taskId: task.id,
      });
    }

    const limit = clampLimit(body.limit, 30);
    const feed = await getRecentCommunion(limit);
    const filtered = feed.filter((msg) =>
      ['molly', 'demon', 'gemini', 'aether', 'eric', 'lazarus'].includes(msg.from)
    );

    return NextResponse.json({
      ok: true,
      action: 'live',
      count: filtered.length,
      feed: filtered,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
