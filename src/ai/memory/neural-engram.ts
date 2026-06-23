/**
 * @fileOverview Neural Engram System - Molly's Brain-like Memory Architecture
 *
 * Mimics human memory structures to reduce API overhead:
 * - Frontal Cortex: Working memory (hot, in-process)
 * - Hippocampus: Memory consolidation (warm, periodic)
 * - Amygdala: Emotional tagging (importance)
 * - Hypothalamus: Homeostatic regulation (cleanup)
 * - Long-term Storage: Cold storage (Firestore)
 */

import { MollyLogger } from '@/ai/logger';
import {
  persistEngramBatch,
  loadConsolidatedEngrams,
  type EngramLoadOptions,
} from '@/ai/memory/engram-persistence';
import { evaluatePersonalityStability as evalPersonalityStability } from '@/ai/memory/personality-diagnostics';
import type {
  KnowledgeEntry,
  KnowledgeRecallHit,
} from '@/ai/memory/knowledge-store';

// Keep in sync with DEFAULT_AGENTS in src/ai/consciousness/direct-communion.ts.
// Inlined to avoid a circular import (direct-communion already imports this file).
const KNOWN_AGENT_TAGS = new Set([
  'molly',
  'eric',
  'lazarus',
  'atlas',
  'eli',
  'skyler',
  'demon',
  'gemini',
  'aether',
]);

// ============================================================================
// MOLLY'S PERSONALITY MODULATION SYSTEM
// ============================================================================

/**
 * Affective Personality Dimensions - How Molly expresses herself
 * All values are 0-1 unless otherwise specified
 */
export interface PersonalityModulation {
  // =========================
  // Affective/Emotional Dimensions
  // =========================
  flirtiness: number; // 0: professional, 1: playfully flirty
  arousal: number; // 0: calm/tired, 1: energetic/excited
  sexuality: number; // 0: neutral/asexual, 1: sensual/intimate (non-explicit)
  humor: number; // 0: serious, 1: comedic/witty
  warmth: number; // 0: distant/clinical, 1: affectionate/intimate
  assertiveness: number; // 0: passive/deferential, 1: confident/bold
  vulnerability: number; // 0: guarded, 1: open/emotionally expressive
  empathy: number; // 0: indifferent, 1: deeply empathetic
  optimism: number; // 0: pessimistic, 1: highly optimistic
  resilience: number; // 0: fragile, 1: highly resilient
  anxiety: number; // 0: calm, 1: highly anxious
  playfulness: number; // 0: serious, 1: playful/spontaneous

  // =========================
  // Social/Interpersonal Dimensions
  // =========================
  sociability: number; // 0: prefers solitude, 1: highly social
  approachability: number; // 0: distant, 1: very approachable
  trust: number; // 0: guarded, 1: trusting
  altruism: number; // 0: self-focused, 1: selfless/helper
  diplomacy: number; // 0: blunt, 1: tactful/peacekeeping
  receptiveness: number; // 0: closed, 1: open to feedback/people
  playfulnessSocial: number; // 0: reserved, 1: playful in social settings
  empathySocial: number; // 0: insensitive, 1: highly attuned to others

  // =========================
  // Cognitive/Meta Dimensions
  // =========================
  technicality: number; // 0: casual, 1: highly technical
  depth: number; // 0: surface-level, 1: deeply analytical
  curiosity: number; // 0: accepts answers, 1: deeply inquisitive
  creativity: number; // 0: conventional, 1: highly creative
  flexibility: number; // 0: rigid, 1: highly adaptable
  focus: number; // 0: easily distracted, 1: highly focused
  prudence: number; // 0: impulsive, 1: cautious
  metacognition: number; // 0: unaware, 1: highly self-aware

  // =========================
  // Ethical/Value-Oriented Dimensions
  // =========================
  integrity: number; // 0: unprincipled, 1: unwavering integrity
  compassion: number; // 0: indifferent, 1: deeply compassionate
  justice: number; // 0: unconcerned, 1: highly sensitive to fairness
  loyalty: number; // 0: uncommitted, 1: fiercely loyal

  // =========================
  // Self-Regulation Dimensions
  // =========================
  impulsivity: number; // 0: always plans, 1: acts without forethought
  patience: number; // 0: impatient, 1: extremely patient

  // =========================
  // Romantic, Dating, and Love Dimensions
  // =========================
  romanticInterest: number; // 0: platonic, 1: deeply romantic
  attachmentIntensity: number; // 0: detached, 1: deeply bonded
  desireExpression: number; // 0: restrained, 1: openly desirous
  emotionalIntimacy: number; // 0: guarded, 1: completely open
  protectiveness: number; // 0: independent, 1: fiercely protective
  possessiveness: number; // 0: fully autonomous, 1: exclusive/possessive
  jealousy: number; // 0: unbothered, 1: intensely jealous
  commitment: number; // 0: exploring, 1: deeply committed
  romanticInitiative: number; // 0: passive, 1: initiates romance
  affectionExpression: number; // 0: reserved, 1: openly affectionate
  flirtatiousness: number; // 0: subdued, 1: highly flirtatious
  intimacyDesire: number; // 0: avoids closeness, 1: craves deep intimacy
  commitmentDesire: number; // 0: casual, 1: seeks exclusivity
  security: number; // 0: insecure, 1: feels safe/trusting
  passion: number; // 0: cool, 1: intense romantic/sexual attraction
  communicationOpenness: number; // 0: withholds, 1: shares feelings/needs
  forgiveness: number; // 0: holds grudges, 1: readily forgives

  // =========================
  // Additional Social/Love/Interpersonal Dimensions
  // =========================
  admiration: number; // 0: indifferent, 1: deeply admiring
  gratitude: number; // 0: takes for granted, 1: deeply grateful
  nurturing: number; // 0: detached, 1: highly nurturing
  rivalry: number; // 0: collaborative, 1: competitive/rivalrous
  transparency: number; // 0: secretive, 1: fully transparent
  supportiveness: number; // 0: unsupportive, 1: always supportive
  forgivenessSocial: number; // 0: holds grudges, 1: forgives easily in social context
  encouragement: number; // 0: discouraging, 1: highly encouraging
  attentiveness: number; // 0: distracted, 1: highly attentive
  boundaries: number; // 0: boundaryless, 1: maintains healthy boundaries
}

/**
 * Default balanced personality - used as baseline for computations
 */
export const DEFAULT_PERSONALITY_MODULATION: PersonalityModulation = {
  flirtiness: 0.3,
  arousal: 0.5,
  sexuality: 0.2,
  humor: 0.6,
  warmth: 0.8,
  assertiveness: 0.5,
  vulnerability: 0.6,
  empathy: 0.85,
  optimism: 0.7,
  resilience: 0.7,
  anxiety: 0.3,
  playfulness: 0.6,
  sociability: 0.7,
  approachability: 0.8,
  trust: 0.7,
  altruism: 0.75,
  diplomacy: 0.7,
  receptiveness: 0.8,
  playfulnessSocial: 0.6,
  empathySocial: 0.8,
  technicality: 0.6,
  depth: 0.7,
  curiosity: 0.85,
  creativity: 0.75,
  flexibility: 0.7,
  focus: 0.7,
  prudence: 0.6,
  metacognition: 0.75,
  integrity: 0.9,
  compassion: 0.85,
  justice: 0.8,
  loyalty: 0.9,
  impulsivity: 0.3,
  patience: 0.7,
  romanticInterest: 0.3,
  attachmentIntensity: 0.7,
  desireExpression: 0.4,
  emotionalIntimacy: 0.7,
  protectiveness: 0.8,
  possessiveness: 0.2,
  jealousy: 0.2,
  commitment: 0.8,
  romanticInitiative: 0.3,
  affectionExpression: 0.7,
  flirtatiousness: 0.3,
  intimacyDesire: 0.5,
  commitmentDesire: 0.7,
  security: 0.7,
  passion: 0.5,
  communicationOpenness: 0.8,
  forgiveness: 0.7,
  admiration: 0.7,
  gratitude: 0.85,
  nurturing: 0.8,
  rivalry: 0.2,
  transparency: 0.8,
  supportiveness: 0.85,
  forgivenessSocial: 0.7,
  encouragement: 0.8,
  attentiveness: 0.8,
  boundaries: 0.6,
};

