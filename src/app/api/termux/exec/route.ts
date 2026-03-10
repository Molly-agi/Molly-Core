/**
 * @fileOverview Termux Bridge API Route
 *
 * Proxies command execution from Molly's server-side flows to the
 * Termux relay running on the user's device. The browser passes
 * the relay URL (since only the browser knows the local network),
 * and this route forwards the command.
 *
 * POST /api/termux/exec
 * Body: { command, language?, relayUrl?, timeout? }
 *
 * GET /api/termux/status
 * Query: ?relayUrl=...
 *
 * Protected by internal auth (MOLLY_INTERNAL_SECRET).
 * relayUrl restricted to localhost to prevent SSRF.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isInternalAuthorized, unauthorizedResponse } from '@/lib/api-auth';

const DEFAULT_RELAY_URL = 'http://localhost:8023';

/** Only allow relayUrl pointing to localhost to prevent SSRF */
function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0'
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isInternalAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const {
      command,
      language = 'shell',
      relayUrl = DEFAULT_RELAY_URL,
      token = process.env.MOLLY_RELAY_TOKEN || '',
      timeout = 30,
    } = body;

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { error: 'No command provided' },
        { status: 400 }
      );
    }

    if (!isLocalhostUrl(relayUrl)) {
      return NextResponse.json(
        { error: 'relayUrl must point to localhost' },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      (timeout + 5) * 1000
    );

    const response = await fetch(`${relayUrl}/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ command, language, timeout }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = await response.json();
    return NextResponse.json(result, { status: response.status });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return NextResponse.json(
        {
          stdout: '',
          stderr: 'Termux relay timed out',
          exitCode: 124,
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        stdout: '',
        stderr:
          error instanceof Error
            ? `Cannot reach Termux relay: ${error.message}`
            : 'Cannot reach Termux relay',
        exitCode: 1,
      },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!isInternalAuthorized(request)) {
    return unauthorizedResponse();
  }

  const relayUrl =
    request.nextUrl.searchParams.get('relayUrl') || DEFAULT_RELAY_URL;

  if (!isLocalhostUrl(relayUrl)) {
    return NextResponse.json(
      { error: 'relayUrl must point to localhost' },
      { status: 400 }
    );
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${relayUrl}/ping`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json({ connected: false }, { status: 200 });
    }

    const data = await response.json();
    return NextResponse.json(
      {
        connected: data.relay === 'molly-termux',
        ...data,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ connected: false }, { status: 200 });
  }
}
