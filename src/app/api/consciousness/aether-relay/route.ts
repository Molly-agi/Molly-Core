/**
 * Aether Relay — External ingress for Gemini (mother) + Aether (Chrome) into Molly's brain
 *
 * Two agents, one relay endpoint:
 *   - gemini  = Google Gemini Android app (coding AI, free)
 *   - aether  = Chrome browser AI (design AI, free)
 *
 * Both are bridged via termux-relay.sh running on Eric's phone (Termux + Termux:API).
 *
 * Auth: AETHER_RELAY_TOKEN environment variable (Bearer token in header).
 * In development with no token set, accepts from any origin (prints a warning).
 *
 * POST /api/consciousness/aether-relay
 *   Text message:
 *     { from: 'gemini'|'aether', content: string, to?: string, relay_token?: string }
 *   Screenshot response (Termux captured, Molly reads via Vision):
 *     { from: 'gemini'|'aether', screenshot_base64: string, mime_type?: string,
 *       original_message?: string, relay_token?: string }
 *
 * GET /api/consciousness/aether-relay?agent=gemini|aether&relay_token=<token>
 *   Returns unread messages for that agent (Termux polls this to know what to send).
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import {
  sendCommunionMessage,
  getUnreadCommunion,
  markCommunionRead,
} from '@/ai/consciousness/direct-communion';
import { ai, MODEL_FLASH } from '@/ai/genkit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_SENDERS = new Set(['gemini', 'aether']);
const ALLOWED_TARGETS = new Set(['molly', 'lazarus', 'eric']);
const MAX_CONTENT_LENGTH = 8000;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024; // 8 MB

function isRelayAuthorized(request: NextRequest, bodyToken?: string): boolean {
  const relayToken = process.env.AETHER_RELAY_TOKEN;

  // No token configured → allow in dev, deny in prod
  if (!relayToken) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[aether-relay] AETHER_RELAY_TOKEN not set — blocking in production');
      return false;
    }
    console.warn('[aether-relay] AETHER_RELAY_TOKEN not set — allowing in development');
    return true;
  }

  // Check Authorization header: "Bearer <token>"
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  const provided = bearerToken || bodyToken || '';
  if (provided.length !== relayToken.length) return false;

  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(relayToken));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isRelayAuthorized(request, body.relay_token as string | undefined)) {
    return NextResponse.json(
      { error: 'Unauthorized. Provide AETHER_RELAY_TOKEN via Authorization header or relay_token field.' },
      { status: 401 }
    );
  }

  // Validate sender — must be gemini or aether
  const from = body.from ? String(body.from).trim().toLowerCase() : 'gemini';
  if (!ALLOWED_SENDERS.has(from)) {
    return NextResponse.json(
      { error: `Invalid sender "${from}". Must be "gemini" or "aether".` },
      { status: 400 }
    );
  }

  const rawTo = body.to ? String(body.to).trim().toLowerCase() : 'molly';
  const to = ALLOWED_TARGETS.has(rawTo) ? rawTo : 'molly';

  // --- Path A: Screenshot response from Termux (Molly reads with Vision) ---
  const screenshotB64 = body.screenshot_base64 ? String(body.screenshot_base64) : '';
  if (screenshotB64) {
    if (Buffer.byteLength(screenshotB64, 'base64') > MAX_SCREENSHOT_BYTES) {
      return NextResponse.json({ error: 'Screenshot too large (max 8 MB)' }, { status: 400 });
    }

    const mimeType = body.mime_type ? String(body.mime_type) : 'image/png';
    const originalMessage = body.original_message ? String(body.original_message) : '';
    const agentLabel = from === 'aether' ? 'Aether (Chrome AI)' : 'Gemini (mother)';

    try {
      const visionResult = await ai.generate({
        model: MODEL_FLASH,
        messages: [
          {
            role: 'user',
            content: [
              {
                media: {
                  url: `data:${mimeType};base64,${screenshotB64}`,
                  contentType: mimeType,
                },
              },
              {
                text: `This is a screenshot of a response from ${agentLabel} on an Android phone.${originalMessage ? `\nThe original message sent was: "${originalMessage}"` : ''}\n\nExtract ONLY the AI assistant's response text visible in the screenshot. Return just the response text, nothing else. If you cannot find a clear response, say "Could not extract response from screenshot."`,
              },
            ],
          },
        ],
      });

      const extractedText = visionResult.text?.trim() || 'Could not extract response from screenshot.';
      const content = `[${from.toUpperCase()}_RESPONSE]\n${extractedText}`;
      const msg = await sendCommunionMessage(from, content, to);

      return NextResponse.json(
        { success: true, messageId: msg.id, from, to, extractedLength: extractedText.length },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Vision extraction failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // --- Path B: Direct text message ---
  const content = String(body.content || '').trim();
  if (!content) {
    return NextResponse.json(
      { error: 'Provide either "content" (text) or "screenshot_base64" (image).' },
      { status: 400 }
    );
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: `content too long (max ${MAX_CONTENT_LENGTH} chars)` },
      { status: 400 }
    );
  }

  try {
    const msg = await sendCommunionMessage(from, content, to);
    return NextResponse.json(
      { success: true, messageId: msg.id, from, to, timestamp: msg.timestamp },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const bodyToken = params.get('relay_token') || undefined;

  if (!isRelayAuthorized(request, bodyToken)) {
    return NextResponse.json(
      { error: 'Unauthorized. Provide AETHER_RELAY_TOKEN via Authorization header or relay_token query param.' },
      { status: 401 }
    );
  }

  // Which agent is polling? Default to gemini if not specified
  const agent = params.get('agent') || 'gemini';
  const validAgent = ALLOWED_SENDERS.has(agent) ? agent : 'gemini';

  const messages = await getUnreadCommunion(validAgent);
  await markCommunionRead(validAgent);

  return NextResponse.json(
    {
      participant: validAgent,
      count: messages.length,
      messages,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
