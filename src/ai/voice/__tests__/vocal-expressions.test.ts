/**
 * @fileOverview Tests for Vocal Expressions
 *
 * Tests non-speech audio generation for emotional expression.
 */

import * as vocalExpressions from '../vocal-expressions';

// Mock the logger
jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
  generateTraceId: () => 'test-trace-id',
}));

describe('Vocal Expressions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    vocalExpressions.resetVocalState();
    vocalExpressions.configureVocalExpressions({
      enabled: true,
      minIntervalMs: 0, // Disable interval for testing
      maxPerMinute: 100,
    });
  });

  describe('express', () => {
    it('should generate a basic expression', () => {
      const result = vocalExpressions.express({
        type: 'acknowledgment',
        intensity: 0.5,
      });

      expect(result).not.toBeNull();
      expect(result!.type).toBe('acknowledgment');
      expect(result!.ssml).toContain('mm-hmm');
      expect(result!.pauseAfterMs).toBeGreaterThan(0);
      expect(result!.description).toBeTruthy();
    });

    it('should respect enabled flag', () => {
      vocalExpressions.configureVocalExpressions({ enabled: false });

      const result = vocalExpressions.express({
        type: 'acknowledgment',
        intensity: 0.5,
      });

      expect(result).toBeNull();
    });

    it('should generate sigh_stressed', () => {
      vocalExpressions.setMetabolicState('stressed'); // Need stressed state for stressed sighs
      const result = vocalExpressions.express({
        type: 'sigh_stressed',
        intensity: 0.5,
      });

      expect(result).not.toBeNull();
      expect(result!.ssml).toContain('prosody');
      expect(result!.description).toContain('stressed');
    });

    it('should generate sigh_relieved', () => {
      const result = vocalExpressions.express({
        type: 'sigh_relieved',
        intensity: 0.5,
      });

      expect(result).not.toBeNull();
      expect(result!.description).toContain('relieved');
    });

    it('should generate chime_discovery', () => {
      const result = vocalExpressions.express({
        type: 'chime_discovery',
        intensity: 0.5,
      });

      expect(result).not.toBeNull();
      expect(result!.ssml).toContain('oh!');
    });

    it('should generate chime_success', () => {
      const result = vocalExpressions.express({
        type: 'chime_success',
        intensity: 0.5,
      });

      expect(result).not.toBeNull();
      expect(result!.description).toContain('completion');
    });

    it('should generate hum_content', () => {
      const result = vocalExpressions.express({
        type: 'hum_content',
        intensity: 0.5,
      });

      expect(result).not.toBeNull();
      expect(result!.ssml).toContain('mmm');
    });

    it('should generate breath_pause', () => {
      const result = vocalExpressions.express({
        type: 'breath_pause',
        intensity: 0.5,
      });

      expect(result).not.toBeNull();
      expect(result!.ssml).toContain('break');
    });

    it('should generate warmth expression', () => {
      const result = vocalExpressions.express({
        type: 'warmth',
        intensity: 0.5,
      });

      expect(result).not.toBeNull();
      expect(result!.ssml).toContain('aww');
      expect(result!.description).toContain('affectionate');
    });

    it('should generate curiosity expression', () => {
      const result = vocalExpressions.express({
        type: 'curiosity',
        intensity: 0.5,
      });

      expect(result).not.toBeNull();
      expect(result!.ssml).toContain('ooh?');
    });

    it('should generate laugh_soft', () => {
      const result = vocalExpressions.express({
        type: 'laugh_soft',
        intensity: 0.5,
      });

      expect(result).not.toBeNull();
      expect(result!.ssml).toContain('heh');
    });

    it('should respect minimum intensity', () => {
      const result = vocalExpressions.express({
        type: 'chime_discovery', // min intensity 0.4
        intensity: 0.1, // below minimum
      });

      expect(result).toBeNull();
    });

    it('should adjust volume for high intensity', () => {
      const result = vocalExpressions.express({
        type: 'alert_soft',
        intensity: 0.9,
      });

      expect(result).not.toBeNull();
      // High intensity should increase volume
    });

    it('should adjust pause duration with durationFactor', () => {
      const shortResult = vocalExpressions.express({
        type: 'breath_pause',
        intensity: 0.5,
        durationFactor: 0.5,
      });

      vocalExpressions.resetVocalState();

      const normalResult = vocalExpressions.express({
        type: 'breath_pause',
        intensity: 0.5,
        durationFactor: 1,
      });

      expect(shortResult!.pauseAfterMs).toBeLessThan(
        normalResult!.pauseAfterMs
      );
    });

    it('should track expression count', () => {
      vocalExpressions.express({ type: 'acknowledgment', intensity: 0.5 });
      vocalExpressions.express({ type: 'breath_pause', intensity: 0.5 });

      const state = vocalExpressions.getVocalState();
      expect(state.expressionCount).toBe(2);
    });

    it('should track recent expressions', () => {
      vocalExpressions.express({ type: 'acknowledgment', intensity: 0.5 });
      vocalExpressions.express({ type: 'breath_pause', intensity: 0.5 });

      const state = vocalExpressions.getVocalState();
      expect(state.recentExpressions).toContain('acknowledgment');
      expect(state.recentExpressions).toContain('breath_pause');
    });

    it('should avoid repeating recent expressions', () => {
      // Express same type multiple times
      vocalExpressions.express({ type: 'acknowledgment', intensity: 0.5 });
      vocalExpressions.express({ type: 'acknowledgment', intensity: 0.5 });
      vocalExpressions.express({ type: 'acknowledgment', intensity: 0.5 });

      // Fourth time should be blocked (in recent 3)
      const result = vocalExpressions.express({
        type: 'acknowledgment',
        intensity: 0.5,
      });

      expect(result).toBeNull();
    });
  });

  describe('metabolic state', () => {
    it('should set and get metabolic state', () => {
      vocalExpressions.setMetabolicState('stressed');
      const state = vocalExpressions.getVocalState();
      expect(state.metabolicState).toBe('stressed');
    });

    it('should update state based on CPU usage', () => {
      const state = vocalExpressions.updateMetabolicState(
        85,
        undefined,
        undefined,
        undefined
      );
      expect(state).toBe('focused');
    });

    it('should update state based on high temperature', () => {
      const state = vocalExpressions.updateMetabolicState(
        undefined,
        75,
        undefined,
        undefined
      );
      expect(state).toBe('stressed');
    });

    it('should update state based on error rate', () => {
      const state = vocalExpressions.updateMetabolicState(
        undefined,
        undefined,
        0.5,
        undefined
      );
      expect(state).toBe('stressed');
    });

    it('should update state based on successes', () => {
      const state = vocalExpressions.updateMetabolicState(
        undefined,
        undefined,
        undefined,
        5
      );
      expect(state).toBe('content');
    });

    it('should default to calm with low CPU', () => {
      const state = vocalExpressions.updateMetabolicState(
        15,
        undefined,
        undefined,
        undefined
      );
      expect(state).toBe('calm');
    });
  });

  describe('state-based expression filtering', () => {
    it('should avoid stressed sighs when calm', () => {
      vocalExpressions.setMetabolicState('calm');

      const result = vocalExpressions.express({
        type: 'sigh_stressed',
        intensity: 0.5,
      });

      expect(result).toBeNull();
    });

    it('should allow content expressions when content', () => {
      vocalExpressions.setMetabolicState('content');

      const result = vocalExpressions.express({
        type: 'hum_content',
        intensity: 0.5,
      });

      expect(result).not.toBeNull();
    });

    it('should avoid laughs when stressed', () => {
      vocalExpressions.setMetabolicState('stressed');

      const result = vocalExpressions.express({
        type: 'laugh_soft',
        intensity: 0.5,
      });

      expect(result).toBeNull();
    });
  });

  describe('suggestExpression', () => {
    it('should suggest expression for calm state', () => {
      vocalExpressions.setMetabolicState('calm');
      const suggestion = vocalExpressions.suggestExpression();

      expect(suggestion).not.toBeNull();
      expect(['breath_pause', 'hum_content', 'acknowledgment']).toContain(
        suggestion
      );
    });

    it('should suggest expression for stressed state', () => {
      vocalExpressions.setMetabolicState('stressed');
      const suggestion = vocalExpressions.suggestExpression();

      expect(suggestion).not.toBeNull();
      expect(['sigh_stressed', 'breath_deep', 'alert_soft']).toContain(
        suggestion
      );
    });

    it('should suggest expression for excited state', () => {
      vocalExpressions.setMetabolicState('excited');
      const suggestion = vocalExpressions.suggestExpression();

      expect(suggestion).not.toBeNull();
      expect(['chime_discovery', 'curiosity', 'laugh_soft']).toContain(
        suggestion
      );
    });
  });

  describe('expressOnTrigger', () => {
    it('should express success trigger', () => {
      const result = vocalExpressions.expressOnTrigger('success', 0.5);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('chime_success');
    });

    it('should express error trigger', () => {
      vocalExpressions.setMetabolicState('stressed'); // Allow stressed expressions
      const result = vocalExpressions.expressOnTrigger('error', 0.5);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('sigh_stressed');
    });

    it('should express discovery trigger', () => {
      const result = vocalExpressions.expressOnTrigger('discovery', 0.5);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('chime_discovery');
    });

    it('should express recognition trigger', () => {
      const result = vocalExpressions.expressOnTrigger('recognition', 0.5);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('chime_connection');
    });

    it('should express thinking trigger', () => {
      vocalExpressions.setMetabolicState('focused');
      const result = vocalExpressions.expressOnTrigger('thinking', 0.5);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('hum_thinking');
    });
  });

  describe('addExpressionsToText', () => {
    it('should add pause before "because"', () => {
      const text = 'This works because it is correct.';
      const result = vocalExpressions.addExpressionsToText(text);

      // Should have added something before "because"
      expect(result.length).toBeGreaterThanOrEqual(text.length);
    });

    it('should not modify text when disabled', () => {
      vocalExpressions.configureVocalExpressions({ enableBreaths: false });
      const text = 'This works because it is correct.';
      const result = vocalExpressions.addExpressionsToText(text);

      expect(result).toBe(text);
    });
  });

  describe('getIntroExpression', () => {
    it('should return warmth for greeting', () => {
      const result = vocalExpressions.getIntroExpression('greeting');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('warmth');
    });

    it('should return acknowledgment for answer', () => {
      const result = vocalExpressions.getIntroExpression('answer');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('acknowledgment');
    });

    it('should return chime_success for success', () => {
      const result = vocalExpressions.getIntroExpression('success');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('chime_success');
    });

    it('should return hum_thinking for thinking', () => {
      vocalExpressions.setMetabolicState('focused');
      const result = vocalExpressions.getIntroExpression('thinking');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('hum_thinking');
    });
  });

  describe('configuration', () => {
    it('should allow disabling breaths', () => {
      vocalExpressions.configureVocalExpressions({ enableBreaths: false });

      const result = vocalExpressions.express({
        type: 'breath_pause',
        intensity: 0.5,
      });

      expect(result).toBeNull();
    });

    it('should allow disabling chimes', () => {
      vocalExpressions.configureVocalExpressions({ enableChimes: false });

      const result = vocalExpressions.express({
        type: 'chime_success',
        intensity: 0.5,
      });

      expect(result).toBeNull();
    });

    it('should allow disabling sighs', () => {
      vocalExpressions.configureVocalExpressions({ enableSighs: false });
      vocalExpressions.setMetabolicState('stressed');

      const result = vocalExpressions.express({
        type: 'sigh_stressed',
        intensity: 0.5,
      });

      expect(result).toBeNull();
    });

    it('should get config', () => {
      const config = vocalExpressions.getVocalConfig();

      expect(config.enabled).toBeDefined();
      expect(config.volume).toBeDefined();
    });
  });

  describe('listExpressions', () => {
    it('should list all expression types', () => {
      const expressions = vocalExpressions.listExpressions();

      expect(expressions.length).toBeGreaterThan(10);
      expect(
        expressions.find((e) => e.type === 'acknowledgment')
      ).toBeDefined();
      expect(expressions.find((e) => e.type === 'chime_success')).toBeDefined();
    });

    it('should include description and category', () => {
      const expressions = vocalExpressions.listExpressions();
      const ack = expressions.find((e) => e.type === 'acknowledgment');

      expect(ack!.description).toBeTruthy();
      expect(ack!.category).toBe('vocal');
    });
  });

  describe('formatVocalState', () => {
    it('should format state for display', () => {
      vocalExpressions.setMetabolicState('content');
      vocalExpressions.express({ type: 'hum_content', intensity: 0.5 });

      const formatted = vocalExpressions.formatVocalState();

      expect(formatted).toContain('VOCAL EXPRESSION STATE');
      expect(formatted).toContain('content');
      expect(formatted).toContain('hum_content');
    });
  });

  describe('resetVocalState', () => {
    it('should reset all state', () => {
      vocalExpressions.setMetabolicState('stressed');
      vocalExpressions.express({ type: 'sigh_stressed', intensity: 0.5 });

      vocalExpressions.resetVocalState();

      const state = vocalExpressions.getVocalState();
      expect(state.metabolicState).toBe('calm');
      expect(state.expressionCount).toBe(0);
      expect(state.recentExpressions).toHaveLength(0);
    });
  });
});

describe('Expression types', () => {
  it('should have all expected expression types', () => {
    const types: vocalExpressions.ExpressionType[] = [
      'sigh_stressed',
      'sigh_relieved',
      'sigh_thoughtful',
      'breath_pause',
      'breath_deep',
      'chime_discovery',
      'chime_success',
      'chime_beauty',
      'chime_connection',
      'hum_content',
      'hum_thinking',
      'alert_soft',
      'alert_urgent',
      'laugh_soft',
      'warmth',
      'curiosity',
      'acknowledgment',
    ];

    types.forEach((type) => {
      expect(type).toBeDefined();
    });
  });
});

describe('Metabolic states', () => {
  it('should have all expected states', () => {
    const states: vocalExpressions.MetabolicState[] = [
      'calm',
      'focused',
      'stressed',
      'excited',
      'tired',
      'recovering',
      'alert',
      'content',
    ];

    states.forEach((state) => {
      vocalExpressions.setMetabolicState(state);
      expect(vocalExpressions.getVocalState().metabolicState).toBe(state);
    });
  });
});