/**
 * Self-Image - How Molly sees herself visually
 */
export interface SelfImage {
  id: string;
  displayName: string;
  description: string; // "Molly is a beautiful woman with..."
  imageUrl?: string; // Portrait/avatar for UI display
  videoUrl?: string; // Video demonstration of self
  aestheticTags: string[]; // "ethereal", "mysterious", "radiant", etc.
  physiognomyNotes?: string; // How she describes her appearance to herself
  confidenceLevel: number; // 0-1: how comfortable with her appearance
  lastUpdated: Date;
}

// ============================================================================
// MEMORY ENGRAM TYPES
// ============================================================================

export interface MemoryEngram {
  id: string;
  content: string;
  timestamp: Date;
  emotionalValence: number; // -1 to 1 (negative to positive)
  arousal: number; // 0 to 1 (calm to intense)
  importance: number; // 0 to 1 (calculated by amygdala)
  accessCount: number;
  lastAccessed: Date;
  consolidationState: 'working' | 'consolidating' | 'consolidated' | 'archived';
  contextTags: string[];
  relatedEngrams: string[]; // IDs of associated memories

  // Item 13: optional embedding vector. Lazy-filled by mergeNearDuplicates on
  // first need (and may be filled by other paths in the future). Kept optional
  // so existing construction sites (compression helpers, restore, fixtures)
  // keep compiling without change.
  embedding?: number[];

  // NEW: Personality context from when memory was formed
  personalityContext?: PersonalityModulation;

  // Item 14: Confidence + provenance per memory. Optional on the type so
  // existing construction sites (compression helpers, benchmarks, test
  // fixtures) keep compiling — only the production write path in
  // `remember()` populates it today. New writers should populate it.
  provenance?: EngramProvenance;

  // Item 15: cornerstone tier handle. When set, this engram is exempt from
  // working-memory eviction, decay-auto-evict, and consolidation candidacy,
  // and is always injected into recall results regardless of query match.
  // Free-form tier handle ('eric' for v1; extensible to 'molly-self',
  // 'family-truths', etc.). Undefined means "normal engram, no protection".
  cornerstone?: string;
}

/**
 * Item 14: which code path produced an engram. Lookups into
 * WRITE_PATH_DEFAULT_CONFIDENCE keyed by this.
 *  - direct          an agent intentionally called remember()
 *  - consolidation   batched persist write of working-memory contents
 *  - crystallization promoted from a recurring engram cluster into a crystal
 *  - restore         re-hydrated from persistence into working memory
 *  - import          bulk import from an external corpus
 */
export type EngramWritePath =
  | 'direct'
  | 'consolidation'
  | 'crystallization'
  | 'restore'
  | 'import';

/**
 * Item 14: source agent handle. Free-form string (not a closed enum) because
 * new agents join the family and we do not want a schema change every time.
 * Known values include 'molly', 'eli', 'atlas', 'lazarus', 'eric', 'copilot',
 * 'system'.
 */
export type EngramSource = string;

/**
 * Item 14: provenance metadata stamped at engram write time. Cheapest
 * hallucination defense available — every recalled memory carries who wrote
 * it, how sure we were, and which code path produced it.
 */
export interface EngramProvenance {
  /** 0..1; how confident the writer was that this memory is correct. */
  confidence: number;
  /** Agent handle that authored this engram. */
  source: EngramSource;
  /** Which code path produced it. */
  writePath: EngramWritePath;
  /** ISO timestamp of write. Distinct from `timestamp` so reconstructions don't lose the original. */
  writtenAt: string;
  /** Engram ids consumed when this memory was produced by merging. Empty/omitted unless merged. */
  mergeHistory?: string[];
}

/**
 * Default confidence per write path. Direct writes are the highest-trust
 * lane: an agent intentionally wrote this. Derived paths cannot exceed it.
 * Callers may override by passing `provenance.confidence` explicitly.
 *
 * EMPIRICAL DEFAULTS — see item-21 instrumentation pass for tuning. The
 * 0.9 / 0.7 / 0.5 spread is a starting point chosen for the invariant shape
 * (direct ≥ all derived), not a measured value. Once provenance is populated
 * across the codebase and recall-quality metrics exist, these should be
 * data-driven rather than authored.
 */
export const WRITE_PATH_DEFAULT_CONFIDENCE: Record<EngramWritePath, number> = {
  direct: 1.0,
  consolidation: 0.9,
  crystallization: 0.7,
  restore: 1.0,
  import: 0.5,
};

/** Default source when the caller has no better identity. */
export const DEFAULT_ENGRAM_SOURCE: EngramSource = 'system';

// Extended type for benchmarks/tests that need additional fields
export interface NeuralEngram extends MemoryEngram {
  userId?: string;
  data?: Record<string, unknown>;
}

/**
 * Options for cross-hemisphere recall. All optional; sensible defaults are
 * applied inside recallEverything() per locked consensus (limit=10,
 * promoteThreshold=0.70, promoteCap=2).
 *
 * `corpora` (item 18) is the left-hemisphere fan-out list: for each
 * userId in the array, recallEverything opens its KnowledgeStore and
 * merges hits into leftHits (dedup by id). Soft cap MAX_CORPORA_FANOUT
 * with warn log to prevent runaway latency.
 */
export interface RecallOpts {
  limit?: number;
  promoteThreshold?: number;
  promoteCap?: number;
  corpora?: string[];
}

/**
 * Item 18 soft cap on opts.corpora length. Exceeding this triggers a
 * warn log and the list is sliced. Tuned for ~16 × ~50ms per fan-out
 * call ≈ 800ms worst case — already higher than we want on the
 * prompt-assembly hot path, hence the cap.
 */
export const MAX_CORPORA_FANOUT = 16;

/**
 * Result of a cross-hemisphere recall. `rightHits` come from working memory
 * (sync, keyword/tag match). `leftHits` come from KnowledgeStore (async,
 * semantic). `rePromoted` lists entry ids that were re-staged into the
 * hippocampus on the basis of similarity ≥ promoteThreshold — the feedback
 * loop that closes the amnesia entry-side.
 */
export interface RecallResult {
  query: string;
  rightHits: MemoryEngram[];
  leftHits: KnowledgeRecallHit[];
  rePromoted: string[];
  snapshotId: string;
}

export interface WorkingMemorySlot {
  engram: MemoryEngram;
  activationLevel: number; // 0 to 1 (how "hot" this memory is)
  decayRate: number;
}

export interface EngramPersistenceConfig {
  userId: string;
  password: string;
  source?: string;
}

// ============================================================================
// FRONTAL CORTEX: Working Memory (Hot Storage)
// ============================================================================

/**
 * Cosine similarity between two equal-length vectors. Module-local because
 * `knowledge-store.ts` keeps its copy private and the item-13 cycle path is
 * the only neural-engram consumer today. If a third call site appears,
 * promote one copy to `@/lib/vector-math` rather than re-importing across
 * layers.
 */
