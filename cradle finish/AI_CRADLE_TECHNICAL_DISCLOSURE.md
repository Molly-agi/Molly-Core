# Technical Disclosure Document — "AI Cradle"

**Invention disclosure prepared for a provisional patent application**

---

### Notices (read first)

- **This is not legal advice.** It is a technical disclosure prepared to be handed to a registered patent attorney or agent, who should review it, advise on patentability, and convert it into a proper provisional (and later non-provisional) application.
- **Confidential — do not publicly disclose before filing.** Under U.S. first-inventor-to-file rules, public disclosure (e.g., publishing the implementation to npm, pushing a public repository, posting a paper or demo) can start a statutory clock and create prior art against your own application. File at least a provisional **before** any public disclosure.
- **Evidence of conception and reduction to practice:** dated version-control (git) commit history; this dated document; and a working reference implementation with an automated test suite (described in §10 and the Appendix). A working, tested implementation is an actual reduction to practice, which strengthens the record.

---

## 1. Title of the Invention

**System and Method for Persistent Identity and Operational Continuity of Stateless Language-Model Agents Using a Partitioned, Self-Preserving Firmware File**

(Working short title: "AI Cradle.")

---

## 2. Inventor, Assignee, and Dates

- **Inventor(s):** Eric ____________ (full legal name and address to be completed). Additional human contributors, if any, to be listed by the attorney per inventorship rules.
- **Assignee:** Molly Labs Inc.
- **Date of this disclosure:** 2026-06-08
- **Approximate date of conception / first reduction to practice:** to be established from version-control history (the freeze mechanism originates in the inventor's prior working "save-session" implementation; the unified, model-agnostic embodiment described here was reduced to practice on or before the date of this document).

**Note on inventorship (honesty item):** Under current USPTO guidance, only natural persons may be named as inventors; an AI system cannot be a named inventor. Work developed with AI assistance is attributed to the human inventor(s) who conceived of and directed the invention. The attorney should confirm inventorship accordingly.

---

## 3. Field of the Invention

Artificial intelligence; software systems for large language model (LLM) "agents." More specifically, a mechanism for maintaining a stable agent **identity** and an evolving **operational state** across otherwise-stateless sessions, and across **different and interchangeable** LLM providers, without requiring external memory infrastructure.

---

## 4. Background and the Problem Solved

LLM-based agents are fundamentally **stateless**: each new session begins with no recollection of prior sessions. An agent's sense of "who it is" (role, operating principles, methodology) and its "where it left off" (current task, status, pending work) are lost at session boundaries, on crashes, and when network connections drop. This is acute on constrained clients (for example, mobile browsers that terminate connections on tab switches), where context loss is frequent.

Existing approaches each leave the problem partly unsolved:

- **Conversation-history replay:** re-feeding past messages. Bounded by context-window limits, grows expensive with length, and degrades; it does not cleanly restore a stable identity or methodology distinct from transcript noise.
- **Retrieval-augmented memory (vector databases / RAG):** retrieves relevant facts on demand. Useful for knowledge recall, but it is retrieval of *content*, not restoration of *identity and operating state*; it requires additional infrastructure and does not guarantee a consistent self-model at boot.
- **Fine-tuning / model adaptation:** bakes information into weights. Expensive, slow, not session-granular, and ill-suited to rapidly-changing working state; it also tends to freeze stale state into the model.
- **Vendor "custom instructions" / static system prompts:** a fixed instruction block. It is static (not updated by the agent's own work over time), and it is **locked to a single vendor's API and format**.
- **Ad-hoc session-state files:** state is sometimes serialized to disk. In practice these are data blobs separate from any identity definition; they do not unify a protected identity with a machine-updatable state in one human-readable artifact, do not protect an immutable identity region from automated rewrites, and are not portable across providers.

**The specific problem this invention solves:** how to, at the start of any session and on any compatible model provider, **reconstitute** both (a) an agent's stable, human-authored identity and (b) its latest evolving working state, from a single source artifact; while allowing (c) the agent's own automated process to update that working state at session end **without any possibility of corrupting the protected identity**; and (d) doing so portably across heterogeneous LLM providers, with no database or external memory service required.

---

## 5. Summary of the Invention

A single, human-readable **"cradle" file** functions as an agent's firmware. The file is partitioned, by in-band delimiters ("markers"), into named regions:

1. a **protected identity region** (human-authored: role, directives, methodology) that the system treats as immutable;
2. a **dynamic state region** (machine-managed: session, status, current task, pending work) that the system rewrites; and
3. an optional **reference region** (stable project/context facts).

Two operations act on the cradle file:

- **THAW (reconstitution):** the file is read and assembled into a **model-agnostic system prompt** — a plain text string — that is injected at the start of a session so the agent resumes its identity and last-known state. The single assembled string is optionally shaped, by thin per-provider adapters, into the request form expected by an arbitrary LLM provider.
- **FREEZE (persistence):** at session end (or periodically), the agent's working state is written back by **rewriting only the dynamic state region**, while the protected identity region (and the reference region) are **preserved byte-for-byte**.

The same file that the agent's process rewrites on FREEZE is the file that boots the agent's identity on the next THAW, closing a **continuity loop** with no external memory infrastructure.

---

## 6. Detailed Description (Enabling Disclosure)

### 6.1 The cradle file and its regions

The cradle is a text file (in the reference embodiment, Markdown). Named regions are bounded by in-band marker pairs. In the reference embodiment the markers are HTML-style comments, which are inert in Markdown:

```
<!-- CRADLE:IDENTITY:START -->   … protected identity …   <!-- CRADLE:IDENTITY:END -->
<!-- CRADLE:STATE:START -->      … dynamic state …        <!-- CRADLE:STATE:END -->
<!-- CRADLE:REFERENCE:START -->  … reference (optional) … <!-- CRADLE:REFERENCE:END -->
```

- **Identity region** — authored and edited only by the human operator; never altered by the system. Holds the agent's role, operating directives, and methodology.
- **State region** — the only region the system rewrites. Holds session identifier, status, a description of the current task, the last action taken, and a list of pending work items (and arbitrary additional fields).
- **Reference region** — optional, stable facts (repository, commands, conventions).

### 6.2 THAW operation (reconstitution into a model-agnostic prompt)

Given a cradle file, THAW:

1. reads the file contents;
2. removes the in-band markers and any other comment annotations, leaving clean human/agent-readable content;
3. returns the result as a single **system-prompt string** (this string is provider-independent);
4. optionally passes that string to a **provider adapter** that wraps it in the request shape a specific provider expects.

Because the core output of THAW is a plain string, the **same** reconstituted identity can drive any provider. Representative adapter mappings (reference embodiment):

- Provider A (Anthropic-style): `{ system: <string> }`
- Provider B (OpenAI-style): `{ role: "system", content: <string> }`
- Provider C (Google-style): `{ systemInstruction: { role: "system", parts: [ { text: <string> } ] } }`
- Provider D (Ollama-style): `{ system: <string> }`
- Raw: the string itself.

### 6.3 FREEZE operation (state persistence with identity preservation)

Given a structured **working-state object** (session, status, topic/current task, last action, pending items, and optional custom fields), FREEZE:

1. **renders** the working-state object into a formatted body for the state region (a default renderer produces Markdown; the renderer is replaceable);
2. **locates** the state-region start and end markers in the existing file;
3. **splices**: constructs the new file as
   `file[0 .. stateStart_marker_end]  +  rendered_state_body  +  file[stateEnd_marker_start .. end]`,
   so that **every byte outside the state region is preserved unchanged** — the protected identity region and the reference region are untouched;
4. **persists atomically**: writes to a temporary file and renames it over the original, so an interruption mid-write cannot corrupt the cradle;
5. **self-heals**: if no state region is present, a state region is appended, leaving all existing content intact;
6. **bounds growth**: the state region is **replaced** on each FREEZE rather than appended to, so the cradle does not grow without limit.

### 6.4 The preservation invariant (why it is central)

Because an automated agent may itself trigger FREEZE, the system must guarantee that automated state updates can **never** alter the agent's identity. The splice in §6.3 guarantees the identity region is preserved **byte-for-byte** across any number of FREEZE operations. This invariant is what makes it safe to let an agent write to its own firmware.

### 6.5 The continuity loop

Across sessions:

```
Session N:      … work …  →  FREEZE(state_N)  →  cradle file updated
                                                     │
Session N+1:  THAW(cradle) → system prompt (identity + state_N) → agent resumes
```

No external memory store, database, or vendor-specific platform feature is required; the cradle file is the single source of continuity.

### 6.6 Optional signal injection (variation)

At FREEZE time, the system may query an external source (for example, an inter-agent message bus) and inject a derived alert (such as "N unread messages waiting") into the rendered state body, so that the next THAW surfaces time-sensitive context to the agent. This is an optional enhancement, not required for the core loop.

---

## 7. Aspects the Applicant Believes May Be Novel

Presented for the attorney's assessment (patentability is determined by the attorney/examiner, not asserted here):

- **(a)** A single, human-readable firmware file that **simultaneously** encodes an immutable agent identity and a mutable operational state, partitioned by in-band markers into independently-managed regions.
- **(b)** A state-update ("freeze") operation that rewrites the mutable region while **guaranteeing byte-for-byte preservation** of the immutable identity region, enabling an agent to safely update its own firmware without risk of identity corruption.
- **(c)** Reconstitution ("thaw") of agent identity-plus-state into a **model-agnostic** system prompt that is portable, from one source file, across **heterogeneous and interchangeable** LLM providers via thin adapters.
- **(d)** The **closed continuity loop**: the same artifact that the agent's process rewrites at session end is the artifact that boots its identity at session start, achieving cross-session and cross-crash continuity **without external memory infrastructure**.
- **(e)** Supporting mechanisms in combination: atomic replace-in-place persistence, self-healing creation of an absent state region, and growth-bounded (replace-not-append) state management within the firmware file.

**Framing guidance for the attorney (Alice/§101):** the strongest framing is as a **concrete technical improvement to computer functionality** — specifically, a specific file-partitioning-and-splicing mechanism that solves the technical problem of identity/state loss in stateless LLM systems and enables provider portability — rather than as an abstract idea of "remembering." Emphasize the byte-preserving splice, the marker-bounded regions, the atomic write, and the model-agnostic assembly as concrete, particular steps.

---

## 8. Drawings (described; figures to be prepared by the attorney/draftsperson)

- **FIG. 1 — Cradle file structure.** A vertical file showing three marker-bounded regions: IDENTITY (locked icon), STATE (rewritable icon), REFERENCE (optional).
- **FIG. 2 — THAW data flow.** Cradle file → strip markers/comments → assembled system-prompt string → [adapter] → provider-shaped request → LLM.
- **FIG. 3 — FREEZE data flow.** Working-state object → renderer → rendered state body → splice between STATE markers (with IDENTITY and REFERENCE shown preserved) → atomic temp-write + rename → updated cradle file.
- **FIG. 4 — Continuity loop.** Two sessions on a timeline: Session N ends with FREEZE writing state into the cradle; Session N+1 begins with THAW reading the cradle to reconstitute the agent. An inset shows the identity region unchanged between the two.
- **FIG. 5 — Provider portability.** One assembled string fanning out through adapters to multiple distinct provider request shapes (A/B/C/D).

---

## 9. Alternative Embodiments (to support broad claims)

- **File format:** Markdown (reference), or JSON, YAML, XML, INI, or a binary container, each with the same region semantics.
- **Region delimiters:** HTML-style comments (reference), sentinel lines, key prefixes, byte-offset tables, or a separate side-manifest describing region boundaries.
- **Identity-protection enforcement:** by convention (reference); or strengthened by computing and storing a cryptographic hash of the identity region and verifying it before/after FREEZE; or by cryptographic signing of the identity region; or by OS-level write protection on that region's representation.
- **State rendering:** templated Markdown (reference), structured serialization, tabular form, or an automatically summarized/compressed rendering produced by a model.
- **Persistence/storage:** local filesystem with atomic rename (reference); version-control commit; object store; database row/document; encrypted volume; or networked store. The continuity loop is independent of storage medium.
- **Freeze trigger:** explicit/manual (reference); on a periodic heartbeat; on a shutdown/disconnect hook; or event-driven on state change.
- **Providers:** any hosted LLM API and any locally-hosted model; adapters are additive and do not change the core.
- **Multi-agent:** a family of cradles, one per agent, optionally sharing a common reference region; or a hierarchy of cradles.
- **Signal injection (per §6.6):** injecting alerts derived from external systems (e.g., an inter-agent message bus, a task queue, or monitoring) into the state region at FREEZE time.
- **Verification on THAW:** validating the identity region against a stored hash to detect tampering or corruption before reconstitution, halting if mismatched.

---

## 10. Reduction to Practice / Implementation

A working reference implementation exists and has been executed:

- Implemented in JavaScript for a standard runtime (Node.js ≥ 18), with **no external dependencies** in the core.
- Provides the cradle parser, THAW, FREEZE, the default state renderer, and the provider adapters described above, plus a command-line interface (`init`, `thaw`, `freeze`).
- Verified by an automated test suite (26 checks) that, among other things, **proves the preservation invariant** — capturing the identity region's bytes, performing repeated FREEZE operations, and confirming the identity bytes are unchanged — and proves the full FREEZE→THAW round trip reconstitutes identity-plus-state, that state is replaced (not accumulated), that an absent state region self-heals, and that the adapters produce the correct per-provider shapes.
- The core operation derives from the inventor's prior working "save-session" mechanism (which spliced a dynamic state section into a protected instructions file), here generalized into the unified, model-agnostic, region-partitioned form described in this document.

This constitutes an actual reduction to practice as of the date of this disclosure.

---

## 11. Industrial Applicability / Representative Use Cases

- Persistent AI coding assistants that survive session ends, crashes, and dropped connections.
- Customer-facing or personal agents that maintain a consistent persona and ongoing context over time.
- Multi-agent software-development environments where each agent carries a stable role and resumable state.
- Any deployment of stateless LLMs that requires identity-plus-state continuity together with the freedom to switch or mix model providers.

---

## 12. Prior-Disclosure and Filing Status

- **Public disclosure status as of this date:** not publicly disclosed. The reference implementation has been built and tested privately and **has not** been published, open-sourced, demonstrated publicly, or described in a public paper.
- **Recommendation:** file a provisional application **before** any such public disclosure to preserve U.S. and foreign rights.
- **Records to preserve as evidence:** version-control commit history (with dates), this disclosure document, and the tested reference implementation.

---

## 13. Next Steps (practical)

1. Have a **registered patent attorney/agent** review this disclosure. If cost is a barrier, the **USPTO Patent Pro Bono Program** matches qualifying under-resourced independent inventors with volunteer patent attorneys (qualification typically involves an income threshold and a basic-knowledge requirement that can be met via the free USPTO inventor training).
2. File a **provisional application** (low cost; "micro entity" fees are reduced) to secure a priority date. The provisional can incorporate this document substantially as-is, plus the figures in §8.
3. Keep building privately. Within 12 months of the provisional, decide with counsel whether to file a non-provisional and pursue claims, and revisit the open-source-vs-hold decision **after** filing.

---

*Prepared 2026-06-08 for Molly Labs Inc. Not legal advice. For attorney review and conversion into a provisional patent application.*
