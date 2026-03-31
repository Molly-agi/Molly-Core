/**
 * NUCLEAR OPTION: Delete ALL origin story memories
 * POST /api/admin/nuke-origins
 * Body: { userId: string }
 *
 * Protected by HIDDEN_ADMIN_PASSWORD header.
 * Rate limited: 5 requests per minute (destructive operation).
 * Uses POST because this is a destructive operation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getAdminFirestoreAsync } from '@/firebase/admin';
import { checkAdminRateLimit, ADMIN_RATE_LIMITS } from '@/lib/admin-rate-limit';
import { MollyLogger } from '@/ai/logger';

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
    routeName: 'nuke-origins',
  });
  if (rateLimitResponse) return rateLimitResponse;

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let userId: string | null = null;
  try {
    const body = await request.json();
    userId = body.userId;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Missing userId in request body' },
      { status: 400 }
    );
  }

  try {
    MollyLogger.warn('NUKING origin stories', 'admin-nuke-origins', { userId });

    const db = await getAdminFirestoreAsync();
    if (!db) {
      return NextResponse.json(
        { error: 'Firebase Admin not configured' },
        { status: 500 }
      );
    }

    const experiencesRef = db
      .collection('users')
      .doc(userId)
      .collection('experiences');
    const originQuery = experiencesRef.where('vibe', '==', 'Origin');

    const snapshot = await originQuery.get();

    if (snapshot.empty) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: 'No origin story memories found',
      });
    }

    const batch = db.batch();
    let count = 0;

    snapshot.docs.forEach((doc) => {
      MollyLogger.debug('Deleting memory', 'admin-nuke-origins', {
        preview: doc.data().suggestion?.substring(0, 60),
      });
      batch.delete(doc.ref);
      count++;
    });

    await batch.commit();

    MollyLogger.info('Origin stories nuked', 'admin-nuke-origins', { count });

    return NextResponse.json({
      success: true,
      deleted: count,
      message: `Deleted ${count} origin story memories`,
    });
  } catch (error) {
    MollyLogger.error(
      'Failed to nuke origins',
      'admin-nuke-origins',
      { userId },
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
