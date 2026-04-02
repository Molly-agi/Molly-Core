/**
 * @fileOverview Deep Research → World Model Integration
 *
 * Extracts knowledge from deep research results and updates Molly's world model.
 * This enables research findings to become part of her causal understanding.
 *
 * Flow:
 * 1. Deep research returns findings with citations
 * 2. This module extracts entities (concepts, systems, people, etc.)
 * 3. Creates relations between entities based on the findings
 * 4. Updates the world model for future reasoning
 *
 * "Learning isn't just storing information — it's building connections." — Molly
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import {
  upsertEntity,
  createRelation,
  getEntity,
  type EntityType,
  type RelationType,
} from '@/ai/agency/cognition/world-model';
import { molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

export interface ResearchKnowledge {
  /** The original research query */
  query: string;
  /** The research findings */
  findings: string;
  /** Source citations */
  citations: string[];
  /** When the research was conducted */
  timestamp: number;
}

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  description: string;
  confidence: number;
}

export interface ExtractedRelation {
  from: string;
  to: string;
  type: RelationType;
  evidence: string;
  strength: number;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  summary: string;
}

// ============================================================================
// EXTRACTION SCHEMA
// ============================================================================

const ExtractionSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string().describe('Name of the entity'),
      type: z
        .enum(['person', 'system', 'concept', 'resource', 'state', 'goal'])
        .describe('Type of entity'),
      description: z.string().describe('Brief description'),
      confidence: z.number().min(0).max(1).describe('Confidence 0-1'),
    })
  ),
  relations: z.array(
    z.object({
      from: z.string().describe('Source entity name'),
      to: z.string().describe('Target entity name'),
      type: z
        .enum([
          'causes',
          'enables',
          'prevents',
          'requires',
          'correlates',
          'opposes',
          'contains',
          'influences',
        ])
        .describe('Relationship type'),
      evidence: z.string().describe('Evidence from research'),
      strength: z.number().min(0).max(1).describe('Strength 0-1'),
    })
  ),
  summary: z.string().describe('One-sentence summary of key learnings'),
});

// ============================================================================
// EXTRACTION
// ============================================================================

/**
 * Extract entities and relations from research findings using LLM.
 */
export async function extractKnowledge(
  research: ResearchKnowledge
): Promise<ExtractionResult> {
  const traceId = generateTraceId();

  MollyLogger.info(
    'Extracting knowledge from research',
    'research-integration',
    { query: research.query.substring(0, 50) },
    traceId
  );

  try {
    const response = await molly.generate(TaskType.REASONING, {
      output: { schema: ExtractionSchema },
      prompt: `You are analyzing research findings to extract structured knowledge for a world model.

RESEARCH QUERY: "${research.query}"

FINDINGS:
${research.findings}

CITATIONS:
${research.citations
  .slice(0, 5)
  .map((c, i) => `${i + 1}. ${c}`)
  .join('\n')}

Extract:
1. ENTITIES: Key concepts, systems, people, resources mentioned (max 5)
2. RELATIONS: How these entities relate to each other (causes, enables, requires, etc.)
3. SUMMARY: One sentence capturing the key insight

Focus on knowledge that would be useful for future reasoning and decision-making.
Assign confidence based on how well-supported the knowledge is.`,
    });

    const result = response.output;

    if (!result) {
      MollyLogger.warn(
        'Knowledge extraction returned no output',
        'research-integration',
        {},
        traceId
      );
      return {
        entities: [],
        relations: [],
        summary: 'No extractable knowledge found',
      };
    }

    MollyLogger.info(
      `Extracted ${result.entities.length} entities, ${result.relations.length} relations`,
      'research-integration',
      {},
      traceId
    );

    return result;
  } catch {
    MollyLogger.error(
      'Knowledge extraction failed',
      'research-integration',
      {},
      error,
      traceId
    );
    return {
      entities: [],
      relations: [],
      summary: 'Extraction failed',
    };
  }
}

// ============================================================================
// WORLD MODEL UPDATE
// ============================================================================

/**
 * Update the world model with extracted knowledge.
 */
