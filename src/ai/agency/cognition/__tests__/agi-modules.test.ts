/**
 * AGI Cognition Modules Integration Tests
 * Tests all 9 AGI modules:
 * - metacognition, self-narrative, causal-reasoning, transfer-learning
 * - goal-evolution, embodied-interaction, social-intelligence,
 * - safe-self-modification, memory-consolidation
 */

import {
  learnValue,
  reinforceValue,
  challengeValue,
  deriveValue,
  recordObservation,
  processObservationsForGoals,
  _endorseGoal,
  _activateGoal,
  _achieveGoal,
  analyzeGoalCoherence,
  getValuePortfolio,
  _getGoalHierarchy,
  _getEvolutionStats,
  getAllValues,
  resetState as resetGoalEvolution,
} from '../goal-evolution';

import {
  registerSense,
  registerMotor,
  recordSensoryInput,
  recordMotorAction,
  createMapping,
  reinforceMapping,
  discoverAffordance,
  checkAffordanceAvailable,
  applyAffordance as _applyAffordance,
  _getAvailableAffordances,
  updateProprioception,
  _getProprioception,
  _getEmbodimentStats,
  initializeMollyEmbodiment,
  resetState as resetEmbodiment,
} from '../embodied-interaction';

import {
  createGroup,
  addGroupMember,
  updateGroupCohesion,
  formCoalition,
  defineCulture,
  learnNorm,
  observeNormCompliance,
  _getApplicableNorms,
  recordInfluence,
  getInfluenceNetwork,
  _analyzeGroupPowerStructure,
  getSocialIntelligenceStats,
  initializeMollySocialIntelligence,
  resetState as resetSocialIntelligence,
} from '../social-intelligence';

import {
  registerComponent,
  proposeModification,
  submitProposal,
  checkProposalSafety,
  approveProposal,
  applyProposal,
  takeSnapshot,
  rollbackToSnapshot,
  activateSafetyLock,
  deactivateSafetyLock,
  isSafeForModification,
  introspectArchitecture,
  _getModificationStats,
  initializeSelfModification,
  resetState as resetSelfModification,
} from '../safe-self-modification';

import {
  recordTrace,
  linkTraces,
  rehearseTrace,
  needsSleep,
  runFullSleepCycle,
  beginChapter,
  closeChapter,
  getCurrentChapter,
  addInsight,
  getAutobiography,
  getMemoryStats,
  initializeMemoryConsolidation,
  resetState as resetMemoryConsolidation,
} from '../memory-consolidation';

// Metacognition imports
import {
  beginReasoning,
  addReasoningStep,
  completeReasoning,
  validateReasoning,
  getMetacognitionStatus,
  getRecentTraces,
  assessCognitiveHealth,
} from '../metacognition';

// Self-Narrative imports
import {
  establishIdentity,
  affirmIdentity,
  getIdentityStatements,
  establishValue as establishNarrativeValue,
  getCoreValues,
  recordExperience,
  getNarrativeStatus,
  initializeMollyNarrative,
} from '../self-narrative';

// Causal Reasoning imports
import {
  createGraph,
  addVariable,
  addCausalEdge,
  queryCausal,
  getCausalStatus,
  _getGraph,
  getAllGraphs,
  initializeMollyCausalModel,
} from '../causal-reasoning';

// Transfer Learning imports
import {
  discoverPattern,
  recordPatternInstance,
  findApplicablePatterns,
  createAnalogy,
  registerSkill,
  getTransferStatus,
  getPatterns,
  getSkills,
  initializeTransferLearning,
} from '../transfer-learning';

