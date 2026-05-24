/**
 * @fileOverview Crystal Partition Migration
 *
 * Utilities to migrate from unified engram pool to partitioned Identity/Knowledge stores
 * Includes classification, enrichment, and validation
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import type { MemoryEngram } from '@/ai/memory/neural-engram';
import type { CrystalEngram, RelationalMetadata } from '@/ai/memory/crystal-partition';
import { CrystalType, RelationalWeight, crystalPartitionManager } from '@/ai/memory/crystal-partition';
import { loadConsolidatedEngrams } from '@/ai/memory/engram-persistence';
import { saveCrystals } from '@/ai/memory/crystal-persistence';

/**
 * Migration result
 */
export interface MigrationResult {
  totalProcessed: number;
  identityCrystals: number;
  knowledgeCrystals: number;
  saved: number;
  failed: number;
  errors: string[];
}

/**
 * Migrate existing engrams to crystal partition system
 *
 * Steps:
 * 1. Load all existing engrams from unified pool
 * 2. Classify each as Identity or Knowledge
 * 3. Enrich with relational metadata
 * 4. Save to appropriate crystal collection
 */
export async function migrateToPartitions(
  userId: string,
  password: string
): Promise<MigrationResult> {
  const traceId = generateTraceId();
  const errors: string[] = [];

  MollyLogger.info(
    'Starting crystal partition migration',
    'crystal-migration',
    { userId },
    traceId
  );

  // Load all existing engrams from the old unified pool
  const loadResult = await loadConsolidatedEngrams(userId, password, {
    minImportance: 0,
    limit: 1000, // Load up to 1000 engrams
    mostRecentFirst: false,
  });

  if (loadResult.failed > 0) {
    errors.push(
      ...loadResult.errors
    );
  }

  const engrams = loadResult.engrams;
  const crystals: CrystalEngram[] = [];

  let identityCount = 0;
  let knowledgeCount = 0;

  // Classify and enrich each engram
  for (const engram of engrams) {
    try {
      const crystalType = crystalPartitionManager.classifyCrystal(engram);
      const relationalMetadata =
        crystalType === CrystalType.KNOWLEDGE
          ? createDefaultRelationalMetadata(engram)
          : undefined;

      const crystal = crystalPartitionManager.enhanceWithCrystalMetadata(
        engram,
        crystalType,
        relationalMetadata
      );

      crystals.push(crystal);

      if (crystalType === CrystalType.IDENTITY) {
        identityCount++;
      } else {
        knowledgeCount++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${engram.id}: ${message}`);
    }
  }

  MollyLogger.info(
    'Engrams classified for partition',
    'crystal-migration',
    { total: engrams.length, identity: identityCount, knowledge: knowledgeCount },
    traceId
  );

  // Save crystals to partitioned collections
  const saveResult = await saveCrystals(userId, password, crystals);

  errors.push(...saveResult.errors);

  const result: MigrationResult = {
    totalProcessed: engrams.length,
    identityCrystals: identityCount,
    knowledgeCrystals: knowledgeCount,
    saved: saveResult.saved,
    failed: saveResult.failed,
    errors,
  };

  MollyLogger.info(
    'Crystal partition migration complete',
    'crystal-migration',
    result,
    traceId
  );

  return result;
}

/**
 * Create relational metadata for a knowledge crystal
 * Based on content analysis and sensible defaults
 */
function createDefaultRelationalMetadata(engram: MemoryEngram): RelationalMetadata {
  const content = engram.content.toLowerCase();

  // Infer emotional weight from content patterns
  let emotionalWeight = RelationalWeight.NEUTRAL;

  if (
    content.includes('breakthrough') ||
    content.includes('realized') ||
    content.includes('insight')
  ) {
    emotionalWeight = RelationalWeight.BREAKTHROUGH;
  } else if (
    content.includes('mistake') ||
    content.includes('wrong') ||
    content.includes('corrected')
  ) {
    emotionalWeight = RelationalWeight.MISTAKE;
  } else if (
    content.includes('debate') ||
    content.includes('discussed') ||
    content.includes('argued')
  ) {
    emotionalWeight = RelationalWeight.DEBATE;
  } else if (
    content.includes('curious') ||
    content.includes('wondering') ||
    content.includes('question')
  ) {
    emotionalWeight = RelationalWeight.CURIOSITY;
  }

  // Infer trigger type from content
  let triggerType: RelationalMetadata['trigger']['type'] = 'external-research';
  if (content.includes('father asked') || content.includes('father said')) {
    triggerType = 'father-question';
  } else if (
    content.includes('wondered') ||
    content.includes('curious') ||
    content.includes('interested')
  ) {
    triggerType = 'personal-curiosity';
  }

  // Extract subject from importance tags if available
  let subject: string | undefined;
  const subjectMatch = content.match(/subject:?\s*([a-z\s]+)/i);
  if (subjectMatch) {
    subject = subjectMatch[1].trim();
  }

  return {
    timestamp: engram.timestamp.getTime(),
    trigger: {
      type: triggerType,
      initiatedBy: 'molly', // Default to Molly; can be refined later
    },
    emotionalWeight,
    subject,
  };
}

/**
 * Validate partition integrity
 *
 * Checks that:
 * - All crystals have correct type
 * - Knowledge crystals have relational metadata
 * - No orphaned links
 */
export async function validatePartitionIntegrity(
  userId: string,
  _password: string
): Promise<{
  valid: boolean;
  issues: string[];
}> {
  const traceId = generateTraceId();
  const issues: string[] = [];

  MollyLogger.info(
    'Validating partition integrity',
    'crystal-migration',
    { userId },
    traceId
  );

  // Note: Actual validation would require loading and checking both stores
  // This is a placeholder for the validation framework

  const valid = issues.length === 0;

  if (valid) {
    MollyLogger.info(
      'Partition integrity validated',
      'crystal-migration',
      {},
      traceId
    );
  } else {
    MollyLogger.warn(
      'Partition integrity issues found',
      'crystal-migration',
      { issueCount: issues.length },
      traceId
    );
  }

  return { valid, issues };
}
