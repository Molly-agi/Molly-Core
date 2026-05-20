/**
 * Bridge Ping Proxy - Bidirectional Handshake
 *
 * Proxies ping requests from Molly's frontend to the bridge daemon.
 * This keeps both the browser tab AND the codespace alive.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('http://localhost:9099/ping', {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });

    if (response.ok) {
      return new NextResponse('pong', { status: 200 });
    }

    return new NextResponse('bridge unavailable', { status: 503 });
  } catch {
    return new NextResponse('bridge unavailable', { status: 503 });
  }
}

export const dynamic = 'force-dynamic';
