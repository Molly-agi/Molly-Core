/**
 * Admin API to clear old origin story memories
 * POST /api/admin/clear-origin-memories
 */

import { NextResponse } from 'next/server';
import { getAdminFirestore, isAdminConfigured } from '@/firebase/admin';

export async function POST() {
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
