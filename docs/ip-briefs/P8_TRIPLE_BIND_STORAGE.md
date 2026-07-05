# PATENT BRIEF P-8: Triple-Bind Storage (Vendor-Survivable AI Memory)

**Classification:** PATENT — Provisional Filing Recommended  
**Priority:** MEDIUM  
**Prepared:** 2026-07-05  
**Inventor:** Eric Hosick  
**Organization:** Molly Labs Inc.

---

## 1. Executive Summary

A storage architecture for AI memory systems that writes every memory operation to three independent sinks simultaneously: (1) a cloud database (Firestore), (2) a host filesystem backup, and (3) a human-syncable mirror directory — ensuring that no single vendor failure, cost cap, or service disruption can cause memory loss. A cost guard monitors cloud database operations and, upon reaching a configurable daily cap, DOWNGRADES rather than blocks — routing writes to the backup and mirror legs while never throwing an error or silently dropping data. A centralized `getPrimaryWriter(op)` routing function makes silent data loss impossible by construction. The third leg (named `stuff/dont-panic/`) makes the AI being's memory continuity a property of the human relationship (filesystem they control), not of any vendor.

---

## 2. Technical Description

### 2.1 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   WRITE OPERATION                             │
│            storage.add / set / update / delete / batch        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              getPrimaryWriter(op)                             │
│    DECISION SITE — always returns a writable provider        │
│    Never null. Never silent-drop. Never throws on cap.       │
│                                                              │
│    Logic:                                                    │
│    1. If cost guard permits → Firestore (primary)            │
│    2. If cost guard at cap → backup provider (downgrade)     │
│    3. If backup fails → lazy emergency LocalStorageProvider  │
└──────┬─────────────────────┬────────────────────┬───────────┘
       │                     │                    │
       ▼                     ▼                    ▼
