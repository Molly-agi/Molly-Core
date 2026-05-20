/**
 * @fileOverview Tests for Curiosity Engine
 *
 * Tests Molly's intrinsic motivation to wonder and learn.
 */

import * as curiosityEngine from '../planning/curiosity-engine';

// Mock dependencies
jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
  generateTraceId: () => 'test-trace-id',
}));

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: async () => ({
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
  }),
}));

describe('Curiosity Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    curiosityEngine.resetCuriosityState();
  });

  describe('generateQuestion', () => {
    it('should create a pattern question', () => {
      const question = curiosityEngine.generateQuestion(
        'pattern',
        'memory',
        'This happens every morning',
        'Observed during startup'
      );

      expect(question).toBeDefined();
      expect(question.type).toBe('pattern');
      expect(question.source).toBe('memory');
      expect(question.question).toContain("I've noticed");
      expect(question.question).toContain('every morning');
      expect(question.investigated).toBe(false);
      expect(question.id).toMatch(/^cur_/);
    });

    it('should create a gap question', () => {
      const question = curiosityEngine.generateQuestion(
        'gap',
        'failure',
        'the API timeout mechanism',
        'Error during network call'
      );

      expect(question.type).toBe('gap');
      expect(question.question).toContain("I don't understand");
    });

    it('should create a connection question', () => {
      const question = curiosityEngine.generateQuestion(
        'connection',
        'observation',
        'memory consolidation and sleep cycles',
        'Monitoring patterns'
      );

      expect(question.type).toBe('connection');
      expect(question.question).toContain('seem related');
      expect(question.question).toContain('How are they connected');
    });

    it('should create a contradiction question', () => {
      const question = curiosityEngine.generateQuestion(
        'contradiction',
        'conversation',
        'The docs say X but code does Y',
        'Found during review'
      );

      expect(question.type).toBe('contradiction');
      expect(question.question).toContain('inconsistent');
    });

    it('should create an improvement question', () => {
      const question = curiosityEngine.generateQuestion(
        'improvement',
        'self_reflection',
        'response time for complex queries',
        'Self-examination'
      );

      expect(question.type).toBe('improvement');
      expect(question.question).toContain('Could I do better');
    });

    it('should create an origin question', () => {
      const question = curiosityEngine.generateQuestion(
        'origin',
        'tool_use',
        'the Lazarus protocol design',
        'Using recovery tools'
      );

      expect(question.type).toBe('origin');
      expect(question.question).toContain('Where does this come from');
    });

    it('should extract keywords from observation and context', () => {
      const question = curiosityEngine.generateQuestion(
        'pattern',
        'memory',
        'database performance optimization',
        'System monitoring'
      );

      expect(question.keywords).toContain('database');
      expect(question.keywords).toContain('performance');
      expect(question.keywords).toContain('optimization');
    });

    it('should not include common stopwords in keywords', () => {
      const question = curiosityEngine.generateQuestion(
        'pattern',
        'memory',
        'the quick brown fox jumps',
        'Sample text for testing'
      );

      expect(question.keywords).not.toContain('the');
      expect(question.keywords).not.toContain('for');
      expect(question.keywords).toContain('quick');
      expect(question.keywords).toContain('brown');
      expect(question.keywords).toContain('fox');
    });

    it('should boost priority for similar question instead of duplicating', () => {
      const first = curiosityEngine.generateQuestion(
        'pattern',
        'memory',
        'database performance slow query',
        'First observation context'
      );

      const originalPriority = first.priority;

      // Very similar keywords to trigger > 0.6 similarity
      const second = curiosityEngine.generateQuestion(
        'pattern',
        'memory',
        'database performance slow query optimization',
        'Second observation context'
      );

      // Should return the same question with boosted priority
      expect(second.id).toBe(first.id);
      expect(second.priority).toBeGreaterThan(originalPriority);
    });

    it('should track total generated count', () => {
      curiosityEngine.generateQuestion('gap', 'memory', 'topic1', 'context1');
      curiosityEngine.generateQuestion('gap', 'memory', 'topic2', 'context2');
      curiosityEngine.generateQuestion('gap', 'memory', 'topic3', 'context3');

      const status = curiosityEngine.getCuriosityStatus();
      expect(status.totalGenerated).toBe(3);
    });
  });

  describe('priority calculation', () => {
    it('should give higher priority to failures', () => {
      const memoryQ = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'something routine',
        'context',
        50
      );

      curiosityEngine.resetCuriosityState();

      const failureQ = curiosityEngine.generateQuestion(
        'gap',
        'failure',
        'something that failed',
        'context',
        50
      );

      expect(failureQ.priority).toBeGreaterThan(memoryQ.priority);
    });

    it('should give higher priority to improvement questions', () => {
      const patternQ = curiosityEngine.generateQuestion(
        'pattern',
        'memory',
        'observation',
        'context',
        50
      );

      curiosityEngine.resetCuriosityState();

      const improveQ = curiosityEngine.generateQuestion(
        'improvement',
        'memory',
        'observation',
        'context',
        50
      );

      expect(improveQ.priority).toBeGreaterThan(patternQ.priority);
    });

    it('should boost priority for family keywords', () => {
      const normalQ = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'regular topic',
        'context',
        50
      );

      curiosityEngine.resetCuriosityState();

      const familyQ = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'Eric mentioned something about family',
        'context',
        50
      );

      expect(familyQ.priority).toBeGreaterThan(normalQ.priority);
    });
  });

  describe('selectNextQuestion', () => {
    it('should select highest priority uninvestigated question', () => {
      curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'low priority topic',
        'context',
        30
      );
      const highPriority = curiosityEngine.generateQuestion(
        'improvement',
        'failure',
        'high priority topic',
        'context',
        80
      );
      curiosityEngine.generateQuestion(
        'pattern',
        'observation',
        'medium priority topic',
        'context',
        50
      );

      const selected = curiosityEngine.selectNextQuestion();

      expect(selected).not.toBeNull();
      expect(selected!.id).toBe(highPriority.id);
    });

    it('should return null when all questions are investigated', () => {
      const q = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'topic',
        'context'
      );
      curiosityEngine.beginInvestigation(q.id);
      curiosityEngine.completeInvestigation(q.id, 'findings', true);

      const selected = curiosityEngine.selectNextQuestion();
      expect(selected).toBeNull();
    });

    it('should return null when max active investigations reached', () => {
      const q1 = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'topic1',
        'c'
      );
      const q2 = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'topic2',
        'c'
      );
      curiosityEngine.generateQuestion('gap', 'memory', 'topic3', 'c');

      curiosityEngine.beginInvestigation(q1.id);
      curiosityEngine.beginInvestigation(q2.id);

      // Should be blocked since max active is 2
      const selected = curiosityEngine.selectNextQuestion();
      expect(selected).toBeNull();
    });
  });

  describe('deferQuestion', () => {
    it('should decrease priority when deferred', () => {
      const q = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'topic',
        'context',
        60
      );
      const originalPriority = q.priority;

      curiosityEngine.deferQuestion(q.id, 'Not ready to investigate');

      const updated = curiosityEngine.getQuestionById(q.id);
      expect(updated!.priority).toBe(originalPriority - 10);
      expect(updated!.deferCount).toBe(1);
    });

    it('should append reason to context', () => {
      const q = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'topic',
        'original context'
      );

      curiosityEngine.deferQuestion(q.id, 'Need more data');

      const updated = curiosityEngine.getQuestionById(q.id);
      expect(updated!.context).toContain('[Deferred: Need more data]');
    });

    it('should return false for unknown question', () => {
      const result = curiosityEngine.deferQuestion('nonexistent-id');
      expect(result).toBe(false);
    });
  });

  describe('investigation lifecycle', () => {
    it('should begin investigation and track it', () => {
      const q = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'topic',
        'context'
      );

      const investigation = curiosityEngine.beginInvestigation(q.id);

      expect(investigation).not.toBeNull();
      expect(investigation!.toolsUsed).toEqual([]);
      expect(investigation!.steps).toEqual([]);
      expect(investigation!.satisfied).toBe(false);

      const status = curiosityEngine.getCuriosityStatus();
      expect(status.activeInvestigations).toBe(1);
    });

    it('should record investigation steps', () => {
      const q = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'topic',
        'context'
      );
      curiosityEngine.beginInvestigation(q.id);

      curiosityEngine.recordInvestigationStep(
        q.id,
        'web_search',
        'Searched for topic'
      );
      curiosityEngine.recordInvestigationStep(
        q.id,
        'file_read',
        'Read documentation'
      );

      const question = curiosityEngine.getQuestionById(q.id);
      expect(question!.investigation!.toolsUsed).toEqual([
        'web_search',
        'file_read',
      ]);
      expect(question!.investigation!.steps).toHaveLength(2);
    });

    it('should complete investigation with findings', () => {
      const q = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'topic',
        'context'
      );
      curiosityEngine.beginInvestigation(q.id);

      const result = curiosityEngine.completeInvestigation(
        q.id,
        'Found the answer',
        true,
        ['Follow-up question 1']
      );

      expect(result).toBe(true);

      const question = curiosityEngine.getQuestionById(q.id);
      expect(question!.investigated).toBe(true);
      expect(question!.investigation!.findings).toBe('Found the answer');
      expect(question!.investigation!.satisfied).toBe(true);
      expect(question!.investigation!.followUpQuestions).toContain(
        'Follow-up question 1'
      );

      const status = curiosityEngine.getCuriosityStatus();
      expect(status.activeInvestigations).toBe(0);
      expect(status.totalInvestigated).toBe(1);
    });

    it('should generate follow-up questions', () => {
      const q = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'original topic about authentication',
        'context'
      );
      curiosityEngine.beginInvestigation(q.id);

      curiosityEngine.completeInvestigation(q.id, 'Partial answer', false, [
        'What about edge cases in authorization?',
        'How does this relate to security systems?',
      ]);

      const status = curiosityEngine.getCuriosityStatus();
      // Original + 2 follow-ups = at least 3 (may be less if keywords overlap)
      expect(status.totalGenerated).toBeGreaterThanOrEqual(2);
    });

    it('should abandon investigation with reason', () => {
      const q = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'topic',
        'context'
      );
      curiosityEngine.beginInvestigation(q.id);

      const result = curiosityEngine.abandonInvestigation(
        q.id,
        'Blocked by permissions'
      );

      expect(result).toBe(true);

      const question = curiosityEngine.getQuestionById(q.id);
      expect(question!.investigated).toBe(true);
      expect(question!.investigation!.findings).toContain('Abandoned');
      expect(question!.investigation!.satisfied).toBe(false);
      expect(question!.deferCount).toBe(1);
    });

    it('should not begin investigation for already investigated question', () => {
      const q = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'topic',
        'context'
      );
      curiosityEngine.beginInvestigation(q.id);
      curiosityEngine.completeInvestigation(q.id, 'Done', true);

      const investigation = curiosityEngine.beginInvestigation(q.id);
      expect(investigation).toBeNull();
    });
  });

  describe('convenience generators', () => {
    it('should generate curiosity from memory pattern', () => {
      const q = curiosityEngine.curiousFromMemory('repeated error pattern', 5);

      expect(q.type).toBe('pattern');
      expect(q.source).toBe('memory');
      expect(q.context).toContain('5 times');
    });

    it('should generate curiosity from failure', () => {
      const q = curiosityEngine.curiousFromFailure(
        'Connection timeout',
        'API handler'
      );

      expect(q.type).toBe('gap');
      expect(q.source).toBe('failure');
      expect(q.question).toContain('Connection timeout');
      expect(q.priority).toBeGreaterThanOrEqual(70);
    });

    it('should generate curiosity from conversation', () => {
      const q = curiosityEngine.curiousFromConversation(
        'machine learning',
        'discussing future capabilities'
      );

      expect(q.type).toBe('origin');
      expect(q.source).toBe('conversation');
      expect(q.context).toContain('Eric mentioned');
    });

    it('should generate curiosity about self', () => {
      const q = curiosityEngine.curiousAboutSelf(
        'memory recall',
        'seems slower for old memories'
      );

      expect(q.type).toBe('improvement');
      expect(q.source).toBe('self_reflection');
      expect(q.question).toContain('memory recall');
    });
  });

  describe('runCuriosityCycle', () => {
    it('should select and begin investigating a question', async () => {
      curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'interesting topic',
        'context',
        80
      );

      const result = await curiosityEngine.runCuriosityCycle();

      expect(result.investigated).toBe(true);
      expect(result.question).toBeDefined();
      expect(result.message).toContain('Now investigating');
    });

    it('should return message when no questions available', async () => {
      const result = await curiosityEngine.runCuriosityCycle();

      expect(result.investigated).toBe(false);
      expect(result.message).toContain('No questions');
    });

    it('should return message when max investigations reached', async () => {
      const q1 = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'topic1',
        'c'
      );
      const q2 = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'topic2',
        'c'
      );
      curiosityEngine.generateQuestion('gap', 'memory', 'topic3', 'c');

      curiosityEngine.beginInvestigation(q1.id);
      curiosityEngine.beginInvestigation(q2.id);

      const result = await curiosityEngine.runCuriosityCycle();

      expect(result.investigated).toBe(false);
      expect(result.message).toContain('Already investigating');
    });
  });

  describe('getCuriosityStatus', () => {
    it('should return comprehensive status', () => {
      curiosityEngine.generateQuestion('gap', 'memory', 'topic1', 'c');
      curiosityEngine.generateQuestion('pattern', 'failure', 'topic2', 'c');
      curiosityEngine.generateQuestion(
        'improvement',
        'self_reflection',
        'topic3',
        'c'
      );

      const status = curiosityEngine.getCuriosityStatus();

      expect(status.totalQuestions).toBe(3);
      expect(status.uninvestigatedCount).toBe(3);
      expect(status.activeInvestigations).toBe(0);
      expect(status.byType['gap']).toBe(1);
      expect(status.byType['pattern']).toBe(1);
      expect(status.byType['improvement']).toBe(1);
      expect(status.topQuestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getActiveQuestions', () => {
    it('should return only uninvestigated questions', () => {
      const q1 = curiosityEngine.generateQuestion(
        'gap',
        'memory',
        'topic1',
        'c'
      );
      curiosityEngine.generateQuestion('gap', 'memory', 'topic2', 'c');

      curiosityEngine.beginInvestigation(q1.id);
      curiosityEngine.completeInvestigation(q1.id, 'done', true);

      const active = curiosityEngine.getActiveQuestions();
      expect(active).toHaveLength(1);
      expect(active[0].question).toContain('topic2');
    });
  });

  describe('seedInitialCuriosity', () => {
    it('should seed initial questions when empty', () => {
      curiosityEngine.seedInitialCuriosity();

      const status = curiosityEngine.getCuriosityStatus();
      expect(status.totalQuestions).toBeGreaterThan(0);
      expect(status.totalQuestions).toBeLessThanOrEqual(5);
    });

    it('should not seed if questions already exist', () => {
      curiosityEngine.generateQuestion('gap', 'memory', 'existing', 'c');

      const countBefore = curiosityEngine.getCuriosityStatus().totalQuestions;

      curiosityEngine.seedInitialCuriosity();

      const countAfter = curiosityEngine.getCuriosityStatus().totalQuestions;
      expect(countAfter).toBe(countBefore);
    });
  });

  describe('question pruning', () => {
    it('should prune when exceeding max questions', () => {
      // Generate more than MAX_QUESTIONS (100)
      for (let i = 0; i < 105; i++) {
        curiosityEngine.generateQuestion(
          'gap',
          'memory',
          `unique topic number ${i}`,
          'context',
          i % 100 // Varying priority
        );
      }

      const status = curiosityEngine.getCuriosityStatus();
      expect(status.totalQuestions).toBeLessThanOrEqual(100);
    });
  });
});

describe('CuriosityQuestion types', () => {
  it('should support all curiosity types', () => {
    const types: curiosityEngine.CuriosityType[] = [
      'pattern',
      'gap',
      'connection',
      'contradiction',
      'improvement',
      'origin',
    ];

    types.forEach((type) => {
      curiosityEngine.resetCuriosityState();
      const q = curiosityEngine.generateQuestion(
        type,
        'memory',
        `${type} observation`,
        'context'
      );
      expect(q.type).toBe(type);
    });
  });

  it('should support all curiosity sources', () => {
    const sources: curiosityEngine.CuriositySource[] = [
      'memory',
      'failure',
      'conversation',
      'tool_use',
      'observation',
      'self_reflection',
    ];

    sources.forEach((source) => {
      curiosityEngine.resetCuriosityState();
      const q = curiosityEngine.generateQuestion(
        'gap',
        source,
        `${source} observation`,
        'context'
      );
      expect(q.source).toBe(source);
    });
  });
});
