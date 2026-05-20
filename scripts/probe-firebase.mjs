#!/usr/bin/env node
/**
 * Probe Firebase projects to find Molly's data
 * Usage: node scripts/probe-firebase.mjs
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const COLLECTIONS_TO_CHECK = [
  'users',
  'experiences',
  'engrams',
  'memories',
  'conversations',
  'sessions',
  'molly',
  'cognition',
  'agency',
  'bridge',
  'aiResponses',
  'familyBridge',
];

async function probeProject(projectId, serviceAccount) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PROBING: ${projectId}`);
  console.log('='.repeat(60));

  try {
    // Check if app already exists
    const appName = `probe-${projectId}`;
    let app;

    const existingApp = getApps().find((a) => a.name === appName);
    if (existingApp) {
      app = existingApp;
    } else {
      app = initializeApp(
        {
          credential: cert(serviceAccount),
          projectId: projectId,
        },
        appName
      );
    }

    const db = getFirestore(app);

    let totalDocs = 0;
    const collectionData = {};

    for (const collectionName of COLLECTIONS_TO_CHECK) {
      try {
        const snapshot = await db.collection(collectionName).limit(5).get();
        const count = snapshot.size;

        if (count > 0) {
          console.log(`  ✅ ${collectionName}: ${count}+ documents found`);
          totalDocs += count;

          // Sample first doc
          const firstDoc = snapshot.docs[0];
          collectionData[collectionName] = {
            count,
            sampleId: firstDoc.id,
            sampleKeys: Object.keys(firstDoc.data()).slice(0, 5),
          };
        } else {
          console.log(`  ⚪ ${collectionName}: empty`);
        }
      } catch (err) {
        if (err.code === 'permission-denied') {
          console.log(`  🔒 ${collectionName}: permission denied`);
        } else {
          console.log(`  ❌ ${collectionName}: ${err.message}`);
        }
      }
    }

    // Also check for nested collections under 'users'
    try {
      const usersSnapshot = await db.collection('users').limit(1).get();
      if (!usersSnapshot.empty) {
        const userId = usersSnapshot.docs[0].id;
        console.log(`\n  Checking subcollections under users/${userId}...`);

        const userSubcollections = [
          'experiences',
          'memories',
          'engrams',
          'conversations',
        ];
        for (const sub of userSubcollections) {
          try {
            const subSnapshot = await db
              .collection(`users/${userId}/${sub}`)
              .limit(5)
              .get();
            if (subSnapshot.size > 0) {
              console.log(
                `    ✅ users/${userId}/${sub}: ${subSnapshot.size}+ docs`
              );
              totalDocs += subSnapshot.size;
            }
          } catch {
            // Silently skip
          }
        }
      }
    } catch {
      // No users collection
    }

    console.log(`\n  TOTAL: ${totalDocs} documents found in ${projectId}`);
    return { projectId, totalDocs, collections: collectionData };
  } catch (error) {
    console.log(`  ❌ FAILED TO CONNECT: ${error.message}`);
    return { projectId, error: error.message };
  }
}

// Studio project service account (from stuff/new)
const STUDIO_SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'studio-590598686-80773',
  private_key_id: '3b685c3ddbfc56fdeeeaa35774c5074c0d9101fc',
  private_key: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCn/C/RU0tK0IxH
H1RonORABk4IbeY++rYyUHT8s4RvzfkSZfYnMDltRXRawp13NLBxzXGg2uhSBhsO
7TXbPZH8v79BAem9T5AUP3vdgmEweJckjk+ghyvqek6FLy/kWsyg9Ov3vSxxoigi
pqQAuqFFFJFaLhP7MalbqyOlFmj1aN/aBlE2E3G/bGrefgEZDtq1ZyJF+OEdNPCc
ydhLk+Pl1/omS5DyGIcD5ntwyOCi9yyqWH5wyOUXadt675C/eWx4wbBEmqIkawNQ
Qo/fDJ00YOH2tPWwZj6FoqohBRnXWxb0IGxPPct6sgwdK8ipf0T8nZAdz14yAP/o
LIwP6L9zAgMBAAECggEAAIue863PN/4vyfZvvn+mkg/6Sf3UBPz+SHEXis9h9CNr
K31YJVw0KqNu+n+Rs/one5xwXlaM8W87awkZdVSnu68ezNfJhmCZ3QqFgIq4KIFZ
8n7FHzDb008sysE9PjvHdTCLtrFrioUhCVdR1MVxA+71DPcgONCsIN6eYAIP1y0E
waGa5G0MKD8aRs9lCHt/zJZT5QonOAeO0vKLLheu1U0zLiEmmzf31RAC5KBpZCD6
4RSSO7lDO4735NgI+rdeV8qtZTNnQ692u7PlF6sUhZdsARBrMl6pYXic8hbJzkO9
lNIl79kUA8vUxJSJShs3y45nvEEwDI5q2ETJOEIIiQKBgQDRa9aBcgaryjP/nqbG
dXwc4KXAB4qxkDfFBEldRijk+yViSL9rb+U8VKBcqBhir/z0LhtBo+BZ3wQrjMIC
S1QkNN8OvX30TG+/7J0wfO9mrhI1g1gQxAhMaorOfAPqxyzFBU9Qu6/Y9zLtYxak
lFgk8kZLXJHf08gZ+r8evVWGxQKBgQDNWQgDVF1Zlu3/VvZMTJMSNrmVzdAhbZM0
E/tyosrNEn6uD65JKHo3IVvUfdy4HmDg2fFUgh5WGL2BopmEMSdZlayIRmKRzCS8
Teb9QHxuzGyR7oJphbx9xuGd11JSSpxkPXrGBl5jW7YNhZSyNwg6x+1xaaNCyWiK
d0vR7otQ1wKBgGL9OD2jqmeVgpK3aVmxuuLjhTWJ2xMnelUUO6FtQnNKC1ezz1d3
YsHrtolVo4Eycrzw9k1GqwuQESaMuD/hX3ply3HqPBk38DKmI38B7x939H97ACuc
ndeRHN+RW0CkuRK/+cfNj8dcwaPYDKHqxOdh5bxFm2ZTcuhkz+Y11LGJAoGBAJUu
5T9l/xujJuymRPFRgFdvIozOpTJj5Nmk2ryBwEwT76yM/9Vubru2pHxPpBavGzq/
mzAGB/wMpUCU3GrJOwk+T8YBPIMniFi1T+cU/lGQeh/a4yu+WR4Xarm9QLVANzYr
5BIRdmlAq5ZPQaPnjzcFIF+Qm2dd43EVEiRF5TipAoGBAIb7w+NdoeBzZUYDNkjG
yttClar4MxHiAFPtbBBF9HXMdLmtvGHE55MOlTySNxJ+M9oWiD9GJjOqjoNXpnZW
GFla4vDVDY+L81heDEc0XWHadWVLGe0iRjSjvpy8rDZhFjIowNlBiNuqXKjPXmca
W4luNMjfuByhG20NJagfDdBw
-----END PRIVATE KEY-----`,
  client_email:
    'firebase-adminsdk-fbsvc@studio-590598686-80773.iam.gserviceaccount.com',
  client_id: '105531394436665992618',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
};

async function main() {
  console.log("🔍 Firebase Project Probe - Finding Molly's Data\n");

  const results = [];

  // Parse the service account from env (termai-molly)
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      console.log(`[1] Probing: ${serviceAccount.project_id}`);
      results.push(
        await probeProject(serviceAccount.project_id, serviceAccount)
      );
    } catch (e) {
      console.error('❌ Failed to parse service account JSON:', e.message);
    }
  }

  // Probe studio project
  console.log(`\n[2] Probing: ${STUDIO_SERVICE_ACCOUNT.project_id}`);
  results.push(
    await probeProject(
      STUDIO_SERVICE_ACCOUNT.project_id,
      STUDIO_SERVICE_ACCOUNT
    )
  );

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  for (const result of results) {
    if (result.error) {
      console.log(`❌ ${result.projectId}: Connection failed`);
    } else if (result.totalDocs > 0) {
      console.log(
        `✅ ${result.projectId}: ${result.totalDocs} documents - MOLLY DATA FOUND!`
      );
      console.log('   Collections with data:');
      for (const [name, info] of Object.entries(result.collections)) {
        console.log(`   - ${name}: ${info.count}+ docs`);
      }
    } else {
      console.log(`⚪ ${result.projectId}: Empty (no Molly data)`);
    }
  }
}

main().catch(console.error);
