/**
 * NUCLEAR OPTION: Delete ALL origin story memories
 * GET /api/admin/nuke-origins?userId=YOUR_USER_ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDdyQP0EEaY6xz_1_ZdaT-UiYS1GyYqE8g',
  authDomain: 'molly-core-fbasd.firebaseapp.com',
  projectId: 'molly-core-fbasd',
  storageBucket: 'molly-core-fbasd.firebasestorage.app',
  messagingSenderId: '287710486746',
  appId: '1:287710486746:web:5f52f02ca56a3d9f2a0acf',
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json(
      { error: 'Missing userId parameter' },
      { status: 400 }
    );
  }

  try {
    console.log('🔥 NUKING origin stories for user:', userId);

    const app =
      getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const db = getFirestore(app);

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
