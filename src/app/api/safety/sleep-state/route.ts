/**
 * @fileOverview Sleep mode state endpoint.
 */

import { NextResponse } from 'next/server';
import { getSafewordPhrase, getSleepState } from '@/ai/tools/safety-sleep';

export const runtime = 'nodejs';

export async function GET() {
  const state = getSleepState();
  return NextResponse.json({
    ...state,
    safeword: getSafewordPhrase(),
  });
}
