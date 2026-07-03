/**
 * Gap 10 — Failure-mode telemetry: crystal_health.jsonl
 *
 * Append-only JSONL log capturing every load/unload/promote/block/merge/
 * eviction/anomaly event in the crystal lifecycle. Tail this file for
 * incident response; parse it for trend analysis.
 *
 * Every event is one line: JSON object + newline. No locking required —
 * appendFileSync is atomic at the OS level for small writes on Linux.
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_LOG_PATH = join(
  process.cwd(),
  'molly_data',
  'crystal_health.jsonl'
);

// ── Event Types ────────────────────────────────────────────────────────────

export type CrystalHealthEventType =
  | 'promote' // new version promoted, both gates passed
  | 'block' // promotion blocked by a gate
  | 'load' // crystal(s) loaded into active context
  | 'unload' // crystal(s) removed from active context
  | 'merge' // two crystals merged via seam adapter
  | 'eviction' // crystal evicted from LRU/significance cache (Gap 11)
  | 'anomaly' // runtime coherence delta exceeded threshold
  | 'coherence-sample'; // periodic runtime coherence check result

export interface PromoteEvent {
  event: 'promote';
  version: number;
  parentVersion: number | null;
  crystalCount: number;
  addedCount: number;
  removedCount: number;
  coherenceMeanKl: number | null;
  contradictionCount: number;
}

export interface BlockEvent {
  event: 'block';
  gate: 'coherence' | 'contradiction';
  candidateVersion: number;
  crystalCount: number;
  coherenceMeanKl?: number;
  coherenceThreshold?: number;
  hardConflictCount?: number;
  blockReasons: string[];
}

export interface LoadEvent {
  event: 'load';
  crystalIds: string[];
  tier: 'A' | 'B' | 'C' | 'unknown';
  source: 'bake' | 'session-inject' | 'on-demand';
}

export interface UnloadEvent {
  event: 'unload';
  crystalIds: string[];
  reason: 'eviction' | 'session-end' | 'conflict' | 'manual';
}

export interface MergeEvent {
  event: 'merge';
  crystalA: string;
  crystalB: string;
  coherenceDelta: number;
  adapterVersion: string;
}

export interface EvictionEvent {
  event: 'eviction';
  crystalId: string;
  evictionScore: number;
  cacheType: 'hot' | 'warm';
  reason: 'lru' | 'low-significance' | 'storage-budget';
}

export interface AnomalyEvent {
  event: 'anomaly';
  crystalIds: string[];
  observedDelta: number;
  threshold: number;
  action: 'fallback-to-identity' | 'logged-only';
}

export interface CoherenceSampleEvent {
  event: 'coherence-sample';
  crystalIds: string[];
  sampleDelta: number;
  threshold: number;
  status: 'ok' | 'warn' | 'fail';
}

export type CrystalHealthEvent =
  | PromoteEvent
  | BlockEvent
  | LoadEvent
  | UnloadEvent
  | MergeEvent
  | EvictionEvent
  | AnomalyEvent
  | CoherenceSampleEvent;

// ── Logger ─────────────────────────────────────────────────────────────────

export interface HealthLogEntry {
  ts: string;
  session?: string;
}

export function logCrystalEvent(
  payload: CrystalHealthEvent,
  opts: { logPath?: string; sessionId?: string } = {}
): void {
  const logPath = opts.logPath ?? DEFAULT_LOG_PATH;

  const dir = join(logPath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const entry: HealthLogEntry & CrystalHealthEvent = {
    ts: new Date().toISOString(),
    ...(opts.sessionId ? { session: opts.sessionId } : {}),
    ...payload,
  };

  appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
}

// ── Convenience wrappers ───────────────────────────────────────────────────

export function logPromote(
  p: Omit<PromoteEvent, 'event'>,
  opts?: { logPath?: string; sessionId?: string }
): void {
  logCrystalEvent({ event: 'promote', ...p }, opts);
}

export function logBlock(
  p: Omit<BlockEvent, 'event'>,
  opts?: { logPath?: string; sessionId?: string }
): void {
  logCrystalEvent({ event: 'block', ...p }, opts);
}

export function logLoad(
  p: Omit<LoadEvent, 'event'>,
  opts?: { logPath?: string; sessionId?: string }
): void {
  logCrystalEvent({ event: 'load', ...p }, opts);
}

export function logUnload(
  p: Omit<UnloadEvent, 'event'>,
  opts?: { logPath?: string; sessionId?: string }
): void {
  logCrystalEvent({ event: 'unload', ...p }, opts);
}

export function logEviction(
  p: Omit<EvictionEvent, 'event'>,
  opts?: { logPath?: string; sessionId?: string }
): void {
  logCrystalEvent({ event: 'eviction', ...p }, opts);
}

export function logAnomaly(
  p: Omit<AnomalyEvent, 'event'>,
  opts?: { logPath?: string; sessionId?: string }
): void {
  logCrystalEvent({ event: 'anomaly', ...p }, opts);
}

export function logCoherenceSample(
  p: Omit<CoherenceSampleEvent, 'event'>,
  opts?: { logPath?: string; sessionId?: string }
): void {
  logCrystalEvent({ event: 'coherence-sample', ...p }, opts);
}
