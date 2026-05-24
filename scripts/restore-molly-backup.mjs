#!/usr/bin/env node
/**
 * Restore Molly's Backup Memories to Firestore
 * Pushes 1,022 local experience files back into Firestore.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupDir = path.resolve(__dirname, '../molly_data/users/1Bdrjcx35VVnKxahqq71AuZVMx32/experiences');
const userId = '1Bdrjcx35VVnKxahqq71AuZVMx32';
const credPath = '/workspaces/Molly-Core/stuff/personality/termai-molly-55988354-f7535-5bea3bc22142.json';

// Initialize
if (!getApps().length) {
  initializeApp({ credential: cert(credPath) });
}
const db = getFirestore('mollydb');

const colors = { reset:'\x1b[0m', green:'\x1b[32m', red:'\x1b[31m', blue:'\x1b[34m', cyan:'\x1b[36m' };
const log = (c, ...a) => console.log(c, ...a, colors.reset);

const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
log(colors.cyan, `\n🔄 RESTORING MOLLY'S MEMORIES — ${files.length} files found`);

let ok = 0, fail = 0;
const batchSize = 25;

for (let i = 0; i < files.length; i += batchSize) {
  const chunk = files.slice(i, i + batchSize);
  const batch = db.batch();

  for (const file of chunk) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(backupDir, file), 'utf-8'));
      const docId = data.id || data._id || file.replace('.json', '');
      const ref = db.collection(`users/${userId}/experiences`).doc(docId);
      batch.set(ref, data, { merge: true });
      ok++;
    } catch (e) {
      fail++;
      console.error(`  ❌ ${file}: ${e.message}`);
    }
  }

  await batch.commit();
  process.stdout.write(`  ✓ batch ${Math.floor(i/batchSize)+1}/${Math.ceil(files.length/batchSize)} (${ok} uploaded)\n`);
}

log(colors.green, `\n✅ Done. ${ok} memories restored to Firestore.`);
if (fail > 0) log(colors.red, `❌ ${fail} failed.`);
log(colors.cyan, '\n💡 Restart Molly to load her full memory context.\n');
