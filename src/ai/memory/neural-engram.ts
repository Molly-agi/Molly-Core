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

  // NEW: Personality context from when memory was formed
  personalityContext?: PersonalityModulation;
}

// Extended type for benchmarks/tests that need additional fields
export interface NeuralEngram extends MemoryEngram {
  userId?: string;
  data?: Record<string, unknown>;
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

class FrontalCortex {
  private workingMemory: Map<string, WorkingMemorySlot> = new Map();
  private readonly MAX_WORKING_MEMORY = 7; // Miller's Law: 7±2 items
  private readonly DECAY_INTERVAL_MS = 30000; // 30 seconds
  private decayTimer?: NodeJS.Timeout;

  constructor() {
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
   * Search working memory by context
   */
  search(query: string): MemoryEngram[] {
    const queryLower = query.toLowerCase();
    const matches: MemoryEngram[] = [];

    for (const slot of this.workingMemory.values()) {
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
   * Get memories ready for consolidation (low activation, not recently used)
   */
  getConsolidationCandidates(): MemoryEngram[] {
    const candidates: MemoryEngram[] = [];
    const now = Date.now();

    for (const slot of this.workingMemory.values()) {
      const timeSinceAccess = now - slot.engram.lastAccessed.getTime();
      if (slot.activationLevel < 0.3 || timeSinceAccess > 60000) {
        candidates.push(slot.engram);
      }
    }

    return candidates;
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

    for (const [id, slot] of this.workingMemory.entries()) {
      if (slot.activationLevel < weakestActivation) {
        weakestActivation = slot.activationLevel;
        weakestId = id;
      }
    }

    if (weakestId) {
      MollyLogger.debug(
        `Evicting weak memory from working memory`,
        'frontal-cortex',
        { id: weakestId, activation: weakestActivation }
      );
      this.workingMemory.delete(weakestId);
    }
  }

  private startDecay(): void {
    this.decayTimer = setInterval(() => {
      for (const [id, slot] of this.workingMemory.entries()) {
        slot.activationLevel = Math.max(
          0,
          slot.activationLevel - slot.decayRate
        );

        // Auto-evict if activation drops to zero
        if (slot.activationLevel <= 0.01) {
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
    this.frontalCortex = new FrontalCortex();
    this.amygdala = new Amygdala();
    this.hippocampus = new Hippocampus();
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
    // and stage others for the hippocampus
    let restoredToWorking = 0;
    let restoredToHippocampus = 0;

    for (const engram of result.engrams) {
      // High importance memories go straight to working memory
      if (engram.importance >= 0.7) {
        this.frontalCortex.hold(engram, engram.importance * 0.8);
        restoredToWorking++;
      } else {
        // Lower importance memories go to hippocampus (warm storage)
        engram.consolidationState = 'consolidated';
        this.hippocampus.stage(engram);
        restoredToHippocampus++;
      }
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
    } = {}
  ): MemoryEngram {
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

    return engram;
  }

  /**
   * Recall memory from working memory
   */
  recall(query: string): MemoryEngram[] {
    return this.frontalCortex.search(query);
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
