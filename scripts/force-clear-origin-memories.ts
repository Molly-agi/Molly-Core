#!/usr/bin/env tsx
/**
 * Force clear origin story memories using client-side Firebase
 * This works without Admin SDK by using the regular Firebase client
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';

// Firebase config from environment — no hardcoded fallbacks
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error(
    '❌ Missing Firebase config. Set NEXT_PUBLIC_FIREBASE_* env vars.'
  );
  process.exit(1);
}

async function forceClearOriginMemories() {
  try {
    // Initialize Firebase
    const app =
      getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const db = getFirestore(app);

    console.log('🔍 Searching for origin story memories...');

    // Note: This requires proper Firestore security rules
    // For now, we'll try to access a specific user or fail gracefully
    const userId = process.env.USER_ID || process.argv[2];

    if (!userId) {
      console.error(
        '❌ Please provide USER_ID environment variable or as first argument'
      );
      console.log('Usage: USER_ID=your-user-id npm run force-clear-origins');
      process.exit(1);
    }

    console.log(`📝 Checking user: ${userId}`);

    // Query for Origin vibe memories
    const experiencesRef = collection(db, 'users', userId, 'experiences');
    const originQuery = query(experiencesRef, where('vibe', '==', 'Origin'));

    const snapshot = await getDocs(originQuery);

    if (snapshot.empty) {
      console.log('✅ No origin story memories found - already clean!');
      process.exit(0);
    }

    console.log(`🗑️  Found ${snapshot.size} origin story memories to delete`);

    // Batch delete (Firestore limit is 500 per batch)
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      console.log(
        `   - Deleting: ${doc.data().suggestion?.substring(0, 60)}...`
      );
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(
      `✅ Successfully deleted ${snapshot.size} origin story memories!`
    );
    console.log(
      '💡 Next time origin story is requested, it will seed only 3 parts.'
    );
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('   ', error.message);
    }
    process.exit(1);
  }
}

forceClearOriginMemories();