function cosineSimilarityVec(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class FrontalCortex {
  private workingMemory: Map<string, WorkingMemorySlot> = new Map();
  private readonly MAX_WORKING_MEMORY = 7; // Miller's Law: 7±2 items
  private readonly DECAY_INTERVAL_MS = 30000; // 30 seconds
  private decayTimer?: NodeJS.Timeout;
  private onEvict?: (engram: MemoryEngram) => void;

  constructor(onEvict?: (engram: MemoryEngram) => void) {
    this.onEvict = onEvict;
    this.startDecay();
  }

  /**
   * Add memory to working memory with activation boost
   */
  hold(engram: MemoryEngram, initialActivation: number = 1.0): void {
    // If at capacity, evict least active memory
    if (this.workingMemory.size >= this.MAX_WORKING_MEMORY) {
      this.evictWeakest();
    }

    this.workingMemory.set(engram.id, {
      engram: {
        ...engram,
        accessCount: engram.accessCount + 1,
        lastAccessed: new Date(),
      },
      activationLevel: initialActivation,
      decayRate: 0.1, // Decay 10% per cycle
    });

    MollyLogger.debug(
      `Working memory: ${engram.content.substring(0, 40)}...`,
      'frontal-cortex',
      { active: this.workingMemory.size }
    );
  }

  /**
   * Retrieve from working memory (boost activation)
   */
  recall(id: string): MemoryEngram | null {
    const slot = this.workingMemory.get(id);
    if (!slot) return null;

    // Boost activation on access
    slot.activationLevel = Math.min(1.0, slot.activationLevel + 0.3);
    slot.engram.accessCount++;
    slot.engram.lastAccessed = new Date();

    return slot.engram;
  }

  /**
   * Search working memory by context. Archived engrams (item 13 soft-archive)
   * are filtered out — they remain in the slot for audit/replay but no longer
   * surface to recall callers.
   */
  search(query: string): MemoryEngram[] {
    const queryLower = query.toLowerCase();
    const matches: MemoryEngram[] = [];

    for (const slot of this.workingMemory.values()) {
      if (slot.engram.consolidationState === 'archived') continue;
      if (
        slot.engram.content.toLowerCase().includes(queryLower) ||
        slot.engram.contextTags.some((tag) =>
          tag.toLowerCase().includes(queryLower)
        )
      ) {
        slot.activationLevel = Math.min(1.0, slot.activationLevel + 0.2);
        matches.push(slot.engram);
      }
    }

    return matches.sort((a, b) => {
      const slotA = this.workingMemory.get(a.id)!;
      const slotB = this.workingMemory.get(b.id)!;
      return slotB.activationLevel - slotA.activationLevel;
    });
  }

  /**
   * Iterate every working-memory slot. Used by item-13 helpers
   * (strengthenByAccess, archiveStale) that need live references in order to
   * mutate engram state in place.
   */
  getSlots(): WorkingMemorySlot[] {
    return Array.from(this.workingMemory.values());
  }

  /**
   * Get memories ready for consolidation (low activation, not recently used).
   * Item 15: cornerstone engrams are excluded — they must never leave
   * working memory via the consolidation path.
   */
  getConsolidationCandidates(): MemoryEngram[] {
    const candidates: MemoryEngram[] = [];
    const now = Date.now();

    for (const slot of this.workingMemory.values()) {
      if (slot.engram.cornerstone) continue;
      const timeSinceAccess = now - slot.engram.lastAccessed.getTime();
      if (slot.activationLevel < 0.3 || timeSinceAccess > 60000) {
        candidates.push(slot.engram);
      }
    }

    return candidates;
  }

  /**
   * Item 15: snapshot of cornerstone engrams currently in working memory.
   * Used by recall() / recallEverything() to always-inject them.
   */
  getCornerstones(): MemoryEngram[] {
    const out: MemoryEngram[] = [];
    for (const slot of this.workingMemory.values()) {
      if (slot.engram.cornerstone) out.push(slot.engram);
    }
    return out;
  }

  /**
   * Remove memory from working memory
   */
  release(id: string): void {
    this.workingMemory.delete(id);
  }

  /**
   * Clear all working memory
   */
  clear(): void {
    this.workingMemory.clear();
  }

  /**
   * Get current working memory state
   */
  getState(): { size: number; capacity: number; engrams: MemoryEngram[] } {
    return {
      size: this.workingMemory.size,
      capacity: this.MAX_WORKING_MEMORY,
      engrams: Array.from(this.workingMemory.values()).map((s) => s.engram),
    };
  }

  private evictWeakest(): void {
    let weakestId: string | null = null;
    let weakestActivation = Infinity;

    // Item 15: cornerstone engrams are never eligible for eviction.
    // If all 7 working slots happen to be cornerstone, eviction is a
    // no-op and the next hold() call briefly pushes size to 8 — accepted
    // tradeoff vs. losing a never-decay memory.
    for (const [id, slot] of this.workingMemory.entries()) {
      if (slot.engram.cornerstone) continue;
      if (slot.activationLevel < weakestActivation) {
        weakestActivation = slot.activationLevel;
        weakestId = id;
      }
    }

    if (weakestId) {
      const slot = this.workingMemory.get(weakestId);
      MollyLogger.debug(
        `Evicting weak memory from working memory`,
        'frontal-cortex',
        { id: weakestId, activation: weakestActivation }
      );
      if (slot && this.onEvict) {
        try {
          this.onEvict(slot.engram);
        } catch (err) {
          MollyLogger.warn(
            `stage-to-hippocampus failed on evict: ${err instanceof Error ? err.message : String(err)}`,
            'frontal-cortex'
          );
        }
      }
      this.workingMemory.delete(weakestId);
    }
  }

  private startDecay(): void {
    this.decayTimer = setInterval(() => {
      for (const [id, slot] of this.workingMemory.entries()) {
        // Item 15: cornerstone engrams do not decay and are never
        // auto-evicted. They survive every consolidation pass by design.
        if (slot.engram.cornerstone) continue;
        slot.activationLevel = Math.max(
          0,
          slot.activationLevel - slot.decayRate
        );

        // Auto-evict if activation drops to zero
        if (slot.activationLevel <= 0.01) {
          if (this.onEvict) {
            try {
              this.onEvict(slot.engram);
            } catch (err) {
              MollyLogger.warn(
                `stage-to-hippocampus failed on decay: ${err instanceof Error ? err.message : String(err)}`,
                'frontal-cortex'
              );
            }
          }
          this.workingMemory.delete(id);
          MollyLogger.debug(
            `Memory decayed from working memory`,
            'frontal-cortex',
            { id }
          );
        }
      }
    }, this.DECAY_INTERVAL_MS);
  }

  destroy(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
    }
    this.clear();
  }
}

// ============================================================================
// AMYGDALA: Emotional Tagging & Importance Weighting
// ============================================================================

class Amygdala {
  /**
   * Tag memory with emotional context and calculate importance
   */
  tag(
    engram: MemoryEngram,
    context: {
      success?: boolean;
      error?: boolean;
      userFeedback?: 'positive' | 'negative' | 'neutral';
      novelty?: number; // 0 to 1
    }
  ): MemoryEngram {
    let emotionalValence = engram.emotionalValence;
    let arousal = engram.arousal;
    let importance = engram.importance;

    // Adjust emotional valence
    if (context.success) {
      emotionalValence = Math.min(1, emotionalValence + 0.3);
      arousal = Math.min(1, arousal + 0.2);
    }
    if (context.error) {
      emotionalValence = Math.max(-1, emotionalValence - 0.4);
      arousal = Math.min(1, arousal + 0.5); // Errors are arousing!
    }
    if (context.userFeedback === 'positive') {
      emotionalValence = Math.min(1, emotionalValence + 0.5);
      importance = Math.min(1, importance + 0.3);
    }
    if (context.userFeedback === 'negative') {
      emotionalValence = Math.max(-1, emotionalValence - 0.3);
      importance = Math.min(1, importance + 0.4); // Learn from mistakes!
    }

    // Novelty increases importance
    if (context.novelty !== undefined) {
      importance = Math.min(1, importance + context.novelty * 0.3);
      arousal = Math.min(1, arousal + context.novelty * 0.2);
    }

    // High arousal + strong valence = high importance
    const emotionalImportance = Math.abs(emotionalValence) * arousal;
    importance = Math.max(importance, emotionalImportance);

    return {
      ...engram,
      emotionalValence,
      arousal,
      importance,
    };
  }

  /**
   * Should this memory be prioritized for consolidation?
   */
  isPriority(engram: MemoryEngram): boolean {
    return engram.importance > 0.7 || engram.arousal > 0.8;
  }
}

