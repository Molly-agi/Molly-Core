/**
 * @fileOverview Client error logger (in-memory) for hands-free diagnostics.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type ClientErrorPayload = {
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  column?: number;
  url?: string;
  userAgent?: string;
  timestamp?: string;
};

const ERROR_BUFFER: ClientErrorPayload[] = [];
const MAX_ERRORS = 20;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ClientErrorPayload;
    const entry: ClientErrorPayload = {
      ...body,
      timestamp: body.timestamp || new Date().toISOString(),
    };

    ERROR_BUFFER.push(entry);
    if (ERROR_BUFFER.length > MAX_ERRORS) {
      ERROR_BUFFER.shift();
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    count: ERROR_BUFFER.length,
    errors: ERROR_BUFFER,
  });
}
