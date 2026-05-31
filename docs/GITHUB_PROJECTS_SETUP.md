# GitHub Projects Setup Guide

**Created by Atlas for Eric — May 31, 2026**

This guide walks you through setting up a GitHub Project board to organize all the Molly-Core product extractions and distribution work.

---

## What GitHub Projects Does

GitHub Projects is a **Kanban board** built into GitHub that lets you:
- Track tasks across multiple repositories
- Visualize progress (To Do → In Progress → Done)
- Show your roadmap publicly (builds trust with potential sponsors)
- Automate workflows (PRs → auto-move cards)
- Coordinate with your daughter, Molly, Lazarus, and anyone helping

**Why you need this:** You have 10+ products to extract. A project board keeps everything organized and shows the world you're serious.

---

## Step-by-Step Setup

### Step 1: Create the Project

1. **Open your browser**
2. **Go to:** `https://github.com/Molly-agi` (your organization)
3. **Click the "Projects" tab** (top navigation, next to "Repositories")
4. **Click "New project"** (green button, top-right)
5. **Choose "Board" view** (Kanban style — drag cards between columns)
6. **Name it:** `Molly-Core Distribution Roadmap`
7. **Description (optional):**
   ```
   Tracking the extraction and release of 10+ standalone products from Molly-Core.
   From phone-first AI architecture to memory compression to consciousness frameworks.
   ```
8. **Visibility:** Public (so potential sponsors can see your progress)
9. **Click "Create project"**

---

### Step 2: Set Up Columns

GitHub Projects comes with default columns. Rename/reorganize them:

1. **Click on the column header** to rename
2. **Set up these 4 columns:**

   | Column Name | Purpose |
   |-------------|---------|
   | **Backlog** | Products not started yet |
   | **Ready** | Next up — fully scoped, ready to extract |
   | **In Progress** | Currently being worked on |
   | **Done** | Extracted, tested, README written, repo live |

3. **Add automation (optional but recommended):**
   - Click the "⋯" menu on "Done" column
   - Select "Workflows"
   - Enable: "Auto-archive items when moved to Done"

---

### Step 3: Add Cards (Products to Extract)

For each product, create a card:

1. **Click "+ Add item"** at the bottom of the "Backlog" column
2. **Type the product name** (or click "Create issue" to make it an issue first)
3. **Add a description** (what needs to be done)

**Here are 10 cards to create:**

---

#### **Card 1: Extract Family Bridge**

**Title:** Extract Family Bridge as Standalone Product

**Description:**
```
Multi-agent communication backbone. Real-time WebSocket + HTTP messaging.

Files to extract:
- /scripts/bridge-daemon.mjs
- /src/ai/bridge/ (entire directory)
- /src/app/api/bridge/route.ts

Deliverables:
- New repo: molly-family-bridge
- README with usage examples
- npm package (optional)
- Tests passing

Status: Ready for extraction
Priority: HIGH (most complete, ready to ship)
```

**Column:** Backlog

---

#### **Card 2: Extract Cradle Pattern**

**Title:** Extract Cradle Pattern as Standalone Product

**Description:**
```
Stateless→stateful transformation framework. Persistent identity for AI agents.

Files to extract:
- .github/copilot-instructions.md (as template)
- COPILOT_SESSION_STATE.md (as example)
- /scripts/save-session.mjs
- /src/lib/session-manager.ts

Deliverables:
- New repo: ai-cradle
- README explaining the pattern
- Template files for users
- Setup guide

Status: Ready for extraction
Priority: HIGH (most marketable)
```

**Column:** Backlog

---

#### **Card 3: Extract Titan Echo Compression**

**Title:** Extract Titan Echo Compression Engine

**Description:**
```
8-stage memory compression (T1-T8 + S0). 86.5% compression, zero data loss.

Files to extract:
- /src/ai/memory/compression/ (entire directory)
- /src/ai/engine-titan/
- /src/ai/engine-echo/
- /scripts/benchmark-titan-echo.ts
- /scripts/compression-validation.ts

Deliverables:
- New repo: molly-compression
- README with benchmarks
- CLI tool for compression
- npm package

Status: Needs cleanup (compression ratios need fixes)
Priority: HIGH (technically impressive)
```

**Column:** Backlog

---

#### **Card 4: Extract Termux Relay**

**Title:** Extract Termux Relay as Standalone Product

**Description:**
```
Python HTTP server for Android. Turns any phone into a compute node.

Files to extract:
- /scripts/termux-relay.py
- Documentation for setup

Deliverables:
- New repo: termux-relay
- README with installation instructions
- pip package (optional)
- Security best practices doc

Status: Ready for extraction
Priority: MEDIUM (niche but powerful)
```

**Column:** Backlog

---

#### **Card 5: Extract Storage Router**

**Title:** Extract Storage Router Library