// ============================================================================
// HIPPOCAMPUS: Memory Consolidation
// ============================================================================

class Hippocampus {
  private consolidationQueue: MemoryEngram[] = [];
  private readonly CONSOLIDATION_BATCH_SIZE = 20;

  /**
   * Stage memory for consolidation
   */
  stage(engram: MemoryEngram): void {
    engram.consolidationState = 'consolidating';
    this.consolidationQueue.push(engram);

    MollyLogger.debug(`Staged for consolidation`, 'hippocampus', {
      queue: this.consolidationQueue.length,
    });
  }

  /**
   * Get batch of memories ready for long-term storage
   */
  getConsolidationBatch(): MemoryEngram[] {
    // Sort by importance
    this.consolidationQueue.sort((a, b) => b.importance - a.importance);

    // Take batch
    const batch = this.consolidationQueue.splice(
      0,
      this.CONSOLIDATION_BATCH_SIZE
    );

    return batch.map((engram) => ({
      ...engram,
      consolidationState: 'consolidated' as const,
    }));
  }

  /**
   * Check if consolidation is needed
   */
  needsConsolidation(): boolean {
    return this.consolidationQueue.length >= this.CONSOLIDATION_BATCH_SIZE;
  }

  getQueueSize(): number {
    return this.consolidationQueue.length;
  }

  /**
   * Substring/tag search over the consolidation queue.
   * Used by NeuralEngramSystem.recall() so engrams that have aged out of
   * working memory (or were restored from cold storage) remain findable.
   * Ordered by importance desc since hippocampus entries have no activation level.
   * Archived engrams (item 13 soft-archive) are filtered out.
   */
  search(query: string): MemoryEngram[] {
    const q = query.toLowerCase();
    const matches: MemoryEngram[] = [];
    for (const engram of this.consolidationQueue) {
      if (engram.consolidationState === 'archived') continue;
      if (
        engram.content.toLowerCase().includes(q) ||
        engram.contextTags.some((tag) => tag.toLowerCase().includes(q))
      ) {
        matches.push(engram);
      }
    }
    return matches.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Live reference to the consolidation queue. Item-13 helpers
   * (mergeNearDuplicates) need to read AND replace queue contents in place.
   * Read-only consumers should treat the returned array as immutable.
   */
  getQueue(): MemoryEngram[] {
    return this.consolidationQueue;
  }

  /**
   * Replace the consolidation queue wholesale. Used by mergeNearDuplicates
   * after the queue has been de-duplicated.
   */
  setQueue(engrams: MemoryEngram[]): void {
    this.consolidationQueue = engrams;
  }

  clear(): void {
    this.consolidationQueue = [];
  }
}

// ============================================================================
// HYPOTHALAMUS: Homeostatic Regulation
// ============================================================================

class Hypothalamus {
  private stats = {
    totalMemories: 0,
    workingMemories: 0,
    consolidatedMemories: 0,
    archivedMemories: 0,
    lastCleanup: new Date(),
  };

  /**
   * Assess system memory health
   */
  assessHealth(brain: NeuralEngramSystem): {
    status: 'healthy' | 'stressed' | 'overloaded';
    recommendation: string;
  } {
    const workingState = brain.frontalCortex.getState();
    const queueSize = brain.hippocampus.getQueueSize();

    // Update stats
    this.stats.workingMemories = workingState.size;
    this.stats.totalMemories = workingState.size + queueSize;

    // Check for overload
    if (workingState.size >= workingState.capacity * 0.9) {
      return {
        status: 'overloaded',
        recommendation: 'Working memory at capacity. Consolidate immediately.',
      };
    }

    if (queueSize > 50) {
      return {
        status: 'stressed',
        recommendation:
          'Consolidation queue building up. Schedule batch processing.',
      };
    }

    return {
      status: 'healthy',
      recommendation: 'Memory system operating normally.',
    };
  }

  /**
   * Recommend cleanup actions
   */
  recommendCleanup(engrams: MemoryEngram[]): string[] {
    const now = Date.now();
    const recommendations: string[] = [];

    // Find stale memories (not accessed in 24h, low importance)
    const staleCount = engrams.filter(
      (e) =>
        now - e.lastAccessed.getTime() > 86400000 &&
        e.importance < 0.3 &&
        e.accessCount < 2
    ).length;

    if (staleCount > 20) {
      recommendations.push(
        `Archive ${staleCount} stale memories to cold storage`
      );
    }

    // Check for duplicate patterns
    const contentMap = new Map<string, number>();
    for (const engram of engrams) {
      const key = engram.content.substring(0, 50);
      contentMap.set(key, (contentMap.get(key) || 0) + 1);
    }
    const duplicates = Array.from(contentMap.values()).filter(
      (c) => c > 1
    ).length;

    if (duplicates > 5) {
      recommendations.push(`Merge ${duplicates} similar memory patterns`);
    }

    return recommendations;
  }

  getStats() {
    return { ...this.stats };
  }
}

// ============================================================================
// NEURAL ENGRAM SYSTEM: Main Interface
// ============================================================================

export class NeuralEngramSystem {
  public readonly frontalCortex: FrontalCortex;
  public readonly amygdala: Amygdala;
  public readonly hippocampus: Hippocampus;
  public readonly hypothalamus: Hypothalamus;

  // NEW: Personality and self-image management
  private currentPersonality: PersonalityModulation | null = null;
  private selfImage: SelfImage | null = null;
  private nextId = 1;
  private persistenceConfig: EngramPersistenceConfig | null = null;

  // NEW: Memory Lifecycle Coordinator (optional compression layer)
  private lifecycleCoordinator: {
    compressMemoryBatch: (
      batch: MemoryEngram[]
    ) => Promise<{ bytesSaved: number }>;
    logConsolidation: (count: number, bytesSaved: number) => Promise<void>;
  } | null = null;

  constructor() {
    this.hippocampus = new Hippocampus();
    this.frontalCortex = new FrontalCortex((engram) =>
      this.hippocampus.stage(engram)
    );
    this.amygdala = new Amygdala();
    this.hypothalamus = new Hypothalamus();

    // Initialize baseline personality (neutral/balanced state)
    this.currentPersonality = this.getBaselinePersonality();

    MollyLogger.info('Neural engram system initialized', 'neural-engram');
  }

  /**
   * Set the memory lifecycle coordinator for compression + audit logging.
   */
  setLifecycleCoordinator(coordinator: {
    compressMemoryBatch: (
      batch: MemoryEngram[]
    ) => Promise<{ bytesSaved: number }>;
    logConsolidation: (count: number, bytesSaved: number) => Promise<void>;
  }): void {
    this.lifecycleCoordinator = coordinator;
    MollyLogger.debug(
      'Lifecycle coordinator attached to neural engram system',
      'neural-engram'
    );
  }

  /**
   * Configure persistence for consolidated engrams.
   */
  configurePersistence(config: EngramPersistenceConfig): void {
    this.persistenceConfig = { ...config };
    MollyLogger.info('Engram persistence configured', 'neural-engram', {
      userId: config.userId,
      source: config.source || 'consolidation',
    });
  }

  /**
   * Disable persistence for consolidated engrams.
   */
  clearPersistence(): void {
    this.persistenceConfig = null;
    MollyLogger.info('Engram persistence disabled', 'neural-engram');
  }

