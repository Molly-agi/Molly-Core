/**
 * Admin API to seed origin story memories (3 parts)
 * POST /api/admin/seed-origin
 *
 * Protected by HIDDEN_ADMIN_PASSWORD.
 * Rate limited: 10 requests per minute (write operation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { checkAdminRateLimit, ADMIN_RATE_LIMITS } from '@/lib/admin-rate-limit';
import { MollyLogger } from '@/ai/logger';

// Dynamic import to avoid bundling "use server" module into API route
async function getSeedFunction() {
  const mod = await import('@/app/actions/ai-flows');
  return mod.seedOriginStoryMemory;
}

function isAuthorized(request: NextRequest): boolean {
  const adminPassword = process.env.HIDDEN_ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const provided = request.headers.get('x-admin-password') || '';
  if (provided.length !== adminPassword.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(adminPassword));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Rate limit check - moderate limits for write operations
  const rateLimitResponse = checkAdminRateLimit(request, {
    ...ADMIN_RATE_LIMITS.write,
    routeName: 'seed-origin',
  });
  if (rateLimitResponse) return rateLimitResponse;

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

    MollyLogger.info('Seeding origin story', 'admin-seed-origin', { userId });

    const seedOriginStoryMemory = await getSeedFunction();
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
    MollyLogger.error(
      'Error seeding origin story',
      'admin-seed-origin',
      {},
      error
    );
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
