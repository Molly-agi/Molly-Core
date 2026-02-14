/**
 * @fileOverview API endpoint to fetch current session state
 */

import { NextResponse } from 'next/server';
import { loadSessionState } from '@/lib/session-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = loadSessionState();
    return NextResponse.json({ success: true, state }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load session state',
      },
      { status: 500 }
    );
  }
}