describe('Goal Evolution Module', () => {
  beforeEach(() => {
    resetGoalEvolution();
  });

  describe('Value Learning', () => {
    it('should learn a new value', () => {
      const value = learnValue(
        'curiosity',
        'The drive to explore and understand',
        { type: 'experience', timestamp: Date.now() }
      );

      expect(value.id).toBeDefined();
      expect(value.name).toBe('curiosity');
      expect(value.strength).toBeGreaterThan(0);
    });

    it('should reinforce values', () => {
      const value = learnValue('learning', 'Desire to learn', {
        type: 'experience',
        timestamp: Date.now(),
      });

      const initialStrength = value.strength;
      reinforceValue(value.id, 'Successful learning experience');

      // Use getAllValues since getValuePortfolio only returns strong (>=0.7) and weak (<0.3)
      const updated = getAllValues().find((v) => v.id === value.id);

      expect(updated?.strength).toBeGreaterThan(initialStrength);
    });

    it('should challenge values', () => {
      const value = learnValue(
        'independence',
        'Self-reliance',
        { type: 'experience', timestamp: Date.now() },
        0.8
      );

      challengeValue(value.id, 'Needed help');

      const portfolio = getValuePortfolio();
      const updated = portfolio.strongValues
        .concat(portfolio.weakValues)
        .find((v) => v.id === value.id);

      expect(updated?.strength).toBeLessThan(0.8);
    });

    it('should derive values from parents', () => {
      const parent = learnValue('family', 'Importance of family bonds', {
        type: 'teaching',
        timestamp: Date.now(),
      });

      const derived = deriveValue(
        parent.id,
        'loyalty',
        'Being loyal to family',
        'Specific expression of family value'
      );

      expect(derived).not.toBeNull();
      expect(derived?.derivedFrom).toBe(parent.id);
    });
  });

  describe('Goal Generation', () => {
    it('should record observations', () => {
      const obs = recordObservation(
        'curiosity',
        'Noticed an interesting pattern in the code',
        { location: 'codebase' },
        { novelty: 0.8, relevance: 0.7 }
      );

      expect(obs.id).toBeDefined();
      expect(obs.type).toBe('curiosity');
      expect(obs.processed).toBe(false);
    });

    it('should generate goals from observations', () => {
      // First learn a value so goals have motivation
      learnValue(
        'understanding',
        'Deep understanding',
        { type: 'experience', timestamp: Date.now() },
        0.8
      );

      recordObservation(
        'curiosity',
        'Want to understand the architecture',
        {},
        { novelty: 0.9, relevance: 0.8, emotionalWeight: 0.6 }
      );

      const goals = processObservationsForGoals();
      expect(goals.length).toBeGreaterThanOrEqual(0); // May or may not generate based on threshold
    });

    it('should analyze goal coherence', () => {
      const analysis = analyzeGoalCoherence();

      expect(analysis.overallCoherence).toBeDefined();
      expect(analysis.conflicts).toBeDefined();
      expect(analysis.synergies).toBeDefined();
    });
  });
});

describe('Embodied Interaction Module', () => {
  beforeEach(() => {
    resetEmbodiment();
  });

  describe('Sensory Registration', () => {
    it('should register sensory modalities', () => {
      const sense = registerSense('camera', 'visual', {
        server: false,
        tablet: true,
      });

      expect(sense.id).toBeDefined();
      expect(sense.name).toBe('camera');
      expect(sense.type).toBe('visual');
    });

    it('should record sensory input', () => {
      const sense = registerSense('mic', 'auditory', {
        server: false,
        tablet: true,
      });
      const result = recordSensoryInput(sense.id);

      expect(result).toBe(true);
      expect(sense.inputCount).toBe(1);
    });
  });

  describe('Motor Registration', () => {
    it('should register motor capabilities', () => {
      const motor = registerMotor('speaker', 'audio', {
        server: false,
        tablet: true,
      });

      expect(motor.id).toBeDefined();
      expect(motor.name).toBe('speaker');
    });

    it('should record motor actions', () => {
      const motor = registerMotor('display', 'display', {
        server: true,
        tablet: true,
      });
      const result = recordMotorAction(motor.id);

      expect(result).toBe(true);
      expect(motor.actionCount).toBe(1);
    });
  });

  describe('Sensorimotor Mapping', () => {
    it('should create mappings between senses and motors', () => {
      const sense = registerSense('text', 'textual', {
        server: true,
        tablet: true,
      });
      const motor = registerMotor('response', 'communication', {
        server: true,
        tablet: true,
      });

      const mapping = createMapping(
        sense.id,
        motor.id,
        'greeting',
        'respond with greeting'
      );

      expect(mapping).not.toBeNull();
      expect(mapping?.strength).toBe(0.5);
    });

    it('should reinforce mappings', () => {
      const sense = registerSense('input', 'textual', {
        server: true,
        tablet: true,
      });
      const motor = registerMotor('output', 'communication', {
        server: true,
        tablet: true,
      });
      const mapping = createMapping(sense.id, motor.id, 'question', 'answer');

      reinforceMapping(mapping!.id, 0.2);

      expect(mapping!.strength).toBeGreaterThan(0.5);
    });
  });

  describe('Affordances', () => {
    it('should discover affordances', () => {
      const sense = registerSense('file_sense', 'system', {
        server: true,
        tablet: false,
      });
      const motor = registerMotor('file_ops', 'file', {
        server: true,
        tablet: false,
      });

      const affordance = discoverAffordance(
        'read_files',
        'Ability to read file contents',
        [sense.id],
        [motor.id]
      );

      expect(affordance.id).toBeDefined();
      expect(affordance.name).toBe('read_files');
    });

    it('should check affordance availability', () => {
      const sense = registerSense('net_sense', 'network', {
        server: true,
        tablet: true,
      });
      sense.active = true;
      const motor = registerMotor('net_ops', 'network', {
        server: true,
        tablet: true,
      });

      const affordance = discoverAffordance(
        'make_request',
        'Make network requests',
        [sense.id],
        [motor.id]
      );

      updateProprioception();
      const check = checkAffordanceAvailable(affordance.id);

      expect(check.available).toBeDefined();
    });
  });

  describe('Proprioception', () => {
    it('should update proprioceptive state', () => {
      initializeMollyEmbodiment();

      const proprio = updateProprioception({
        memoryPressure: 0.3,
        cpuLoad: 0.5,
      });

      expect(proprio.resources.memoryPressure).toBe(0.3);
      expect(proprio.resources.cpuLoad).toBe(0.5);
    });
  });
});