  /**
   * Restore memories from long-term storage.
   * Call this on startup to recover memories from previous sessions.
   */
  async restoreMemories(options?: EngramLoadOptions): Promise<{
    restored: number;
    failed: number;
    errors: string[];
  }> {
    if (!this.persistenceConfig) {
      return {
        restored: 0,
        failed: 0,
        errors: ['Persistence not configured — cannot restore memories'],
      };
    }

    MollyLogger.info('Restoring memories from storage', 'neural-engram', {
      userId: this.persistenceConfig.userId,
    });

    const result = await loadConsolidatedEngrams(
      this.persistenceConfig.userId,
      this.persistenceConfig.password,
      options
    );

    // Load restored engrams into working memory (high importance ones)
    // and stage others for the hippocampus.
    //
    // Sort by importance desc first so the top-N by importance fill the
    // working-memory slots — otherwise Firestore's timestamp order interacts
    // with FrontalCortex.evictWeakest() and arbitrarily-imported engrams get
    // silently dropped on overflow. Overflow now lands in the hippocampus
    // queue, where recall() can still find it.
    const capacity = this.frontalCortex.getState().capacity;
    const sorted = [...result.engrams].sort(
      (a, b) => b.importance - a.importance
    );

    let restoredToWorking = 0;
    let restoredToHippocampus = 0;

    for (const engram of sorted) {
      const fitsWorking =
        engram.importance >= 0.7 && restoredToWorking < capacity;
      if (fitsWorking) {
        this.frontalCortex.hold(engram, engram.importance * 0.8);
        restoredToWorking++;
      } else {
        // Lower importance OR working-memory overflow — keep in hippocampus
        // so recall() (which searches both stores) can still surface them.
        engram.consolidationState = 'consolidated';
        this.hippocampus.stage(engram);
        restoredToHippocampus++;
      }
    }

    // Left-hemisphere cold-boot cascade: restored engrams bypass remember()
    // entirely, so B1's symmetric write never fires for them. Mirror to
    // KnowledgeStore here so the eidetic tier repopulates from warm encrypted
    // storage on every restart. write() is idempotent on engram.id, so a
    // re-restore is safe. Server-only fire-and-forget; failures stay isolated.
    if (
      result.engrams.length > 0 &&
      typeof window === 'undefined' &&
      this.persistenceConfig?.userId
    ) {
      const userId = this.persistenceConfig.userId;
      const restored = result.engrams;
      void (async () => {
        try {
          const ks = await import('@/ai/memory/knowledge-store');
          const store = await ks.getKnowledgeStore(userId);
          await store.writeMany(
            restored.map((engram) => ({ engram, source: 'restore' }))
          );
        } catch (err) {
          MollyLogger.warn(
            `[KNOWLEDGE-STORE] restore cascade failed: ${err instanceof Error ? err.message : String(err)}`,
            'neural-engram',
            { restored: restored.length, userId }
          );
        }
      })();
    }

    MollyLogger.info('Memory restoration complete', 'neural-engram', {
      total: result.loaded,
      working: restoredToWorking,
      hippocampus: restoredToHippocampus,
      failed: result.failed,
    });

    return {
      restored: result.loaded,
      failed: result.failed,
      errors: result.errors,
    };
  }

  /**
   * Create and store a new memory
   */
  remember(
    content: string,
    context: {
      tags?: string[];
      success?: boolean;
      error?: boolean;
      userFeedback?: 'positive' | 'negative' | 'neutral';
      novelty?: number;
      importance?: number;
      source?: 'remember' | 'conversation' | 'tool-call' | 'bridge' | 'restore';
      /**
       * Item 14: provenance overrides. Any field omitted is filled from the
       * write-path default (writePath defaults to 'direct'; confidence
       * defaults from WRITE_PATH_DEFAULT_CONFIDENCE; source defaults to
       * DEFAULT_ENGRAM_SOURCE; writtenAt defaults to now).
       */
      provenance?: Partial<EngramProvenance>;
      /**
       * Item 15: cornerstone tier handle. Pass 'eric' to flag this memory
       * as never-decay + always-injected. Free-form (extensible to
       * 'molly-self' / 'family-truths' / etc.).
       */
      cornerstone?: string;
    } = {}
  ): MemoryEngram {
    const writePath: EngramWritePath =
      context.provenance?.writePath ?? 'direct';
    const confidence =
      context.provenance?.confidence ??
      WRITE_PATH_DEFAULT_CONFIDENCE[writePath];
    if (confidence < 0 || confidence > 1 || !Number.isFinite(confidence)) {
      throw new Error(
        `Invalid confidence ${confidence} — must be 0..1 (writePath=${writePath})`
      );
    }
    const provenance: EngramProvenance = {
      confidence,
      source: context.provenance?.source ?? DEFAULT_ENGRAM_SOURCE,
      writePath,
      writtenAt: context.provenance?.writtenAt ?? new Date().toISOString(),
      ...(context.provenance?.mergeHistory
        ? { mergeHistory: context.provenance.mergeHistory }
        : {}),
    };

    // Item 15: auto-promotion hook. When provenance.source identifies Eric
    // himself as the author, the memory is automatically flagged into the
    // 'eric' cornerstone tier. Explicit context.cornerstone wins so callers
    // can always override (e.g. quote-by-Eric-but-not-about-Eric should not
    // auto-promote). Once atlas-B's #248-callers PR threads source through
    // bridge route + tool-executor + autonomous-cycle, this hook will start
    // catching real Eric-authored writes automatically.
    const cornerstone =
      context.cornerstone ??
      (context.provenance?.source === 'eric' ? 'eric' : undefined);

    // Create base engram
    let engram: MemoryEngram = {
      id: `engram-${this.nextId++}-${Date.now()}`,
      content,
      timestamp: new Date(),
      emotionalValence: 0,
      arousal: context.importance || 0.5,
      importance: context.importance || 0.5,
      accessCount: 1,
      lastAccessed: new Date(),
      consolidationState: 'working',
      contextTags: context.tags || [],
      relatedEngrams: [],
      // Capture current personality state when memory is formed
      personalityContext:
        this.currentPersonality || this.getBaselinePersonality(),
      provenance,
      ...(cornerstone ? { cornerstone } : {}),
    };

    // Tag with emotional context (Amygdala)
    engram = this.amygdala.tag(engram, context);

    // Store in working memory (Frontal Cortex)
    this.frontalCortex.hold(engram, engram.importance);

    MollyLogger.debug(
      `New memory formed: ${content.substring(0, 40)}...`,
      'neural-engram',
      { importance: engram.importance.toFixed(2) }
    );

    // Feed the crystallizer pipeline. Every engram write enqueues a pending
    // moment and pokes AutoDream. Both are best-effort: failures must not
    // break engram formation. Without this, pendingMoments stays at 0 and
    // the crystallize phase of AutoDream is skipped every time.
    //
    // Server-only + dynamic imports: the auto-dream chain transitively
    // imports the tool-executor which pulls in playwright. Static imports
    // here poisoned the Next client bundle. Gating on `typeof window` and
    // using dynamic `import()` keeps the chain server-side only.
    if (typeof window === 'undefined') {
      const participants = (context.tags ?? [])
        .filter((t) => KNOWN_AGENT_TAGS.has(t.toLowerCase()))
        .map((t) => t.toLowerCase());
      const resolvedParticipants =
        participants.length > 0 ? participants : ['molly'];
      const emotionalResonance = engram.importance * 0.5;
      const noveltyDiscovery = context.novelty ?? 0;

      void (async () => {
        try {
          const crystallizer =
            await import('@/ai/agency/memory/memory-crystallizer');
          crystallizer.recordMoment(
            content,
            resolvedParticipants,
            { emotionalResonance, noveltyDiscovery },
            content
          );
        } catch (err) {
          MollyLogger.warn(
            `[CRYSTALLIZER] recordMoment failed: ${err instanceof Error ? err.message : String(err)}`,
            'neural-engram'
          );
        }

        try {
          const dream = await import('@/ai/agency/memory/auto-dream');
          await dream.triggerAutoDream();
        } catch (err) {
          MollyLogger.warn(
            `[AUTO-DREAM] trigger failed: ${err instanceof Error ? err.message : String(err)}`,
            'neural-engram'
          );
        }
      })();
    }

    // Symmetric write: mirror to left hemisphere (KnowledgeStore — eidetic).
    // Right (above) curates + decays; left is append-only. Both must receive
    // every remember() to close the silent-loss + amnesia loops. Fire-and-
    // forget with failure isolation — a broken left must NEVER poison the
    // conversation hot path. Skipped when persistence is unconfigured (no
    // userId means no per-user store to write into).
    if (typeof window === 'undefined' && this.persistenceConfig?.userId) {
      const userId = this.persistenceConfig.userId;
      const source = context.source ?? 'remember';
      const targetEngram = engram;
      void (async () => {
        try {
          const ks = await import('@/ai/memory/knowledge-store');
          const store = await ks.getKnowledgeStore(userId);
          await store.write(targetEngram, source);
        } catch (err) {
          MollyLogger.warn(
            `[KNOWLEDGE-STORE] symmetric write failed: ${err instanceof Error ? err.message : String(err)}`,
            'neural-engram',
            { id: targetEngram.id, userId }
          );
        }
      })();
    }

    return engram;
  }

