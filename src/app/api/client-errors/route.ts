/**
 * @fileOverview Client error logger (in-memory) for hands-free diagnostics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { appendSessionEvent } from '@/lib/session-manager';
import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

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
const LOG_DIR = join(process.cwd(), '.molly-logs');
const ERROR_LOG_FILE = join(LOG_DIR, 'client-errors.jsonl');

function persistError(entry: ClientErrorPayload) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(ERROR_LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf-8');
  } catch {
    // Avoid throwing from the logging path.
  }
}

function readRecentErrors(limit: number): ClientErrorPayload[] {
  if (!existsSync(ERROR_LOG_FILE)) {
    return [];
  }

  try {
    const content = readFileSync(ERROR_LOG_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line) as ClientErrorPayload);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ClientErrorPayload;
    const timestamp = body.timestamp || new Date().toISOString();
    const entry: ClientErrorPayload = {
      ...body,
      timestamp,
    };

    ERROR_BUFFER.push(entry);
    if (ERROR_BUFFER.length > MAX_ERRORS) {
      ERROR_BUFFER.shift();
    }

    persistError(entry);
    try {
      const location = entry.line ? `:${entry.line}` : '';
      const column = entry.column ? `:${entry.column}` : '';
      const source = entry.source
        ? ` | ${entry.source}${location}${column}`
        : '';
      const details = `${entry.message}${source}`;
      appendSessionEvent({
        event: 'client-error',
        url: entry.url,
        details,
        timestamp,
      });
    } catch {
      // Avoid throwing from the logging path.
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
  const persistedErrors = readRecentErrors(MAX_ERRORS);
  return NextResponse.json({
    status: 'ok',
    count: ERROR_BUFFER.length + persistedErrors.length,
    errors: [...persistedErrors, ...ERROR_BUFFER].slice(-MAX_ERRORS),
  });
}