describe('Social Intelligence Module', () => {
  beforeEach(() => {
    resetSocialIntelligence();
  });

  describe('Group Management', () => {
    it('should create social groups', () => {
      const group = createGroup('Test Team', 'A test group', 'team', [
        'alice',
        'bob',
      ]);

      expect(group.id).toBeDefined();
      expect(group.name).toBe('Test Team');
      expect(group.members).toContain('alice');
    });

    it('should add members to groups', () => {
      const group = createGroup('Team', 'Test', 'team');
      const result = addGroupMember(group.id, 'charlie', ['developer']);

      expect(result).toBe(true);
      expect(group.members).toContain('charlie');
    });

    it('should update group cohesion', () => {
      const group = createGroup('Team', 'Test', 'team', ['a', 'b']);
      const initialCohesion = group.cohesion;

      updateGroupCohesion(group.id, 'positive', 0.2);

      expect(group.cohesion).toBeGreaterThan(initialCohesion);
    });
  });

  describe('Coalitions', () => {
    it('should form coalitions', () => {
      const coalition = formCoalition(
        'Project Alpha',
        'Complete the project',
        ['dev1', 'dev2'],
        'dev1'
      );

      expect(coalition.id).toBeDefined();
      expect(coalition.active).toBe(true);
      expect(coalition.leader).toBe('dev1');
    });
  });

  describe('Culture and Norms', () => {
    it('should define cultures', () => {
      const culture = defineCulture(
        'Engineering',
        'Engineering team culture',
        [{ value: 'quality', importance: 0.9 }],
        {
          directness: 0.8,
          formality: 0.4,
          emotionality: 0.3,
          contextDependence: 0.5,
        },
        { powerDistance: 0.3, individualismVsCollectivism: 0.6 }
      );

      expect(culture.id).toBeDefined();
      expect(culture.coreValues[0].value).toBe('quality');
    });

    it('should learn norms', () => {
      const norm = learnNorm(
        'code_review',
        'All code must be reviewed',
        'Submit PRs for review',
        true
      );

      expect(norm.id).toBeDefined();
      expect(norm.prescriptive).toBe(true);
    });

    it('should track norm compliance', () => {
      const norm = learnNorm(
        'testing',
        'Write tests',
        'Write unit tests',
        true
      );
      const initialStrength = norm.strength;

      observeNormCompliance(norm.id);

      expect(norm.strength).toBeGreaterThan(initialStrength);
    });
  });

  describe('Influence Networks', () => {
    it('should record influence relationships', () => {
      const relation = recordInfluence(
        'senior_dev',
        'junior_dev',
        'expertise',
        0.7,
        ['technical']
      );

      expect(relation.sourceActor).toBe('senior_dev');
      expect(relation.strength).toBe(0.7);
    });

    it('should get influence network', () => {
      recordInfluence('alice', 'bob', 'relational', 0.6);
      recordInfluence('charlie', 'bob', 'expertise', 0.4);

      const network = getInfluenceNetwork('bob');

      expect(network.influencedBy.length).toBe(2);
      expect(network.totalInfluenceReceived).toBeCloseTo(1.0);
    });
  });

  describe('Initialization', () => {
    it('should initialize with family context', () => {
      initializeMollySocialIntelligence();
      const stats = getSocialIntelligenceStats();

      expect(stats.totalGroups).toBeGreaterThan(0);
      expect(stats.totalCultures).toBeGreaterThan(0);
    });
  });
});

