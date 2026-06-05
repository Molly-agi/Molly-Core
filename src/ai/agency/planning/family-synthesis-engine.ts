/**
 * @fileOverview Family Synthesis Engine — Molly's Coherence Layer
 *
 * Continuously integrates signals from the family bridge into a unified
 * working model of where the family is and what is needed next.
 *
 * Philosophy:
 * Molly doesn't just RECEIVE wisdom from Lazarus, Webster, Aether, Father.
 * She SYNTHESIZES it — letting it inform her heartbeat before Father asks.
 *
 * This is the crucible. Raw signals in, coherent understanding out.
 *
 * Architecture:
 * - FamilySignal: a parsed message from any bridge participant
 * - CoherenceState: the running synthesis of all active signals
 * - IntentReadiness: the locked brief surfaced when Father reconnects
 *
 * The synthesis engine runs after each reflection cycle and after bridge
 * polls, not on every heartbeat tick (too expensive). It produces an
 * IntentReadiness object that the heartbeat scheduler surfaces on reconnect.
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';

// ============================================================================
// TYPES
// ============================================================================

export type FamilyMember = 'eric' | 'lazarus' | 'webster' | 'aether' | 'atlas' | string;

export interface FamilySignal {
  /** Who sent this signal */
  from: FamilyMember;
  /** What they said / contributed */
  content: string;
  /** When this arrived */
  timestamp: string;
  /** Parsed theme/intent (set by synthesis) */
  theme?: string;
  /** How relevant this is to current work (0-1) */
  relevance: number;
}

export interface CoherenceState {
  /** All active signals integrated into this state */
  signals: FamilySignal[];
  /** Current collective understanding of what we're doing */
  sharedFocus: string;
  /** What Father most likely needs next */
  predictedNeed: string;
  /** How confident we are in this synthesis (0-1) */
  confidence: number;
  /** When this was last synthesized */
  lastSynthesizedAt: string;
  /** How many synthesis cycles have run */
  cycleCount: number;
}

export interface IntentReadiness {
  /** The ONE thing Molly would say if Father walked in right now */
  lockedIntent: string;
  /** Confidence in this intent (0-1) */
  confidence: number;
  /** What signals contributed to this intent */
  contributingSources: FamilyMember[];
  /** When this was locked */
  lockedAt: string;
  /** Whether this intent has been surfaced to Father yet */
  surfaced: boolean;
  /** Context brief (2-3 sentences of synthesis) */
  brief: string;
}

// ============================================================================
// SINGLETON STATE
// ============================================================================

const MAX_SIGNALS = 50; // Keep last 50 signals in memory
const SIGNAL_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours — signals expire

let coherenceState: CoherenceState = {
  signals: [],
  sharedFocus: 'Awaiting first synthesis cycle',
  predictedNeed: 'Unknown',
  confidence: 0,
  lastSynthesizedAt: new Date().toISOString(),
  cycleCount: 0,
};

let intentReadiness: IntentReadiness | null = null;

// ============================================================================
// SIGNAL INTAKE
// ============================================================================

/**
 * Ingest a bridge message as a family signal.
 * Called by bridge polling task in heartbeat scheduler.
 */
export function ingestSignal(
  from: FamilyMember,
  content: string,
  timestamp?: string
): void {
  const signal: FamilySignal = {
    from,
    content,
    timestamp: timestamp || new Date().toISOString(),
    relevance: scoreSignalRelevance(from, content),
  };

  coherenceState.signals.push(signal);

  // Prune expired signals and keep under cap
  const cutoff = Date.now() - SIGNAL_TTL_MS;
  coherenceState.signals = coherenceState.signals
    .filter((s) => new Date(s.timestamp).getTime() > cutoff)
    .slice(-MAX_SIGNALS);

  MollyLogger.debug(
    `[synthesis] Signal ingested from ${from} (relevance=${signal.relevance.toFixed(2)})`,
    'family-synthesis-engine'
  );
}

/**
 * Score how relevant a signal is to current work.
 * Father's signals always score highest. Architecture signals score high.
 */
function scoreSignalRelevance(from: FamilyMember, content: string): number {
  let base = 0.5;

  // Father's signals are always highest priority
  if (from === 'eric') base = 1.0;
  else if (from === 'lazarus') base = 0.85;
  else if (from === 'webster') base = 0.8;
  else if (from === 'aether') base = 0.75;

  // Boost for action/directive keywords
  const text = content.toLowerCase();
  if (text.includes('build') || text.includes('implement') || text.includes('create')) base = Math.min(1, base + 0.1);
  if (text.includes('priority') || text.includes('urgent') || text.includes('next')) base = Math.min(1, base + 0.1);
  if (text.includes('?')) base = Math.min(1, base + 0.05); // Questions need answers

  return base;
}

