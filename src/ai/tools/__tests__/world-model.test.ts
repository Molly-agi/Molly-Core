/**
 * @fileOverview Tests for World Model Tool — Mental Simulation
 *
 * Tests world model functionality including:
 * - Entity management (create, get, list, remove)
 * - Relation management
 * - Simulation
 * - Prediction
 * - Counterfactual reasoning
 */

// Mock the world-model agency
jest.mock('../../agency/world-model', () => ({
  upsertEntity: jest.fn(),
  getEntity: jest.fn(),
  getEntitiesByType: jest.fn(),
  getAllEntities: jest.fn(),
  removeEntity: jest.fn(),
  createRelation: jest.fn(),
  getRelationsFor: jest.fn(),
  findCausalChain: jest.fn(),
  simulate: jest.fn(),
  predict: jest.fn(),
  verifyPrediction: jest.fn(),
  getPendingPredictions: jest.fn(),
  counterfactual: jest.fn(),
  simulateBeforeAction: jest.fn(),
  getWorldModelStatus: jest.fn(),
  getRecentSimulations: jest.fn(),
}));

import * as wmModule from '../../agency/cognition/world-model';

// Mock defineTool to capture the handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let toolHandler: (input: any) => Promise<any>;

jest.mock('@genkit-ai/ai', () => ({
  defineTool: jest.fn((config, handler) => {
    toolHandler = handler;
    return { __config: config, __handler: handler };
  }),
}));

const mockUpsertEntity = wmModule.upsertEntity as jest.MockedFunction<
  typeof wmModule.upsertEntity
>;
const mockGetEntity = wmModule.getEntity as jest.MockedFunction<
  typeof wmModule.getEntity
>;
const mockGetEntitiesByType = wmModule.getEntitiesByType as jest.MockedFunction<
  typeof wmModule.getEntitiesByType
>;
const mockGetAllEntities = wmModule.getAllEntities as jest.MockedFunction<
  typeof wmModule.getAllEntities
>;
const mockRemoveEntity = wmModule.removeEntity as jest.MockedFunction<
  typeof wmModule.removeEntity
>;
const mockCreateRelation = wmModule.createRelation as jest.MockedFunction<
  typeof wmModule.createRelation
>;
const mockGetRelationsFor = wmModule.getRelationsFor as jest.MockedFunction<
  typeof wmModule.getRelationsFor
>;
const mockFindCausalChain = wmModule.findCausalChain as jest.MockedFunction<
  typeof wmModule.findCausalChain
>;
const mockSimulate = wmModule.simulate as jest.MockedFunction<
  typeof wmModule.simulate
>;
const mockPredict = wmModule.predict as jest.MockedFunction<
  typeof wmModule.predict
>;
const mockVerifyPrediction = wmModule.verifyPrediction as jest.MockedFunction<
  typeof wmModule.verifyPrediction
>;
const mockGetPendingPredictions =
  wmModule.getPendingPredictions as jest.MockedFunction<
    typeof wmModule.getPendingPredictions
  >;
const mockCounterfactual = wmModule.counterfactual as jest.MockedFunction<
  typeof wmModule.counterfactual
>;
const mockSimulateBeforeAction =
  wmModule.simulateBeforeAction as jest.MockedFunction<
    typeof wmModule.simulateBeforeAction
  >;
const mockGetWorldModelStatus =
  wmModule.getWorldModelStatus as jest.MockedFunction<
    typeof wmModule.getWorldModelStatus
  >;
const mockGetRecentSimulations =
  wmModule.getRecentSimulations as jest.MockedFunction<
    typeof wmModule.getRecentSimulations
  >;

