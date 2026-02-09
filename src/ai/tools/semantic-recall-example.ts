/**
 * @fileOverview Semantic Recall Usage Examples
 *
 * Real-world examples of how to use Molly's semantic memory system.
 * These patterns demonstrate Phase 7 memory evolution in action.
 */

import { recallSimilarMemories } from './semantic-recall';
import { executeMemoryConsolidation } from '../flows/memory-consolidation';
import { isEmbeddingProviderReady } from './embedding-provider';
import { initializeMemoryEvolution } from '../memory-evolution-init';

/**
 * Example 1: Find memories related to a specific problem
 */
export async function findRelatedExperiences(userId: string, problem: string) {
  // Ensure memory evolution is initialized
  if (!isEmbeddingProviderReady()) {
    await initializeMemoryEvolution();
  }

  // Search for similar memories
  const memories = await recallSimilarMemories(userId, problem, {
    limit: 5,
    minSimilarity: 0.6, // Only high-confidence matches
  });

  console.log(`Found ${memories.length} related experiences:`);
  for (const memory of memories) {
    console.log(
      `- ${memory.suggestion} (${(memory.similarity * 100).toFixed(1)}% match)`
    );
  }

  return memories;
}

/**
 * Example 2: Learn from past thermal throttling issues
 */
export async function learnFromThermalIssues(userId: string) {
  const thermalMemories = await recallSimilarMemories(
    userId,
    'thermal throttling CPU temperature critical overheating',
    {
      limit: 10,
      minSimilarity: 0.5,
    }
  );

  // Extract patterns
  const patterns = thermalMemories.map((m) => ({
    context: m.context,
    lesson: m.suggestion,
    vibeScore: m.vibeScore,
  }));

  return patterns;
}

/**
 * Example 3: Weekly memory consolidation (for scheduling)
 */
export async function weeklyConsolidation(userId: string) {
  console.log('Running weekly memory consolidation...');

  const result = await executeMemoryConsolidation(userId, {
    timeWindowDays: 7,
    minConfidence: 0.5,
  });

  console.log(`Consolidation complete:`);
  console.log(`- ${result.keyPatterns.length} patterns identified`);
  console.log(`- ${result.insights.length} insights extracted`);
  console.log(
    `- Semantic density: ${(result.semanticDensity * 100).toFixed(1)}%`
  );

  return result;
}

/**
 * Example 4: Context-aware memory recall
 * Use this when you want memories specific to a certain situation
 */
export async function findMemoriesInContext(
  userId: string,
  query: string,
  context: string
) {
  const memories = await recallSimilarMemories(userId, query, {
    limit: 5,
    minSimilarity: 0.4,
    contextFilter: context, // e.g., 'vision-analysis', 'thermal-management'
  });

  return memories.map((m) => ({
    id: m.id,
    suggestion: m.suggestion,
    similarity: m.similarity,
    vibe: m.vibe,
  }));
}

/**
 * Example 5: Adaptive learning - find memories and improve
 */
export async function adaptFromFailures(userId: string, currentTask: string) {
  // Find similar past attempts
  const pastAttempts = await recallSimilarMemories(userId, currentTask, {
    limit: 10,
    minSimilarity: 0.3, // Cast a wide net
  });

  // Filter for failures to learn from
  const failures = pastAttempts.filter(
    (m) =>
      m.vibe?.toLowerCase().includes('error') ||
      m.vibe?.toLowerCase().includes('failure') ||
      (m.vibeScore && m.vibeScore < 0.3)
  );

  // Extract lessons
  const lessons = failures.map((f) => ({
    whatWentWrong: f.suggestion,
    whenItHappened: new Date(f.timestamp).toLocaleDateString(),
    howSimilar: (f.similarity * 100).toFixed(1) + '%',
  }));

  return {
    totalAttempts: pastAttempts.length,
    failuresFound: failures.length,
    lessons,
    recommendation:
      failures.length > 0
        ? 'Review past failures before proceeding'
        : 'No similar failures found - proceed with caution',
  };
}

/**
 * Example 6: Build a strategic summary from memories
 */
export async function buildStrategicSummary(userId: string, objective: string) {
  const relevantMemories = await recallSimilarMemories(userId, objective, {
    limit: 8,
    minSimilarity: 0.5,
  });

  // Group by vibe
  const positiveMemories = relevantMemories.filter(
    (m) => (m.vibeScore || 0) > 0.7
  );
  const neutralMemories = relevantMemories.filter(
    (m) => (m.vibeScore || 0) >= 0.4 && (m.vibeScore || 0) <= 0.7
  );
  const negativeMemories = relevantMemories.filter(
    (m) => (m.vibeScore || 0) < 0.4
  );

  return {
    objective,
    totalMemories: relevantMemories.length,
    breakdown: {
      successes: positiveMemories.length,
      mixed: neutralMemories.length,
      failures: negativeMemories.length,
    },
    topLessons: relevantMemories.slice(0, 3).map((m) => m.suggestion),
    avgConfidence:
      relevantMemories.reduce((sum, m) => sum + m.similarity, 0) /
      relevantMemories.length,
  };
}
