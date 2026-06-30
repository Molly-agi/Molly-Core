/**
 * @fileOverview Gap 2 phase 3 — KV capture orchestrator
 *
 * Wires the slot snapshot client, the binary differ, and an injectable
 * significance scorer into a single state machine. The consumer streams
 * generated token windows in via observe(); the orchestrator decides
 * WHEN to snapshot (pre-trigger + trigger thresholds) and emits a delta
 * descriptor when both snapshots are captured.
 *
 * The scorer callback is injected so this module ships independently of
 * Lazarus's significance-vector.scoreStreaming (still in flight). Default
 * stub returns 0.0 so nothing triggers until a real scorer is plugged in.
 *
 * State machine:
 *   idle ──score >= preTriggerScore──> armed (saves baseline)
 *   armed ──score >= triggerScore──> captured (saves after, emits delta)
 *   captured ──score <= triggerScore - hysteresis──> idle
 *   (any) ──finalize()──> bake any pending baseline as a final snapshot
 */

import type { SlotSnapshotClient } from './slot-snapshot';

export interface ScorerCtx {
  sessionId: string;
  priorScore: number;
  windowIndex: number;
}

export type StreamingScorer = (
  window: string,
  ctx: ScorerCtx
) => number | Promise<number>;

export interface CaptureOrchestratorOptions {
  client: SlotSnapshotClient;
  slotId: number;
  sessionId: string;
  /** 0..1, score that arms the baseline snapshot. Default 0.5 */
  preTriggerScore?: number;
  /** 0..1, score that captures the after snapshot. Default 0.7 */
  triggerScore?: number;
  /** Drop required to return to idle. Default 0.05 */
  hysteresis?: number;
  /** Optional scorer; defaults to one that always returns 0 (inert) */
  scorer?: StreamingScorer;
  /** Optional clock for tests */
  now?: () => Date;
}

export type CaptureState = 'idle' | 'armed' | 'captured';

export interface CaptureEvent {
  type: 'idle' | 'armed' | 'captured' | 'released' | 'skipped' | 'error';
  state: CaptureState;
  score: number;
  windowIndex: number;
  baselineFile?: string;
  afterFile?: string;
  reason?: string;
}

export class KvCaptureOrchestrator {
  private readonly client: SlotSnapshotClient;
  private readonly slotId: number;
  private readonly sessionId: string;
  private readonly preTriggerScore: number;
  private readonly triggerScore: number;
  private readonly hysteresis: number;
  private readonly scorer: StreamingScorer;
  private readonly now: () => Date;

  private state: CaptureState = 'idle';
  private windowIndex = 0;
  private priorScore = 0;
  private baselineFile: string | null = null;
  private afterFile: string | null = null;
  private pending: Promise<unknown> | null = null;

  constructor(opts: CaptureOrchestratorOptions) {
    if (!opts.client) throw new Error('client is required');
    if (!opts.sessionId) throw new Error('sessionId is required');
    this.client = opts.client;
    this.slotId = opts.slotId;
    this.sessionId = opts.sessionId;
    this.preTriggerScore = opts.preTriggerScore ?? 0.5;
    this.triggerScore = opts.triggerScore ?? 0.7;
    this.hysteresis = opts.hysteresis ?? 0.05;
    this.scorer = opts.scorer ?? (async () => 0);
    this.now = opts.now ?? (() => new Date());

    if (this.preTriggerScore >= this.triggerScore) {
      throw new Error('preTriggerScore must be < triggerScore');
    }
    if (this.hysteresis < 0 || this.hysteresis >= this.triggerScore) {
      throw new Error('hysteresis must be in [0, triggerScore)');
    }
  }

  getState(): CaptureState {
    return this.state;
  }

  /**
   * Feed one window of generated text. Returns the event the state
   * machine emitted for this observation. Idempotent under re-entry —
   * if a save is in flight from a prior observe() the new call is
   * marked skipped rather than racing.
   */
  async observe(window: string): Promise<CaptureEvent> {
    const idx = this.windowIndex++;
    if (this.pending) {
      return {
        type: 'skipped',
        state: this.state,
        score: this.priorScore,
        windowIndex: idx,
        reason: 'in-flight',
      };
    }
    const task = this._observe(window, idx).finally(() => {
      this.pending = null;
    });
    this.pending = task;
    return task;
  }