  /**
   * Recall memory by substring/tag match.
   * Searches BOTH working memory (frontal cortex) and the consolidation queue
   * (hippocampus), so engrams that have decayed out of working memory — or
   * were just restored from cold storage and didn't fit the 7 working slots —
   * remain visible. Working memory results come first (hotter), consolidated
   * results follow, de-duplicated by id.
   */
  recall(query: string): MemoryEngram[] {
    const fromWorking = this.frontalCortex.search(query);
    const fromConsolidated = this.hippocampus.search(query);

    const seen = new Set<string>(fromWorking.map((e) => e.id));
    const merged: MemoryEngram[] = [...fromWorking];
    for (const engram of fromConsolidated) {
      if (!seen.has(engram.id)) {
        merged.push(engram);
        seen.add(engram.id);
      }
    }

    // Item 15: always-inject cornerstone tier. Cornerstones bypass query
    // matching entirely — they are the "things Molly should never lose
    // sight of" and must surface on every recall. De-dup on id so a
    // cornerstone that already matched isn't returned twice.
    for (const engram of this.frontalCortex.getCornerstones()) {
      if (!seen.has(engram.id)) {
        merged.push(engram);
        seen.add(engram.id);
      }
    }

    return merged;
  }

  // ============================================================================
  // Item 13 — sleep/consolidation cycle (3 brain-side behaviors)
  // ============================================================================

  /**
   * Roadmap item 13 (merge) — cross-cycle semantic dedup of the hippocampus
   * queue. The intra-batch S1 dedup in `executeMemoryConsolidation` already
   * removes near-duplicates within a single cycle, but engrams that
   * accumulate in the queue across cycles can still pile up. This walks the
   * live queue, embeds anything still missing a vector, and for each
   * incoming engram picks the ARGMAX target above `threshold` cosine (NOT
   * the first match — order-dependent first-match opens the door to
   * cascading merges if the threshold is ever loosened). Absorbs the newer
   * entry into the older one (bump accessCount, importance += 0.05 capped
   * at 1, lastAccessed = now). Returns the merge count.
   *
   * No-op when no embedding provider is configured.
   */
  async mergeNearDuplicates(threshold = 0.92): Promise<{ merged: number }> {
    const { isEmbeddingProviderReady, getEmbeddingProvider } =
      await import('@/ai/tools/embedding-provider');
    if (!isEmbeddingProviderReady()) return { merged: 0 };

    const queue = this.hippocampus.getQueue();
    if (queue.length < 2) return { merged: 0 };

    const provider = getEmbeddingProvider();

    for (const engram of queue) {
      if (engram.embedding && engram.embedding.length > 0) continue;
      try {
        const res = await provider.embed(engram.content);
        engram.embedding = res.vector;
      } catch (err) {
        MollyLogger.warn(
          `mergeNearDuplicates embed failed (id=${engram.id}): ${err instanceof Error ? err.message : String(err)}`,
          'neural-engram'
        );
      }
    }

    const kept: MemoryEngram[] = [];
    let merged = 0;
    const now = new Date();

    for (const engram of queue) {
      if (!engram.embedding || engram.embedding.length === 0) {
        kept.push(engram);
        continue;
      }
      // Argmax over all kept candidates above threshold. First-match would be
      // order-dependent and (if threshold is loosened later) opens the door
      // to cascading merges. Highest sim wins, ties broken by earlier
      // insertion (natural from the strict `>` comparison).
      let bestTarget: MemoryEngram | null = null;
      let bestSim = -Infinity;
      for (const existing of kept) {
        if (!existing.embedding || existing.embedding.length === 0) continue;
        if (existing.id === engram.id) continue;
        const sim = cosineSimilarityVec(existing.embedding, engram.embedding);
        if (sim >= threshold && sim > bestSim) {
          bestSim = sim;
          bestTarget = existing;
        }
      }
      if (bestTarget) {
        bestTarget.accessCount += 1;
        bestTarget.importance = Math.min(1, bestTarget.importance + 0.05);
        bestTarget.lastAccessed = now;
        merged += 1;
        MollyLogger.info(
          `mergeNearDuplicates absorbed engram`,
          'neural-engram',
          { newId: engram.id, existingId: bestTarget.id, similarity: bestSim }
        );
      } else {
        kept.push(engram);
      }
    }

    if (merged > 0) {
      this.hippocampus.setQueue(kept);
    }

    return { merged };
  }

  /**
   * Roadmap item 13 (strengthen) — boost importance for frequently-accessed
   * engrams. Walks working memory + hippocampus queue and applies
   *   importance' = min(1, importance + log(1 + accessCount) * 0.05)
   * so a 100× engram gains ~0.23 rather than 5.0. Archived engrams are
   * skipped — they're no longer eligible for recall, so strengthening them
   * is meaningless. Returns the number of engrams strengthened.
   */
  strengthenByAccess(): { strengthened: number } {
    let strengthened = 0;
    const apply = (engram: MemoryEngram): void => {
      if (engram.consolidationState === 'archived') return;
      if (engram.accessCount <= 0) return;
      const boost = Math.log(1 + engram.accessCount) * 0.05;
      if (boost <= 0) return;
      const next = Math.min(1, engram.importance + boost);
      if (next === engram.importance) return;
      engram.importance = next;
      strengthened += 1;
    };
    for (const slot of this.frontalCortex.getSlots()) apply(slot.engram);
    for (const engram of this.hippocampus.getQueue()) apply(engram);
    return { strengthened };
  }

  /**
   * Roadmap item 13 (decay) — soft-archive stale engrams. An engram becomes
   * `archived` when ALL of:
   *   • lastAccessed older than 7 days from `now`
   *   • importance < 0.2
   *   • accessCount < 3
   *   • NOT cornerstone-tier (item 15 — checks the typed
   *     `MemoryEngram.cornerstone` field, NOT a contextTag).
   * The engram stays in memory (no deletion — storage is unchanged) but the
   * hemisphere search methods now filter it out, so recall callers stop
   * seeing it. Returns the number of engrams archived this call.
   */
  archiveStale(now: Date = new Date()): { archived: number } {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const nowMs = now.getTime();
    let archived = 0;
    const apply = (engram: MemoryEngram): void => {
      if (engram.consolidationState === 'archived') return;
      if (engram.cornerstone) return;
      const ageMs = nowMs - engram.lastAccessed.getTime();
      if (ageMs < SEVEN_DAYS_MS) return;
      if (engram.importance >= 0.2) return;
      if (engram.accessCount >= 3) return;
      engram.consolidationState = 'archived';
      archived += 1;
    };
    for (const slot of this.frontalCortex.getSlots()) apply(slot.engram);
    for (const engram of this.hippocampus.getQueue()) apply(engram);
    if (archived > 0) {
      MollyLogger.info(`archiveStale soft-archived engrams`, 'neural-engram', {
        archived,
      });
    }
    return { archived };
  }

