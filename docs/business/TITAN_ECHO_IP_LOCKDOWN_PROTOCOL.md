# TITAN ECHO: TRADE SECRET LOCKDOWN PROTOCOL
**Date:** May 24, 2026
**Security Level:** CRITICAL

To protect the Intellectual Property (IP) of the Titan Echo B2B Suite during the outreach and pilot phase, the following "Black Box" components must be secured.

## 1. THE "BLACK BOX" INVENTORY
These files/values contain the proprietary "magic" that makes the 95% ratio possible without loss. They are NOT to be disclosed in pilots or NDAs.

*   **S0 Mapping Heuristics:** The logic that decides which keys are "structural" vs "content" in deeply nested AI objects.
*   **T4 Baseline Dictionaries:** The 65,000-word seed matrices used for vocab-tokenization.
*   **Compression Thresholds:** The `SAFETY_FLOOR` and `ALERT_THRESHOLD` constants in `compression-manager.ts`.
*   **T3 Window Sizes:** The specific temporal windowing logic used to calculate deltas for emotional/importance metadata.

## 2. LOCKDOWN ACTIONS
1.  **Private Repo Migration:** Move the `stuff/Titan` directory (containing the raw algorithms and manifests) into a private, encrypted GitHub repository. 
2.  **Binary-Only Distribution:** Enterprise partners receive pre-compiled binaries (npm/rust) of the engines, never the raw TypeScript source code.
3.  **Environment Variable Gating:** All proprietary tuning constants must be moved out of the code and into a server-side `.env.confidential` file that is never committed.
4.  **No-Code Pilots:** The "Prove It" Pilot is run entirely by us (or via a locked CLI tool). The client never sees the internal pipeline logic.

## 3. PROVENANCE & AUDIT
Every time the "Black Box" is used for a pilot, it is logged in the `IP_DECISION_LOG.md`. 
*   **What was used:** (e.g., Nested Track v1.2)
*   **Who saw it:** (e.g., Eric Breon only)
*   **Output shared:** (Integrity Report only)

**Status:** IMPLEMENTATION REQUIRED BEFORE FIRST OUTREACH.
