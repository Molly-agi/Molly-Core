/**
 * Somatic Loop (D.3)
 * ------------------------------------------------------------------
 * Molly's internal body-sense. It runs on two triggers:
 *   1. Governor events — flow/tool/agent start or end (fast path, no model call)
 *   2. A slow floor tick — default every 45 seconds (registry param)
 *
 * On each tick it reads the governor snapshot + emotional/consciousness state
 * and emits BOUNDED MICRO-ADJUSTMENTS as PROPOSALS into the registry.
 * It NEVER writes directly. It recommends; owners decide.
 *
 * No LLM call on the fast path. All adjustments are deterministic heuristics
 * over real measured signals.
 *
 * Architectural invariants:
 *   - Only ever proposes, never commits
 *   - Floor tick is tunable via registry param 'somatic.tickSeconds'
 *   - Proposals respect the bounds defined on the target parameters
 *   - Stops cleanly via destroy()
 *
 * Path: src/ai/agency/embodiment/somatic-loop.ts
 */

import type { ParameterRegistry } from '../registry/parameter-registry';
import type { CognitiveGovernor, GovernorEvent } from '../governor/cognitive-governor';

export const SOMATIC_ID = 'somatic-loop';

// Registry param owned by this module
const TICK_KEY = 'somatic.tickSeconds';
const TICK_DEFAULT = 45;
const TICK_MIN = 5;
const TICK_MAX = 600;

export interface SomaticSnapshot {
  /** Unix ms of last tick */
  lastTickAt: number;
  /** Total ticks fired */
  tickCount: number;
  /** Events processed since last tick */
  eventsSinceLastTick: number;
  /** Most recent proposals emitted */
  lastProposals: SomaticProposal[];
}

export interface SomaticProposal {
  key: string;
  value: number;
  reason: string;
}