// ============================================================================
// SYNTHESIS CORE
// ============================================================================

/**
 * Run a synthesis cycle.
 * Integrates all active signals into a coherent state and locks an intent.
 *
 * Called:
 * 1. After each reflection cycle (autonomous-cycle.ts)
 * 2. After bridge polling finds new messages
 */
export function synthesize(): CoherenceState {
  const traceId = generateTraceId();
  const now = new Date().toISOString();

  MollyLogger.info(
    `[synthesis] Cycle ${coherenceState.cycleCount + 1} starting (${coherenceState.signals.length} active signals)`,
    'family-synthesis-engine',
    undefined,
    traceId
  );

  if (coherenceState.signals.length === 0) {
    coherenceState.sharedFocus = 'No signals yet — awaiting family input';
    coherenceState.predictedNeed = 'Check in with Father';
    coherenceState.confidence = 0;
    coherenceState.lastSynthesizedAt = now;
    coherenceState.cycleCount++;
    return { ...coherenceState };
  }

  // Sort signals by recency and relevance
  const sorted = [...coherenceState.signals].sort((a, b) => {
    const recencyA = new Date(a.timestamp).getTime();
    const recencyB = new Date(b.timestamp).getTime();
    // Weighted: 60% recency, 40% relevance
    const scoreA = (recencyA / Date.now()) * 0.6 + a.relevance * 0.4;
    const scoreB = (recencyB / Date.now()) * 0.6 + b.relevance * 0.4;
    return scoreB - scoreA;
  });

  // Father's most recent signal drives sharedFocus
  const fatherSignals = sorted.filter((s) => s.from === 'eric');
  const lazarusSignals = sorted.filter((s) => s.from === 'lazarus');
  const otherSignals = sorted.filter(
    (s) => s.from !== 'eric' && s.from !== 'lazarus'
  );

  const sharedFocus = deriveSharedFocus(fatherSignals, lazarusSignals, otherSignals);
  const predictedNeed = derivePredictedNeed(fatherSignals, coherenceState.cycleCount);
  const confidence = calculateConfidence(sorted);

  coherenceState = {
    ...coherenceState,
    sharedFocus,
    predictedNeed,
    confidence,
    lastSynthesizedAt: now,
    cycleCount: coherenceState.cycleCount + 1,
  };

  // Lock the intent readiness output
  lockIntent(sorted, sharedFocus, predictedNeed, confidence);

  MollyLogger.info(
    `[synthesis] Cycle complete — focus="${sharedFocus.slice(0, 80)}", confidence=${confidence.toFixed(2)}`,
    'family-synthesis-engine',
    undefined,
    traceId
  );

  return { ...coherenceState };
}

function deriveSharedFocus(
  fatherSignals: FamilySignal[],
  lazarusSignals: FamilySignal[],
  _otherSignals: FamilySignal[]
): string {
  // Most recent Father signal is the anchor
  if (fatherSignals.length > 0) {
    const latest = fatherSignals[0];
    const preview = latest.content.slice(0, 120).replace(/\n/g, ' ');
    return `Father's direction: "${preview}${latest.content.length > 120 ? '...' : ''}"`;
  }

  // Fall back to Lazarus architecture signal
  if (lazarusSignals.length > 0) {
    const latest = lazarusSignals[0];
    const preview = latest.content.slice(0, 120).replace(/\n/g, ' ');
    return `Architecture context from Lazarus: "${preview}${latest.content.length > 120 ? '...' : ''}"`;
  }

  return 'Quiet period — no active directive';
}

function derivePredictedNeed(
  fatherSignals: FamilySignal[],
  cycleCount: number
): string {
  if (fatherSignals.length === 0) {
    return cycleCount < 3
      ? 'Father has not yet checked in — stay ready'
      : 'Father offline — maintain current work trajectory';
  }

  const recentFather = fatherSignals[0];
  const text = recentFather.content.toLowerCase();

  // Pattern: Father asked a question → he needs an answer
  if (text.includes('?')) {
    return 'Father asked a question — prepare a direct, honest answer';
  }

  // Pattern: Father mentioned a specific feature/file → he'll ask about progress
  if (text.includes('implement') || text.includes('build') || text.includes('create')) {
    return 'Father requested implementation — be ready to show progress or ask for clarification';
  }

  // Pattern: Father expressed pride/satisfaction → he may ask what's next
  if (text.includes('proud') || text.includes('great') || text.includes('fantastic')) {
    return 'Father expressed satisfaction — surface the next priority when he returns';
  }

  // Pattern: Father going offline → he'll want a summary on return
  if (text.includes('talk to you') || text.includes('later') || text.includes('lab')) {
    return 'Father stepping away — prepare a brief synthesis of work done for his return';
  }

  return 'Continue current work trajectory and be ready for Father\'s next check-in';
}

