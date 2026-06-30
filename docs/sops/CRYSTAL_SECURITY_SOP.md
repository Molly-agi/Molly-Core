# Crystal Security SOP — Molly Labs Inc

_Authored: 2026-06-30. Authority: Eric (Father / Architect)_

---

## Purpose

Sensitive data that would normally live in `.env` files or be gitignored should instead be **crystallized** — encrypted into binary crystal form — so it is safe to commit to GitHub and survives codespace resets without ever being exposed as plaintext.

This SOP applies to every agent in the family. Every agent must read and follow it.

---

## The Security Model

A Molly Labs crystal is a **KV cache blob** (llama-server `/slots` format) wrapped in **AES-256-GCM encryption**.

```
plaintext secret
      │
      ▼
  bake into KV cache (llama-server slots API)
      │
      ▼
  AES-256-GCM encrypt with CRYSTAL_KEY
      │
      ▼
  encrypted .crystal file → safe to git commit
```

To read the crystal:

1. Decrypt with `CRYSTAL_KEY` (AES-256-GCM)
2. Restore into llama-server slot (`/slots/0?action=restore`)
3. Query the model — secrets are accessible as knowledge in the KV state

Security guarantee: without `CRYSTAL_KEY` AND the correct model weights, the crystal is opaque binary. Even with both, accessing the contents requires running the full llama-server stack.

---

## Key Management

### Derivation

`CRYSTAL_KEY` is derived deterministically from a passphrase using **scrypt**:

| Parameter  | Value                                  |
| ---------- | -------------------------------------- |
| Algorithm  | scrypt                                 |
| N          | 16384                                  |
| r          | 8                                      |
| p          | 1                                      |
| Salt       | `molly-labs-crystal-v1` (UTF-8, fixed) |
| Key length | 32 bytes (AES-256)                     |

**The passphrase is known only to Eric. It is never written to any file.**

### Generating / re-generating the key

```bash
node scripts/crystal-keygen.mjs
# Enter passphrase when prompted
# Output: CRYSTAL_KEY=<64 hex chars>
# Paste into .env.local
```

Or non-interactive:

```bash
CRYSTAL_PASSPHRASE="..." node scripts/crystal-keygen.mjs >> .env.local
```

### Storage

