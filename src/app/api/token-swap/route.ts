import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const ENV_FILE = path.join(process.cwd(), '.env.local');

/**
 * POST /api/admin/swap-token
 * Hot-swap the Gemini API token without a full server restart.
 *
 * Body: { token: "AQ.Ab8..." }
 *
 * 1. Validates the token against the live Gemini API
 * 2. Updates process.env in-memory immediately
 * 3. Writes the new token to .env.local for persistence
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token: string = (body?.token || '').trim();

    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 400 });
    }

    // Validate against the live API before committing
    const testRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': token,
        },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!testRes.ok) {
      const err = await testRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: 'Token rejected by Gemini API',
          code: testRes.status,
          detail: (err as Record<string, unknown>)?.error,
        },
        { status: 400 }
      );
    }

    // Token is valid — swap GEMINI_API_KEY in-memory immediately.
    // We target GEMINI_API_KEY (not GOOGLE_GENAI_API_KEY) because
    // GOOGLE_GENAI_API_KEY is a Codespace secret and cannot be overridden.
    process.env.GEMINI_API_KEY = token;

    // Persist to .env.local
    let envContent = await fs.readFile(ENV_FILE, 'utf8').catch(() => '');

    if (envContent.match(/^GEMINI_API_KEY=/m)) {
      envContent = envContent.replace(
        /^GEMINI_API_KEY=.*/m,
        `GEMINI_API_KEY=${token}`
      );
    } else {
      envContent = `GEMINI_API_KEY=${token}\n` + envContent;
    }

    await fs.writeFile(ENV_FILE, envContent, 'utf8');

    return NextResponse.json({
      ok: true,
      message: 'Token swapped. Molly is online.',
      tokenPrefix: token.slice(0, 12) + '...',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/swap-token
 * Check current token health.
 */
export async function GET() {
  const token =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || '';

  if (!token) {
    return NextResponse.json({ status: 'NO_TOKEN' });
  }

  try {
    const testRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': token,
        },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (testRes.ok) {
      return NextResponse.json({
        status: 'OK',
        tokenPrefix: token.slice(0, 12) + '...',
        isOAuthToken: token.startsWith('AQ.'),
      });
    }

    const err = await testRes.json().catch(() => ({}));
    return NextResponse.json({
      status: 'DEAD',
      code: testRes.status,
      detail: (err as Record<string, unknown>)?.error,
      tokenPrefix: token.slice(0, 12) + '...',
    });
  } catch (err) {
    return NextResponse.json({
      status: 'ERROR',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
