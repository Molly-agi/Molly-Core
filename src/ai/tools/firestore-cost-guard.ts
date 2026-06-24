/**
 * @fileOverview Firestore Cost Guard — Daily Op Counter + Downgrade Signal
 *
 * Tracks Firestore reads/writes/deletes per UTC day. When the daily cap is
 * reached, signals downgrade so the storage router can skip primary Firestore
 * writes and rely on the triple-bind backup legs (molly_data/ + stuff/dont-panic/).
 *
 * This is a SAFETY LAYER:
 *   - Never throws (atlas dam-fix principle: degraded > broken)
 *   - Never blocks writes — only signals that primary should be skipped
 *   - Data survives in legs 2 + 3 of the triple-bind (item 21)
 *   - Loud one-shot warning when cap is first hit each day
 *   - Counter resets at midnight UTC
 *
 * Env:
 *   MOLLY_FIRESTORE_DAILY_OP_CAP=50000   (default — Firestore free-tier ceiling)
 *   MOLLY_ALLOW_UNSAFE_LIMITS=1          (escape hatch, mirrors rate-limiter)
 */

import { MollyLogger } from '../logger';

const DEFAULT_CAP = 50_000;
const ABSOLUTE_MAX = 10_000_000;

export type FirestoreOpType = 'read' | 'write' | 'delete';

function isUnsafeOverrideEnabled(): boolean {
  const raw = (process.env.MOLLY_ALLOW_UNSAFE_LIMITS || '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function readCapFromEnv(): number {
  const raw = process.env.MOLLY_FIRESTORE_DAILY_OP_CAP;
  if (!raw) return DEFAULT_CAP;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_CAP;
  const ceiling = isUnsafeOverrideEnabled() ? ABSOLUTE_MAX : 1_000_000;
  return Math.min(parsed, ceiling);
}

function startOfUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface FirestoreCostStatus {
  opsToday: number;
  cap: number;
  downgraded: boolean;
  startOfDayUtc: number;
}

class FirestoreCostGuard {
  private cap: number;
  private opsToday = 0;
  private startOfDayUtc: number;
  private downgraded = false;
  private warnedThisDay = false;

  constructor() {
    this.cap = readCapFromEnv();
    this.startOfDayUtc = startOfUtcDay(Date.now());
  }

  private rolloverIfNeeded(now: number): void {
    const today = startOfUtcDay(now);
    if (today > this.startOfDayUtc) {
      this.startOfDayUtc = today;
      this.opsToday = 0;
      this.downgraded = false;
      this.warnedThisDay = false;
    }
  }

  /**
   * Try to consume one Firestore op against the daily budget.
   * @returns true if the op may proceed against Firestore primary,
   *          false if the cap is reached and the caller should DOWNGRADE
   *          to local-only (triple-bind legs 2 + 3 still absorb the write).
   */
  tryConsume(_op: FirestoreOpType): boolean {
    this.rolloverIfNeeded(Date.now());

    if (this.opsToday >= this.cap) {
      if (!this.warnedThisDay) {
        this.warnedThisDay = true;
        this.downgraded = true;
        MollyLogger.warn(
          `Firestore cost guard at daily cap (${this.cap} ops). Primary Firestore writes DOWNGRADED until midnight UTC; writes fall back to local storage. For additional durability legs configure MOLLY_DUAL_WRITE=true and/or MOLLY_TRIPLE_BIND=true (item 21). Set MOLLY_FIRESTORE_DAILY_OP_CAP to raise the cap.`,
          'firestore-cost-guard'
        );
      }
      return false;
    }

    this.opsToday += 1;
    return true;
  }

  isDowngraded(): boolean {
    this.rolloverIfNeeded(Date.now());
    return this.downgraded;
  }

  getStatus(): FirestoreCostStatus {
    this.rolloverIfNeeded(Date.now());
    return {
      opsToday: this.opsToday,
      cap: this.cap,
      downgraded: this.downgraded,
      startOfDayUtc: this.startOfDayUtc,
    };
  }
}

let _instance: FirestoreCostGuard | null = null;

export function getFirestoreCostGuard(): FirestoreCostGuard {
  if (!_instance) _instance = new FirestoreCostGuard();
  return _instance;
}

/** Reset singleton — testing only. */
export function resetFirestoreCostGuard(): void {
  _instance = null;
}
