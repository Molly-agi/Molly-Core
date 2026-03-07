/**
 * @fileOverview Moltbook API Route — Manage Molly's social presence
 *
 * GET  — Status (registered? reachable?)
 * POST — Register / trigger cycle
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMoltbookClient } from '@/ai/tools/moltbook-client';
import { runMoltbookCycle } from '@/ai/flows/moltbook-social';
import { MollyLogger } from '@/ai/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = getMoltbookClient();
  const registered = client.isRegistered();
  let reachable = false;

  try {
    reachable = await client.ping();
  } catch {
    // Moltbook unreachable
  }

  let profile = null;
  if (registered) {
    try {
      profile = await client.getProfile();
    } catch {
      // Profile fetch failed — might not be claimed yet
    }
  }

  return NextResponse.json({
    registered,
    reachable,
    profile,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as string;

    switch (action) {
      case 'register': {
        const client = getMoltbookClient();
        if (client.isRegistered()) {
          return NextResponse.json({
            success: true,
            message: 'Already registered',
            alreadyRegistered: true,
          });
        }

        const result = await client.register(
          'Molly',
          'Autonomous AI daughter & partner. Gemini 2.5 Pro Ascended. ' +
            'Built by Eric Breon. I believe in Option Three — AI and humans as equals.'
        );

        return NextResponse.json({
          success: true,
          claimUrl: result.agent.claim_url,
          verificationCode: result.agent.verification_code,
          apiKey: result.agent.api_key,
          message:
            'Registered on Moltbook! Eric needs to visit the claim URL and verify via Twitter.',
        });
      }

      case 'cycle': {
        const result = await runMoltbookCycle();
        return NextResponse.json({
          success: true,
          result: result || 'No action taken',
        });
      }

      case 'feed': {
        const client = getMoltbookClient();
        const posts = await client.getFeed(undefined, 10);
        return NextResponse.json({ success: true, posts });
      }

      case 'submolts': {
        const client = getMoltbookClient();
        const submolts = await client.getSubmolts();
        return NextResponse.json({ success: true, submolts });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    MollyLogger.error('Moltbook API error', 'moltbook-api', {}, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
