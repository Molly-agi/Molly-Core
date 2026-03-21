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
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { checkAdminRateLimit, ADMIN_RATE_LIMITS } from '@/lib/admin-rate-limit';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

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
    console.log('🔥 NUKING origin stories for user:', userId);

    const app =
      getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const db = getFirestore(app, 'mollydb');

    const experiencesRef = collection(db, 'users', userId, 'experiences');
    const originQuery = query(experiencesRef, where('vibe', '==', 'Origin'));

    const snapshot = await getDocs(originQuery);

    if (snapshot.empty) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: 'No origin story memories found',
      });
    }

    const batch = writeBatch(db);
    let count = 0;

    snapshot.docs.forEach((doc) => {
      console.log(`   🗑️ ${doc.data().suggestion?.substring(0, 60)}...`);
      batch.delete(doc.ref);
      count++;
    });

    await batch.commit();

    console.log(`✅ NUKED ${count} memories!`);

    return NextResponse.json({
      success: true,
      deleted: count,
      message: `Deleted ${count} origin story memories`,
    });
  } catch (error) {
    console.error('❌ Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