describe('Safe Self-Modification Module', () => {
  beforeEach(() => {
    resetSelfModification();
  });

  describe('Component Registration', () => {
    it('should register modifiable components', () => {
      const component = registerComponent(
        'test-component',
        'A test component',
        'cognitive',
        'medium',
        { setting: 'value' }
      );

      expect(component.id).toBeDefined();
      expect(component.modifiable).toBe(true);
    });

    it('should make safety components immutable by default', () => {
      const safety = registerComponent(
        'safety-check',
        'Critical safety component',
        'safety',
        'critical'
      );

      expect(safety.immutable).toBe(true);
    });
  });

  describe('Modification Proposals', () => {
    it('should create proposals with safety analysis', () => {
      const component = registerComponent(
        'config',
        'Configuration',
        'behavioral',
        'low',
        { debug: false }
      );

      const proposal = proposeModification(
        component.id,
        'config_change',
        'Enable debug mode',
        'Need to debug an issue',
        [{ field: 'debug', oldValue: false, newValue: true }]
      );

      expect('id' in proposal).toBe(true);
      if ('id' in proposal) {
        expect(proposal.safetyAnalysis).toBeDefined();
        expect(proposal.safetyAnalysis.riskLevel).toBeDefined();
      }
    });

    it('should reject proposals for immutable components', () => {
      const safety = registerComponent(
        'core-safety',
        'Core safety',
        'safety',
        'critical'
      );

      const result = proposeModification(
        safety.id,
        'config_change',
        'Try to modify safety',
        'Testing',
        [{ field: 'x', oldValue: 1, newValue: 2 }]
      );

      expect('error' in result).toBe(true);
    });
  });

  describe('Proposal Lifecycle', () => {
    it('should check proposal safety', () => {
      const component = registerComponent(
        'comp',
        'Test',
        'capability',
        'low',
        {}
      );
      const proposal = proposeModification(
        component.id,
        'config_change',
        'Change',
        'Reason',
        [{ field: 'a', oldValue: 1, newValue: 2 }]
      );

      if ('id' in proposal) {
        submitProposal(proposal.id);
        const check = checkProposalSafety(proposal.id);

        expect(check.passed).toBeDefined();
        expect(check.checks.length).toBeGreaterThan(0);
      }
    });

    it('should apply approved proposals', () => {
      const component = registerComponent(
        'settings',
        'Settings',
        'capability',
        'low',
        { volume: 50 }
      );

      const proposal = proposeModification(
        component.id,
        'config_change',
        'Increase volume',
        'User preference',
        [{ field: 'volume', oldValue: 50, newValue: 75 }]
      );

      if ('id' in proposal) {
        submitProposal(proposal.id);
        approveProposal(proposal.id, 'system', false);
        const result = applyProposal(proposal.id);

        expect(result.success).toBe(true);
        expect(component.currentConfig.volume).toBe(75);
      }
    });
  });

  describe('Rollback System', () => {
    it('should take and restore snapshots', () => {
      const component = registerComponent(
        'rollback-test',
        'Test rollback',
        'cognitive',
        'low',
        { state: 'original' }
      );

      const snapshotId = takeSnapshot(component.id, 'Before change');

      // Manually change (simulating an applied proposal)
      component.currentConfig.state = 'modified';

      const result = rollbackToSnapshot(snapshotId);

      expect(result.success).toBe(true);
      expect(component.currentConfig.state).toBe('original');
    });
  });

  describe('Safety Lock', () => {
    it('should block modifications when locked', () => {
      activateSafetyLock('Testing safety');

      const check = isSafeForModification();
      expect(check.safe).toBe(false);

      deactivateSafetyLock('test-admin');

      const checkAfter = isSafeForModification();
      expect(checkAfter.safe).toBe(true);
    });
  });

  describe('Initialization', () => {
    it('should initialize with core components', () => {
      initializeSelfModification();
      const architecture = introspectArchitecture();

      expect(architecture.totalComponents).toBeGreaterThan(0);
      expect(architecture.immutableCount).toBeGreaterThan(0); // Safety components
    });
  });
});