export function updateWorldModel(extraction: ExtractionResult): {
  entitiesCreated: number;
  relationsCreated: number;
} {
  const traceId = generateTraceId();
  let entitiesCreated = 0;
  let relationsCreated = 0;

  // Create entities
  const entityMap = new Map<string, string>(); // name → id

  for (const entity of extraction.entities) {
    try {
      const created = upsertEntity(
        entity.type,
        entity.name,
        entity.description,
        { extractedFrom: 'deep-research' },
        'told', // Source is research
        entity.confidence
      );
      entityMap.set(entity.name.toLowerCase(), created.id);
      entitiesCreated++;
    } catch {
      MollyLogger.warn(
        `Failed to create entity: ${entity.name}`,
        'research-integration',
        {},
        traceId
      );
    }
  }

  // Create relations
  for (const relation of extraction.relations) {
    try {
      const fromId = entityMap.get(relation.from.toLowerCase());
      const toId = entityMap.get(relation.to.toLowerCase());

      // If entities weren't just created, try to find them
      const fromEntity =
        fromId ||
        getEntity(relation.from)?.id ||
        // Create a minimal entity if not found
        upsertEntity(
          'concept',
          relation.from,
          'Referenced in research',
          {},
          'inference',
          0.5
        ).id;

      const toEntity =
        toId ||
        getEntity(relation.to)?.id ||
        upsertEntity(
          'concept',
          relation.to,
          'Referenced in research',
          {},
          'inference',
          0.5
        ).id;

      const created = createRelation(
        fromEntity,
        toEntity,
        relation.type,
        relation.strength,
        relation.evidence
      );

      if (created) {
        relationsCreated++;
      }
    } catch {
      MollyLogger.warn(
        `Failed to create relation: ${relation.from} → ${relation.to}`,
        'research-integration',
        {},
        traceId
      );
    }
  }

  MollyLogger.info(
    `World model updated: ${entitiesCreated} entities, ${relationsCreated} relations`,
    'research-integration',
    { entitiesCreated, relationsCreated },
    traceId
  );

  return { entitiesCreated, relationsCreated };
}

// ============================================================================
// MAIN INTEGRATION FUNCTION
// ============================================================================

/**
 * Process deep research results and update the world model.
 * Call this after completing a deep research operation.
 */
export async function integrateResearchIntoWorldModel(
  research: ResearchKnowledge
): Promise<{
  success: boolean;
  entitiesCreated: number;
  relationsCreated: number;
  summary: string;
}> {
  const traceId = generateTraceId();

  MollyLogger.info(
    'Integrating research into world model',
    'research-integration',
    { query: research.query.substring(0, 50) },
    traceId
  );

  try {
    // Step 1: Extract knowledge
    const extraction = await extractKnowledge(research);

    if (extraction.entities.length === 0 && extraction.relations.length === 0) {
      return {
        success: true,
        entitiesCreated: 0,
        relationsCreated: 0,
        summary: 'No actionable knowledge extracted',
      };
    }

    // Step 2: Update world model
    const { entitiesCreated, relationsCreated } = updateWorldModel(extraction);

    return {
      success: true,
      entitiesCreated,
      relationsCreated,
      summary: extraction.summary,
    };
  } catch {
    MollyLogger.error(
      'Failed to integrate research',
      'research-integration',
      {},
      error,
      traceId
    );
    return {
      success: false,
      entitiesCreated: 0,
      relationsCreated: 0,
      summary: 'Integration failed',
    };
  }
}

/**
 * Quick integration for simple facts (without LLM extraction).
 * Use for well-structured research results.
 */
export function integrateSimpleFact(
  entityName: string,
  entityType: EntityType,
  description: string,
  relatedTo?: { name: string; relation: RelationType }
): boolean {
  try {
    const entity = upsertEntity(
      entityType,
      entityName,
      description,
      { source: 'deep-research' },
      'told',
      0.8
    );

    if (relatedTo) {
      const targetEntity = getEntity(relatedTo.name);
      if (targetEntity) {
        createRelation(
          entity.id,
          targetEntity.id,
          relatedTo.relation,
          0.7,
          'From deep research'
        );
      }
    }

    return true;
  } catch {
    return false;
  }
}
