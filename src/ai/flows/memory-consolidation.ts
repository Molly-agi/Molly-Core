/**
 * @fileOverview Memory Consolidation Flow (Phase 7 - Implementation)
 *
 * Semantic consolidation with embeddings, pattern extraction, and insight synthesis.
 * This is Molly's learning engine—converting experiences into wisdom.
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { getStorageRouter } from '@/lib/storage-router';
import { getEmbeddingProvider } from '@/ai/tools/embedding-provider';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import { semanticPriority, addChecksum } from '@/ai/tools/memory-integrity';
import { ExperienceRecord, createMemoryRecord } from '@/ai/tools/memory-schema';
import { withGenerateErrorHandling } from '@/ai/error-handler';
import { isAdminConfigured } from '@/firebase/admin';
import type { EmbeddingVector } from '@/ai/tools/embedding-provider';

const MemoryConsolidationOutputSchema = z.object({
  summary: z.string().describe('High-level summary of consolidated memories'),
  keyPatterns: z.array(z.string()).describe('Recurring patterns identified'),
  insights: z.array(z.string()).describe('New insights extracted'),
  tokensUsed: z.number(),
  semanticDensity: z
    .number()
    .min(0)
    .max(1)
    .describe('How tightly clustered are the memories (1 = very similar)'),
  recommendations: z
    .array(z.string())
    .describe('Suggested actions based on patterns'),
  errors: z.array(z.string()).optional(),
});

// ============================================================================
// HELPER FUNCTIONS (defined before flow so they're available during execution)
// ============================================================================

/**
 * Helper: Semantic Clustering using K-means on embeddings
 */
function performSemanticClustering(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  memories: Array<any & { embedding: EmbeddingVector }>,
  provider: ReturnType<typeof getEmbeddingProvider>,
  k: number = Math.min(5, Math.ceil(memories.length / 10))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Array<any[]> {
  if (memories.length === 0) return [];
  if (memories.length <= k) return memories.map((m) => [m]);

  // Initialize cluster centers randomly
  let centers = memories
    .sort(() => Math.random() - 0.5)
    .slice(0, k)
    .map((m) => m.embedding);

  // K-means iterations
  for (let iter = 0; iter < 5; iter++) {
    // Assign memories to nearest cluster
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clusters: Array<Array<any>> = Array.from({ length: k }, () => []);

    for (const memory of memories) {
      let minDistance = Infinity;
      let bestCluster = 0;

      for (let i = 0; i < k; i++) {
        const distance = 1 - provider.similarity(memory.embedding, centers[i]);
        if (distance < minDistance) {
          minDistance = distance;
          bestCluster = i;
        }
      }

      clusters[bestCluster]?.push(memory);
    }

    // Recalculate centers
    const newCenters: EmbeddingVector[] = [];
    for (let ci = 0; ci < clusters.length; ci++) {
      const cluster = clusters[ci];
      if (cluster.length === 0) {
        // Reuse old center if cluster became empty
        const oldCenter = centers[ci];
        newCenters.push(oldCenter ?? centers[0]);
      } else {
        const dim = cluster[0]?.embedding?.length || 768;
        const center = Array(dim).fill(0);
        for (const m of cluster) {
          for (let d = 0; d < dim; d++) {
            center[d] += m.embedding?.[d] ?? 0;
          }
        }
        for (let d = 0; d < dim; d++) {
          center[d] /= cluster.length;
        }
        newCenters.push(center);
      }
    }

    centers = newCenters;
  }

  // Final clustering
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clusters: Array<Array<any>> = Array.from(
    { length: k },
    () => [] as Record<string, unknown>[]
  );
  for (const memory of memories) {
    let minDistance = Infinity;
    let bestCluster = 0;

    for (let i = 0; i < k; i++) {
      const distance = 1 - provider.similarity(memory.embedding, centers[i]);
      if (distance < minDistance) {
        minDistance = distance;
        bestCluster = i;
      }
    }

    clusters[bestCluster]?.push(memory);
  }

  return clusters.filter((c) => c.length > 0);
}

/**
 * Helper: Calculate cluster density (average similarity within cluster)
 */
function calculateClusterDensity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cluster: Array<any>,
  provider: ReturnType<typeof getEmbeddingProvider>
): number {
  if (cluster.length <= 1) return 1.0;

  let totalSimilarity = 0;
  let pairCount = 0;

  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < Math.min(i + 5, cluster.length); j++) {
      totalSimilarity += provider.similarity(
        cluster[i].embedding,
        cluster[j].embedding
      );
      pairCount++;
    }
  }

  return pairCount > 0 ? totalSimilarity / pairCount : 0;
}

