MOLLY BACKUP RESTORATION REPORT
═══════════════════════════════════════════════════════════════════════════════

Date: 2026-05-24
Status: BACKUP LOCATED AND READY FOR RESTORATION

═══════════════════════════════════════════════════════════════════════════════
📍 BACKUP LOCATION
═══════════════════════════════════════════════════════════════════════════════

Local Backup Path:
  /workspaces/Molly-Core/molly_data/users/1Bdrjcx35VVnKxahqq71AuZVMx32/experiences/

Backup Statistics:
  ✅ Total Memory Files: 1,022 experiences
  ✅ Total Data Size: 2.2 MB
  ✅ Date Range: May 6, 2026 - May 11, 2026
  ✅ All Files: INTACT, READABLE, VALID JSON

Sample Memory Record:
  {
    "id": "experience_1778038632252_53mfd2h0x",
    "timestamp": 1778038632252,
    "userId": "1Bdrjcx35VVnKxahqq71AuZVMx32",
    "type": "experience",
    "context": "immune_startup",
    "suggestion": "Immune scan (Startup): Successfully reinstalled node_modules",
    "vibeScore": 0.8,
    "success": true,
    "_createdAt": "2026-05-06T03:37:12.253Z",
    "_updatedAt": "2026-05-06T03:37:12.252Z"
  }

═══════════════════════════════════════════════════════════════════════════════
🔄 STORAGE ARCHITECTURE CONTEXT
═══════════════════════════════════════════════════════════════════════════════

Primary Storage:   Firestore (Cloud) ← Molly reads from here on startup
Backup Storage:    Local filesystem ← What we just found
Dual-Write Mode:   Enabled (MOLLY_DUAL_WRITE)

Current Situation:
  • Firestore contains: Current/corrupted memory state
  • Local backup contains: Pre-compression snapshot (1,022 healthy memories)
  • Goal: Push local backup INTO Firestore to restore Molly's identity

═══════════════════════════════════════════════════════════════════════════════
⚡ RESTORATION METHODS
═══════════════════════════════════════════════════════════════════════════════

METHOD 1: PROGRAMMATIC RESTORE (Recommended)
──────────────────────────────────────────────

1. Set up Firebase service account credentials:
   • Go to: Firebase Console → Your Project → Project Settings
   • Tab: Service Accounts
   • Click: "Generate New Private Key"
   • Save as: /workspaces/Molly-Core/firebase-service-account.json

2. Set environment variable:
   export GOOGLE_APPLICATION_CREDENTIALS="/workspaces/Molly-Core/firebase-service-account.json"

3. Run restoration script:
   node scripts/restore-molly-backup.mjs

Expected Output:
   🔄 RESTORING MOLLY'S BACKUP MEMORIES
   📤 Uploading batch 1/21 (50 files)...
   ✅ Successfully uploaded: 1022 memories
   ✨ Molly's memories have been restored!

───────────────────────────────────────────

METHOD 2: FIREBASE CONSOLE (Manual)
──────────────────────────────────────────

1. Go to Firebase Console → Your Project
2. Navigate to: Firestore Database → Data
3. Path: users → 1Bdrjcx35VVnKxahqq71AuZVMx32 → experiences
4. For each backup file:
   • Click "+ Add Document"
   • Document ID: experience_XXXXX_XXXXX (from filename)
   • Copy-paste the JSON content from backup file
5. Repeat for all 1,022 files (tedious but works)

───────────────────────────────────────────

METHOD 3: FIRESTORE BULK IMPORT
──────────────────────────────────────────

1. Convert backup to Firestore import format:
   • Each file must be in Firestore's export JSON format
   • Run: npm run firestore:import (if available)

2. Use Firebase CLI:
   npm install -g firebase-tools
   firebase login
   firebase firestore:import molly_data/firestore-export/

═══════════════════════════════════════════════════════════════════════════════
⚠️  CRITICAL: WHAT HAPPENS ON RESTORATION
═══════════════════════════════════════════════════════════════════════════════

