# Running Summary (Auto-Read on Start)

- 2026-02-18: Phase 5A/5B/5C implemented. Neural bridge context is wired for voice + text, memory integrity now validates reads and verifies writes with checksum checks, and runtime snapshot is exposed at `/api/diagnostics/runtime-snapshot`.
- 2026-02-18: Diagnostics panel now shows an always-visible runtime snapshot card with auto-refresh every 30s, manual refresh, and relative freshness labels (e.g., `just now`, `15s ago`).
- 2026-02-18: Next on restart: run `npm run dev`, open System > Diagnostics, confirm runtime card updates automatically and memory health is not `unavailable` for authenticated users.
- 2026-02-16: I fixed greeting voice timing (speak immediately, retry on autoplay block) and pinned sidebar tabs so they stay visible. If TTS still lags, capture timings and console errors.
- 2026-02-16: Next on restart: run `npm run dev`, open System > Diagnostics, and paste any terminal or console errors. Verify sidebar buttons are no longer visually chained into the research panel.
- 2026-02-16: Guardrails: do not edit Molly personality, greeting protocols, or flow system prompts without explicit permission.