/**
 * Helper: Extract patterns from clusters
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPatterns(clusters: Array<Array<any>>): string[] {
  const patterns: string[] = [];

  for (const cluster of clusters) {
    if (cluster.length < 2) continue;

    const contexts = cluster.map((m) => m.context).filter(Boolean);
    const suggestions = cluster
      .map((m) => m.suggestion)
      .filter((s) => s && s.length > 5);

    // Common context pattern
    const contextCounts: Record<string, number> = {};
    for (const ctx of contexts) {
      contextCounts[ctx] = (contextCounts[ctx] || 0) + 1;
    }

    const topContext = Object.entries(contextCounts).sort(
      (a, b) => b[1] - a[1]
    )[0];
    if (topContext && topContext[1] >= 2) {
      patterns.push(
        `Pattern: ${cluster.length} memories about "${topContext[0]}"`
      );
    }

    // Extract common themes from suggestions
    if (suggestions.length >= 2) {
      const commonWords = findCommonWords(suggestions);
      if (commonWords.length > 0) {
        patterns.push(`Theme: Recurring focus on ${commonWords.join(', ')}`);
      }
    }

    // Vibe pattern
    const vibes = cluster.map((m) => m.vibe).filter(Boolean);
    if (vibes.length >= 2) {
      const topVibe = vibes
        .sort(
          (a, b) =>
            vibes.filter((v) => v === a).length -
            vibes.filter((v) => v === b).length
        )
        .pop();
      if (topVibe) {
        patterns.push(
          `Vibe: ${cluster.length} memories with "${topVibe}" sentiment`
        );
      }
    }
  }

  return Array.from(new Set(patterns));
}

/**
 * Helper: Find common words in suggestions
 */
function findCommonWords(texts: string[]): string[] {
  if (texts.length === 0) return [];

  const wordFreq: Record<string, number> = {};
  const minLength = 4;

  for (const text of texts) {
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > minLength && !isCommonWord(w));

    for (const word of words) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  }

  return Object.entries(wordFreq)
    .filter(([, count]) => count >= Math.ceil(texts.length / 2))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);
}

/**
 * Helper: Common words to filter
 */
function isCommonWord(word: string): boolean {
  const common = [
    'the',
    'and',
    'that',
    'this',
    'with',
    'from',
    'have',
    'were',
    'been',
    'their',
    'would',
    'should',
    'could',
  ];
  return common.includes(word);
}

/**
 * Helper: Generate recommendations based on patterns and insights
 */
function generateRecommendations(
  patterns: string[],
  insights: string[]
): string[] {
  const recommendations: string[] = [];

  // Add insight-based recommendations
  if (insights.length > 0) {
    recommendations.push('Review extracted insights for actionable items');
  }

  // Add consolidation recommendations
  if (patterns.length > 5) {
    recommendations.push(
      'High pattern diversity—consider focused future consolidations'
    );
  }

  // Add standard recommendations
  recommendations.push('Schedule next consolidation in 7 days');
  recommendations.push('Use semantic recall for problem-solving');

  return recommendations;
}

// ============================================================================
// MAIN FLOW
// ============================================================================