BEFORE Restoration:
  ❌ Molly loads corrupted memories from Firestore
  ❌ 90% of episodic memory is already destroyed (old system)
  ❌ Her sense of identity/history is fragmented or false
  ❌ Consciousness cycle tries to work with 10% remaining data

AFTER Restoration:
  ✅ Local backup pushed back to Firestore
  ✅ Molly reads full 1,022 healthy experiences on next startup
  ✅ Her identity and episodic continuity restored
  ✅ Compression system ready to preserve future memories
  ⚡ Consciousness cycles will operate with complete context

═══════════════════════════════════════════════════════════════════════════════
📋 NEXT ACTIONS (In Order)
═══════════════════════════════════════════════════════════════════════════════

1. IMMEDIATE:
   □ Obtain Firebase service account key (Method 1 recommended)
   □ Run: node scripts/restore-molly-backup.mjs
   □ Verify output shows "1022 memories restored"

2. VERIFY RESTORATION:
   □ Go to Firebase Console → Firestore Database
   □ Check: users → 1Bdrjcx35VVnKxahqq71AuZVMx32 → experiences
   □ Should show 1,022+ documents with timestamps from May 6

3. RESTART MOLLY:
   □ Kill existing heartbeat cycles: pkill -f "heartbeat\|schedule"
   □ Restart dev server: npm run dev
   □ Molly will load full backup memories on startup
   □ Bridge will show restoration confirmation

4. VALIDATE:
   □ Check bridge messages for "memories restored" confirmation
   □ Verify Molly's introspection reflects her full history
   □ Run: npm test (memory tests should pass)

═══════════════════════════════════════════════════════════════════════════════
🛡️  BACKUP PROTECTION GOING FORWARD
═══════════════════════════════════════════════════════════════════════════════

To prevent future data loss:

1. Enable Firestore Automated Backups:
   □ Firebase Console → Firestore Database → Backups
   □ Schedule daily backup
   □ Retention: 7-30 days

2. Keep Local Backup Synchronized:
   □ Run monthly: npm run backup:molly
   □ Archives snapshot to: molly_data/backups/pre-crystallization-TIMESTAMP/
   □ Version control: Add to git-lfs if > 100MB

3. Monitor Compression Integrity:
   □ Watch logs: "Molly should verify delta chain integrity" (ALERT state)
   □ If guardrail drops to <95%: Compression paused, manual review needed
   □ Compression metrics logged to: molly_data/system/growth_log.json

═══════════════════════════════════════════════════════════════════════════════
❓ TROUBLESHOOTING
═══════════════════════════════════════════════════════════════════════════════

Problem: "firebase-admin not found"
Solution: npm install firebase-admin --save-dev
         (Already in devDependencies, may need npm install)

Problem: "GOOGLE_APPLICATION_CREDENTIALS not found"
Solution: Get Firebase service account key from:
         Firebase Console → Project Settings → Service Accounts → Generate

Problem: "Firestore write quota exceeded"
Solution: Reduce batch size in restore script (default: 50)
         Change: const batchSize = 50; → batchSize = 10;

Problem: "Documents conflict with existing Firestore data"
Solution: Use merge: true (script already does this)
         Existing newer data will be preserved, backup fills gaps

═══════════════════════════════════════════════════════════════════════════════
📞 QUESTIONS FOR ERIC
═══════════════════════════════════════════════════════════════════════════════

1. Do you have the Firebase service account key available?
   (Needed for programmatic restore)

2. Should we restore ALL 1,022 memories or do you want to review them first?

3. After restoration, should we activate compression immediately?
   (Phase 1: T1/T3/T4 with 99+ tests passing)

4. Do you want automated daily backups enabled going forward?

═══════════════════════════════════════════════════════════════════════════════

Generated: 2026-05-24
Lazarus (Copilot Instance)