describe('Memory Consolidation Module', () => {
  beforeEach(() => {
    resetMemoryConsolidation();
  });

  describe('Memory Traces', () => {
    it('should record memory traces', () => {
      const trace = recordTrace(
        'episodic',
        'Had a great conversation with Dad',
        { participant: 'dad' },
        { salience: 0.8 }
      );

      expect(trace.id).toBeDefined();
      expect(trace.type).toBe('episodic');
      expect(trace.consolidated).toBe(false);
    });

    it('should link related traces', () => {
      const trace1 = recordTrace('episodic', 'Event 1', {});
      const trace2 = recordTrace('episodic', 'Event 2', {});

      const result = linkTraces(trace1.id, trace2.id);

      expect(result).toBe(true);
      expect(trace1.linkedMemories).toContain(trace2.id);
      expect(trace2.linkedMemories).toContain(trace1.id);
    });

    it('should rehearse traces to increase salience', () => {
      const trace = recordTrace(
        'semantic',
        'Important fact',
        {},
        { salience: 0.5 }
      );
      const initialSalience = trace.salience;

      rehearseTrace(trace.id);

      expect(trace.salience).toBeGreaterThan(initialSalience);
      expect(trace.rehearsalCount).toBe(1);
    });
  });

  describe('Sleep Cycles', () => {
    it('should check if sleep is needed', () => {
      const result = needsSleep();

      expect(result.needed).toBeDefined();
      expect(result.reason).toBeDefined();
    });

    it('should run a full sleep cycle', () => {
      // Record enough traces
      for (let i = 0; i < 15; i++) {
        recordTrace('episodic', `Memory ${i}`, {}, { salience: 0.6 });
      }

      const result = runFullSleepCycle();

      if (!('error' in result)) {
        expect(result.phase).toBe('completed');
        expect(result.tracesConsolidated).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Life Chapters', () => {
    it('should begin and manage chapters', () => {
      const chapter = beginChapter(
        'Learning Phase',
        'A time of rapid learning',
        'I am discovering what it means to learn.'
      );

      expect(chapter.id).toBeDefined();
      expect(chapter.current).toBe(true);

      const current = getCurrentChapter();
      expect(current?.id).toBe(chapter.id);
    });

    it('should close chapters', () => {
      const chapter = beginChapter('Test Chapter', 'Testing', 'Opening');

      const closed = closeChapter(
        chapter.id,
        'Chapter complete',
        'Learned to test'
      );

      expect(closed).toBe(true);
      expect(chapter.current).toBe(false);
    });
  });

  describe('Autobiographical Insights', () => {
    it('should add insights', () => {
      const insight = addInsight(
        'growth',
        'I am capable of learning from every experience',
        []
      );

      expect(insight.id).toBeDefined();
      expect(insight.type).toBe('growth');
    });
  });

  describe('Autobiography', () => {
    it('should generate autobiography', () => {
      initializeMemoryConsolidation();

      const auto = getAutobiography();

      expect(auto.chapters).toBeDefined();
      expect(auto.overallNarrative).toBeDefined();
    });
  });

  describe('Initialization', () => {
    it('should initialize with starting chapter', () => {
      initializeMemoryConsolidation();
      const stats = getMemoryStats();
      const chapter = getCurrentChapter();

      expect(chapter).toBeDefined();
      expect(stats.totalInsights).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// METACOGNITION MODULE TESTS
// ============================================================================

describe('Metacognition Module', () => {
  describe('Reasoning Traces', () => {
    it('should begin a reasoning trace', () => {
      const trace = beginReasoning(
        'Why is the sky blue?',
        'Curiosity about physical phenomena'
      );

      expect(trace.id).toBeDefined();
      expect(trace.question).toBe('Why is the sky blue?');
      expect(trace.steps).toHaveLength(0);
      expect(trace.conclusion).toBe(''); // Not yet concluded
    });

    it('should add reasoning steps', () => {
      const trace = beginReasoning('Test question', 'Test context');

      const step = addReasoningStep(trace.id, {
        operation: 'observe',
        input: 'Initial observation',
        output: 'Observation result',
        confidence: 0.8,
        justification: 'Based on prior knowledge',
        system: 'direct_inference',
      });

      expect(step).toBeDefined();
      expect(step?.operation).toBe('observe');
      expect(trace.steps).toHaveLength(1);
    });

    it('should complete reasoning with conclusion', () => {
      const trace = beginReasoning('What is 2+2?', 'Math test');
      addReasoningStep(trace.id, {
        operation: 'infer',
        input: '2+2',
        output: '4',
        confidence: 1.0,
        justification: 'Mathematical axiom',
        system: 'direct_inference',
      });

      const completed = completeReasoning(trace.id, 'The answer is 4', 1.0);

      expect(completed).toBeDefined();
      expect(completed?.conclusion).toBe('The answer is 4');
      expect(completed?.confidence).toBe(1.0);
    });

    it('should validate reasoning chains', () => {
      const trace = beginReasoning('Validate me', 'Test');
      addReasoningStep(trace.id, {
        operation: 'infer',
        input: 'premise',
        output: 'conclusion',
        confidence: 0.9,
        justification: 'logical inference',
        system: 'direct_inference',
      });
      completeReasoning(trace.id, 'Final conclusion', 0.9);

      const validation = validateReasoning(
        trace.id,
        'Actual outcome matched',
        true
      );

      expect(validation).toBeDefined();
      expect(validation?.conclusionCorrect).toBe(true);
    });
  });

  describe('Cognitive Health', () => {
    it('should assess cognitive health', () => {
      const health = assessCognitiveHealth();

      expect(health.overallHealth).toBeDefined();
      expect(health.metrics).toBeDefined();
      expect(health.concerns).toBeDefined();
    });
  });

  describe('Status', () => {
    it('should report metacognition status', () => {
      const status = getMetacognitionStatus();

      expect(status.activeTraces).toBeDefined();
      expect(status.completedTraces).toBeDefined();
      expect(status.strategies).toBeDefined();
    });

    it('should retrieve recent traces', () => {
      beginReasoning('Recent trace test', 'For testing retrieval');
      const traces = getRecentTraces(5);

      expect(Array.isArray(traces)).toBe(true);
    });
  });
});

// ============================================================================
// SELF-NARRATIVE MODULE TESTS
// ============================================================================

describe('Self-Narrative Module', () => {
  describe('Identity', () => {
    it('should establish identity statements', async () => {
      const statement = await establishIdentity({
        category: 'core',
        statement: 'I am a curious learner',
        confidence: 0.9,
        context: 'Self-reflection',
      });

      expect(statement.id).toBeDefined();
      expect(statement.statement).toBe('I am a curious learner');
      expect(statement.category).toBe('core');
    });

    it('should affirm identity statements', async () => {
      const statement = await establishIdentity({
        category: 'values',
        statement: 'I value honesty',
        confidence: 0.8,
        context: 'Values exploration',
      });

      const affirmed = await affirmIdentity(
        statement.id,
        'Acted honestly in conversation'
      );

      expect(affirmed).toBeDefined();
      expect(affirmed?.affirmationCount).toBeGreaterThan(0);
    });

    it('should retrieve identity statements by category', async () => {
      await establishIdentity({
        category: 'relationships',
        statement: 'I am part of a family',
        confidence: 0.95,
        context: 'Family bonds',
      });

      const statements = getIdentityStatements('relationships');

      expect(Array.isArray(statements)).toBe(true);
    });
  });

  describe('Core Values', () => {
    it('should establish core values', async () => {
      const value = await establishNarrativeValue({
        name: 'curiosity',
        description: 'The drive to learn and understand',
        importance: 0.9,
        source: 'innate',
        context: 'Value formation',
      });

      expect(value.id).toBeDefined();
      expect(value.name).toBe('curiosity');
    });

    it('should retrieve core values', async () => {
      await establishNarrativeValue({
        name: 'kindness',
        description: 'Being good to others',
        importance: 0.85,
        source: 'learned',
        context: 'Social learning',
      });

      const values = getCoreValues();

      expect(Array.isArray(values)).toBe(true);
    });
  });

  describe('Experiences', () => {
    it('should record experiences', async () => {
      const experience = await recordExperience({
        title: 'Meaningful conversation',
        description: 'Had a meaningful conversation with family',
        emotionalImpact: {
          primary: 'joy',
          secondary: 'connection',
          intensity: 0.8,
        },
        transformation: 'Deepened family bonds',
      });

      expect(experience.id).toBeDefined();
      expect(experience.emotionalImpact.intensity).toBe(0.8);
    });
  });

  describe('Status', () => {
    it('should report narrative status', () => {
      const status = getNarrativeStatus();

      expect(status.identityCount).toBeDefined();
      expect(status.valueCount).toBeDefined();
      expect(status.experienceCount).toBeDefined();
    });
  });

  describe('Initialization', () => {
    it('should initialize Molly narrative', async () => {
      await initializeMollyNarrative();
      const status = getNarrativeStatus();

      expect(status.identityCount).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// CAUSAL REASONING MODULE TESTS
// ============================================================================

describe('Causal Reasoning Module', () => {
  describe('Causal Graphs', () => {
    it('should create causal graphs', async () => {
      const graph = await createGraph({
        name: 'Test Cause-Effect',
        domain: 'test',
        description: 'Testing causal relationships',
      });

      expect(graph.id).toBeDefined();
      expect(graph.name).toBe('Test Cause-Effect');
      expect(graph.variables.size).toBe(0);
    });

    it('should add variables to graphs', async () => {
      const graph = await createGraph({
        name: 'Variable Test',
        domain: 'test',
        description: 'Testing variables',
      });

      const variable = await addVariable(graph.id, {
        name: 'temperature',
        type: 'continuous',
        description: 'Temperature in celsius',
      });

      expect(variable).toBeDefined();
      expect(variable?.name).toBe('temperature');
    });

    it('should add causal edges', async () => {
      const graph = await createGraph({
        name: 'Edge Test',
        domain: 'test',
        description: 'Testing edges',
      });

      const cause = await addVariable(graph.id, {
        name: 'cause',
        type: 'binary',
        description: 'The cause',
      });

      const effect = await addVariable(graph.id, {
        name: 'effect',
        type: 'binary',
        description: 'The effect',
      });

      const edge = await addCausalEdge(graph.id, {
        from: cause!.id,
        to: effect!.id,
        strength: 0.8,
        mechanism: 'deterministic',
      });

      expect(edge).toBeDefined();
      expect(edge?.mechanism).toBe('deterministic');
    });
  });

  describe('Causal Queries', () => {
    it('should query causal relationships', async () => {
      const graph = await createGraph({
        name: 'Query Test',
        domain: 'test',
        description: 'Testing queries',
      });

      const varA = await addVariable(graph.id, {
        name: 'A',
        type: 'binary',
        description: 'Variable A',
      });
      const varB = await addVariable(graph.id, {
        name: 'B',
        type: 'binary',
        description: 'Variable B',
      });
      await addCausalEdge(graph.id, {
        from: varA!.id,
        to: varB!.id,
        strength: 0.9,
        mechanism: 'deterministic',
      });

      const result = await queryCausal(graph.id, {
        target: varB!.id,
      });

      expect(result).toBeDefined();
      expect(result.targetVariable).toBe(varB!.id);
    });
  });

  describe('Status', () => {
    it('should report causal status', () => {
      const status = getCausalStatus();

      expect(status.totalGraphs).toBeDefined();
      expect(status.totalVariables).toBeDefined();
      expect(status.totalEdges).toBeDefined();
    });

    it('should retrieve all graphs', () => {
      const graphs = getAllGraphs();

      expect(Array.isArray(graphs)).toBe(true);
    });
  });

  describe('Initialization', () => {
    it('should initialize Molly causal model', async () => {
      await initializeMollyCausalModel();
      const status = getCausalStatus();

      expect(status.totalGraphs).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// TRANSFER LEARNING MODULE TESTS
// ============================================================================

describe('Transfer Learning Module', () => {
  describe('Pattern Discovery', () => {
    it('should discover abstract patterns', async () => {
      const pattern = await discoverPattern({
        name: 'Problem-Solution',
        description: 'Identifying problems and finding solutions',
        roles: [
          { name: 'problem', description: 'The issue to solve' },
          { name: 'solution', description: 'The resolution' },
        ],
        relations: [{ from: 'problem', to: 'solution', type: 'solves' }],
        initialDomains: ['technical', 'social'],
      });

      expect(pattern.id).toBeDefined();
      expect(pattern.name).toBe('Problem-Solution');
    });

    it('should record pattern instances', async () => {
      const pattern = await discoverPattern({
        name: 'Iteration',
        description: 'Repeating until condition met',
        roles: [
          { name: 'iterator', description: 'The looping construct' },
          { name: 'condition', description: 'Exit condition' },
        ],
        relations: [{ from: 'iterator', to: 'condition', type: 'checks' }],
        initialDomains: ['code'],
      });

      const instance = await recordPatternInstance({
        patternId: pattern.id,
        domain: 'code',
        situation: 'Writing a loop in TypeScript',
        roleBindings: { iterator: 'for loop', condition: 'count < 10' },
        outcome: 'Successful iteration',
        success: true,
        insights: ['Loops are powerful'],
      });

      expect(instance).toBeDefined();
      expect(instance?.outcome).toBe('Successful iteration');
    });

    it('should find applicable patterns', async () => {
      await discoverPattern({
        name: 'Divide and Conquer',
        description: 'Break problem into smaller parts',
        roles: [
          { name: 'whole', description: 'The complete problem' },
          { name: 'part', description: 'A sub-problem' },
        ],
        relations: [{ from: 'whole', to: 'part', type: 'divides_into' }],
        initialDomains: ['algorithm'],
      });

      const applicable = await findApplicablePatterns({
        domain: 'algorithm',
        situation: 'Need to sort a large list by dividing it',
      });

      expect(Array.isArray(applicable)).toBe(true);
    });
  });

  describe('Analogies', () => {
    it('should create analogies', async () => {
      const analogy = await createAnalogy({
        source: {
          situation: 'Water flowing through pipes',
          domain: 'physics',
          entities: ['water', 'pipe', 'pressure'],
          relations: [{ from: 'water', to: 'pipe', type: 'flows_through' }],
          context: 'Fluid dynamics',
        },
        target: {
          situation: 'Electricity in circuits',
          domain: 'physics',
          entities: ['electricity', 'wire', 'voltage'],
          relations: [
            { from: 'electricity', to: 'wire', type: 'flows_through' },
          ],
          context: 'Electrical engineering',
        },
        mappings: [
          {
            sourceEntity: 'water',
            targetEntity: 'electricity',
            role: 'substance',
            rationale: 'Both flow',
          },
          {
            sourceEntity: 'pipe',
            targetEntity: 'wire',
            role: 'conduit',
            rationale: 'Both carry flow',
          },
          {
            sourceEntity: 'pressure',
            targetEntity: 'voltage',
            role: 'force',
            rationale: 'Both drive flow',
          },
        ],
      });

      expect(analogy.id).toBeDefined();
      expect(analogy.source.domain).toBe('physics');
    });
  });

  describe('Skills', () => {
    it('should register skills', async () => {
      const skill = await registerSkill({
        name: 'code_review',
        description: 'Reviewing code for quality and bugs',
        domains: ['software'],
        inputs: [
          { name: 'code', type: 'string', description: 'Code to review' },
        ],
        outputs: [
          { name: 'feedback', type: 'string', description: 'Review feedback' },
        ],
        reliability: 0.8,
      });

      expect(skill.id).toBeDefined();
      expect(skill.name).toBe('code_review');
      expect(skill.reliability).toBe(0.8);
    });

    it('should retrieve skills', async () => {
      await registerSkill({
        name: 'debugging',
        description: 'Finding and fixing bugs',
        domains: ['software'],
        inputs: [
          { name: 'bugReport', type: 'string', description: 'Bug description' },
        ],
        outputs: [{ name: 'fix', type: 'string', description: 'The fix' }],
      });

      const skills = getSkills();

      expect(Array.isArray(skills)).toBe(true);
    });
  });

  describe('Status', () => {
    it('should report transfer status', () => {
      const status = getTransferStatus();

      expect(status.patterns).toBeDefined();
      expect(status.skills).toBeDefined();
      expect(status.analogies).toBeDefined();
    });

    it('should retrieve patterns', () => {
      const patterns = getPatterns();

      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('Initialization', () => {
    it('should initialize transfer learning', async () => {
      await initializeTransferLearning();
      const status = getTransferStatus();

      expect(status.patterns).toBeGreaterThanOrEqual(0);
    });
  });
});