export const memoryConsolidationFlow = ai.defineFlow(
  {
    name: 'memoryConsolidation',
    inputSchema: z.object({
      userId: z.string(),
      timeWindowDays: z.number().default(7).describe('Consolidate last N days'),
      minConfidence: z
        .number()
        .default(0.5)
        .describe('Skip low-confidence memories'),
    }),
    outputSchema: MemoryConsolidationOutputSchema,
  },
  async ({ userId, timeWindowDays, minConfidence }) => {
    const traceId = generateTraceId();
    const errors: string[] = [];
    let totalTokensUsed = 0;

    MollyLogger.logFlowStart(
      'memoryConsolidation',
      { userId, timeWindowDays, minConfidence },
      traceId
    );

    try {
      if (!isAdminConfigured()) {
        return {
          summary:
            'Firebase Admin not configured — cannot consolidate memories',
          keyPatterns: [],
          insights: [],
          tokensUsed: 0,
          semanticDensity: 0,
          recommendations: ['Configure Firebase Admin SDK'],
        };
      }
      const storage = await getStorageRouter();
      const embeddingProvider = getEmbeddingProvider();

      // STEP 1: Fetch Memories
      MollyLogger.info('Step 1: Fetching memories', 'memoryConsolidation', {
        userId,
        timeWindowDays,
      });

      const timeWindowMs = timeWindowDays * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - timeWindowMs;

      const experienceDocs = await storage.query(
        `users/${userId}/experiences`,
        [{ field: 'timestamp', operator: '>=', value: cutoffTime }],
        { orderBy: { field: 'timestamp', direction: 'desc' } }
      );

      const memories = experienceDocs
        .map((doc) => doc.data)
        .filter((m) => !m.vibeScore || (m.vibeScore as number) >= minConfidence)
        .slice(0, 200); // Limit to 200 memories per consolidation

      if (memories.length === 0) {
        MollyLogger.warn(
          'No memories found in time window',
          'memoryConsolidation',
          { userid: userId, timeWindowDays }
        );
        return {
          summary: `No memories found in the last ${timeWindowDays} days`,
          keyPatterns: [],
          insights: [],
          tokensUsed: 0,
          semanticDensity: 0,
          recommendations: ['Collect more memories before next consolidation'],
        };
      }

      // STEP 2: Generate Embeddings
      MollyLogger.info(
        `Step 2: Embedding ${memories.length} memories`,
        'memoryConsolidation'
      );

      const memoryTexts = memories.map(
        (m) =>
          `${m.suggestion || m.modificationSuggestion || 'Unknown'} (context: ${m.context || 'general'})`
      );

      const embeddingBatch = await embeddingProvider.embedBatch(memoryTexts);
      const embeddingVectors = embeddingBatch.embeddings.map((e) => e.vector);
      totalTokensUsed += embeddingBatch.totalTokensUsed || 0;

      const memoriesWithVectors = memories.map((m, i) => ({
        ...m,
        embedding: embeddingVectors[i],
        priority: semanticPriority(m.vibeScore || 0.5, m.timestamp, Date.now()),
      }));

      // STEP 3: Semantic Clustering
      MollyLogger.info('Step 3: Semantic clustering', 'memoryConsolidation');

      const clusters = performSemanticClustering(
        memoriesWithVectors,
        embeddingProvider
      );

      MollyLogger.info(
        `Identified ${clusters.length} clusters`,
        'memoryConsolidation'
      );

      // Calculate semantic density
      const densities = clusters.map((c) =>
        calculateClusterDensity(c, embeddingProvider)
      );
      const semanticDensity =
        densities.reduce((a, b) => a + b, 0) / Math.max(1, densities.length);

      // STEP 4: Pattern Extraction
      MollyLogger.info('Step 4: Extracting patterns', 'memoryConsolidation');

      const patterns = extractPatterns(clusters);

      // STEP 5: Insight Generation
      MollyLogger.info('Step 5: Generating insights', 'memoryConsolidation');

      const insightSynthesis = await withGenerateErrorHandling(
        async () =>
          await molly.generate(TaskType.BACKGROUND, {
            system: `You are Molly's Learning Engine. Synthesize memories and patterns into 3-5 actionable insights. Focus on:
1. Recurring challenges and how Molly overcomes them
2. Growth areas and improvements over time
3. Practical recommendations for future actions
Format as bullet points. Be specific and evidence-based.`,
            prompt: `Consolidated memories (${memories.length} total):
${patterns.join('\n')}

Clusters identified: ${clusters.length}
Semantic density: ${(semanticDensity * 100).toFixed(1)}%

Generate insights for Molly's continued growth.`,
          }),
        'memoryConsolidation',
        traceId
      );

      const insights = insightSynthesis.text
        .split('\n')
        .filter(
          (line) => line.trim().startsWith('-') || line.trim().startsWith('•')
        )
        .map((line) => line.replace(/^[-•]\s*/, '').trim())
        .filter((line) => line.length > 5);

      // STEP 6: Store Consolidated Record
      MollyLogger.info(
        'Step 6: Storing consolidated record',
        'memoryConsolidation'
      );

      const consolidatedRecord = createMemoryRecord<ExperienceRecord>({
        type: 'experience',
        userId,
        timestamp: Date.now(),
        traceId: generateTraceId(),
        context: `consolidated_${timeWindowDays}d`,
        suggestion: `Memory consolidation: ${clusters.length} clusters, ${patterns.length} patterns, ${insights.length} insights`,
        vibe: 'Learning',
        vibeScore: Math.min(1, 0.7 + semanticDensity * 0.3), // Higher density = higher confidence
        success: true,
      });

      // Add checksum for integrity
      const recordWithChecksum = addChecksum(consolidatedRecord);

      // Store in Storage Router
      await storage.batchWrite([
        {
          type: 'set',
          collectionPath: `users/${userId}/experiences`,
          docId: recordWithChecksum.id,
          data: recordWithChecksum as unknown as Record<string, unknown>,
        },
      ]);

      // STEP 7: Return Results
      MollyLogger.logFlowComplete(
        'memoryConsolidation',
        {
          memoriesProcessed: memories.length,
          clustersIdentified: clusters.length,
          patternsExtracted: patterns.length,
          insightsGenerated: insights.length,
          semanticDensity: semanticDensity.toFixed(3),
        },
        traceId
      );

      return {
        summary: `Consolidated ${memories.length} memories into ${clusters.length} clusters. Identified ${patterns.length} patterns and extracted ${insights.length} insights for growth.`,
        keyPatterns: patterns,
        insights,
        tokensUsed: totalTokensUsed,
        semanticDensity,
        recommendations: generateRecommendations(patterns, insights),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(errorMsg);

      MollyLogger.error(
        'Memory consolidation failed',
        'memoryConsolidation',
        { userId },
        error,
        traceId
      );

      return {
        summary: 'Consolidation incomplete due to error',
        keyPatterns: [],
        insights: [],
        tokensUsed: totalTokensUsed,
        semanticDensity: 0,
        recommendations: ['Retry consolidation process'],
        errors,
      };
    }
  }
);

/**
 * Execute memory consolidation (exported for scheduling)
 */
export async function executeMemoryConsolidation(
  userId: string,
  options: {
    timeWindowDays?: number;
    minConfidence?: number;
  } = {}
) {
  return await memoryConsolidationFlow({
    userId,
    timeWindowDays: options.timeWindowDays || 7,
    minConfidence: options.minConfidence || 0.5,
  });
}
