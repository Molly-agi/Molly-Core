/**
 * @fileOverview World Model Tool — Molly's Mental Simulation Interface
 *
 * This tool allows Molly to:
 *   - Build her understanding of the world (entities, relations)
 *   - Simulate actions before taking them ("what if?")
 *   - Make and verify predictions
 *   - Reason about alternatives (counterfactuals)
 *
 * "Measure twice, cut once" — but in thought-space
 */

import { z } from 'zod';
import { defineTool } from '@genkit-ai/ai';
import {
  upsertEntity,
  getEntity,
  getEntitiesByType,
  removeEntity,
  createRelation,
  getRelationsFor,
  findCausalChain,
  simulate,
  predict,
  verifyPrediction,
  getPendingPredictions,
  counterfactual,
  simulateBeforeAction,
  getWorldModelStatus,
  getRecentSimulations,
  getAllEntities,
  type EntityType,
  type RelationType,
  type SimulationOutcome,
} from '../agency/cognition/world-model';

const WorldModelInputSchema = z.object({
  action: z.enum([
    // Entity management
    'entity', // Create or update an entity
    'getEntity', // Get a specific entity
    'listEntities', // List entities by type
    'removeEntity', // Remove an entity
    // Relation management
    'relate', // Create a causal relation
    'relations', // Get relations for an entity
    'findChain', // Find causal chain between entities
    // Simulation
    'simulate', // Simulate an action
    'simulateBefore', // Simulate before taking action
    // Prediction
    'predict', // Make a prediction
    'verify', // Verify a prediction
    'pendingPredictions', // Get predictions needing verification
    // Counterfactual
    'whatIf', // Counterfactual reasoning
    // Status
    'status', // Get world model status
    'recentSimulations', // Get recent simulations
  ]),
  // For entity actions
  entityType: z
    .enum(['person', 'system', 'concept', 'resource', 'state', 'goal'])
    .optional(),
  entityName: z.string().optional(),
  entityDescription: z.string().optional(),
  entityProperties: z.record(z.unknown()).optional(),
  entityId: z.string().optional(),
  // For relation actions
  fromEntity: z.string().optional(),
  toEntity: z.string().optional(),
  relationType: z
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
    .optional(),
  relationStrength: z.number().min(0).max(1).optional(),
  evidence: z.string().optional(),
  // For simulation
  simulateAction: z.string().optional(),
  involvedEntities: z.array(z.string()).optional(),
  context: z.record(z.unknown()).optional(),
  // For prediction
  predictionText: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  resolveByHours: z.number().optional(),
  predictionId: z.string().optional(),
  actualOutcome: z.string().optional(),
  predictionCorrect: z.boolean().optional(),
  // For counterfactual
  actualAction: z.string().optional(),
  actualOutcomeResult: z
    .enum(['success', 'failure', 'partial', 'unknown'])
    .optional(),
  alternativeAction: z.string().optional(),
  // For lists
  limit: z.number().min(1).max(20).optional(),
});

const WorldModelOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const worldModelTool = defineTool(
  {
    name: 'worldModel',
    description: `Your mental simulation engine for reasoning about the world:
- Build understanding: entities (things) and relations (how they connect)
- Simulate actions before taking them ("what would happen if...")
- Make and track predictions
- Reason about alternatives (counterfactuals)

Actions:
- 'entity': Create/update entity (entityType, entityName, entityDescription, entityProperties)
- 'getEntity': Get entity details (entityName or entityId)
- 'listEntities': List by type (entityType)
- 'removeEntity': Remove entity (entityId)
- 'relate': Create relation (fromEntity, toEntity, relationType, relationStrength, evidence)
- 'relations': Get relations (entityId)
- 'findChain': Find causal path (fromEntity, toEntity)
- 'simulate': Run simulation (simulateAction, involvedEntities, context)
- 'simulateBefore': Pre-action check (simulateAction, context)
- 'predict': Make prediction (predictionText, confidence, resolveByHours)
- 'verify': Verify prediction (predictionId, actualOutcome, predictionCorrect)
- 'pendingPredictions': Get unverified predictions
- 'whatIf': Counterfactual (actualAction, actualOutcomeResult, alternativeAction, involvedEntities)
- 'status': World model overview
- 'recentSimulations': Recent simulation history`,
    inputSchema: WorldModelInputSchema,
    outputSchema: WorldModelOutputSchema,
  },
  async (input) => {
    try {
      switch (input.action) {
        case 'entity': {
          if (!input.entityType || !input.entityName) {
            return {
              success: false,
              message: 'Missing required fields: entityType, entityName',
            };
          }

          const entity = upsertEntity(
            input.entityType as EntityType,
            input.entityName,
            input.entityDescription || '',
            input.entityProperties || {},
            'observation',
            input.confidence || 0.8
          );

          return {
            success: true,
            message: `Entity "${entity.name}" (${entity.type}) created/updated`,
            data: {
              id: entity.id,
              type: entity.type,
              name: entity.name,
              confidence: entity.confidence,
            },
          };
        }

        case 'getEntity': {
          const nameOrId = input.entityName || input.entityId;
          if (!nameOrId) {
            return {
              success: false,
              message: 'Missing entityName or entityId',
            };
          }

          const entity = getEntity(nameOrId);
          if (!entity) {
            return {
              success: false,
              message: `Entity "${nameOrId}" not found`,
            };
          }

          return {
            success: true,
            message: `Found entity: ${entity.name}`,
            data: entity,
          };
        }

        case 'listEntities': {
          const entities = input.entityType
            ? getEntitiesByType(input.entityType as EntityType)
            : getAllEntities();

          return {
            success: true,
            message: `${entities.length} entities found`,
            data: entities.slice(0, input.limit || 10).map((e) => ({
              id: e.id,
              type: e.type,
              name: e.name,
              confidence: e.confidence,
            })),
          };
        }

        case 'removeEntity': {
          if (!input.entityId) {
            return { success: false, message: 'Missing entityId' };
          }

          const removed = removeEntity(input.entityId);
          return {
            success: removed,
            message: removed ? 'Entity removed' : 'Entity not found',
          };
        }

        case 'relate': {
          if (!input.fromEntity || !input.toEntity || !input.relationType) {
            return {
              success: false,
              message: 'Missing required: fromEntity, toEntity, relationType',
            };
          }

          // Try to find entities by name
          const from = getEntity(input.fromEntity);
          const to = getEntity(input.toEntity);

          if (!from || !to) {
            return {
              success: false,
              message: `Entity not found: ${!from ? input.fromEntity : input.toEntity}. Create it first.`,
            };
          }

          const relation = createRelation(
            from.id,
            to.id,
            input.relationType as RelationType,
            input.relationStrength || 0.7,
            input.evidence
          );

          if (!relation) {
            return { success: false, message: 'Failed to create relation' };
          }

          return {
            success: true,
            message: `Relation: ${from.name} -[${relation.type}]-> ${to.name} (strength: ${Math.round(relation.strength * 100)}%)`,
            data: {
              id: relation.id,
              type: relation.type,
              strength: relation.strength,
              observations: relation.observations,
            },
          };
        }

        case 'relations': {
          const nameOrId = input.entityName || input.entityId;
          if (!nameOrId) {
            return { success: false, message: 'Missing entity identifier' };
          }

          const entity = getEntity(nameOrId);
          if (!entity) {
            return { success: false, message: 'Entity not found' };
          }

          const { outgoing, incoming } = getRelationsFor(entity.id);

          const formatRelation = (r: {
            from: string;
            to: string;
            type: string;
            strength: number;
          }) => {
            const fromE = getEntity(r.from);
            const toE = getEntity(r.to);
            return `${fromE?.name || r.from} -[${r.type}]-> ${toE?.name || r.to} (${Math.round(r.strength * 100)}%)`;
          };

          return {
            success: true,
            message: `${outgoing.length} outgoing, ${incoming.length} incoming relations`,
            data: {
              outgoing: outgoing.map(formatRelation),
              incoming: incoming.map(formatRelation),
            },
          };
        }

        case 'findChain': {
          if (!input.fromEntity || !input.toEntity) {
            return {
              success: false,
              message: 'Missing fromEntity or toEntity',
            };
          }

          const from = getEntity(input.fromEntity);
          const to = getEntity(input.toEntity);

          if (!from || !to) {
            return {
              success: false,
              message: 'One or both entities not found',
            };
          }

          const chains = findCausalChain(from.id, to.id);

          if (chains.length === 0) {
            return {
              success: true,
              message: `No causal path found from ${from.name} to ${to.name}`,
              data: { chains: [] },
            };
          }

          const formattedChains = chains.map((chain) =>
            chain.map((r) => {
              const fromE = getEntity(r.from);
              const toE = getEntity(r.to);
              return `${fromE?.name} -[${r.type}]-> ${toE?.name}`;
            })
          );

          return {
            success: true,
            message: `Found ${chains.length} causal path(s)`,
            data: { chains: formattedChains },
          };
        }

        case 'simulate': {
          if (!input.simulateAction) {
            return { success: false, message: 'Missing simulateAction' };
          }

          const entityIds = (input.involvedEntities || [])
            .map((name) => getEntity(name)?.id)
            .filter((id): id is string => id !== undefined);

          const simulation = simulate(
            input.simulateAction,
            entityIds,
            input.context || {}
          );

          return {
            success: true,
            message: `Simulation: ${simulation.outcome} (${Math.round(simulation.confidence * 100)}% confidence)`,
            data: {
              id: simulation.id,
              outcome: simulation.outcome,
              confidence: simulation.confidence,
              steps: simulation.steps.length,
              stepSummary: simulation.steps.slice(0, 3).map((s) => s.action),
              alternatives: simulation.alternatives.map((a) => ({
                description: a.description,
                outcome: a.outcome,
                probability: Math.round(a.probability * 100) + '%',
              })),
            },
          };
        }

        case 'simulateBefore': {
          if (!input.simulateAction) {
            return { success: false, message: 'Missing simulateAction' };
          }

          const result = simulateBeforeAction(
            input.simulateAction,
            input.context || {}
          );

          return {
            success: true,
            message: result.shouldProceed
              ? `PROCEED — ${Math.round(result.confidence * 100)}% confidence`
              : `CAUTION — ${result.warnings.length} warning(s)`,
            data: {
              shouldProceed: result.shouldProceed,
              confidence: result.confidence,
              outcome: result.simulation.outcome,
              warnings: result.warnings,
              suggestions: result.suggestions,
            },
          };
        }

        case 'predict': {
          if (!input.predictionText || input.confidence === undefined) {
            return {
              success: false,
              message: 'Missing predictionText or confidence',
            };
          }

          const resolveByMs = (input.resolveByHours || 24) * 60 * 60 * 1000;
          const prediction = predict(
            input.predictionText,
            input.confidence,
            resolveByMs
          );

          return {
            success: true,
            message: `Prediction recorded: "${input.predictionText.slice(0, 50)}..." (${Math.round(input.confidence * 100)}% confidence)`,
            data: {
              id: prediction.id,
              resolveBy: prediction.resolveBy,
            },
          };
        }

        case 'verify': {
          if (
            !input.predictionId ||
            !input.actualOutcome ||
            input.predictionCorrect === undefined
          ) {
            return {
              success: false,
              message:
                'Missing predictionId, actualOutcome, or predictionCorrect',
            };
          }

          const verified = verifyPrediction(
            input.predictionId,
            input.actualOutcome,
            input.predictionCorrect
          );

          return {
            success: verified,
            message: verified
              ? `Prediction verified: ${input.predictionCorrect ? 'CORRECT' : 'WRONG'}`
              : 'Prediction not found',
          };
        }

        case 'pendingPredictions': {
          const pending = getPendingPredictions();

          return {
            success: true,
            message: `${pending.length} predictions awaiting verification`,
            data: pending.map((p) => ({
              id: p.id,
              prediction: p.prediction.slice(0, 80),
              confidence: Math.round(p.confidence * 100) + '%',
              resolveBy: p.resolveBy,
            })),
          };
        }

        case 'whatIf': {
          if (
            !input.actualAction ||
            !input.actualOutcomeResult ||
            !input.alternativeAction
          ) {
            return {
              success: false,
              message:
                'Missing actualAction, actualOutcomeResult, or alternativeAction',
            };
          }

          const entityIds = (input.involvedEntities || [])
            .map((name) => getEntity(name)?.id)
            .filter((id): id is string => id !== undefined);

          const result = counterfactual(
            input.actualAction,
            input.actualOutcomeResult as SimulationOutcome,
            input.alternativeAction,
            entityIds
          );

          return {
            success: true,
            message: result.recommendation,
            data: {
              comparison: result.comparison,
              alternativeOutcome: result.alternative.outcome,
              alternativeConfidence:
                Math.round(result.alternative.confidence * 100) + '%',
              recommendation: result.recommendation,
            },
          };
        }

        case 'status': {
          const status = getWorldModelStatus();
          return {
            success: true,
            message: `World model: ${status.entities} entities, ${status.relations} relations, ${status.predictionAccuracy}% prediction accuracy`,
            data: status,
          };
        }

        case 'recentSimulations': {
          const simulations = getRecentSimulations(input.limit || 5);

          return {
            success: true,
            message: `${simulations.length} recent simulation(s)`,
            data: simulations.map((s) => ({
              id: s.id,
              action: s.action.slice(0, 60),
              outcome: s.outcome,
              confidence: Math.round(s.confidence * 100) + '%',
              runAt: s.runAt,
            })),
          };
        }

        default:
          return {
            success: false,
            message: `Unknown action: ${input.action}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
);