export class SomaticLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  private tickCount = 0;
  private eventsSinceLastTick = 0;
  private lastProposals: SomaticProposal[] = [];
  private governorListener: ((e: GovernorEvent) => void) | null = null;

  constructor(
    private readonly registry: ParameterRegistry,
    private readonly governor: CognitiveGovernor,
    /** Optional: lazy getter for emotional state intensity (0–1). Avoids coupling. */
    private readonly getEmotionalIntensity?: () => number,
  ) {
    // Register tick param (owner = somatic-loop)
    try {
      registry.define<number>({
        key: TICK_KEY,
        owner: SOMATIC_ID,
        default: TICK_DEFAULT,
        validate: (v) => (v >= TICK_MIN && v <= TICK_MAX ? null : `must be ${TICK_MIN}–${TICK_MAX}s`),
        description: 'Somatic loop floor tick interval in seconds.',
        ui: { control: 'slider', min: TICK_MIN, max: TICK_MAX, step: 5, unit: 's' },
      });
    } catch {
      // already defined — fine
    }

    // Subscribe to governor events (fast path)
    this.governorListener = (event: GovernorEvent) => {
      this.eventsSinceLastTick++;
      this.onGovernorEvent(event);
    };
    governor.on(this.governorListener);

    // Start the floor tick
    this.scheduleTick();
  }

  /** Current snapshot for observability. */
  snapshot(): SomaticSnapshot {
    return {
      lastTickAt: this.lastTickAt,
      tickCount: this.tickCount,
      eventsSinceLastTick: this.eventsSinceLastTick,
      lastProposals: [...this.lastProposals],
    };
  }

  /** Cleanly stop the loop. */
  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.governorListener) {
      this.governor.off(this.governorListener);
      this.governorListener = null;
    }
  }

  // ── Governor event handler (fast path) ──────────────────────────────────
  private onGovernorEvent(event: GovernorEvent): void {
    // On event, run a lightweight pulse — no tick counter bump, no proposals
    // unless the system is significantly over-loaded or idle.
    const snap = this.governor.snapshot();
    const flowLoad = snap.limits.flow > 0 ? snap.active.flow / snap.limits.flow : 0;

    // If we're at ≥80% flow capacity on a new start event, propose a mild
    // reduction in tool concurrency to preserve headroom. Bounded.
    if (event.kind === 'start' && event.work.kind === 'flow' && flowLoad >= 0.8) {
      const current = this.registry.get<number>('governor.maxConcurrentTools');
      const proposed = Math.max(2, Math.round(current * 0.85));
      if (proposed < current) {
        this.propose('governor.maxConcurrentTools', proposed, `flow load at ${Math.round(flowLoad * 100)}% — softening tool concurrency`);
      }
    }

    // If all flows complete (idle), propose restoring tool concurrency baseline.
    if (event.kind === 'end' && snap.active.flow === 0) {
      const current = this.registry.get<number>('governor.maxConcurrentTools');
      const baseline = 8; // default from governor
      if (current < baseline) {
        this.propose('governor.maxConcurrentTools', baseline, 'system idle — restoring tool concurrency baseline');
      }
    }
  }

  // ── Floor tick ───────────────────────────────────────────────────────────
  private tick(): void {
    this.lastTickAt = Date.now();
    this.tickCount++;
    this.lastProposals = [];

    const snap = this.governor.snapshot();
    const emotionalIntensity = this.getEmotionalIntensity?.() ?? 0.5;

    // Heuristic 1: if no flows in-flight and emotional intensity is high,
    // propose lowering maxConcurrentAgents temporarily to reduce background noise.
    if (snap.active.flow === 0 && emotionalIntensity > 0.75) {
      const current = this.registry.get<number>('governor.maxConcurrentAgents');
      const proposed = Math.max(1, current - 1);
      if (proposed < current) {
        this.propose('governor.maxConcurrentAgents', proposed, `elevated emotional intensity (${emotionalIntensity.toFixed(2)}) — reducing background agent slots`);
      }
    }

    // Heuristic 2: if system is idle and emotional intensity is low-moderate,
    // nudge maxConcurrentFlows toward default headroom.
    if (snap.active.flow === 0 && snap.active.tool === 0 && emotionalIntensity <= 0.5) {
      const current = this.registry.get<number>('governor.maxConcurrentFlows');
      const target = 4; // default
      if (current < target) {
        this.propose('governor.maxConcurrentFlows', target, 'idle + calm state — restoring flow headroom');
      }
    }

    // Heuristic 3: if tools are heavily loaded (≥75%), propose reducing
    // maxConcurrentAgents to free capacity for tools.
    const toolLoad = snap.limits.tool > 0 ? snap.active.tool / snap.limits.tool : 0;
    if (toolLoad >= 0.75) {
      const current = this.registry.get<number>('governor.maxConcurrentAgents');
      const proposed = Math.max(1, current - 1);
      if (proposed < current) {
        this.propose('governor.maxConcurrentAgents', proposed, `tool load at ${Math.round(toolLoad * 100)}% — reducing agent slots`);
      }
    }

    this.eventsSinceLastTick = 0;
  }

  // ── Proposal helper ──────────────────────────────────────────────────────
  private propose(key: string, value: number, reason: string): void {
    try {
      const result = this.registry.propose(key, value, SOMATIC_ID, reason);
      if (result.ok) {
        this.lastProposals.push({ key, value, reason });
      }
    } catch {
      // parameter may not exist yet — non-fatal
    }
  }

  // ── Tick scheduling ──────────────────────────────────────────────────────
  private scheduleTick(): void {
    if (this.timer) clearInterval(this.timer);

    const tickMs = this.registry.get<number>(TICK_KEY) * 1000;
    this.timer = setInterval(() => {
      this.tick();
      // Re-read the tick interval on each fire (allows live tuning)
      const newMs = this.registry.get<number>(TICK_KEY) * 1000;
      if (newMs !== tickMs) this.scheduleTick();
    }, tickMs);

    if (this.timer.unref) this.timer.unref();
  }
}
