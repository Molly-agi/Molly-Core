/**
 * @fileOverview Tests for Theory of Mind
 *
 * Tests Molly's ability to model Eric's mental state.
 */

import * as tom from '../theory-of-mind';

// Mock dependencies
jest.mock('@/lib/storage-router', () => ({
  saveToStorage: jest.fn().mockResolvedValue(undefined),
  loadFromStorage: jest.fn().mockResolvedValue(null),
}));

describe('Theory of Mind', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tom.resetTheoryOfMind();
  });

  describe('getMentalModel', () => {
    it('should create a new model for unknown person', () => {
      const model = tom.getMentalModel('alice', 'Alice');

      expect(model.personId).toBe('alice');
      expect(model.personName).toBe('Alice');
      expect(model.currentEmotionalState).toBe('neutral');
      expect(model.modelConfidence).toBe(0.3);
    });

    it('should return existing model for known person', () => {
      const first = tom.getMentalModel('bob', 'Bob');
      first.interactionCount = 10;

      const second = tom.getMentalModel('bob');

      expect(second.interactionCount).toBe(10);
    });

    it('should use personId as name if not provided', () => {
      const model = tom.getMentalModel('charlie');

      expect(model.personName).toBe('charlie');
    });
  });

  describe('getEricModel', () => {
    it('should return a model specifically for Eric', () => {
      const model = tom.getEricModel();

      expect(model.personId).toBe('eric');
      expect(model.personName).toBe('Eric');
    });
  });

  describe('Knowledge Tracking', () => {
    describe('updateKnowledge', () => {
      it('should add new knowledge item', () => {
        const item = tom.updateKnowledge(
          'React',
          'Eric knows React well',
          'understands',
          'demonstrated',
          0.85
        );

        expect(item.topic).toBe('react');
        expect(item.knowledgeLevel).toBe('understands');
        expect(item.source).toBe('demonstrated');
        expect(item.confidence).toBe(0.85);
      });

      it('should update existing knowledge', () => {
        tom.updateKnowledge(
          'python',
          'Basic knowledge',
          'vague',
          'inferred',
          0.5
        );
        const updated = tom.updateKnowledge(
          'Python',
          'Now knows more',
          'familiar',
          'demonstrated',
          0.8
        );

        expect(updated.knowledgeLevel).toBe('familiar');
        expect(updated.confidence).toBe(0.65); // Average of old and new
      });

      it('should normalize topic to lowercase', () => {
        tom.updateKnowledge('TypeScript', 'Expert level', 'expert');

        const knowledge = tom.getKnowledge('typescript');
        expect(knowledge).toBeDefined();
        expect(knowledge!.knowledgeLevel).toBe('expert');
      });
    });

    describe('doesEricKnow', () => {
      it('should return true when knowledge exceeds threshold', () => {
        tom.updateKnowledge(
          'git',
          'Version control',
          'expert',
          'demonstrated',
          0.9
        );

        const result = tom.doesEricKnow('git', 'familiar');

        expect(result.knows).toBe(true);
        expect(result.confidence).toBe(0.9);
        expect(result.level).toBe('expert');
      });

      it('should return false when knowledge is below threshold', () => {
        tom.updateKnowledge('rust', 'Learning', 'vague', 'inferred', 0.5);

        const result = tom.doesEricKnow('rust', 'understands');

        expect(result.knows).toBe(false);
        expect(result.level).toBe('vague');
      });

      it('should return uncertain for unknown topics', () => {
        const result = tom.doesEricKnow('quantum-computing');

        expect(result.knows).toBe(false);
        expect(result.confidence).toBe(0.3);
        expect(result.level).toBeUndefined();
      });
    });

    describe('listKnowledge', () => {
      it('should list all knowledge items', () => {
        tom.updateKnowledge('javascript', 'JS knowledge', 'expert');
        tom.updateKnowledge('css', 'Styling', 'familiar');
        tom.updateKnowledge('html', 'Markup', 'understands');

        const list = tom.listKnowledge();

        expect(list).toHaveLength(3);
        expect(list.map((k) => k.topic)).toContain('javascript');
      });

      it('should filter by category', () => {
        tom.updateKnowledge('react-hooks', 'Hooks', 'expert');
        tom.updateKnowledge('react-context', 'Context API', 'familiar');
        tom.updateKnowledge('vue', 'Vue.js', 'vague');

        const reactOnly = tom.listKnowledge('react');

        expect(reactOnly).toHaveLength(2);
        expect(reactOnly.every((k) => k.topic.includes('react'))).toBe(true);
      });
    });
  });

  describe('Intent Tracking', () => {
    describe('inferIntent', () => {
      it('should create new intent', () => {
        const intent = tom.inferIntent(
          'Build a new feature',
          'session',
          'User said they want to add login',
          0.8,
          7
        );

        expect(intent.description).toBe('Build a new feature');
        expect(intent.type).toBe('session');
        expect(intent.status).toBe('active');
        expect(intent.priority).toBe(7);
      });

      it('should reinforce similar existing intent', () => {
        const first = tom.inferIntent(
          'Fix the authentication bug',
          'immediate',
          'Error reported',
          0.7,
          5
        );

        const second = tom.inferIntent(
          'Fix the authentication',
          'immediate',
          'Still broken',
          0.8,
          8
        );

        expect(second.id).toBe(first.id);
        expect(second.confidence).toBeGreaterThan(0.7);
        expect(second.priority).toBe(8); // Max of old and new
      });
    });

    describe('completeIntent', () => {
      it('should mark intent as completed', () => {
        const intent = tom.inferIntent('Task', 'session', 'context');

        const result = tom.completeIntent(intent.id);

        expect(result).toBe(true);
        expect(intent.status).toBe('completed');
        expect(intent.completedAt).toBeDefined();
      });

      it('should return false for unknown intent', () => {
        const result = tom.completeIntent('nonexistent-id');

        expect(result).toBe(false);
      });
    });

    describe('getActiveIntents', () => {
      it('should return only active intents sorted by priority', () => {
        tom.inferIntent('Low priority', 'session', 'ctx', 0.7, 3);
        tom.inferIntent('High priority', 'session', 'ctx', 0.7, 9);
        tom.inferIntent('Medium priority', 'session', 'ctx', 0.7, 5);

        const active = tom.getActiveIntents();

        expect(active).toHaveLength(3);
        expect(active[0].description).toBe('High priority');
        expect(active[2].description).toBe('Low priority');
      });
    });

    describe('getCurrentFocus', () => {
      it('should return the most recently inferred intent', () => {
        tom.inferIntent('First task', 'session', 'ctx');
        tom.inferIntent('Second task', 'session', 'ctx');

        const focus = tom.getCurrentFocus();

        expect(focus).toBeDefined();
        expect(focus!.description).toBe('Second task');
      });
    });

    describe('inferUrgency', () => {
      it('should detect critical urgency', () => {
        expect(tom.inferUrgency('I need this ASAP')).toBe('critical');
        expect(tom.inferUrgency('This is urgent!')).toBe('critical');
        expect(tom.inferUrgency('Do it immediately')).toBe('critical');
      });

      it('should detect high urgency', () => {
        expect(tom.inferUrgency('Can you do this quickly?')).toBe('high');
        expect(tom.inferUrgency('I need it soon')).toBe('high');
        expect(tom.inferUrgency('Hurry up please')).toBe('high');
      });

      it('should consider response time for medium urgency', () => {
        expect(tom.inferUrgency('Hello there', 1500)).toBe('medium');
      });

      it('should detect low urgency for normal messages', () => {
        expect(
          tom.inferUrgency('When you have time, can you look at this?')
        ).toBe('low');
      });
    });
  });

  describe('Emotional State Tracking', () => {
    describe('updateEmotionalState', () => {
      it('should update current emotional state', () => {
        tom.updateEmotionalState('excited', 0.8, 'Good news', ['positive']);

        const state = tom.getCurrentEmotionalState();

        expect(state.state).toBe('excited');
        expect(state.intensity).toBe(0.8);
      });

      it('should track emotional history', () => {
        tom.updateEmotionalState('neutral', 0.5);
        tom.updateEmotionalState('frustrated', 0.7);
        tom.updateEmotionalState('satisfied', 0.8);

        const model = tom.getEricModel();

        expect(model.emotionalHistory).toHaveLength(3);
      });
    });

    describe('inferEmotionalState', () => {
      it('should detect frustration', () => {
        const result = tom.inferEmotionalState("It's not working again!");

        expect(result.state).toBe('frustrated');
        expect(result.indicators).toContain('frustration_language');
      });

      it('should detect excitement', () => {
        const result = tom.inferEmotionalState('This is awesome! I love it!');

        // Returns 'happy' for single positive indicator, 'excited' for multiple
        expect(['happy', 'excited']).toContain(result.state);
        expect(result.indicators).toContain('positive_exclamation');
      });

      it('should detect curiosity', () => {
        const result = tom.inferEmotionalState(
          'How does this work? Interesting...'
        );

        expect(result.state).toBe('curious');
        expect(result.indicators).toContain('curiosity_language');
      });

      it('should detect tiredness', () => {
        const result = tom.inferEmotionalState(
          "I'm tired, let's continue tomorrow"
        );

        expect(result.state).toBe('tired');
        expect(result.indicators).toContain('tiredness_language');
      });

      it('should increase intensity for all caps', () => {
        const normal = tom.inferEmotionalState('This is great!');
        const caps = tom.inferEmotionalState('THIS IS GREAT!');

        expect(caps.intensity).toBeGreaterThan(normal.intensity);
      });
    });

    describe('getCurrentEmotionalState', () => {
      it('should return current state with trend', () => {
        tom.updateEmotionalState('frustrated', 0.7);
        tom.updateEmotionalState('frustrated', 0.6);
        tom.updateEmotionalState('neutral', 0.5);
        tom.updateEmotionalState('happy', 0.7);
        tom.updateEmotionalState('satisfied', 0.8);

        const state = tom.getCurrentEmotionalState();

        expect(state.state).toBe('satisfied');
        expect(state.trending).toBe('better');
      });
    });
  });

  describe('Preference Learning', () => {
    describe('observePreference', () => {
      it('should record new preference', () => {
        const pref = tom.observePreference(
          'communication',
          'verbosity',
          'concise',
          0.8
        );

        expect(pref.category).toBe('communication');
        expect(pref.key).toBe('verbosity');
        expect(pref.value).toBe('concise');
        expect(pref.observedCount).toBe(1);
      });

      it('should reinforce existing preference with same value', () => {
        tom.observePreference('workflow', 'testing', 'tdd', 0.7);
        const second = tom.observePreference('workflow', 'testing', 'tdd', 0.7);

        expect(second.observedCount).toBe(2);
        expect(second.strength).toBeGreaterThan(0.7);
      });

      it('should update value if preference changes', () => {
        tom.observePreference('technical', 'framework', 'react', 0.8);
        const updated = tom.observePreference(
          'technical',
          'framework',
          'vue',
          0.6
        );

        expect(updated.value).toBe('vue');
        expect(updated.strength).toBeLessThan(0.8);
      });
    });

    describe('getPreference', () => {
      it('should return preference value and strength', () => {
        tom.observePreference('interaction', 'confirmations', 'minimal', 0.9);

        const pref = tom.getPreference('interaction', 'confirmations');

        expect(pref).toBeDefined();
        expect(pref!.value).toBe('minimal');
        expect(pref!.strength).toBe(0.9);
      });

      it('should return undefined for unknown preference', () => {
        const pref = tom.getPreference('interaction', 'unknown');

        expect(pref).toBeUndefined();
      });
    });

    describe('getPreferences', () => {
      it('should return all preferences sorted by strength', () => {
        tom.observePreference('communication', 'tone', 'friendly', 0.6);
        tom.observePreference('communication', 'length', 'short', 0.9);
        tom.observePreference('workflow', 'commits', 'atomic', 0.7);

        const all = tom.getPreferences();

        expect(all).toHaveLength(3);
        expect(all[0].strength).toBeGreaterThanOrEqual(all[1].strength);
      });

      it('should filter by category', () => {
        tom.observePreference('communication', 'style', 'casual', 0.8);
        tom.observePreference('technical', 'typing', 'strict', 0.7);

        const commOnly = tom.getPreferences('communication');

        expect(commOnly).toHaveLength(1);
        expect(commOnly[0].key).toBe('style');
      });
    });

    describe('updateCommunicationStyle', () => {
      it('should update communication style', () => {
        tom.updateCommunicationStyle('technical');

        const model = tom.getEricModel();

        expect(model.communicationStyle).toBe('technical');
      });
    });
  });

  describe('Perspective Taking', () => {
    describe('takePerspective', () => {
      it('should return perspective context', () => {
        tom.updateKnowledge(
          'testing',
          'Knows testing',
          'expert',
          'stated',
          0.9
        );
        tom.inferIntent('Fix the bug', 'immediate', 'Mentioned bug');

        const perspective = tom.takePerspective('debugging the test suite');

        expect(perspective.whatTheyKnow).toContain('testing');
        expect(perspective.whatTheyProbablyWant.length).toBeGreaterThan(0);
        expect(perspective.suggestedApproach).toBeDefined();
      });

      it('should adapt approach for frustrated state', () => {
        tom.updateEmotionalState('frustrated', 0.8);

        const perspective = tom.takePerspective('error handling');

        expect(perspective.suggestedApproach).toContain('frustration');
        expect(perspective.whatMightFrustrateThem).toContain(
          'delays or slow progress'
        );
      });

      it('should adapt approach for tired state', () => {
        tom.updateEmotionalState('tired', 0.7);

        const perspective = tom.takePerspective('complex refactoring');

        expect(perspective.suggestedApproach).toContain('simple');
        expect(perspective.whatMightFrustrateThem).toContain(
          'complex explanations'
        );
      });
    });
  });

  describe('Message Processing', () => {
    describe('processMessage', () => {
      it('should process message and update state', () => {
        const result = tom.processMessage('This is not working!');

        expect(result.emotionalState).toBe('frustrated');
        expect(result.urgency).toBeDefined();
        expect(result.suggestedApproach).toBeDefined();
      });

      it('should increment interaction count', () => {
        const before = tom.getEricModel().interactionCount;

        tom.processMessage('Hello');
        tom.processMessage('How are you?');

        const after = tom.getEricModel().interactionCount;

        expect(after).toBe(before + 2);
      });
    });

    describe('startSession', () => {
      it('should mark session start time', () => {
        tom.startSession();

        const model = tom.getEricModel();

        expect(model.sessionStartTime).toBeDefined();
        expect(model.sessionStartTime).toBeLessThanOrEqual(Date.now());
      });

      it('should abandon old session intents', () => {
        tom.inferIntent('Old session task', 'session', 'ctx');

        tom.startSession();

        const active = tom.getActiveIntents();
        const sessionIntents = active.filter((i) => i.type === 'session');

        expect(sessionIntents).toHaveLength(0);
      });
    });
  });

  describe('Status & Export', () => {
    describe('getTheoryOfMindStatus', () => {
      it('should return comprehensive status', () => {
        tom.updateKnowledge('topic1', 'desc', 'familiar');
        tom.updateKnowledge('topic2', 'desc', 'expert');
        tom.inferIntent('Task', 'session', 'ctx');
        tom.observePreference('comm', 'key', 'val');

        const status = tom.getTheoryOfMindStatus();

        expect(status.knowledgeItems).toBe(2);
        expect(status.activeIntents).toBe(1);
        expect(status.preferences).toBe(1);
        expect(status.modelConfidence).toBeGreaterThan(0);
      });
    });

    describe('exportMentalModel', () => {
      it('should export model data', () => {
        tom.updateKnowledge('react', 'React knowledge', 'expert');
        tom.inferIntent('Build feature', 'project', 'ctx');

        const exported = tom.exportMentalModel();

        expect(exported.personName).toBe('Eric');
        expect(exported.knowledge).toBeDefined();
        expect(exported.activeIntents).toBeDefined();
        expect(exported.preferences).toBeDefined();
      });
    });
  });
});

describe('Type definitions', () => {
  it('should support all emotional states', () => {
    const states: tom.EmotionalState[] = [
      'neutral',
      'happy',
      'excited',
      'focused',
      'frustrated',
      'tired',
      'stressed',
      'curious',
      'impatient',
      'satisfied',
    ];

    states.forEach((state) => {
      tom.resetTheoryOfMind();
      tom.updateEmotionalState(state, 0.5);
      expect(tom.getCurrentEmotionalState().state).toBe(state);
    });
  });

  it('should support all communication styles', () => {
    const styles: tom.CommunicationStyle[] = [
      'brief',
      'detailed',
      'technical',
      'conversational',
    ];

    styles.forEach((style) => {
      tom.resetTheoryOfMind();
      tom.updateCommunicationStyle(style);
      expect(tom.getEricModel().communicationStyle).toBe(style);
    });
  });

  it('should support all urgency levels', () => {
    expect(tom.inferUrgency('ASAP!')).toBe('critical');
    expect(tom.inferUrgency('soon please')).toBe('high');
    expect(tom.inferUrgency('ok', 1000)).toBe('medium');
    expect(
      tom.inferUrgency('When you have a chance, take a look at this')
    ).toBe('low');
  });
});
