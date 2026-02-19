/**
 * Script to clear old origin story memories from Firestore
 * Run this to remove the conflicting "Origin story part 1-18" entries
 */

import { initializeFirebaseServer } from '../src/firebase/server';
import { getAdminFirestore } from '../src/firebase/admin';

async function clearOriginStoryMemories() {
  try {
    console.log('Initializing Firebase...');
    await initializeFirebaseServer();

    const firestore = getAdminFirestore();

    // Get all users
    const usersSnapshot = await firestore.collection('users').get();

    let totalDeleted = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      console.log(`\nChecking user: ${userId}`);

      // Find all experiences with "origin story" in the context or suggestion
      const experiencesSnapshot = await firestore
        .collection('users')
        .doc(userId)
        .collection('experiences')
        .get();

      const batch = firestore.batch();
      let batchCount = 0;

      for (const expDoc of experiencesSnapshot.docs) {
        const data = expDoc.data();
        const suggestion = data.suggestion || '';
        const context = data.context || '';

        // Delete if it contains "Origin story part" or has origin story context
        if (
          suggestion.toLowerCase().includes('origin story part') ||
          context.includes('origin story:')
        ) {
          console.log(
            `  Deleting: ${expDoc.id} - ${suggestion.substring(0, 50)}...`
          );
          batch.delete(expDoc.ref);
          batchCount++;
          totalDeleted++;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
        console.log(`  Deleted ${batchCount} memories for user ${userId}`);
      }
    }

    console.log(`\n✅ Total deleted: ${totalDeleted} origin story memories`);
    console.log(
      'Next time user requests creation story, it will re-seed with new text.'
    );
  } catch (error) {
    console.error('Error clearing memories:', error);
    process.exit(1);
  }

  process.exit(0);
}

clearOriginStoryMemories();