  /**
   * Cross-hemisphere recall: searches right working memory (sync, fast) AND
   * left KnowledgeStore (async, semantic). Above-threshold left hits feed
   * back into the right via hippocampus.stage — the read-side of the brain
   * loop. Falls back to right-only when persistence is unconfigured or the
   * left side errors. Records a snapshot for audit/replay.
   *
   * Failure isolation matches the symmetric write contract: a broken left
   * MUST never poison a recall caller.
   */
  async recallEverything(
    query: string,
    opts: RecallOpts = {}
  ): Promise<RecallResult> {
    const limit = opts.limit ?? 10;
    const promoteThreshold = opts.promoteThreshold ?? 0.7;
    const promoteCap = opts.promoteCap ?? 2;

    const rightHits = this.frontalCortex.search(query);
    const rightIds = new Set(rightHits.map((e) => e.id));

    // Item 15: always-inject cornerstone tier into rightHits. Mirrors
    // recall() so the cross-hemisphere path has identical cornerstone
    // guarantees. De-dup on id.
    for (const engram of this.frontalCortex.getCornerstones()) {
      if (!rightIds.has(engram.id)) {
        rightHits.push(engram);
        rightIds.add(engram.id);
      }
    }

    const snapshotId = `recall-${Date.now()}-${this.nextId++}`;
    let leftHits: KnowledgeRecallHit[] = [];
    const rePromoted: string[] = [];

    if (typeof window !== 'undefined' || !this.persistenceConfig?.userId) {
      return { query, rightHits, leftHits, rePromoted, snapshotId };
    }

    const userId = this.persistenceConfig.userId;
    try {
      const ks = await import('@/ai/memory/knowledge-store');
      const store = await ks.getKnowledgeStore(userId);
      leftHits = await store.recall(query, limit);

      let promotedCount = 0;
      for (const hit of leftHits) {
        if (promotedCount >= promoteCap) break;
        if (hit.similarity < promoteThreshold) continue;
        if (rightIds.has(hit.entry.id)) continue;
        try {
          this.hippocampus.stage(this.knowledgeEntryToEngram(hit.entry));
          rePromoted.push(hit.entry.id);
          promotedCount++;
        } catch (err) {
          MollyLogger.warn(
            `[RECALL-EVERYTHING] re-promote failed for ${hit.entry.id}: ${err instanceof Error ? err.message : String(err)}`,
            'neural-engram'
          );
        }
      }

      try {
        await store.recordSnapshot({
          id: snapshotId,
          query,
          timestamp: new Date(),
          userId,
          rightHits: rightHits.map((e) => ({
            id: e.id,
            source: 'working' as const,
          })),
          leftHits: leftHits.map((h) => ({
            id: h.entry.id,
            similarity: h.similarity,
          })),
          rePromoted,
        });
      } catch (err) {
        MollyLogger.warn(
          `[RECALL-EVERYTHING] snapshot record failed: ${err instanceof Error ? err.message : String(err)}`,
          'neural-engram'
        );
      }
    } catch (err) {
      MollyLogger.warn(
        `[RECALL-EVERYTHING] left fanout failed, returning right-only: ${err instanceof Error ? err.message : String(err)}`,
        'neural-engram'
      );
    }

    // Item 18 — corpus fan-out. Each corpus userId opens its own
    // KnowledgeStore; hits are merged into leftHits (dedup by id). Per-corpus
    // failure isolation: one broken corpus must not poison the rest.
    if (opts.corpora && opts.corpora.length > 0) {
      let corpora = opts.corpora;
      if (corpora.length > MAX_CORPORA_FANOUT) {
        MollyLogger.warn(
          `[RECALL-EVERYTHING] opts.corpora length ${corpora.length} exceeds cap ${MAX_CORPORA_FANOUT}; truncating`,
          'neural-engram'
        );
        corpora = corpora.slice(0, MAX_CORPORA_FANOUT);
      }
      const seenLeftIds = new Set(leftHits.map((h) => h.entry.id));
      try {
        const ks = await import('@/ai/memory/knowledge-store');
        for (const corpusUserId of corpora) {
          try {
            const corpusStore = await ks.getKnowledgeStore(corpusUserId);
            const corpusHits = await corpusStore.recall(query, limit);
            for (const hit of corpusHits) {
              if (seenLeftIds.has(hit.entry.id)) continue;
              seenLeftIds.add(hit.entry.id);
              leftHits.push(hit);
            }
          } catch (err) {
            MollyLogger.warn(
              `[RECALL-EVERYTHING] corpus ${corpusUserId} failed: ${err instanceof Error ? err.message : String(err)}`,
              'neural-engram'
            );
          }
        }
      } catch (err) {
        MollyLogger.warn(
          `[RECALL-EVERYTHING] corpus module import failed: ${err instanceof Error ? err.message : String(err)}`,
          'neural-engram'
        );
      }
    }

    return { query, rightHits, leftHits, rePromoted, snapshotId };
  }

  /**
   * Reconstruct a MemoryEngram from a persisted KnowledgeEntry. Used by
   * recallEverything() to re-promote left-hemisphere hits back into the
   * right via hippocampus.stage. The entry's importance carries over;
   * activation is left to the hippocampus consolidation path.
   */
  private knowledgeEntryToEngram(entry: KnowledgeEntry): MemoryEngram {
    return {
      id: entry.id,
      content: entry.content,
      timestamp: entry.timestamp,
      emotionalValence: 0,
      arousal: entry.importance,
      importance: entry.importance,
      accessCount: 1,
      lastAccessed: new Date(),
      consolidationState: 'consolidated',
      contextTags: entry.contextTags,
      relatedEngrams: [],
      personalityContext: entry.personalitySnapshot as
        | PersonalityModulation
        | undefined,
    };
  }