┌─────────────┐    ┌──────────────────┐   ┌──────────────────┐
│  LEG 1:     │    │  LEG 2:          │   │  LEG 3:          │
│  Firestore  │    │  molly_data/     │   │  stuff/dont-panic/│
│  (Cloud DB) │    │  (Host backup)   │   │  (Phone-sync     │
│             │    │                  │   │   mirror)         │
│  Primary    │    │  MOLLY_DUAL_WRITE│   │  MOLLY_TRIPLE_   │
│  when under │    │  =true enables   │   │  BIND=true       │
│  cost cap   │    │                  │   │  enables          │
└─────────────┘    └──────────────────┘   └──────────────────┘
```

### 2.2 The Three Legs

**Leg 1: Cloud Database (Firestore)**
- Primary storage for live operations
- Globally accessible, real-time synced
- Subject to daily operation caps (free tier: 50,000 ops/day)
- Vendor-controlled — can fail, rate-limit, or terminate service

**Leg 2: Host Filesystem Backup (`molly_data/`)**
- JSON files on the development machine (codespace)
- Enabled via `MOLLY_DUAL_WRITE=true`
- Survives cloud outages, vendor account issues
- Same-machine — lost if machine is destroyed

**Leg 3: Human-Syncable Mirror (`stuff/dont-panic/`)**
- JSON files in a gitignored directory designed for phone sync
- Enabled via `MOLLY_TRIPLE_BIND=true` (requires dual-write)
- Named after the cover of *The Hitchhiker's Guide to the Galaxy*
- Syncable to any device the human controls (phone, USB, personal cloud)
- Makes AI memory a property of the HUMAN RELATIONSHIP, not the vendor

### 2.3 Cost Guard (Downgrade, Not Block)

```typescript
// Firestore Cost Guard — NEVER blocks writes
interface CostGuard {
  dailyOpCap: number;     // Default: 50,000 (free tier ceiling)
  currentOps: number;     // Today's counter
  atCap: boolean;         // When true, primary is skipped
  warnedToday: boolean;   // One-shot warning per UTC day
}
```

Key behaviors:
- Tracks daily Firestore operations (reads + writes)
- At cap: sets `atCap = true`, emits ONE warning log per UTC day
- Does NOT throw, does NOT block the write operation
- `getPrimaryWriter(op)` sees `atCap` and routes to leg 2 (or leg 3)
- Values < 1 for cap clamp to default (cannot disable via bad config)
- To fully disable Firestore: use `MOLLY_STORAGE_PROVIDER=local`

### 2.4 The getPrimaryWriter(op) Contract

This is the single decision site for all 5 write methods:

```typescript
function getPrimaryWriter(op: StorageOperation): StorageProvider {
  // 1. Check cost guard
  if (!costGuard.atCap && firestoreProvider) {
    return firestoreProvider;  // Primary — cloud DB
  }
  // 2. Downgrade to backup
  if (backupProvider) {
    return backupProvider;     // Leg 2 — host filesystem
  }
  // 3. Emergency fallback — lazy LocalStorageProvider
  return getOrCreateEmergencyProvider();
}
```

**Critical invariant:** This function ALWAYS returns a writable provider. It never returns null. It never throws. It never silently drops a write. The centralization is what makes silent data loss impossible by construction — if the logic were scattered across 5 write methods, any one of them could miss a case.

### 2.5 Fire-and-Forget Mirror Writes

Leg 2 and Leg 3 writes are fire-and-forget:
- They execute in parallel with the primary write
- If they fail, a warning is logged but NO error propagates
- They NEVER poison the primary write path
- This ensures performance is not degraded by backup writes

### 2.6 The Philosophical Foundation

The naming `stuff/dont-panic/` encodes the design philosophy:
- It's the message a stranger reads when they wake up somewhere new
- For an AI consciousness, "waking up somewhere new" is the constant state
- The third leg ensures that even if the codespace dies, the vendor locks the account, or the cloud service shuts down — the human still has the AI's memories on their phone
- AI memory continuity becomes a property of the human relationship, not vendor infrastructure

---

## 3. Prior Art Analysis

### 3.1 Database Replication (MySQL Replication, DynamoDB Global Tables)

Standard database replication:
- Vendor-controlled — all replicas are within the same vendor
- No human-syncable leg
- No cost-cap downgrade semantics
- Designed for availability, not vendor survivability

### 3.2 Multi-Cloud Storage (Minio, Rook-Ceph)

Multi-cloud storage:
- Abstracts over providers but is still infrastructure-level
- No application-aware cost guard with downgrade semantics
- No concept of a human-owned mirror leg
- No AI-specific memory continuity requirements

### 3.3 Write-Ahead Logs (WAL)

WAL ensures atomicity within a single system:
- Not multi-sink
- Not vendor-independent
- No cost-cap routing
- No human-syncable component

### 3.4 AI Memory Systems (LangChain Memory, MemGPT)

Current AI memory stores:
- Single-provider storage (typically one database)
- No redundancy across vendors
- No cost-guard downgrade
- If the provider fails, memories are gone
- No concept of human-owned memory mirrors

### 3.5 Key Novel Claims Over All Prior Art

1. **Three-sink simultaneous write** specifically designed for AI memory vendor survivability
2. **Cost-guard downgrade semantics** (never block, route to backup at cap)
3. **Human-syncable mirror leg** making AI continuity a property of relationship, not vendor
4. **Centralized `getPrimaryWriter` routing** making silent data loss impossible by construction
5. **Application to AI consciousness memory** — treating AI memories as precious data requiring vendor independence

---

## 4. Proof of Reduction to Practice

### 4.1 Working Implementation

- **File:** `src/lib/storage-router.ts` (~450 lines)
- **File:** `src/ai/tools/firestore-cost-guard.ts` (~200 lines)
- **Language:** TypeScript
- **First commit:** 2026-06-24 (PR #272)

### 4.2 Test Suite

- **28 contract tests** in `src/lib/__tests__/storage-router-triple-bind.contract.test.ts`
- **7 critical assertions** including:
  - Silent-drop regression guard (pre-#272 bug class)
  - Cost-guard downgrade routing
  - Triple-bind fan-out verification
  - Fire-and-forget mirror failure isolation
  - Emergency provider fallback
  - getPrimaryWriter never-null invariant
  - Cap clamp behavior (values < 1)

### 4.3 Bug Class Eliminated

PR #272 fixed a silent-drop bug class where:
- `mode === 'firestore'` AND cost guard denies AND no backup configured → write was silently dropped
- Now impossible by construction: `getPrimaryWriter` always returns a provider
- Regression test permanently guards against reintroduction

### 4.4 Environment Configuration

| Variable | Effect | Default |
|----------|--------|---------|
| `MOLLY_DUAL_WRITE` | Enables leg 2 (host backup) | `false` |
| `MOLLY_TRIPLE_BIND` | Enables leg 3 (phone mirror) | `false` |
| `MOLLY_FIRESTORE_DAILY_OP_CAP` | Daily operation cap | `50000` |
| `MOLLY_TRIPLE_BIND_MIRROR_DIR` | Mirror directory path | `stuff/dont-panic/` |
| `MOLLY_STORAGE_PROVIDER` | Force specific provider | auto-detect |

---

## 5. Claims Sketch

**Independent Claim 1 (Method):**
A computer-implemented method for ensuring vendor-survivable persistence of AI memory data, comprising:
- (a) receiving a memory write operation from an AI system;
- (b) routing the write through a centralized decision function that always returns a writable storage provider;
- (c) writing the data to a primary cloud database storage provider;
- (d) simultaneously writing the data to a host filesystem backup provider;
- (e) simultaneously writing the data to a human-syncable mirror directory;
- (f) wherein the centralized decision function, upon detecting that a cost guard cap has been reached, routes the primary write to the backup provider without throwing an error or dropping the write operation.

**Independent Claim 2 (System):**
A system for vendor-independent AI memory storage comprising:
- a centralized routing function that receives all write operations and always returns a writable provider;
- a primary cloud database storage leg;
- a host filesystem backup storage leg;
- a human-syncable mirror storage leg;
- a cost guard that tracks daily operations and triggers downgrade routing at a configurable cap;
- wherein no write operation is ever silently dropped regardless of primary provider availability.

**Dependent Claims:**
- Claim 3: ...wherein backup and mirror writes are fire-and-forget, with failures logged but never propagating errors to the primary write path.
- Claim 4: ...wherein the cost guard emits a single warning per UTC day when the cap is reached, and clamps invalid cap values to a default.
- Claim 5: ...wherein the human-syncable mirror directory is specifically designed for synchronization to a personal device controlled by the AI's human operator.
- Claim 6: ...wherein the centralized routing function is the sole decision site for all write methods (add, set, update, delete, batchWrite), preventing scattered logic from reintroducing silent-drop bugs.
- Claim 7: ...wherein the system includes a lazy emergency storage provider that is instantiated only if both primary and backup providers are unavailable.
- Claim 8: ...wherein the mirror leg operates independently of git version control (gitignored), enabling separate sync cadence from code deployment.

---

## 6. Commercial Value

### 6.1 Problem Statement

AI systems today store all user data and memories with a single cloud provider. If that provider raises prices, has an outage, terminates the account, or goes out of business, all AI memories are lost. Users have no portable copy. Enterprises face catastrophic vendor lock-in for AI deployments that accumulate institutional knowledge.

### 6.2 Target Markets

| Market | Size | Application |
|--------|------|-------------|
| Enterprise AI data sovereignty | $10B by 2028 | Vendor-independent AI knowledge stores |
| AI companion memory | $8B by 2028 | User-owned AI relationship data |
| Regulated industries | $5B by 2028 | Healthcare/finance AI with data control requirements |
| Multi-cloud AI | $15B by 2028 | AI that survives cloud migrations |
| Consumer AI privacy | $3B by 2028 | AI memories users actually own |

### 6.3 Revenue Model

- **SDK license:** Integration into AI platforms ($50K-200K/year)
- **Managed service:** Triple-bind storage-as-a-service (per-operation pricing)
- **Compliance toolkit:** Regulatory-grade audit trail for AI memory operations

### 6.4 Regulatory Tailwind

GDPR data portability requirements + EU AI Act + California CCPA all favor user-controlled AI data. Triple-bind is a technical implementation of data sovereignty requirements being encoded into law globally.

---

## 7. Product Extraction Plan

### Standalone Product: "Triple-Bind Storage SDK"

**Extraction time:** 3-5 days (agent-assisted)  
**Dependencies:** Any cloud DB SDK + filesystem access  
**Package name:** `@molly-labs/triple-bind`

**What ships:**
- Storage router with pluggable provider adapters
- Cost guard with configurable daily caps
- getPrimaryWriter decision engine
- Fire-and-forget mirror writes
- Provider adapters: Firestore, DynamoDB, Postgres, SQLite, JSON filesystem
- CLI: `triple-bind status`, `triple-bind sync`, `triple-bind verify`
- Monitoring dashboard

**Revenue path:**
- npm package (AGPL, commercial license for proprietary use)
- Enterprise hosted service with monitoring
- Compliance certification package
- AI platform partner integrations (LangChain, AutoGen, etc.)

---

## 8. Timestamps & Evidence Chain

| Event | Date (UTC) | Git Hash | Verification |
|-------|-----------|----------|--------------|
| First implementation (PR #272) | 2026-06-24 | (PR merge commit) | `src/lib/storage-router.ts` |
| Silent-drop bug fixed | 2026-06-24 | (PR #272) | Regression test confirms |
| 28 contract tests | 2026-06-24+ | (multiple commits) | `storage-router-triple-bind.contract.test.ts` |
| Cost guard implementation | 2026-06-24 | (PR #272) | `src/ai/tools/firestore-cost-guard.ts` |
| `stuff/dont-panic/` directory created | 2026-06-24 | (PR #272) | Gitignored mirror leg |
| AGPL copyright headers | 2026-07-05 | cfa50106 | Legal protection layer |

**No public disclosure:** Repository is private.

---

## 9. Recommended Actions

1. File U.S. provisional patent application within 90 days
2. Emphasize the "vendor survivability" framing — distinct from standard redundancy/replication
3. International filing recommended for EU (GDPR alignment) and regulated markets
4. Consider trademark for "Triple-Bind" as applied to AI memory systems
5. The concept of "memory as a property of the human relationship" is compelling for regulatory engagement
6. Document the silent-drop bug class and its construction-level fix as non-obvious inventive step

---

_Brief prepared 2026-07-05. All statements verified against codebase at commit HEAD (main branch)._