  private async _observe(window: string, idx: number): Promise<CaptureEvent> {
    let score = 0;
    try {
      score = await this.scorer(window, {
        sessionId: this.sessionId,
        priorScore: this.priorScore,
        windowIndex: idx,
      });
    } catch (err) {
      return {
        type: 'error',
        state: this.state,
        score: this.priorScore,
        windowIndex: idx,
        reason: `scorer threw: ${(err as Error).message}`,
      };
    }
    const clampedScore = Math.max(0, Math.min(1, score));
    this.priorScore = clampedScore;

    switch (this.state) {
      case 'idle':
        if (clampedScore >= this.preTriggerScore) {
          return await this.armBaseline(clampedScore, idx);
        }
        return {
          type: 'idle',
          state: 'idle',
          score: clampedScore,
          windowIndex: idx,
        };

      case 'armed':
        if (clampedScore >= this.triggerScore) {
          return await this.captureAfter(clampedScore, idx);
        }
        return {
          type: 'armed',
          state: 'armed',
          score: clampedScore,
          windowIndex: idx,
        };

      case 'captured':
        if (clampedScore <= this.triggerScore - this.hysteresis) {
          this.state = 'idle';
          const baseline = this.baselineFile;
          const after = this.afterFile;
          this.baselineFile = null;
          this.afterFile = null;
          return {
            type: 'released',
            state: 'idle',
            score: clampedScore,
            windowIndex: idx,
            baselineFile: baseline ?? undefined,
            afterFile: after ?? undefined,
          };
        }
        return {
          type: 'captured',
          state: 'captured',
          score: clampedScore,
          windowIndex: idx,
        };
    }
  }

  /**
   * End-of-session bake. If we're armed but never reached trigger, capture
   * a final snapshot anyway so the session's tail state is recorded.
   */
  async finalize(): Promise<CaptureEvent> {
    const idx = this.windowIndex;
    if (this.state === 'armed') {
      return await this.captureAfter(this.priorScore, idx, true);
    }
    return {
      type: this.state === 'captured' ? 'captured' : 'idle',
      state: this.state,
      score: this.priorScore,
      windowIndex: idx,
      baselineFile: this.baselineFile ?? undefined,
      afterFile: this.afterFile ?? undefined,
    };
  }

  private async armBaseline(score: number, idx: number): Promise<CaptureEvent> {
    try {
      const filename = this.buildName('baseline');
      await this.client.saveSlot(this.slotId, filename);
      this.baselineFile = filename;
      this.state = 'armed';
      return {
        type: 'armed',
        state: 'armed',
        score,
        windowIndex: idx,
        baselineFile: filename,
      };
    } catch (err) {
      return {
        type: 'error',
        state: this.state,
        score,
        windowIndex: idx,
        reason: `baseline save failed: ${(err as Error).message}`,
      };
    }
  }

  private async captureAfter(
    score: number,
    idx: number,
    fromFinalize = false
  ): Promise<CaptureEvent> {
    try {
      const filename = this.buildName(fromFinalize ? 'finalize' : 'after');
      await this.client.saveSlot(this.slotId, filename);
      this.afterFile = filename;
      this.state = 'captured';
      return {
        type: 'captured',
        state: 'captured',
        score,
        windowIndex: idx,
        baselineFile: this.baselineFile ?? undefined,
        afterFile: filename,
      };
    } catch (err) {
      return {
        type: 'error',
        state: this.state,
        score,
        windowIndex: idx,
        reason: `after save failed: ${(err as Error).message}`,
      };
    }
  }

  private buildName(tag: 'baseline' | 'after' | 'finalize'): string {
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    return `kv_${this.slotId}_${this.sessionId}_${tag}_${stamp}.bin`;
  }
}
