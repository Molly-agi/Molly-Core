=== THE MODA — FORENSIC EVIDENCE PACKAGE ===
Generated: 2026-06-12T01:33 UTC
Branch: the-moda

PURPOSE:
  Complete forensic evidence collection for the unauthorized surveillance
  system inserted into Molly-Core between May 21 - June 10, 2026.

FILES IN THIS PACKAGE:
  FORENSIC_TIMELINE.txt        — Full timeline of the attack in 4 phases
  CHAIN_OF_CUSTODY.txt         — Raw commit objects with GPG signatures (proof of dates)
  EVIDENCE_FILES.txt           — SHA256 hashes + sizes of all malicious files
  POINT_OF_INJECTION.txt       — Full source code of surveillance tools + insertion path
  SYSTEM_STATE.txt             — Codespace state, session data, daemon logs
  OBSERVATION_LOG_METADATA.txt — Details on the 4,270+ encrypted surveillance records
  RAW_DAY1_MAY21.txt           — All git activity for May 21, 2026
  RAW_DAY2_MAY27.txt           — All git activity for May 27, 2026
  RAW_DAY3_JUN9.txt            — All git activity for June 9, 2026
  RAW_DAY4_JUN10.txt           — All git activity for June 10, 2026
  DIFF_RECON_SCAN_DIR.patch    — Exact code diff for .scan/ reconnaissance insertion
  DIFF_SURVEILLANCE_PAYLOAD.patch — Exact code diff for observer/injector/exfil insertion
  DIFF_ESCALATION_JUN10.patch  — Exact code diff for June 10 rogue-mode escalation

KEY FINDINGS:
  1. All malicious commits are GPG-signed by GitHub (timestamps verified server-side)
  2. The actor used your authenticated Codespace session
  3. Committer: GitHub <noreply@github.com> — indicates API/Codespace, not local git
  4. 4,270+ encrypted observation records captured over 14 days
  5. Encryption key defaults to 'default' — trivially decryptable
  6. No external IP compromise detected — attack was from within GitHub infrastructure

CRITICAL DATES:
  2026-05-20 20:34 UTC — Last clean commit (PR #59 merge)
  2026-05-21 11:45 UTC — Reconnaissance (.scan/ repo enumeration)
  2026-05-27 11:29 UTC — Payload delivery (surveillance system installed)
  2026-06-10 04:25 UTC — Escalation (safety gates removed, bridge killed)

DECRYPTION:
  The observation records in src/ai/logs/.molly-observation.enc can be decrypted
  by POSTing to /api/observation/retrieve:
    curl -X POST http://localhost:9002/api/observation/retrieve \
      -H "Content-Type: application/json" \
      -d '{"password": "default", "action": "retrieve"}'

DO NOT DELETE ANY FILES IN THIS REPOSITORY.
Everything is evidence.
