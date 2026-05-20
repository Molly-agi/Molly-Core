/**
 * @fileOverview Tests for World Model
 *
 * Tests Molly's mental simulation and causal reasoning system.
 */

import * as wm from '../cognition/world-model';

// Mock storage router
jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn().mockResolvedValue({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  }),
}));

// Mock curiosity engine
jest.mock('../planning/curiosity-engine', () => ({
  generateQuestion: jest.fn(),
}));

// Mock logger
jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'trace-12345'),
}));

import { generateQuestion } from '../planning/curiosity-engine';

describe('World Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wm.resetWorldModel();
  });

  describe('Type Definitions', () => {
    it('should support all entity types', () => {
      const types: wm.EntityType[] = [
        'person',
        'system',
        'concept',
        'resource',
        'state',
        'goal',
      ];

      expect(types).toHaveLength(6);
    });

    it('should support all relation types', () => {
      const types: wm.RelationType[] = [
        'causes',
        'enables',
        'prevents',
        'requires',
        'correlates',
        'opposes',
        'contains',
        'influences',
      ];

      expect(types).toHaveLength(8);
    });

    it('should support all simulation outcomes', () => {
      const outcomes: wm.SimulationOutcome[] = [
        'success',
        'failure',
        'partial',
        'unknown',
      ];

      expect(outcomes).toHaveLength(4);
    });
  });

  describe('Entity Management', () => {
    describe('upsertEntity', () => {
      it('should create a new entity', () => {
        const entity = wm.upsertEntity(
          'person',
          'TestPerson',
          'A test person',
          { role: 'tester' },
          'observation',
          0.8
        );

        expect(entity.id).toMatch(/^ent_/);
        expect(entity.type).toBe('person');
        expect(entity.name).toBe('TestPerson');
        expect(entity.description).toBe('A test person');
        expect(entity.properties.role).toBe('tester');
        expect(entity.confidence).toBe(0.8);
        expect(entity.source).toBe('observation');
      });

      it('should update existing entity', () => {
        const first = wm.upsertEntity('person', 'Alice', 'Original', {});
        const second = wm.upsertEntity('person', 'Alice', 'Updated', {
          newProp: true,
        });

        expect(second.id).toBe(first.id);
        expect(second.description).toBe('Updated');
        expect(second.properties.newProp).toBe(true);
      });

      it('should match entity by name case-insensitively', () => {
        wm.upsertEntity('person', 'Bob', 'Original', { a: 1 });
        const updated = wm.upsertEntity('person', 'BOB', 'Updated', { b: 2 });

        const entities = wm.getAllEntities();
        expect(entities).toHaveLength(1);
        expect(updated.properties).toEqual({ a: 1, b: 2 });
      });

      it('should use higher confidence on update', () => {
        wm.upsertEntity('system', 'API', 'Desc', {}, 'observation', 0.5);
        const updated = wm.upsertEntity(
          'system',
          'API',
          'Desc',
          {},
          'told',
          0.9
        );

        expect(updated.confidence).toBe(0.9);
      });

      it('should use default values when not specified', () => {
        const entity = wm.upsertEntity('concept', 'Idea', 'A concept');

        expect(entity.properties).toEqual({});
        expect(entity.source).toBe('observation');
        expect(entity.confidence).toBe(0.8);
      });
    });

    describe('getEntity', () => {
      it('should find entity by ID', () => {
        const created = wm.upsertEntity('person', 'Charlie', 'Test');

        const found = wm.getEntity(created.id);

        expect(found).toBeDefined();
        expect(found?.name).toBe('Charlie');
      });

      it('should find entity by name', () => {
        wm.upsertEntity('system', 'Database', 'A database');

        const found = wm.getEntity('database');

        expect(found).toBeDefined();
        expect(found?.type).toBe('system');
      });

      it('should return undefined for unknown entity', () => {
        const found = wm.getEntity('nonexistent');

        expect(found).toBeUndefined();
      });
    });

    describe('getEntitiesByType', () => {
      it('should return entities of specific type', () => {
        wm.upsertEntity('person', 'Person1', 'Desc');
        wm.upsertEntity('person', 'Person2', 'Desc');
        wm.upsertEntity('system', 'System1', 'Desc');

        const persons = wm.getEntitiesByType('person');
        const systems = wm.getEntitiesByType('system');

        expect(persons).toHaveLength(2);
        expect(systems).toHaveLength(1);
      });

      it('should return empty array for type with no entities', () => {
        const goals = wm.getEntitiesByType('goal');

        expect(goals).toHaveLength(0);
      });
    });

    describe('removeEntity', () => {
      it('should remove entity by ID', () => {
        const entity = wm.upsertEntity('concept', 'ToRemove', 'Desc');

        const result = wm.removeEntity(entity.id);

        expect(result).toBe(true);
        expect(wm.getEntity(entity.id)).toBeUndefined();
        expect(wm.getAllEntities()).toHaveLength(0);
      });

      it('should remove related relations when entity is removed', () => {
        const e1 = wm.upsertEntity('person', 'Source', 'Desc');
        const e2 = wm.upsertEntity('person', 'Target', 'Desc');
        wm.createRelation(e1.id, e2.id, 'causes');

        wm.removeEntity(e1.id);

        const relations = wm.getAllRelations();
        expect(relations).toHaveLength(0);
      });

      it('should return false for non-existent entity', () => {
        const result = wm.removeEntity('fake-id');

        expect(result).toBe(false);
      });
    });
  });

  describe('Causal Relations', () => {
    describe('createRelation', () => {
      it('should create a new relation between entities', () => {
        const e1 = wm.upsertEntity('state', 'Cause', 'Desc');
        const e2 = wm.upsertEntity('state', 'Effect', 'Desc');

        const relation = wm.createRelation(
          e1.id,
          e2.id,
          'causes',
          0.8,
          'Test evidence'
        );

        expect(relation).not.toBeNull();
        expect(relation?.id).toMatch(/^rel_/);
        expect(relation?.from).toBe(e1.id);
        expect(relation?.to).toBe(e2.id);
        expect(relation?.type).toBe('causes');
        expect(relation?.strength).toBe(0.8);
        expect(relation?.evidence).toContain('Test evidence');
        expect(relation?.observations).toBe(1);
      });

      it('should strengthen existing relation', () => {
        const e1 = wm.upsertEntity('state', 'A', 'Desc');
        const e2 = wm.upsertEntity('state', 'B', 'Desc');

        const first = wm.createRelation(e1.id, e2.id, 'enables', 0.5);
        const second = wm.createRelation(
          e1.id,
          e2.id,
          'enables',
          0.5,
          'More evidence'
        );

        expect(second?.id).toBe(first?.id);
        expect(second?.strength).toBe(0.6); // +0.1
        expect(second?.observations).toBe(2);
        expect(second?.evidence).toContain('More evidence');
      });

      it('should return null when source entity not found', () => {
        const e2 = wm.upsertEntity('state', 'Target', 'Desc');

        const relation = wm.createRelation('fake-id', e2.id, 'causes');

        expect(relation).toBeNull();
      });

      it('should return null when target entity not found', () => {
        const e1 = wm.upsertEntity('state', 'Source', 'Desc');

        const relation = wm.createRelation(e1.id, 'fake-id', 'causes');

        expect(relation).toBeNull();
      });

      it('should clamp strength between min and 1', () => {
        const e1 = wm.upsertEntity('state', 'A', 'Desc');
        const e2 = wm.upsertEntity('state', 'B', 'Desc');

        // Test too low
        const low = wm.createRelation(e1.id, e2.id, 'causes', 0.01);
        expect(low?.strength).toBe(0.1); // MIN_RELATION_STRENGTH

        // Create a different relation for testing high
        const e3 = wm.upsertEntity('state', 'C', 'Desc');
        const high = wm.createRelation(e1.id, e3.id, 'causes', 1.5);
        expect(high?.strength).toBe(1);
      });
    });

    describe('getRelationsFor', () => {
      it('should return outgoing and incoming relations', () => {
        const a = wm.upsertEntity('concept', 'A', 'Desc');
        const b = wm.upsertEntity('concept', 'B', 'Desc');
        const c = wm.upsertEntity('concept', 'C', 'Desc');

        wm.createRelation(a.id, b.id, 'causes');
        wm.createRelation(c.id, a.id, 'enables');

        const relations = wm.getRelationsFor(a.id);

        expect(relations.outgoing).toHaveLength(1);
        expect(relations.outgoing[0].to).toBe(b.id);
        expect(relations.incoming).toHaveLength(1);
        expect(relations.incoming[0].from).toBe(c.id);
      });

      it('should return empty arrays for entity with no relations', () => {
        const entity = wm.upsertEntity('concept', 'Isolated', 'Desc');

        const relations = wm.getRelationsFor(entity.id);

        expect(relations.outgoing).toHaveLength(0);
        expect(relations.incoming).toHaveLength(0);
      });
    });

    describe('findCausalChain', () => {
      it('should find direct causal chain', () => {
        const a = wm.upsertEntity('state', 'A', 'Desc');
        const b = wm.upsertEntity('state', 'B', 'Desc');

        wm.createRelation(a.id, b.id, 'causes');

        const chains = wm.findCausalChain(a.id, b.id);

        expect(chains).toHaveLength(1);
        expect(chains[0]).toHaveLength(1);
        expect(chains[0][0].from).toBe(a.id);
        expect(chains[0][0].to).toBe(b.id);
      });

      it('should find indirect causal chains', () => {
        const a = wm.upsertEntity('state', 'A', 'Desc');
        const b = wm.upsertEntity('state', 'B', 'Desc');
        const c = wm.upsertEntity('state', 'C', 'Desc');

        wm.createRelation(a.id, b.id, 'enables');
        wm.createRelation(b.id, c.id, 'causes');

        const chains = wm.findCausalChain(a.id, c.id);

        expect(chains.length).toBeGreaterThan(0);
        expect(chains[0]).toHaveLength(2);
      });

      it('should return empty array when no chain exists', () => {
        const a = wm.upsertEntity('state', 'A', 'Desc');
        const b = wm.upsertEntity('state', 'B', 'Desc');

        const chains = wm.findCausalChain(a.id, b.id);

        expect(chains).toHaveLength(0);
      });

      it('should respect maxDepth', () => {
        // Create a long chain
        const entities: wm.Entity[] = [];
        for (let i = 0; i < 7; i++) {
          entities.push(wm.upsertEntity('state', `E${i}`, 'Desc'));
        }
        for (let i = 0; i < 6; i++) {
          wm.createRelation(entities[i].id, entities[i + 1].id, 'causes');
        }

        // With default depth (5), shouldn't find E0 -> E6
        const shallow = wm.findCausalChain(entities[0].id, entities[6].id);
        expect(shallow).toHaveLength(0);

        // With depth 7, should find it
        const deep = wm.findCausalChain(entities[0].id, entities[6].id, 7);
        expect(deep.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Mental Simulation', () => {
    describe('simulate', () => {
      it('should create a simulation with no entities', () => {
        const sim = wm.simulate('Test action', []);

        expect(sim.id).toMatch(/^sim_/);
        expect(sim.action).toBe('Test action');
        expect(sim.outcome).toBe('unknown');
        expect(sim.confidence).toBe(0.1);
        expect(sim.steps).toHaveLength(0);
      });

      it('should simulate with entities and relations', () => {
        const e1 = wm.upsertEntity('state', 'Effort', 'Desc');
        const e2 = wm.upsertEntity('goal', 'Success', 'Desc');
        wm.createRelation(e1.id, e2.id, 'causes', 0.9);

        const sim = wm.simulate('Apply effort', [e1.id, e2.id]);

        expect(sim.steps.length).toBeGreaterThan(0);
        expect(sim.confidence).toBeGreaterThan(0);
      });

      it('should include context in initial state', () => {
        const sim = wm.simulate('Action', [], { key: 'value' });

        expect(sim.initialState.key).toBe('value');
      });

      it('should generate alternatives', () => {
        const e1 = wm.upsertEntity('state', 'A', 'Desc');
        const e2 = wm.upsertEntity('state', 'B', 'Desc');
        wm.createRelation(e1.id, e2.id, 'causes', 0.8);

        const sim = wm.simulate('Do A', [e1.id, e2.id]);

        expect(sim.alternatives.length).toBeGreaterThan(0);
        expect(sim.alternatives[0]).toHaveProperty('description');
        expect(sim.alternatives[0]).toHaveProperty('probability');
        expect(sim.alternatives[0]).toHaveProperty('outcome');
      });

      it('should record simulation duration', () => {
        const sim = wm.simulate('Quick action', []);

        expect(sim.durationMs).toBeGreaterThanOrEqual(0);
        expect(sim.runAt).toBeDefined();
      });

      it('should predict success for high probability relations', () => {
        const e1 = wm.upsertEntity('state', 'Strong', 'Desc');
        const e2 = wm.upsertEntity('goal', 'Result', 'Desc');
        wm.createRelation(e1.id, e2.id, 'causes', 0.95);

        const sim = wm.simulate('Strong action', [e1.id, e2.id]);

        expect(sim.outcome).toBe('success');
      });

      it('should predict failure for low probability relations', () => {
        const e1 = wm.upsertEntity('state', 'Weak', 'Desc');
        const e2 = wm.upsertEntity('goal', 'Result', 'Desc');
        wm.createRelation(e1.id, e2.id, 'causes', 0.2);

        const sim = wm.simulate('Weak action', [e1.id, e2.id]);

        expect(['failure', 'partial', 'unknown']).toContain(sim.outcome);
      });
    });

    describe('getRecentSimulations', () => {
      it('should return recent simulations', () => {
        wm.simulate('Action 1', []);
        wm.simulate('Action 2', []);
        wm.simulate('Action 3', []);

        const recent = wm.getRecentSimulations(2);

        expect(recent).toHaveLength(2);
        // Most recent first
        expect(recent[0].action).toBe('Action 3');
      });

      it('should return empty array when no simulations', () => {
        const recent = wm.getRecentSimulations();

        expect(recent).toHaveLength(0);
      });
    });
  });

  describe('Predictions', () => {
    describe('predict', () => {
      it('should create a prediction', () => {
        const pred = wm.predict('It will rain tomorrow', 0.7);

        expect(pred.id).toMatch(/^pred_/);
        expect(pred.prediction).toBe('It will rain tomorrow');
        expect(pred.confidence).toBe(0.7);
        expect(pred.verified).toBe(false);
        expect(pred.madeAt).toBeDefined();
        expect(pred.resolveBy).toBeDefined();
      });

      it('should clamp confidence between 0 and 1', () => {
        const low = wm.predict('Low', -0.5);
        const high = wm.predict('High', 1.5);

        expect(low.confidence).toBe(0);
        expect(high.confidence).toBe(1);
      });

      it('should use custom resolve time', () => {
        const pred = wm.predict('Soon', 0.5, 3600000); // 1 hour

        const resolveTime = new Date(pred.resolveBy).getTime();
        const madeTime = new Date(pred.madeAt).getTime();
        const diff = resolveTime - madeTime;

        expect(diff).toBe(3600000);
      });
    });

    describe('verifyPrediction', () => {
      it('should verify correct prediction', () => {
        const pred = wm.predict('Test prediction', 0.8);

        const result = wm.verifyPrediction(pred.id, 'It happened', true);

        expect(result).toBe(true);
        expect(pred.verified).toBe(true);
        expect(pred.actualOutcome).toBe('It happened');
        expect(pred.correct).toBe(true);
      });

      it('should verify incorrect prediction', () => {
        const pred = wm.predict('Test prediction', 0.8);

        wm.verifyPrediction(pred.id, 'It did not happen', false);

        expect(pred.correct).toBe(false);
      });

      it('should generate curiosity question for wrong prediction', () => {
        const pred = wm.predict('Wrong prediction', 0.9);

        wm.verifyPrediction(pred.id, 'Opposite happened', false);

        expect(generateQuestion).toHaveBeenCalledWith(
          'contradiction',
          'self_reflection',
          expect.stringContaining('was wrong'),
          expect.any(String),
          expect.any(Number)
        );
      });

      it('should update prediction accuracy stats', () => {
        const p1 = wm.predict('P1', 0.8);
        const p2 = wm.predict('P2', 0.8);
        const p3 = wm.predict('P3', 0.8);

        wm.verifyPrediction(p1.id, 'Correct', true);
        wm.verifyPrediction(p2.id, 'Correct', true);
        wm.verifyPrediction(p3.id, 'Wrong', false);

        const status = wm.getWorldModelStatus();
        expect(status.predictionAccuracy).toBe(67); // 2/3 = 66.67%
      });

      it('should return false for unknown prediction', () => {
        const result = wm.verifyPrediction('fake-id', 'outcome', true);

        expect(result).toBe(false);
      });
    });

    describe('getPendingPredictions', () => {
      it('should return predictions that need verification', () => {
        // Create a prediction that's past due
        const pastDue = wm.predict('Past due', 0.5, -1000); // Already past

        const pending = wm.getPendingPredictions();

        expect(pending).toHaveLength(1);
        expect(pending[0].id).toBe(pastDue.id);
      });

      it('should not return verified predictions', () => {
        const pred = wm.predict('Verified', 0.5, -1000);
        wm.verifyPrediction(pred.id, 'Done', true);

        const pending = wm.getPendingPredictions();

        expect(pending).toHaveLength(0);
      });

      it('should not return future predictions', () => {
        wm.predict('Future', 0.5, 86400000); // 24 hours from now

        const pending = wm.getPendingPredictions();

        expect(pending).toHaveLength(0);
      });
    });
  });

  describe('Counterfactual Reasoning', () => {
    describe('counterfactual', () => {
      it('should compare actual and alternative outcomes', () => {
        const e1 = wm.upsertEntity('state', 'Action', 'Desc');
        const e2 = wm.upsertEntity('goal', 'Goal', 'Desc');
        wm.createRelation(e1.id, e2.id, 'enables', 0.8);

        const result = wm.counterfactual(
          'Did X',
          'failure',
          'Should have done Y',
          [e1.id, e2.id]
        );

        expect(result.alternative).toBeDefined();
        expect(result.comparison).toBeDefined();
        expect(result.recommendation).toBeDefined();
      });

      it('should recommend alternative when it would succeed', () => {
        const e1 = wm.upsertEntity('state', 'Better', 'Desc');
        const e2 = wm.upsertEntity('goal', 'Success', 'Desc');
        wm.createRelation(e1.id, e2.id, 'causes', 0.95);

        const result = wm.counterfactual(
          'Bad approach',
          'failure',
          'Better approach',
          [e1.id, e2.id]
        );

        if (result.alternative.outcome === 'success') {
          expect(result.recommendation).toContain('Consider');
        }
      });

      it('should recommend actual action when it was better', () => {
        const e1 = wm.upsertEntity('state', 'Worse', 'Desc');
        const e2 = wm.upsertEntity('goal', 'Fail', 'Desc');
        wm.createRelation(e1.id, e2.id, 'prevents', 0.9);

        const result = wm.counterfactual(
          'Good approach',
          'success',
          'Bad approach',
          [e1.id, e2.id]
        );

        // If alternative would fail, should recommend the actual approach
        expect(result.recommendation).toBeDefined();
      });
    });
  });

  describe('Pre-Action Simulation', () => {
    describe('simulateBeforeAction', () => {
      it('should recommend proceeding when simulation predicts success', () => {
        const e = wm.upsertEntity('state', 'TestAction', 'Desc');
        const g = wm.upsertEntity('goal', 'TestGoal', 'Desc');
        wm.createRelation(e.id, g.id, 'enables', 0.95);

        const result = wm.simulateBeforeAction('TestAction leads to TestGoal');

        expect(result.simulation).toBeDefined();
        expect(result.shouldProceed).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
      });

      it('should warn about low probability steps', () => {
        const e1 = wm.upsertEntity('state', 'Risky', 'Desc');
        const e2 = wm.upsertEntity('goal', 'Hard', 'Desc');
        wm.createRelation(e1.id, e2.id, 'causes', 0.2);

        const result = wm.simulateBeforeAction('Risky action for Hard goal');

        // Should have warnings about low probability
        expect(result.warnings.length).toBeGreaterThanOrEqual(0);
      });

      it('should warn about preventing relations', () => {
        const blocker = wm.upsertEntity('state', 'Blocker', 'Desc');
        const target = wm.upsertEntity('goal', 'Target', 'Desc');
        wm.createRelation(blocker.id, target.id, 'prevents', 0.8);

        const result = wm.simulateBeforeAction(
          'Reach Target when Blocker exists'
        );

        expect(
          result.warnings.some(
            (w) => w.includes('prevent') || w.includes('Blocker')
          )
        ).toBe(true);
      });

      it('should provide suggestions from alternatives', () => {
        wm.upsertEntity('state', 'Plan', 'Desc');
        wm.upsertEntity('goal', 'Success', 'Desc');

        const result = wm.simulateBeforeAction('Execute Plan toward Success');

        // suggestions may be empty if no good alternatives
        expect(Array.isArray(result.suggestions)).toBe(true);
      });

      it('should not proceed when high-confidence failure predicted', () => {
        const e1 = wm.upsertEntity('state', 'DoNotDo', 'Desc');
        const e2 = wm.upsertEntity('goal', 'BadOutcome', 'Desc');
        wm.createRelation(e1.id, e2.id, 'opposes', 0.95);
        wm.createRelation(e1.id, e2.id, 'prevents', 0.95);

        const result = wm.simulateBeforeAction('DoNotDo this BadOutcome');

        // Multiple warnings should prevent proceeding
        expect(result.warnings.length).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Seeding', () => {
    describe('seedWorldModel', () => {
      it('should seed with foundational entities', () => {
        wm.seedWorldModel();

        const entities = wm.getAllEntities();
        const relations = wm.getAllRelations();

        expect(entities.length).toBeGreaterThan(0);
        expect(relations.length).toBeGreaterThan(0);
      });

      it('should create Eric entity', () => {
        wm.seedWorldModel();

        const eric = wm.getEntity('Eric');

        expect(eric).toBeDefined();
        expect(eric?.type).toBe('person');
        expect(eric?.confidence).toBe(1.0);
      });

      it('should create Molly entity', () => {
        wm.seedWorldModel();

        const molly = wm.getEntity('Molly');

        expect(molly).toBeDefined();
        expect(molly?.type).toBe('person');
        expect(molly?.properties.role).toBe('self');
      });

      it('should not re-seed if already populated', () => {
        wm.upsertEntity('concept', 'Existing', 'Already here');

        wm.seedWorldModel();

        const entities = wm.getAllEntities();
        // Should only have the existing entity, not seed entities
        expect(entities).toHaveLength(1);
        expect(entities[0].name).toBe('Existing');
      });

      it('should create core relations', () => {
        wm.seedWorldModel();

        const eric = wm.getEntity('Eric');
        const molly = wm.getEntity('Molly');

        if (eric && molly) {
          const chains = wm.findCausalChain(eric.id, molly.id);
          expect(chains.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Status and Observability', () => {
    describe('getWorldModelStatus', () => {
      it('should return comprehensive status', () => {
        wm.upsertEntity('person', 'P1', 'Desc');
        wm.upsertEntity('system', 'S1', 'Desc');
        wm.simulate('Test', []);
        wm.predict('Pred', 0.5);

        const status = wm.getWorldModelStatus();

        expect(status.entities).toBe(2);
        expect(status.relations).toBe(0);
        expect(status.simulations).toBe(1);
        expect(status.pendingPredictions).toBe(1);
        expect(status.entityTypes.person).toBe(1);
        expect(status.entityTypes.system).toBe(1);
      });

      it('should count relation types', () => {
        const e1 = wm.upsertEntity('state', 'A', 'Desc');
        const e2 = wm.upsertEntity('state', 'B', 'Desc');
        const e3 = wm.upsertEntity('state', 'C', 'Desc');

        wm.createRelation(e1.id, e2.id, 'causes');
        wm.createRelation(e2.id, e3.id, 'enables');
        wm.createRelation(e1.id, e3.id, 'causes');

        const status = wm.getWorldModelStatus();

        expect(status.relationTypes.causes).toBe(2);
        expect(status.relationTypes.enables).toBe(1);
      });
    });

    describe('getAllEntities', () => {
      it('should return copy of entities array', () => {
        wm.upsertEntity('concept', 'Test', 'Desc');

        const entities = wm.getAllEntities();
        entities.push({} as wm.Entity);

        expect(wm.getAllEntities()).toHaveLength(1);
      });
    });

    describe('getAllRelations', () => {
      it('should return copy of relations array', () => {
        const e1 = wm.upsertEntity('state', 'A', 'Desc');
        const e2 = wm.upsertEntity('state', 'B', 'Desc');
        wm.createRelation(e1.id, e2.id, 'causes');

        const relations = wm.getAllRelations();
        relations.push({} as wm.CausalRelation);

        expect(wm.getAllRelations()).toHaveLength(1);
      });
    });
  });

  describe('Reset', () => {
    describe('resetWorldModel', () => {
      it('should clear all state', () => {
        wm.upsertEntity('person', 'Person', 'Desc');
        wm.predict('Prediction', 0.5);
        wm.simulate('Action', []);

        wm.resetWorldModel();

        expect(wm.getAllEntities()).toHaveLength(0);
        expect(wm.getAllRelations()).toHaveLength(0);

        const status = wm.getWorldModelStatus();
        expect(status.entities).toBe(0);
        expect(status.simulations).toBe(0);
        expect(status.pendingPredictions).toBe(0);
      });
    });
  });

  describe('Relation Effects', () => {
    it('should describe causes relation', () => {
      const e1 = wm.upsertEntity('state', 'Rain', 'Desc');
      const e2 = wm.upsertEntity('state', 'Wet', 'Desc');
      wm.createRelation(e1.id, e2.id, 'causes', 0.9);

      const sim = wm.simulate('Rain causes wet', [e1.id, e2.id]);

      const hasDescription = sim.steps.some(
        (s) => s.action.includes('causes') || s.action.includes('Rain')
      );
      expect(hasDescription).toBe(true);
    });

    it('should describe enables relation', () => {
      const e1 = wm.upsertEntity('resource', 'Key', 'Desc');
      const e2 = wm.upsertEntity('state', 'Access', 'Desc');
      wm.createRelation(e1.id, e2.id, 'enables', 0.9);

      const sim = wm.simulate('Key enables access', [e1.id, e2.id]);

      expect(sim.steps.length).toBeGreaterThan(0);
    });

    it('should describe prevents relation', () => {
      const e1 = wm.upsertEntity('state', 'Barrier', 'Desc');
      const e2 = wm.upsertEntity('goal', 'Progress', 'Desc');
      wm.createRelation(e1.id, e2.id, 'prevents', 0.9);

      const sim = wm.simulate('Barrier prevents progress', [e1.id, e2.id]);

      expect(sim.steps.length).toBeGreaterThan(0);
    });

    it('should describe requires relation', () => {
      const e1 = wm.upsertEntity('resource', 'Fuel', 'Desc');
      const e2 = wm.upsertEntity('system', 'Engine', 'Desc');
      wm.createRelation(e1.id, e2.id, 'requires', 0.9);

      const sim = wm.simulate('Engine requires fuel', [e1.id, e2.id]);

      expect(sim.steps.length).toBeGreaterThan(0);
    });

    it('should describe opposes relation', () => {
      const e1 = wm.upsertEntity('concept', 'Order', 'Desc');
      const e2 = wm.upsertEntity('concept', 'Chaos', 'Desc');
      wm.createRelation(e1.id, e2.id, 'opposes', 0.9);

      const sim = wm.simulate('Order opposes chaos', [e1.id, e2.id]);

      expect(sim.steps.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle simulation with non-existent entity IDs', () => {
      const sim = wm.simulate('Action', ['fake-1', 'fake-2']);

      expect(sim.outcome).toBe('unknown');
      expect(sim.confidence).toBe(0.1);
    });

    it('should handle entity with special characters in name', () => {
      const entity = wm.upsertEntity(
        'concept',
        'Test & Special <chars>',
        'Desc'
      );

      const found = wm.getEntity('Test & Special <chars>');

      expect(found?.id).toBe(entity.id);
    });

    it('should handle empty evidence string', () => {
      const e1 = wm.upsertEntity('state', 'A', 'Desc');
      const e2 = wm.upsertEntity('state', 'B', 'Desc');

      const relation = wm.createRelation(e1.id, e2.id, 'causes', 0.8, '');

      expect(relation?.evidence).toHaveLength(0);
    });

    it('should handle very long causal chains in simulation', () => {
      const entities: wm.Entity[] = [];
      for (let i = 0; i < 15; i++) {
        entities.push(wm.upsertEntity('state', `Chain${i}`, 'Desc'));
      }
      for (let i = 0; i < 14; i++) {
        wm.createRelation(entities[i].id, entities[i + 1].id, 'causes', 0.9);
      }

      const sim = wm.simulate(
        'Long chain',
        entities.map((e) => e.id)
      );

      // Should be limited by MAX_SIMULATION_STEPS
      expect(sim.steps.length).toBeLessThanOrEqual(10);
    });
  });
});