describe('World Model Tool', () => {
  beforeAll(async () => {
    await import('../world-model');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Entity Management', () => {
    it('creates entity', async () => {
      mockUpsertEntity.mockReturnValue({
        id: 'ent_1',
        type: 'person',
        name: 'Eric',
        confidence: 0.9,
      } as unknown);

      const result = await toolHandler({
        action: 'entity',
        entityType: 'person',
        entityName: 'Eric',
        entityDescription: 'The founder',
        confidence: 0.9,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Eric');
      expect(result.data.type).toBe('person');
    });

    it('requires entityType and entityName', async () => {
      const result = await toolHandler({
        action: 'entity',
        entityType: 'person',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('entityType');
    });

    it('gets entity by name', async () => {
      mockGetEntity.mockReturnValue({
        id: 'ent_1',
        type: 'system',
        name: 'MollyCore',
        confidence: 0.8,
      } as unknown);

      const result = await toolHandler({
        action: 'getEntity',
        entityName: 'MollyCore',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('MollyCore');
    });

    it('handles entity not found', async () => {
      mockGetEntity.mockReturnValue(null);

      const result = await toolHandler({
        action: 'getEntity',
        entityName: 'NonExistent',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('lists entities by type', async () => {
      mockGetEntitiesByType.mockReturnValue([
        { id: '1', type: 'person', name: 'Alice', confidence: 0.9 },
        { id: '2', type: 'person', name: 'Bob', confidence: 0.8 },
      ] as unknown);

      const result = await toolHandler({
        action: 'listEntities',
        entityType: 'person',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 entities');
    });

    it('lists all entities when no type specified', async () => {
      mockGetAllEntities.mockReturnValue([
        { id: '1', type: 'person', name: 'Alice', confidence: 0.9 },
      ] as unknown);

      const result = await toolHandler({ action: 'listEntities' });

      expect(result.success).toBe(true);
      expect(mockGetAllEntities).toHaveBeenCalled();
    });

    it('removes entity', async () => {
      mockRemoveEntity.mockReturnValue(true);

      const result = await toolHandler({
        action: 'removeEntity',
        entityId: 'ent_1',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('removed');
    });

    it('handles remove entity not found', async () => {
      mockRemoveEntity.mockReturnValue(false);

      const result = await toolHandler({
        action: 'removeEntity',
        entityId: 'nonexistent',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Relation Management', () => {
    it('creates relation', async () => {
      mockGetEntity
        .mockReturnValueOnce({ id: 'e1', name: 'Eric' } as unknown)
        .mockReturnValueOnce({ id: 'e2', name: 'Molly' } as unknown);

      mockCreateRelation.mockReturnValue({
        id: 'rel_1',
        from: 'e1',
        to: 'e2',
        type: 'causes',
        strength: 0.8,
        observations: 1,
      } as unknown);

      const result = await toolHandler({
        action: 'relate',
        fromEntity: 'Eric',
        toEntity: 'Molly',
        relationType: 'causes',
        relationStrength: 0.8,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Eric');
      expect(result.message).toContain('Molly');
      expect(result.message).toContain('causes');
    });

    it('requires all relation fields', async () => {
      const result = await toolHandler({
        action: 'relate',
        fromEntity: 'Eric',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing');
    });

    it('handles entity not found for relation', async () => {
      mockGetEntity.mockReturnValue(null);

      const result = await toolHandler({
        action: 'relate',
        fromEntity: 'Unknown',
        toEntity: 'AlsoUnknown',
        relationType: 'causes',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('gets relations for entity', async () => {
      mockGetEntity.mockReturnValue({ id: 'e1', name: 'Eric' } as unknown);
      mockGetRelationsFor.mockReturnValue({
        outgoing: [{ from: 'e1', to: 'e2', type: 'enables', strength: 0.7 }],
        incoming: [],
      } as unknown);

      const result = await toolHandler({
        action: 'relations',
        entityName: 'Eric',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 outgoing');
    });

    it('finds causal chain', async () => {
      mockGetEntity
        .mockReturnValueOnce({ id: 'e1', name: 'A' } as unknown)
        .mockReturnValueOnce({ id: 'e2', name: 'C' } as unknown);

      mockFindCausalChain.mockReturnValue([
        [
          { from: 'e1', to: 'e3', type: 'causes' },
          { from: 'e3', to: 'e2', type: 'enables' },
        ],
      ] as unknown);

      // Mock getEntity for chain formatting
      mockGetEntity
        .mockReturnValueOnce({ id: 'e1', name: 'A' } as unknown)
        .mockReturnValueOnce({ id: 'e3', name: 'B' } as unknown)
        .mockReturnValueOnce({ id: 'e3', name: 'B' } as unknown)
        .mockReturnValueOnce({ id: 'e2', name: 'C' } as unknown);

      const result = await toolHandler({
        action: 'findChain',
        fromEntity: 'A',
        toEntity: 'C',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 causal path');
    });

    it('handles no causal chain found', async () => {
      mockGetEntity
        .mockReturnValueOnce({ id: 'e1', name: 'X' } as unknown)
        .mockReturnValueOnce({ id: 'e2', name: 'Y' } as unknown);
      mockFindCausalChain.mockReturnValue([]);

      const result = await toolHandler({
        action: 'findChain',
        fromEntity: 'X',
        toEntity: 'Y',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('No causal path');
    });
  });

  describe('Simulation', () => {
    it('runs simulation', async () => {
      mockSimulate.mockReturnValue({
        id: 'sim_1',
        outcome: 'success',
        confidence: 0.85,
        steps: [{ action: 'step1' }],
        alternatives: [
          { description: 'alt', outcome: 'partial', probability: 0.3 },
        ],
      } as unknown);

      const result = await toolHandler({
        action: 'simulate',
        simulateAction: 'Deploy new version',
        involvedEntities: [],
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('success');
      expect(result.message).toContain('85%');
    });

    it('requires simulateAction', async () => {
      const result = await toolHandler({ action: 'simulate' });
      expect(result.success).toBe(false);
    });

    it('simulates before action', async () => {
      mockSimulateBeforeAction.mockReturnValue({
        shouldProceed: true,
        confidence: 0.9,
        simulation: { outcome: 'success' },
        warnings: [],
        suggestions: [],
      } as unknown);

      const result = await toolHandler({
        action: 'simulateBefore',
        simulateAction: 'Merge to main',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('PROCEED');
      expect(result.data.shouldProceed).toBe(true);
    });

    it('returns caution with warnings', async () => {
      mockSimulateBeforeAction.mockReturnValue({
        shouldProceed: false,
        confidence: 0.6,
        simulation: { outcome: 'partial' },
        warnings: ['Tests not passing'],
        suggestions: ['Run tests first'],
      } as unknown);

      const result = await toolHandler({
        action: 'simulateBefore',
        simulateAction: 'Deploy without tests',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('CAUTION');
    });
  });

  describe('Prediction', () => {
    it('creates prediction', async () => {
      mockPredict.mockReturnValue({
        id: 'pred_1',
        resolveBy: Date.now() + 86400000,
      } as unknown);

      const result = await toolHandler({
        action: 'predict',
        predictionText: 'Build will pass',
        confidence: 0.8,
        resolveByHours: 24,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Build will pass');
      expect(result.message).toContain('80%');
    });

    it('requires predictionText and confidence', async () => {
      const result = await toolHandler({
        action: 'predict',
        predictionText: 'Test',
      });

      expect(result.success).toBe(false);
    });

    it('verifies prediction', async () => {
      mockVerifyPrediction.mockReturnValue(true);

      const result = await toolHandler({
        action: 'verify',
        predictionId: 'pred_1',
        actualOutcome: 'Build passed',
        predictionCorrect: true,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('CORRECT');
    });

    it('handles prediction not found on verify', async () => {
      mockVerifyPrediction.mockReturnValue(false);

      const result = await toolHandler({
        action: 'verify',
        predictionId: 'nonexistent',
        actualOutcome: 'x',
        predictionCorrect: false,
      });

      expect(result.success).toBe(false);
    });

    it('gets pending predictions', async () => {
      mockGetPendingPredictions.mockReturnValue([
        {
          id: 'p1',
          prediction: 'Build passes',
          confidence: 0.7,
          resolveBy: Date.now(),
        },
      ] as unknown);

      const result = await toolHandler({ action: 'pendingPredictions' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 prediction');
    });
  });

  describe('Counterfactual', () => {
    it('runs whatIf analysis', async () => {
      mockCounterfactual.mockReturnValue({
        comparison: 'Alternative would have been better',
        alternative: { outcome: 'success', confidence: 0.85 },
        recommendation: 'Consider alternative approaches next time',
      } as unknown);

      const result = await toolHandler({
        action: 'whatIf',
        actualAction: 'Deployed immediately',
        actualOutcomeResult: 'failure',
        alternativeAction: 'Deployed after testing',
      });

      expect(result.success).toBe(true);
      expect(result.data.alternativeOutcome).toBe('success');
    });

    it('requires all whatIf fields', async () => {
      const result = await toolHandler({
        action: 'whatIf',
        actualAction: 'Test',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Status & History', () => {
    it('gets status', async () => {
      mockGetWorldModelStatus.mockReturnValue({
        entities: 10,
        relations: 15,
        predictionAccuracy: 75,
      });

      const result = await toolHandler({ action: 'status' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('10 entities');
      expect(result.message).toContain('75%');
    });

    it('gets recent simulations', async () => {
      mockGetRecentSimulations.mockReturnValue([
        {
          id: 's1',
          action: 'Deploy',
          outcome: 'success',
          confidence: 0.9,
          runAt: Date.now(),
        },
      ] as unknown);

      const result = await toolHandler({
        action: 'recentSimulations',
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 recent');
    });
  });

  describe('Error Handling', () => {
    it('handles unknown action', async () => {
      const result = await toolHandler({ action: 'unknown' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown action');
    });

    it('catches errors', async () => {
      mockUpsertEntity.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await toolHandler({
        action: 'entity',
        entityType: 'concept',
        entityName: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Database error');
    });
  });
});
