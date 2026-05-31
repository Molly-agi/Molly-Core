/**
 * Live voice debug logging endpoint
 * Receives debug logs from browser and prints to server console
 */

import { appendFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { level = 'log', message, data } = await request.json();

    // Print to server console (visible in npm run dev terminal)
    const output = data ? `${message} ${JSON.stringify(data)}` : message;
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level.toUpperCase()}] ${output}`;
    console.log(`\n[LIVE-VOICE-DEBUG] ${line}`);

    // Persist to file so mobile-only sessions can be debugged reliably.
    await appendFile('/tmp/live-voice-debug.log', `${line}\n`, 'utf8');

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to log' }, { status: 400 });
  }
}
