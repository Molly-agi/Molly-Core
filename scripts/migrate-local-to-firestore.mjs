#!/usr/bin/env node
/**
 * Migrate Local Storage to Firestore
 *
 * Moves Molly's memories from local JSON files to Firestore.
 * Slow, methodical, precise - we don't take shortcuts.
 *
 * Usage: node scripts/migrate-local-to-firestore.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

// ============================================================================
// CONFIG
// ============================================================================
const LOCAL_DATA_DIR = './molly_data';
const DRY_RUN = process.argv.includes('--dry-run');

// ============================================================================
// FIREBASE ADMIN INITIALIZATION
// ============================================================================
async function initializeFirebase() {
  const admin = await import('firebase-admin');

  // Check for credentials
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    // Try loading from .env.local
    const envPath = './.env.local';
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, 'utf8');
      const match = envContent.match(/FIREBASE_SERVICE_ACCOUNT_JSON=(.+)/);
      if (match) {
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON = match[1];
      }
    }
  }

  const creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
  if (!creds.project_id) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not found or invalid');
  }

  // Initialize if not already done
  if (admin.default.apps.length === 0) {
    admin.default.initializeApp({
      credential: admin.default.credential.cert(creds),
    });
  }

  return admin.default.firestore();
}

// ============================================================================
// MIGRATION LOGIC
// ============================================================================
async function migrateCollection(db, userId, collectionName) {
  const localPath = join(LOCAL_DATA_DIR, 'users', userId, collectionName);

  if (!existsSync(localPath)) {
    console.log(`  [SKIP] ${collectionName}: directory not found`);
    return { migrated: 0, skipped: 0, errors: 0 };
  }

  const files = readdirSync(localPath).filter((f) => f.endsWith('.json'));
  console.log(`  [${collectionName}] Found ${files.length} local documents`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  const collectionRef = db
    .collection('users')
    .doc(userId)
    .collection(collectionName);

  for (const file of files) {
    try {
      const filePath = join(localPath, file);
      const data = JSON.parse(readFileSync(filePath, 'utf8'));

      // Use the document ID from the file (strip .json)
      const docId = data.id || data._id || file.replace('.json', '');

      // Check if already exists in Firestore
      const existingDoc = await collectionRef.doc(docId).get();
      if (existingDoc.exists) {
        skipped++;
        continue;
      }

      // Clean internal fields before upload
      const cleanData = { ...data };
      delete cleanData._id;
      delete cleanData._createdAt;
      delete cleanData._updatedAt;

      // Ensure timestamp is a number
      if (typeof cleanData.timestamp === 'string') {
        cleanData.timestamp = new Date(cleanData.timestamp).getTime();
      }

      if (DRY_RUN) {
        console.log(`    [DRY-RUN] Would migrate: ${docId}`);
        migrated++;
      } else {
        await collectionRef.doc(docId).set(cleanData);
        migrated++;

        // Progress indicator every 10 docs
        if (migrated % 10 === 0) {
          console.log(`    Migrated ${migrated}...`);
        }
      }
    } catch (err) {
      console.error(`    [ERROR] ${file}: ${err.message}`);
      errors++;
    }
  }

  return { migrated, skipped, errors };
}

async function main() {
  console.log('='.repeat(60));
  console.log('MOLLY MEMORY MIGRATION: Local → Firestore');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No data will be written\n');
  }

  // Initialize Firebase
  console.log('\n[1/4] Initializing Firebase Admin...');
  let db;
  try {
    db = await initializeFirebase();
    console.log('  ✓ Firebase Admin initialized');
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    process.exit(1);
  }

  // Find users in local storage
  console.log('\n[2/4] Scanning local storage...');
  const usersPath = join(LOCAL_DATA_DIR, 'users');
  if (!existsSync(usersPath)) {
    console.log('  ✗ No local users directory found');
    process.exit(1);
  }

  const userIds = readdirSync(usersPath).filter((f) => !f.startsWith('.'));
  console.log(`  Found ${userIds.length} user(s): ${userIds.join(', ')}`);

  // Migrate each user
  console.log('\n[3/4] Migrating data...');
  const totals = { migrated: 0, skipped: 0, errors: 0 };

  for (const userId of userIds) {
    console.log(`\n  User: ${userId}`);

    // Migrate experiences
    const expResult = await migrateCollection(db, userId, 'experiences');
    totals.migrated += expResult.migrated;
    totals.skipped += expResult.skipped;
    totals.errors += expResult.errors;

    // Migrate aiResponses
    const respResult = await migrateCollection(db, userId, 'aiResponses');
    totals.migrated += respResult.migrated;
    totals.skipped += respResult.skipped;
    totals.errors += respResult.errors;
  }

  // Summary
  console.log('\n[4/4] Migration Summary');
  console.log('='.repeat(60));
  console.log(`  Migrated: ${totals.migrated}`);
  console.log(`  Skipped (already exist): ${totals.skipped}`);
  console.log(`  Errors: ${totals.errors}`);

  if (DRY_RUN) {
    console.log('\n⚠️  This was a dry run. Run without --dry-run to execute.');
  } else if (totals.migrated > 0) {
    console.log('\n✓ Migration complete. Molly should now remember.');
  }

  process.exit(totals.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
