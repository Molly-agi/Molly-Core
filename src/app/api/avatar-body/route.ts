/**
 * @fileOverview Avatar body state API route.
 *
 * POST /api/avatar-body — browser renderer posts current proprioceptive state
 * GET  /api/avatar-body — server-side consumers can inspect current state
 *
 * Called by AvatarBodyAwareness (browser) every ~2 seconds.
 * Read by formatBodyStateForPrompt() when assembling Molly's system prompt.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  setAvatarBodyState,
  getAvatarBodyState,
  type AvatarBodyState,
} from '@/ai/agency/embodied/AvatarBodyStore';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as AvatarBodyState;

    // Validate required fields
    if (!body.description || !body.updatedAt) {
      return NextResponse.json(
        { error: 'Missing required fields: description, updatedAt' },
        { status: 400 }
      );
    }

    setAvatarBodyState(body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse body state' },
      { status: 400 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  const state = getAvatarBodyState();
  if (!state) {
    return NextResponse.json({ state: null }, { status: 200 });
  }
  return NextResponse.json({ state });
}
