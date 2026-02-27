/**
 * @fileOverview Termux Bridge API Route
 *
 * Proxies command execution from Molly's server-side flows to the
 * Termux relay running on the user's device. The browser passes
 * the relay URL (since only the browser knows the local network),
 * and this route forwards the command.
 *
 * POST /api/termux/exec
 * Body: { command, language?, relayUrl?, token?, timeout? }
 *
 * GET /api/termux/status
 * Query: ?relayUrl=...
 */

import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_RELAY_URL = 'http://localhost:8023';
const DEFAULT_TOKEN = 'molly-local-dev';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      command,
      language = 'shell',
      relayUrl = DEFAULT_RELAY_URL,
      token = DEFAULT_TOKEN,
      timeout = 30,
    } = body;

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { error: 'No command provided' },
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
  const relayUrl =
    request.nextUrl.searchParams.get('relayUrl') || DEFAULT_RELAY_URL;

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