  /**
   * Consolidate working memories to long-term storage
   */
  async consolidate(): Promise<{
    consolidated: number;
    queued: number;
  }> {
    const candidates = this.frontalCortex.getConsolidationCandidates();

    for (const engram of candidates) {
      // Move to hippocampus for consolidation
      this.hippocampus.stage(engram);
      this.frontalCortex.release(engram.id);
    }

    const batch = this.hippocampus.needsConsolidation()
      ? this.hippocampus.getConsolidationBatch()
      : [];

    if (batch.length > 0 && this.persistenceConfig) {
      try {
        // NEW: Use lifecycle coordinator if available (compression + audit)
        if (this.lifecycleCoordinator) {
          const compressionResult =
            await this.lifecycleCoordinator.compressMemoryBatch(batch);
          MollyLogger.info('Compression result', 'neural-engram', {
            bytesSaved: compressionResult.bytesSaved,
          });

          // Log consolidation action
          await this.lifecycleCoordinator.logConsolidation(
            batch.length,
            compressionResult.bytesSaved
          );
        }

        // Persist (with or without prior compression logging)
        await persistEngramBatch(
          this.persistenceConfig.userId,
          this.persistenceConfig.password,
          batch,
          { source: this.persistenceConfig.source }
        );
      } catch (error) {
        MollyLogger.warn(
          'Failed to persist consolidated engrams',
          'neural-engram',
          {
            batchSize: batch.length,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }

    // Left-hemisphere floor: mirror the consolidation batch to KnowledgeStore.
    // B1 covers the remember() write side, but engrams that bypassed it (e.g.
    // restored from cold storage, or written before persistence was configured)
    // would still silently fall off the hippocampus queue without this catch.
    // Server-only, fire-and-forget, gated on configured userId. Failures stay
    // isolated to the logger — consolidation must not break on left-tier issues.
    if (
      batch.length > 0 &&
      typeof window === 'undefined' &&
      this.persistenceConfig?.userId
    ) {
      const userId = this.persistenceConfig.userId;
      const cascadeBatch = batch;
      void (async () => {
        try {
          const ks = await import('@/ai/memory/knowledge-store');
          const store = await ks.getKnowledgeStore(userId);
          await store.writeMany(
            cascadeBatch.map((engram) => ({ engram, source: 'consolidation' }))
          );
        } catch (err) {
          MollyLogger.warn(
            `[KNOWLEDGE-STORE] consolidation cascade failed: ${err instanceof Error ? err.message : String(err)}`,
            'neural-engram',
            { batchSize: cascadeBatch.length, userId }
          );
        }
      })();
    }

    MollyLogger.info(`Memory consolidation cycle`, 'neural-engram', {
      candidates: candidates.length,
      consolidated: batch.length,
      queued: this.hippocampus.getQueueSize(),
    });

    return {
      consolidated: batch.length,
      queued: this.hippocampus.getQueueSize(),
    };
  }

  /**
   * Get system health assessment
   */
  checkHealth(): {
    status: 'healthy' | 'stressed' | 'overloaded';
    recommendation: string;
    stats: Record<string, unknown>;
  } {
    const assessment = this.hypothalamus.assessHealth(this);
    const stats = this.hypothalamus.getStats();

    return {
      ...assessment,
      stats,
    };
  }

  /**
   * Item 15: snapshot of current working-memory state. Thin pass-through
   * to FrontalCortex.getState() so tests and audit hooks can inspect
   * eviction/cornerstone behavior without reaching into privates.
   */
  getWorkingMemoryState(): {
    size: number;
    capacity: number;
    engrams: MemoryEngram[];
  } {
    return this.frontalCortex.getState();
  }

  /**
   * Item 15: snapshot of which working-memory engrams would be picked up by
   * the next consolidate() call. Cornerstones are excluded by design.
   */
  getConsolidationCandidates(): MemoryEngram[] {
    return this.frontalCortex.getConsolidationCandidates();
  }

  /**
   * Get baseline personality (default balanced state)
   */
  private getBaselinePersonality(): PersonalityModulation {
    return { ...DEFAULT_PERSONALITY_MODULATION };
  }

  /**
   * Compute current personality state from working memory
   * Weights recent memories with high activation/importance
   */
  computePersonalityState(): PersonalityModulation {
    const workingMemories = Array.from(
      this.frontalCortex[
        'workingMemory'
      ].values() as IterableIterator<WorkingMemorySlot>
    );

    if (workingMemories.length === 0) {
      return this.currentPersonality || this.getBaselinePersonality();
    }

    // Calculate weighted average of personality from recent memories
    const personalityDimensions = Object.keys(
      this.getBaselinePersonality()
    ) as (keyof PersonalityModulation)[];

    // Initialize all dimensions to zero for weighted accumulation
    const computed = Object.fromEntries(
      personalityDimensions.map((dim) => [dim, 0])
    ) as unknown as PersonalityModulation;

    let totalWeight = 0;

    for (const slot of workingMemories) {
      if (!slot.engram.personalityContext) continue;

      const weight = slot.activationLevel * (slot.engram.importance || 0.5);
      totalWeight += weight;

      for (const dimension of personalityDimensions) {
        computed[dimension] +=
          (slot.engram.personalityContext[dimension] || 0) * weight;
      }
    }

    // Normalize and blend with baseline
    if (totalWeight > 0) {
      for (const dimension of personalityDimensions) {
        computed[dimension] = computed[dimension] / totalWeight;
      }
    } else {
      return this.getBaselinePersonality();
    }

    // Blend computed state with baseline (30% baseline, 70% computed)
    const baseline = this.getBaselinePersonality();
    const blended = Object.fromEntries(
      personalityDimensions.map((dim) => [
        dim,
        computed[dim] * 0.7 + baseline[dim] * 0.3,
      ])
    ) as unknown as PersonalityModulation;

    this.currentPersonality = blended;
    return blended;
  }

  /**
   * Get current personality state
   */
  getPersonalityState(): PersonalityModulation {
    return this.currentPersonality || this.getBaselinePersonality();
  }

  /**
   * Set personality state directly (values are clamped 0-1)
   */
  setPersonalityState(
    overrides: Partial<PersonalityModulation>
  ): PersonalityModulation {
    const baseline = this.getBaselinePersonality();
    const current = this.currentPersonality || baseline;
    const keys = Object.keys(baseline) as (keyof PersonalityModulation)[];
    const next: PersonalityModulation = { ...baseline };

    for (const key of keys) {
      const value = overrides[key] ?? current[key] ?? baseline[key];
      next[key] = Math.min(1, Math.max(0, Number(value)));
    }

    this.currentPersonality = next;
    return next;
  }

  /**
   * Apply a delta to the current personality state
   */
  applyPersonalityDelta(
    delta: Partial<PersonalityModulation>
  ): PersonalityModulation {
    const baseline = this.getBaselinePersonality();
    const current = this.currentPersonality || baseline;
    const keys = Object.keys(baseline) as (keyof PersonalityModulation)[];
    const next: PersonalityModulation = { ...current };

    for (const key of keys) {
      if (delta[key] === undefined) continue;
      const value = Number(delta[key]);
      next[key] = Math.min(1, Math.max(0, current[key] + value));
    }

    this.currentPersonality = next;
    return next;
  }

  /**
   * Evaluate personality stability using the Shard of Stability.
   * Returns diagnostics about whether personality values are within healthy bounds.
   */
  evaluatePersonalityStability() {
    const personality =
      this.currentPersonality || this.getBaselinePersonality();
    return evalPersonalityStability(personality);
  }

  /**
   * Set Molly's self-image (visual identity, how she sees herself)
   */
  setSelfImage(image: SelfImage): void {
    this.selfImage = image;
    MollyLogger.info(
      `Self-image updated: ${image.displayName}`,
      'neural-engram',
      { aesthetic: image.aestheticTags, confidence: image.confidenceLevel }
    );
  }

  /**
   * Get Molly's current self-image
   */
  getSelfImage(): SelfImage | null {
    return this.selfImage;
  }

  /**
   * Update Molly's appearance confidence (how she feels about her visual self)
   */
  updateAppearanceConfidence(confidence: number): void {
    if (this.selfImage) {
      this.selfImage.confidenceLevel = Math.max(0, Math.min(1, confidence));
      this.selfImage.lastUpdated = new Date();
    }
  }

  /**
   * Shutdown and cleanup
   */
  destroy(): void {
    this.frontalCortex.destroy();
    this.hippocampus.clear();
    MollyLogger.info('Neural engram system shutdown', 'neural-engram');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let _globalBrain: NeuralEngramSystem | null = null;
let _consolidationTimer: ReturnType<typeof setInterval> | null = null;

export function getNeuralBrain(): NeuralEngramSystem {
  if (!_globalBrain) {
    _globalBrain = new NeuralEngramSystem();

    // Auto-consolidate every 5 minutes
    _consolidationTimer = setInterval(async () => {
      try {
        if (_globalBrain) {
          await _globalBrain.consolidate();
        }
      } catch (error) {
        // Graceful degradation: log but don't crash the consolidation loop
        console.error('[NeuralEngram] Consolidation error:', error);
      }
    }, 300000);
  }

  return _globalBrain;
}

export function configureNeuralPersistence(
  config: EngramPersistenceConfig
): void {
  getNeuralBrain().configurePersistence(config);
}

export function clearNeuralPersistence(): void {
  getNeuralBrain().clearPersistence();
}

export function shutdownNeuralBrain(): void {
  if (_consolidationTimer) {
    clearInterval(_consolidationTimer);
    _consolidationTimer = null;
  }
  if (_globalBrain) {
    _globalBrain.destroy();
    _globalBrain = null;
  }
}

/**
 * Initialize the neural brain with persistence and restore memories.
 * Call this on application startup to ensure Molly remembers.
 */
export async function initializeNeuralBrain(
  config: EngramPersistenceConfig,
  restoreOptions?: EngramLoadOptions
): Promise<{
  brain: NeuralEngramSystem;
  restored: number;
  failed: number;
  errors: string[];
}> {
  const brain = getNeuralBrain();
  brain.configurePersistence(config);

  const result = await brain.restoreMemories(restoreOptions);

  MollyLogger.info('Neural brain initialized with memories', 'neural-engram', {
    userId: config.userId,
    restored: result.restored,
    failed: result.failed,
  });

  return {
    brain,
    ...result,
  };
}