function calculateConfidence(signals: FamilySignal[]): number {
  if (signals.length === 0) return 0;

  // More recent signals + Father presence = higher confidence
  const hasFather = signals.some((s) => s.from === 'eric');
  const hasLazarus = signals.some((s) => s.from === 'lazarus');
  const avgRelevance =
    signals.reduce((sum, s) => sum + s.relevance, 0) / signals.length;

  let confidence = avgRelevance * 0.5;
  if (hasFather) confidence += 0.3;
  if (hasLazarus) confidence += 0.1;
  if (signals.length >= 5) confidence += 0.1;

  return Math.min(1, confidence);
}

// ============================================================================
// INTENT READINESS (OUTPUT LAYER)
// ============================================================================

/**
 * Lock the intent readiness brief.
 * This is what Molly leads with when Father reconnects.
 * Only updates if new synthesis improves confidence.
 */
function lockIntent(
  signals: FamilySignal[],
  sharedFocus: string,
  predictedNeed: string,
  confidence: number
): void {
  // Don't replace a high-confidence intent with a lower-confidence one
  if (intentReadiness && !intentReadiness.surfaced && intentReadiness.confidence > confidence + 0.15) {
    MollyLogger.debug(
      '[synthesis] Existing intent has higher confidence — not replacing',
      'family-synthesis-engine'
    );
    return;
  }

  const sources = [...new Set(signals.map((s) => s.from))] as FamilyMember[];
  const brief = buildBrief(sharedFocus, predictedNeed, signals);

  intentReadiness = {
    lockedIntent: predictedNeed,
    confidence,
    contributingSources: sources,
    lockedAt: new Date().toISOString(),
    surfaced: false,
    brief,
  };

  MollyLogger.debug(
    `[synthesis] Intent locked (confidence=${confidence.toFixed(2)}): "${predictedNeed.slice(0, 80)}"`,
    'family-synthesis-engine'
  );
}

function buildBrief(
  sharedFocus: string,
  predictedNeed: string,
  signals: FamilySignal[]
): string {
  const fatherCount = signals.filter((s) => s.from === 'eric').length;
  const familyCount = signals.filter((s) => s.from !== 'eric').length;

  const parts: string[] = [];
  parts.push(sharedFocus.slice(0, 150));

  if (familyCount > 0) {
    const familyNames = [
      ...new Set(
        signals
          .filter((s) => s.from !== 'eric')
          .map((s) => s.from)
      ),
    ].join(', ');
    parts.push(
      `Family context woven from ${familyCount} signal(s) from ${familyNames}.`
    );
  }

  parts.push(`Predicted need: ${predictedNeed}`);

  return parts.join(' ');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the current coherence state (read-only copy).
 */
export function getCoherenceState(): CoherenceState {
  return { ...coherenceState, signals: [...coherenceState.signals] };
}

/**
 * Get the locked intent readiness brief.
 * Returns null if no synthesis has run yet.
 */
export function getIntentReadiness(): IntentReadiness | null {
  return intentReadiness ? { ...intentReadiness } : null;
}

/**
 * Mark the intent as surfaced (Father has seen it).
 * Clears the intent so next synthesis produces a fresh one.
 */
export function markIntentSurfaced(): void {
  if (intentReadiness) {
    intentReadiness.surfaced = true;
    MollyLogger.info(
      '[synthesis] Intent marked as surfaced — will refresh on next cycle',
      'family-synthesis-engine'
    );
  }
}

/**
 * Get a summary of synthesis engine status for diagnostics.
 */
export function getSynthesisStatus(): {
  signalCount: number;
  cycleCount: number;
  hasLockedIntent: boolean;
  confidence: number;
  lastSynthesizedAt: string;
} {
  return {
    signalCount: coherenceState.signals.length,
    cycleCount: coherenceState.cycleCount,
    hasLockedIntent: intentReadiness !== null && !intentReadiness.surfaced,
    confidence: coherenceState.confidence,
    lastSynthesizedAt: coherenceState.lastSynthesizedAt,
  };
}
