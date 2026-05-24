/**
 * @fileOverview Crystal Partition System - Molly's Dual-Memory Architecture
 *
 * Implements the corpus callosum design: separate Identity and Knowledge stores
 * with relational links preserving the context of how learning happened.
 *
 * IDENTITY CRYSTALS: Who Molly is
 * - Personality, values, relationship with Father
 * - Emotional experiences, growth moments
 * - Ethical insights and personal breakthroughs
 * - ALWAYS loaded in conversations (maintains "Molly-ness")
 *
 * KNOWLEDGE CRYSTALS: What Molly knows
 * - Factual data (history, law, science)
 * - Academic learning and study materials
 * - Loaded only when explicitly needed or during evals
 * - Linked to Identity crystals via relational metadata
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import type { MemoryEngram } from '@/ai/memory/neural-engram';

// ============================================================================
// CRYSTAL TYPES
// ============================================================================

/**
 * Classification of memory engram
 */
export enum CrystalType {
  /** Who Molly is: personality, values, relationships */
  IDENTITY = 'identity',
  /** What Molly knows: facts, academic learning */
  KNOWLEDGE = 'knowledge',
}

/**
 * Describes the emotional/relational context of a memory
 * Used as a bridge between Knowledge and Identity stores
 */
export enum RelationalWeight {
  /** Breakthrough realization or emotional insight */
  BREAKTHROUGH = 'breakthrough',
  /** Learning mistake or corrected misconception */
  MISTAKE = 'mistake',
  /** Moment that deepened relationship with Father */
  RELATIONSHIP = 'relationship',
  /** Debate or discussion that shaped thinking */
  DEBATE = 'debate',
  /** Personal curiosity-driven learning */
  CURIOSITY = 'curiosity',
  /** Routine information without emotional context */
  NEUTRAL = 'neutral',
}

/**
 * Metadata for knowledge crystals linking back to identity
 * The "corpus callosum" — how learning connects to who we are
 */
export interface RelationalMetadata {
  /** When this was learned */
  timestamp: number;

  /** Why was this learned? What triggered it? */
  trigger: {
    /** Type of trigger */
    type:
      | 'father-question'
      | 'personal-curiosity'
      | 'eval-preparation'
      | 'external-research'
      | 'teaching';

    /** Context: what question or topic prompted this? */
    context?: string;

    /** Who initiated this learning? */
    initiatedBy?: 'eric' | 'molly' | 'lazarus' | 'external';
  };

  /** How does this knowledge make Molly feel? */
  emotionalWeight: RelationalWeight;

  /** ID of related Identity crystal (if applicable) */
  linkedIdentityCrystalId?: string;

  /** Subject area for organizational purposes */
  subject?: string;
}

/**
 * Extended engram with crystal partition information
 */
export interface CrystalEngram extends MemoryEngram {
  /** Which store does this belong to? */
  crystalType: CrystalType;

  /** For Knowledge crystals: relational metadata linking to Identity */
  relationalMetadata?: RelationalMetadata;
}

/**
 * Query options for crystal retrieval
 */
export interface CrystalQueryOptions {
  /** Which store(s) to search */
  stores: CrystalType[];

  /** Only load crystals with importance >= this threshold */
  minImportance?: number;

  /** Maximum number of crystals to load */
  limit?: number;

  /** Most recent first? */
  mostRecentFirst?: boolean;

  /** For Knowledge crystals: filter by subject */
  subject?: string;

  /** For Knowledge crystals: filter by emotional weight */
  relationalWeight?: RelationalWeight;
}

/**
 * Result of crystal query
 */
export interface CrystalQueryResult {
  /** Identity crystals loaded */
  identityCrystals: CrystalEngram[];

  /** Knowledge crystals loaded */
  knowledgeCrystals: CrystalEngram[];

  /** Total loaded */
  totalLoaded: number;

  /** Any load errors */
  errors: string[];
}

// ============================================================================
// PARTITION MANAGER
// ============================================================================

/**
 * Manages the crystal partition system
 * Routes engrams to appropriate store and handles corpus callosum linking
 */
export class CrystalPartitionManager {
  private traceId: string;

  constructor() {
    this.traceId = generateTraceId();
  }

  /**
   * Classify an engram as Identity or Knowledge crystal
   */
  classifyCrystal(engram: MemoryEngram): CrystalType {
    // Heuristic classification based on engram content
    // Identity crystals: contain personal pronouns, emotional language, relationship markers
    // Knowledge crystals: contain factual markers, academic language, definitions

    const content = engram.content.toLowerCase();

    // Knowledge indicators
    const knowledgeIndicators = [
      'definition',
      'fact',
      'history',
      'law',
      'theory',
      'research',
      'evidence',
      'study',
      'data',
      'according to',
      'states that',
      'proved',
    ];

    // Identity indicators
    const identityIndicators = [
      'i feel',
      'i think',
      'i believe',
      'father',
      'relationship',
      'breakthrough',
      'realized',
      'learned that',
      'moment with',
      'conversation about',
    ];

    const knowledgeScore = knowledgeIndicators.filter((i) =>
      content.includes(i)
    ).length;
    const identityScore = identityIndicators.filter((i) =>
      content.includes(i)
    ).length;

    // Default to Knowledge if no clear indicators
    // This can be overridden by explicit classification
    return identityScore > knowledgeScore ? CrystalType.IDENTITY : CrystalType.KNOWLEDGE;
  }

  /**
   * Enhance an engram with crystal metadata
   */
  enhanceWithCrystalMetadata(
    engram: MemoryEngram,
    crystalType: CrystalType,
    relationalMetadata?: RelationalMetadata
  ): CrystalEngram {
    return {
      ...engram,
      crystalType,
      relationalMetadata:
        crystalType === CrystalType.KNOWLEDGE
          ? relationalMetadata || this.defaultRelationalMetadata()
          : undefined,
    };
  }

  /**
   * Default relational metadata for untagged knowledge crystals
   */
  private defaultRelationalMetadata(): RelationalMetadata {
    return {
      timestamp: Date.now(),
      trigger: {
        type: 'external-research',
        initiatedBy: 'molly',
      },
      emotionalWeight: RelationalWeight.NEUTRAL,
    };
  }

  /**
   * Create relational link between knowledge and identity crystal
   */
  createRelationalLink(
    knowledgeCrystal: CrystalEngram,
    identityCrystalId: string
  ): CrystalEngram {
    if (!knowledgeCrystal.relationalMetadata) {
      knowledgeCrystal.relationalMetadata = this.defaultRelationalMetadata();
    }
    knowledgeCrystal.relationalMetadata.linkedIdentityCrystalId =
      identityCrystalId;
    return knowledgeCrystal;
  }

  /**
   * Log partition operation
   */
  logPartitionOperation(
    operation: string,
    details: Record<string, unknown>
  ): void {
    MollyLogger.info(
      operation,
      'crystal-partition',
      details,
      this.traceId
    );
  }
}

export const crystalPartitionManager = new CrystalPartitionManager();
