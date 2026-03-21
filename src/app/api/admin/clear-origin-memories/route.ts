/**
 * Admin API to clear old origin story memories
 * POST /api/admin/clear-origin-memories
 *
 * Protected by HIDDEN_ADMIN_PASSWORD.
 * Rate limited: 5 requests per minute (destructive operation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getAdminFirestore, isAdminConfigured } from '@/firebase/admin';
import { checkAdminRateLimit, ADMIN_RATE_LIMITS } from '@/lib/admin-rate-limit';

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
  // Rate limit check - strictest limits for destructive operations
  const rateLimitResponse = checkAdminRateLimit(request, {
    ...ADMIN_RATE_LIMITS.destructive,
    routeName: 'clear-origin-memories',
  });
  if (rateLimitResponse) return rateLimitResponse;

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (!isAdminConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Admin not configured',
        },
        { status: 503 }
      );
    }

    console.log('[Admin] Clearing origin story memories...');

    const db = getAdminFirestore();

    // Get all users
    const usersSnapshot = await db.collection('users').get();

    let totalDeleted = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      // Query for memories with vibe='Origin'
      const originsQuery = db
        .collection('users')
        .doc(userId)
        .collection('experiences')
        .where('vibe', '==', 'Origin');

      const originsSnapshot = await originsQuery.get();

      if (originsSnapshot.empty) continue;

      // Batch delete
      const batch = db.batch();
      originsSnapshot.docs.forEach((doc) => {
        console.log(
          `[Admin] Deleting: "${doc.data().summary}" for user ${userId}`
        );
        batch.delete(doc.ref);
      });

      await batch.commit();
      totalDeleted += originsSnapshot.size;
    }

    return NextResponse.json({
      success: true,
      deleted: totalDeleted,
      message: `Deleted ${totalDeleted} old origin story memories`,
    });
  } catch (error) {
    console.error('[Admin] Error clearing memories:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