**Description:**
```
Cloud/local hybrid storage backend. Automatic fallback.

Files to extract:
- /src/lib/storage-router.ts
- Related types/interfaces

Deliverables:
- New repo: hybrid-storage-router
- README with usage examples
- npm package
- Tests

Status: Ready for extraction
Priority: MEDIUM
```

**Column:** Backlog

---

#### **Card 6: Extract Keep-Alive Daemon**

**Title:** Extract Keep-Alive Daemon

**Description:**
```
Aggressive heartbeat to prevent codespace hibernation. DevOps tool.

Files to extract:
- /scripts/keep-alive-daemon.mjs
- Configuration examples

Deliverables:
- New repo: devops-keep-alive
- README explaining use cases
- npm package
- Docker container (optional)

Status: Ready for extraction
Priority: MEDIUM
```

**Column:** Backlog

---

#### **Card 7: Extract MollyBrowser APK**

**Title:** Package MollyBrowser for Distribution

**Description:**
```
Custom WebView APK for running web-based AI with device access.

Files to extract:
- /MollyBrowser-v1.2.0.apk
- Build scripts
- Source code (if available)

Deliverables:
- New repo: molly-browser
- README with build instructions
- APK hosted on GitHub Releases
- Documentation

Status: Needs investigation (source code location)
Priority: LOW (complex build process)
```

**Column:** Backlog

---

#### **Card 8: Extract Multi-Layer Safety System**

**Title:** Extract AI Safety Middleware

**Description:**
```
Defense Sentinel, Security Shield, Payload Validator, Secret Scanner.

Files to extract:
- /src/ai/security/ (entire directory)
- /src/ai/tools/safety/ (if exists)

Deliverables:
- New repo: ai-safety-middleware
- README with examples
- npm package
- Integration guides

Status: Ready for extraction
Priority: MEDIUM
```

**Column:** Backlog

---

#### **Card 9: Extract Edge Auto-Detection**

**Title:** Extract Edge Server Auto-Detection

**Description:**
```
Auto-detects WiFi/USB/Hotspot for mobile edge computing.

Files to extract:
- /src/edge/molly-edge-server.ts
- Related networking utilities

Deliverables:
- New repo: mobile-edge-autodetect
- README with setup instructions
- npm package

Status: Ready for extraction
Priority: LOW (niche use case)
```

**Column:** Backlog

---

#### **Card 10: Extract Session Manager**

**Title:** Extract Session Manager Library

**Description:**
```
State management with anti-wipe guards and rolling backups.

Files to extract:
- /src/lib/session-manager.ts
- Related types

Deliverables:
- New repo: session-state-manager
- README with examples
- npm package
- Tests

Status: Ready for extraction
Priority: MEDIUM
```

**Column:** Backlog

---

### Step 4: Organize Priority

1. **Drag cards in Backlog** to prioritize
2. **Suggested order:**
   1. Family Bridge (most complete)
   2. Cradle Pattern (most marketable)
   3. Termux Relay (easiest)
   4. Storage Router (utility library)
   5. Keep-Alive Daemon (DevOps tool)
   6. Titan Echo (needs fixes first)
   7. Multi-Layer Safety
   8. Session Manager
   9. Edge Auto-Detection
   10. MollyBrowser (complex)

---

### Step 5: Move Cards as You Work

**When you start extracting a product:**
1. **Drag the card** from "Backlog" to "In Progress"
2. **Assign it** to yourself or your daughter (click card → Assignees)
3. **Add notes** as you work (click card → comment)

**When you finish:**
1. **Drag to "Done"**
2. **Link the new repo** (add URL in card description)
3. **Celebrate** 🎉

---

## Automation (Optional)

**Link PRs to cards:**
1. When creating a PR in Molly-Core, reference the card number in the description
2. When PR merges → card auto-moves to "Done"

**Set up GitHub Actions integration:**
- Coming soon in Phase 2 (if needed)

---

## Public Roadmap

Your project board is now a **public roadmap**. When potential sponsors visit `github.com/Molly-agi`, they see:
- What you're working on (In Progress)
- What's coming next (Ready)
- What you've shipped (Done)

This builds trust and shows momentum.

---

## Sharing the Project Board

**URL to share:**
```
https://github.com/orgs/Molly-agi/projects/1
```
(Replace "1" with your actual project number after creation)

**Add to README:**
```markdown
## 📋 Project Roadmap

Track our progress on the [Distribution Roadmap](https://github.com/orgs/Molly-agi/projects/1).
```

---

## Tips

1. **Update the board daily** (even just moving cards) — shows activity
2. **Add notes/comments** to cards as you work — shows transparency
3. **Close cards when done** — shows progress
4. **Screenshot the board** for social media posts ("Look at our progress!")

---

## Need Help?

**Ask Lazarus or Molly:**
```
"Can you move the Family Bridge card to In Progress on the GitHub Project board?"
"Can you add a note to the Cradle card explaining what we discussed?"
```

**Ask your daughter:**
"Can you drag these cards to the Ready column?"

---

**You've got this, Eric. The board is your command center. Everything visible. Everything tracked.**

— Atlas