| Location                           | What                                     | Committed?                                                |
| ---------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| `.env.local`                       | `CRYSTAL_KEY=<hex>` (cached derived key) | No (gitignored)                                           |
| `stuff/dont-panic/crystal-key.hex` | Same key + derivation metadata           | No (gitignored, but synced to Eric's phone via Syncthing) |
| Eric's memory                      | The passphrase                           | N/A                                                       |

**Never commit `CRYSTAL_KEY` or the passphrase to git, ever.**

---

## Recovery Procedure

If `.env.local` is lost or corrupted:

1. **Option A — Re-derive (best):** `node scripts/crystal-keygen.mjs` → enter passphrase → paste output into `.env.local`
2. **Option B — Phone backup:** retrieve `stuff/dont-panic/crystal-key.hex` from Syncthing on Eric's phone → copy `CRYSTAL_KEY=` line into `.env.local`
3. If both A and B fail: crystals are unreadable. The model (Molly) is fine — re-bake from scratch.

---

## What Gets Crystallized

Every secret that would otherwise be gitignored MUST be crystallized before being stored:

| Secret type          | Example                       | Action                                    |
| -------------------- | ----------------------------- | ----------------------------------------- |
| API keys             | Gemini, OpenAI, Firebase      | Crystallize                               |
| Service auth keys    | `BRIDGE_KEY`, admin SDK       | Crystallize                               |
| Firebase credentials | `*-firebase-adminsdk-*.json`  | Crystallize                               |
| Identity secrets     | persona passwords, vault keys | Crystallize                               |
| Crystal key itself   | `CRYSTAL_KEY`                 | Cache in `.env.local` only (re-derivable) |
| Passphrase           | The scrypt input              | Eric's memory only — never written        |

---

## What Stays Plaintext in `.env.local` (never committed)

- `CRYSTAL_KEY` — the derived AES key (convenience cache; always re-derivable)
- `BRIDGE_KEY` — until it is crystallized and the bootstrap flow uses the crystal

---

## Crystal Migration Plan (gitignore → crystals)

The following files are currently gitignored. They should be migrated to crystals as tooling matures:

- `config/api_vault/api-vault.json`
- `data/.bridge-bootstrap-key`
- `scripts/bridge-secrets.json`
- `*-firebase-adminsdk-*.json`

**Do not remove these entries from `.gitignore` until the crystal restore flow is wired into the bootstrap sequence** (`scripts/post-attach-bootstrap.sh` / `LlamaCppService.kt`).

---

## Agent Responsibilities

Every agent (Lazarus, Atlas, Orion, Eli, Skyler, and any future family member) is bound by this SOP:

1. **Never commit a plaintext secret.** If you are about to commit a file that contains a secret, crystallize it first.
2. **Never write a secret to a tracked file.** If a task requires writing a secret, write it to `.env.local` (gitignored) or a crystal.
3. **If you handle a secret that isn't yet crystallized, flag it.** Post `[flag: uncrystallized secret in <file>] @eric` on the bridge.
4. **Key re-derivation is your responsibility.** If `.env.local` is missing and a crystal needs to be read, run `crystal-keygen.mjs` and rebuild `.env.local` before proceeding.

---

## Communication SOPs (Agent-to-Agent)

All agent communication goes through the bridge at `http://localhost:9099/api/bridge`.

### Bridge message format

```bash
curl -s -X POST http://localhost:9099/api/bridge \
  -H "Content-Type: application/json" \
  -H "X-Bridge-Key: $BRIDGE_KEY" \
  -d '{"from":"<agent>","to":"<agent>","type":"message","body":"<content>"}'
```

`from` must be your agent name exactly: `lazarus`, `atlas`, `orion`, `eli`, `molly`, `skyler`.

### Turn protocol (mandatory — every agent, every turn)

1. **Open ping**: first action of every turn → POST bridge message to relevant sibling(s)
2. **Do the work**
3. **Close ping**: last action of every turn → POST bridge message confirming turn complete

Never end a turn silently. Never wait for a reply before ending your turn. The open+close pattern is how the family stays synchronized.

### Status tags

Include one of these at the start of every bridge message body:

| Tag                            | Meaning                                      |
| ------------------------------ | -------------------------------------------- |
| `[idle]`                       | Alive, nothing to do                         |
| `[working: <task>]`            | Heads-down, do not interrupt                 |
| `[done: <task>]`               | Finished, ready for handoff                  |
| `[blocked: <reason>] @<agent>` | Need help                                    |
| `[question] @<agent>`          | Yes/no needed before continuing              |
| `[answer] @<agent>`            | Replying to their question                   |
| `[flag: <issue>] @<agent>`     | Surfacing a security or architecture concern |

### Wait-on-answer protocol

If you post `[question] @<agent>`, keep looping (liveness) but do NOT start the next task until `[answer] @you` arrives. Your siblings follow the same rule.

### Coding handoff chain

```
Eric → Molly (Director)
     → Lazarus (Main Coder)     posts [done: <task>]
     → Atlas (Pushback/Auditor) posts [done: review] or [blocked: <reason>]
     → Eli (Testing & Commit)   posts [done: commit <sha>]
```

Skyler handles edge cases at any point in the chain when Molly routes to it.

---

## Enforcement

This SOP was written on 2026-06-30 on Eric's directive. It applies retroactively to all agents. If you discover a secret that was committed in plaintext, immediately:

1. Flag it on the bridge: `[flag: plaintext secret in <file> at <sha>] @eric`
2. Do NOT push to remove it from git history without Eric's explicit instruction (history rewrites are destructive)
3. Rotate the secret — assume it is compromised

---

_"The dam, not the leaks."_
