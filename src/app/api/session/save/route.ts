/**
 * @fileOverview API endpoint to save session state
 * Called explicitly by the client before unload to ensure state is persisted
 */

import { saveSessionState } from '@/lib/session-manager';
import { MollyLogger } from '@/ai/logger';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Save the session state provided by client
    if (body.state) {
      saveSessionState(body.state);
    } else {
      // If no state provided, just touch the file to update timestamp
      saveSessionState({
        lastUpdated: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { success: true, message: 'Session saved' },
      { status: 200 }
    );
  } catch (error) {
    MollyLogger.error('Session save failed', 'session-save-api', {}, error);
    return NextResponse.json(
      { success: false, error: 'Failed to save session' },
      { status: 500 }
    );
  }
}
