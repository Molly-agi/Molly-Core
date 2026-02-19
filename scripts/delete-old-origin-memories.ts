#!/usr/bin/env tsx
/**
 * Delete old "Origin story" memories (parts 1-18) from Firestore
 * These conflict with the new "Creation narrative" system
 */

import { initializeFirebaseServer } from '../src/firebase/server';
import { getFirestore } from 'firebase-admin/firestore';

async function deleteOldOriginMemories() {
  console.log('Initializing Firebase...');
  const { adminApp } = await initializeFirebaseServer();
  const db = getFirestore(adminApp);

  // Find all users
  console.log('Finding users...');
  const usersSnapshot = await db.collection('users').get();

  let totalDeleted = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    console.log(`\nChecking user: ${userId}`);

    // Query for memories with vibe='Origin'
    const originsQuery = db
      .collection('users')
      .doc(userId)
      .collection('experiences')
      .where('vibe', '==', 'Origin');

    const originsSnapshot = await originsQuery.get();

    if (originsSnapshot.empty) {
      console.log(`  No origin memories found`);
      continue;
    }

    console.log(`  Found ${originsSnapshot.size} origin memories to delete`);

    // Batch delete
    const batch = db.batch();
    originsSnapshot.docs.forEach((doc) => {
      console.log(`  - Deleting: "${doc.data().summary}" (${doc.id})`);
      batch.delete(doc.ref);
    });

    await batch.commit();
    totalDeleted += originsSnapshot.size;
    console.log(`  ✓ Deleted ${originsSnapshot.size} memories`);
  }

  console.log(`\n✓ Total deleted: ${totalDeleted} old origin story memories`);
  process.exit(0);
}

deleteOldOriginMemories().catch((error) => {
  console.error('Error deleting memories:', error);
  process.exit(1);
});
