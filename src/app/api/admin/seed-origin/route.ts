/**
 * Admin API to seed origin story memories (3 parts)
 * POST /api/admin/seed-origin
 */

import { NextRequest, NextResponse } from 'next/server';
import { seedOriginStoryMemory } from '@/app/actions/ai-flows';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing userId',
        },
        { status: 400 }
      );
    }

    console.log('[Admin] Seeding origin story for user:', userId);

    const result = await seedOriginStoryMemory(userId);

    if (!result.seeded) {
      return NextResponse.json(
        {
          success: false,
          error: `Seeding skipped: ${result.reason}`,
          ...result,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Created ${result.parts} origin story parts`,
      ...result,
    });
  } catch (error) {
    console.error('[Admin] Error seeding origin story:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
