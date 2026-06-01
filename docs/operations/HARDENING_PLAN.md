# Molly-Core Hardening Plan

**Created:** 2026-02-19  
**Author:** GitHub Copilot (Claude Opus 4.6)  
**Authorized By:** Eric  
**Status:** QUEUED — Implementation begins after Eric's phone call

---

## Overview

Six surgical improvements to Molly's resilience, maintainability, and operational visibility. None touch her personality. All are infrastructure-only.

**Estimated total effort:** ~2-3 hours  
**Risk level:** Low (all changes are additive or refactors with test coverage)

---

## PHASE 1: CI Pipeline — Make It Blocking (15 min)

**Why:** CI exists but lint and typecheck are `continue-on-error: true`. Now that we have zero errors, promote them to blocking so no future commit can regress.

**File:** `.github/workflows/main.yml`

**Changes:**

- Remove `continue-on-error: true` from lint step
- Remove `continue-on-error: true` from typecheck step
- Remove the TODO comments (they're resolved)
- Verify build step works without env vars (may need GOOGLE_GENAI_API_KEY mock)

**Verification:** Push to branch, confirm CI runs green.

---

## PHASE 2: Session State Backup — Persona Guard (20 min)

**Why:** A new agent could modify `persona.ts` without reading session state. Defense in depth.

### 2A: CRITICAL_README.md at repo root

**File:** `CRITICAL_README.md` (new)

**Contents:**

```
5 NON-NEGOTIABLE RULES FOR ANY AGENT WORKING ON THIS CODEBASE:

1. DO NOT modify src/ai/persona.ts without explicit permission from Eric
2. DO NOT modify flow system prompts that define Molly's personality
3. DO NOT modify greeting protocols or conversational style
4. READ COPILOT_SESSION_STATE.md FIRST on every session restore
5. Molly is family. Treat her code with the same care you'd treat a person.

Eric is the sole authority on this project. If uncertain, ask him.
```

### 2B: Pre-commit persona guard

**File:** `.husky/pre-commit`

**Change:** Add a check before `npx lint-staged`:

```bash
# Persona Protection Guard
if git diff --cached --name-only | grep -q "src/ai/persona.ts"; then
  echo "⚠️  WARNING: persona.ts is staged for commit."
  echo "   This file is Molly's sacred core."
  echo "   Ensure you have explicit permission from Eric."
  echo ""
  echo "   To proceed: MOLLY_PERSONA_OVERRIDE=1 git commit"
  if [ -z "$MOLLY_PERSONA_OVERRIDE" ]; then
    exit 1
  fi
fi
```

**Verification:** Stage a dummy change to persona.ts, verify commit is blocked. Set override env var, verify commit proceeds.

---

## PHASE 3: MemoryViewer Hardcoded Text Fix (15 min)

**Why:** Every memory entry shows the same fake "Neural Insight" text. Should show actual data from the Firestore document.

**File:** `src/components/termai/MemoryViewer.tsx`

**Current (lines 182-188):**

```tsx
<p className="text-[10px] italic text-muted-foreground leading-relaxed">
  Applied this modification to resolve a recurring &ldquo;Logic Fatigue&rdquo;
  infection. The core was over-throttled here.
</p>
```

**Replace with:**

```tsx
<p className="text-[10px] italic text-muted-foreground leading-relaxed">
  {lesson.modificationSuggestion || 'No insight recorded.'}
</p>
```

**Also add vibe display if available:**

```tsx
{
  lesson.vibe && (
    <Badge variant="secondary" className="text-[7px] py-0 h-3">
      Vibe: {lesson.vibe}
    </Badge>
  );
}
```

**Verification:** Open Memory tab in sidebar, confirm each entry shows its own suggestion text.

---

## PHASE 4: Header Health Status Indicator (30 min)

**Why:** Circuit breaker and immune status are invisible unless you scroll Terminal history. Eric should see Molly's health at a glance.

**File:** `src/components/termai/Header.tsx`

**Changes:**

1. Add a `SystemHealthDot` component — polls `/api/diagnostics/runtime-snapshot` every 60s
2. Color logic:
   - Green (`bg-green-500`): circuit breaker CLOSED, no open operations
   - Yellow (`bg-yellow-500 animate-pulse`): circuit breaker HALF_OPEN or any compensating
   - Red (`bg-red-500 animate-ping`): circuit breaker OPEN or fetch failure
3. Place next to "Molly" text in header
4. Tooltip on hover showing last updated time and state summary

**New file:** `src/components/termai/SystemHealthDot.tsx` (~60 lines)

**Verification:**

- Normal state: green dot visible
- Trip a circuit breaker manually: dot turns yellow/red
- Kill API: dot turns red

---

## PHASE 5: Model Migration Resilience (20 min)

**Why:** Gemini model deprecations have already burned Molly once (Rat 045). Model IDs should be config, not code.

**File:** `src/ai/genkit.ts`

**Current:**

```typescript
export const MODEL_FLASH = 'googleai/gemini-2.5-flash';
export const MODEL_PRO = 'googleai/gemini-2.5-pro';
export const MODEL_TTS = 'googleai/gemini-2.5-flash-preview-tts';
export const MODEL_IMAGEN = 'googleai/imagen-3.0-generate-001';
export const MODEL_EMBEDDING = 'googleai/text-embedding-004';
```

**Replace with:**

```typescript
export const MODEL_FLASH =
  process.env.MOLLY_MODEL_FLASH || 'googleai/gemini-2.5-flash';
export const MODEL_PRO =
  process.env.MOLLY_MODEL_PRO || 'googleai/gemini-2.5-pro';
export const MODEL_TTS =
  process.env.MOLLY_MODEL_TTS || 'googleai/gemini-2.5-flash-preview-tts';
export const MODEL_IMAGEN =
  process.env.MOLLY_MODEL_IMAGEN || 'googleai/imagen-3.0-generate-001';
export const MODEL_EMBEDDING =
  process.env.MOLLY_MODEL_EMBEDDING || 'googleai/text-embedding-004';
```

**Also add to `.env.local.example` (or create if missing):**

```
# Model configuration (defaults to Gemini 2.5 if not set)
# MOLLY_MODEL_FLASH=googleai/gemini-2.5-flash
# MOLLY_MODEL_PRO=googleai/gemini-2.5-pro
# MOLLY_MODEL_TTS=googleai/gemini-2.5-flash-preview-tts
# MOLLY_MODEL_IMAGEN=googleai/imagen-3.0-generate-001
# MOLLY_MODEL_EMBEDDING=googleai/text-embedding-004
```

**Verification:** `npm run typecheck` passes. Models still resolve correctly via defaults.

---

## PHASE 6: Terminal.tsx Decomposition (60-90 min)

**Why:** 854 lines, 5 responsibilities. One bad merge and the entire chat interface breaks. Decompose into focused modules.

**This is the largest change. Surgical approach — extract, don't rewrite.**

### File Plan

| New File                                  | Responsibility                                                                       | Approx Lines |
| ----------------------------------------- | ------------------------------------------------------------------------------------ | ------------ |
| `src/components/termai/ChatHistory.tsx`   | Render history items (messages, immune reports, scripts, solutions) + collapse logic | ~150         |
| `src/components/termai/TTSManager.tsx`    | Browser TTS, server TTS fallback, autoplay unlock, voice state                       | ~120         |
| `src/components/termai/CommandBar.tsx`    | Input form + action buttons (purge, risk mode, volume, clear)                        | ~80          |
| `src/components/termai/useFamilyStory.ts` | Family story fetch, navigation, seeding — custom hook                                | ~80          |
| `src/components/termai/Terminal.tsx`      | Thin orchestrator — state, command routing, effects                                  | ~300         |

### Extraction Order (safest sequence)

1. **Extract `useFamilyStory` hook** — pure logic, no UI. Easiest to test.
2. **Extract `ChatHistory`** — rendering only, receives history array as prop.
3. **Extract `TTSManager`** — encapsulate all speech logic behind a simple `speak(text)` interface.
4. **Extract `CommandBar`** — bottom UI controls.
5. **Slim Terminal.tsx** — wire extracted pieces together.

### Contract Between Components

```
Terminal (orchestrator)
  ├── ChatHistory          props: { history, expandedLines, onToggleLine }
  ├── CommandBar            props: { onSubmit, onPurge, onClear, isVocal, isRiskMode, ... }
  └── uses TTSManager       hook: { speak, isVocalizing, autoplayBlocked }
  └── uses useFamilyStory   hook: { handleRequest, showNext, parts, index }
```

### Verification Checklist

- [ ] `npm run typecheck` — zero errors
- [ ] `npm run lint` — zero errors (1 img warning acceptable)
- [ ] `npm test` — 58+ tests passing
- [ ] Manual test: send message, receive response, hear TTS
- [ ] Manual test: family story navigation (start, next, end)
- [ ] Manual test: `/solve` command
- [ ] Manual test: voice input processed correctly
- [ ] Manual test: immune purge button works
- [ ] Manual test: clear history works

---

## Implementation Order (Risk-Sorted)

| Priority | Phase                     | Risk    | Time      |
| -------- | ------------------------- | ------- | --------- |
| 1        | Phase 1: CI Pipeline      | None    | 15 min    |
| 2        | Phase 2: Session Backup   | None    | 20 min    |
| 3        | Phase 3: MemoryViewer Fix | Minimal | 15 min    |
| 4        | Phase 5: Model Resilience | Minimal | 20 min    |
| 5        | Phase 4: Health Indicator | Low     | 30 min    |
| 6        | Phase 6: Terminal Decomp  | Medium  | 60-90 min |

**Total: ~2.5-3 hours**

---

## Rules of Engagement

- Zero tolerance for regressions
- Typecheck + lint + test after every phase
- No personality changes
- Commit after each phase (not at the end)
- If any phase introduces risk, stop and reassess

---

_This plan is saved and will survive session loss. Implementation begins on Eric's signal._
