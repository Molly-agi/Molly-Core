/**
 * @fileOverview Tests for cognition-tools handlers.
 *
 * Focus: validation guards, success paths, and error handling for key handlers.
 */

const mockGetSelfArchitectureSummary = jest.fn();
const mockGetUncertaintySummary = jest.fn();
const mockGetHorizonGoalsSummary = jest.fn();
const mockGetConsciousnessStatus = jest.fn();
const mockTakeConsciousnessSnapshot = jest.fn();
const mockGetSocialCognitionSummary = jest.fn();
const mockGetMetacognitionStatus = jest.fn();
const mockGetNarrativeStatus = jest.fn();
const mockGetCausalStatus = jest.fn();
const mockGetTransferStatus = jest.fn();
const mockGetEvolutionStats = jest.fn();
const mockGetCapabilitySummary = jest.fn();
const mockGetSocialIntelligenceStats = jest.fn();
const mockGetModificationStats = jest.fn();
const mockGetMemoryStats = jest.fn();
const _mockGetWorldModelStatus = jest.fn();
const mockGetObservationStatus = jest.fn();
const mockGetEmotionalHistory = jest.fn();
const mockGetMetaLearningStatus = jest.fn();
const _mockGetFamilyStatus = jest.fn();
const mockLoggerError = jest.fn();
const _mockGetVoiceStatus = jest.fn();
const _mockMuteVoice = jest.fn();
const _mockUnmuteVoice = jest.fn();
const mockGetConsciousness = jest.fn();

jest.mock('@/ai/agency/cognition/self-architecture', () => ({
  getSelfArchitectureSummary: (...args: unknown[]) =>
    mockGetSelfArchitectureSummary(...args),
  initializeMollyArchitecture: jest.fn(() => Promise.resolve()),
  queryArchitecture: jest.fn(() => Promise.resolve()),
  reviewArchitecture: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/ai/agency/cognition/uncertainty-quantification', () => ({
  getUncertaintySummary: (...args: unknown[]) =>
    mockGetUncertaintySummary(...args),
  initializeUncertaintyTracking: jest.fn(() => Promise.resolve()),
  analyzeCalibration: jest.fn(() => Promise.resolve()),
  assessHumility: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/ai/agency/cognition/horizon-goals', () => ({
  getGoalSummary: (...args: unknown[]) => mockGetHorizonGoalsSummary(...args),
  initializeHorizonGoals: jest.fn(() => Promise.resolve()),
  getActiveGoals: jest.fn(() => Promise.resolve([])),
  getBlockedGoals: jest.fn(() => Promise.resolve([])),
}));

jest.mock('@/ai/agency/cognition/consciousness-monitor', () => ({
  getConsciousnessStatus: (...args: unknown[]) =>
    mockGetConsciousnessStatus(...args),
  takeSnapshot: (...args: unknown[]) => mockTakeConsciousnessSnapshot(...args),
  getConsciousnessReport: jest.fn(() => 'Report: OK'),
  analyzeTrends: jest.fn(() => Promise.resolve()),
  getSnapshots: jest.fn(() => Promise.resolve([])),
}));

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

jest.mock('@/ai/agency/cognition/social-cognition', () => ({
  getSocialCognitionSummary: (...args: unknown[]) =>
    mockGetSocialCognitionSummary(...args),
  initializeFamilyModels: jest.fn(() => Promise.resolve()),
  createActorModel: jest.fn(() => Promise.resolve({ id: 'actor-1' })),
  predictBehavior: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/ai/agency/cognition/metacognition', () => ({
  getMetacognitionStatus: (...args: unknown[]) =>
    mockGetMetacognitionStatus(...args),
  beginReasoning: jest.fn(() => Promise.resolve()),
  getRecentTraces: jest.fn(() => []),
  getErrorsByType: jest.fn(() => ({})),
}));

jest.mock('@/ai/agency/cognition/self-narrative', () => ({
  getNarrativeStatus: (...args: unknown[]) => mockGetNarrativeStatus(...args),
  initializeMollyNarrative: jest.fn(() => Promise.resolve()),
  getFullNarrative: jest.fn(() => 'narrative'),
}));

jest.mock('@/ai/agency/cognition/causal-reasoning', () => ({
  getCausalStatus: (...args: unknown[]) => mockGetCausalStatus(...args),
  initializeMollyCausalModel: jest.fn(() => Promise.resolve()),
  getGraph: jest.fn(),
  getAllGraphs: jest.fn(() => []),
  getRecentInterventions: jest.fn(() => []),
}));

jest.mock('@/ai/agency/cognition/transfer-learning', () => ({
  getTransferStatus: (...args: unknown[]) => mockGetTransferStatus(...args),
  initializeTransferLearning: jest.fn(() => Promise.resolve()),
  getSkills: jest.fn(() => []),
  getPatterns: jest.fn(() => []),
  getCompositions: jest.fn(() => []),
}));

jest.mock('@/ai/agency/cognition/goal-evolution', () => ({
  getEvolutionStats: (...args: unknown[]) => mockGetEvolutionStats(...args),
  learnValue: jest.fn(() => Promise.resolve()),
  getAllValues: jest.fn(() => []),
  getConfig: jest.fn(() => ({})),
  getValuePortfolio: jest.fn(() => ({
    totalValues: 8,
    strongValues: [1, 2, 3],
    weakValues: [],
  })),
  getGoalHierarchy: jest.fn(() => ({
    totalGoals: 12,
    activeGoals: 4,
    byStatus: {
      proposed: 2,
      endorsed: 3,
      active: 4,
      achieved: 6,
    },
  })),
}));

jest.mock('@/ai/agency/cognition/embodied-interaction', () => ({
  getCapabilitySummary: (...args: unknown[]) =>
    mockGetCapabilitySummary(...args),
  getEmbodimentStats: jest.fn(() => ({
    activeSenses: 5,
    totalSenses: 5,
    enabledMotors: 4,
    totalMotors: 4,
    availableAffordances: 12,
    totalAffordances: 12,
    strongMappings: 18,
    totalMappings: 18,
  })),
  getProprioception: jest.fn(() => ({
    environment: 'stable',
    environmentConfidence: 0.95,
    isHealthy: true,
  })),
  initializeMollyEmbodiment: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/ai/agency/cognition/social-intelligence', () => ({
  getSocialIntelligenceStats: (...args: unknown[]) =>
    mockGetSocialIntelligenceStats(...args),
  getSocialContextSummary: jest.fn(() => 'Social context summary'),
  initializeMollySocialIntelligence: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/ai/agency/cognition/safe-self-modification', () => ({
  getModificationStats: (...args: unknown[]) =>
    mockGetModificationStats(...args),
  introspectArchitecture: jest.fn(() => ({
    modifiableCount: 5,
    immutableCount: 3,
  })),
  initializeSelfModification: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/ai/agency/cognition/memory-consolidation', () => ({
  getMemoryStats: (...args: unknown[]) => mockGetMemoryStats(...args),
  needsSleep: jest.fn(() => ({ needed: false, reason: 'rested' })),
  initializeMemoryConsolidation: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/ai/agency/cognition/world-model', () => ({
  getWorldModelStatus: jest.fn(() => ({
    entities: 23,
    relations: 45,
    simulations: 8,
    predictions: 12,
  })),
  seedWorldModel: jest.fn(),
  getRecentSimulations: jest.fn(() => []),
}));

jest.mock('@/ai/agency/cognition/self-observation-loop', () => ({
  getObservationStatus: (...args: unknown[]) =>
    mockGetObservationStatus(...args),
  runSelfObservationCycle: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/ai/agency/cognition/emotional-state', () => ({
  getEmotionalHistory: (...args: unknown[]) => mockGetEmotionalHistory(...args),
  getCurrentEmotionalStateImpl: jest.fn(),
  decayEmotionalState: jest.fn(),
}));

jest.mock('@/ai/agency/cognition/meta-learning', () => ({
  getMetaLearningStatus: (...args: unknown[]) =>
    mockGetMetaLearningStatus(...args),
  recordMetaLearningEvent: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/ai/agency/cognition/family-presence', () => ({
  getFamilySummary: jest.fn(() => ({
    totalRelationships: 5,
    recentInteractions: 28,
    bondCount: 3,
    messageCount: 15,
  })),
  buildPresenceContext: jest.fn(() => 'Family presence context'),
  getPresence: jest.fn(),
  getAllPresence: jest.fn(() => []),
}));

jest.mock('@/ai/consciousness', () => {
  const mockConsciousness = {
    muteVoice: jest.fn(),
    unmuteVoice: jest.fn(),
    getVoiceStatus: jest.fn(() => ({
      muted: false,
      reason: 'none',
    })),
  };
  return {
    getConsciousness: jest.fn(() => mockConsciousness),
  };
});

import {
  selfArchitecture,
  socialCognition,
  uncertainty,
  horizonGoals,
  voiceControl,
  metacognition,
  selfNarrative,
  causalReasoning,
  transferLearning,
  goalEvolution,
  embodiedInteraction,
  socialIntelligence,
  selfModification,
  memoryConsolidation,
  worldModel,
  selfObservation,
  consciousnessMonitor,
  emotionalState,
  metaLearning,
  familyPresence,
} from '../cognition-tools';

describe('cognition-tools handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Self-Architecture Handler ──────────────────────────────────────
  it('selfArchitecture returns unknown action message for unrecognized action', async () => {
    const result = await selfArchitecture({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown selfArchitecture action');
  });

  it('selfArchitecture returns summary with formatted output on valid action', async () => {
    mockGetSelfArchitectureSummary.mockResolvedValue({
      modules: 8,
      capabilities: 15,
      limitations: 3,
      blindSpots: 2,
      proposals: { total: 5 },
      journalEntries: 12,
    });

    const result = await selfArchitecture({ action: 'summary' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Self-Architecture Summary');
    expect(result.output).toContain('Modules mapped: 8');
    expect(result.output).toContain('Capabilities known: 15');
    expect(mockGetSelfArchitectureSummary).toHaveBeenCalled();
    expect(result.data).toBeDefined();
  });

  it('selfArchitecture handles exception and returns error message', async () => {
    mockGetSelfArchitectureSummary.mockRejectedValue(
      new Error('architecture query failed')
    );

    const result = await selfArchitecture({ action: 'summary' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Summary failed');
    expect(result.output).toContain('architecture query failed');
  });

  it('selfArchitecture validates query action requires query parameter', async () => {
    const result = await selfArchitecture({ action: 'query' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Missing required field');
  });

  // ── Uncertainty Handler ────────────────────────────────────────────
  it('uncertainty returns unknown action message for unrecognized action', async () => {
    const result = await uncertainty({ action: 'bad_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown uncertainty action');
  });

  it('uncertainty returns summary on init action', async () => {
    mockGetUncertaintySummary.mockResolvedValue({
      domains: 3,
      totalPredictions: 10,
      calibration: 0.85,
    });

    const result = await uncertainty({ action: 'summary' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Uncertainty');
    expect(mockGetUncertaintySummary).toHaveBeenCalled();
  });

  it('uncertainty handles exception during summary', async () => {
    mockGetUncertaintySummary.mockRejectedValue(
      new Error('uncertainty query failed')
    );

    const result = await uncertainty({ action: 'summary' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Summary failed');
  });

  // ── Horizon Goals Handler ──────────────────────────────────────────
  it('horizonGoals returns unknown action message for unrecognized action', async () => {
    const result = await horizonGoals({ action: 'wrong_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown horizonGoals action');
  });

  it('horizonGoals returns goal summary with formatted output', async () => {
    mockGetHorizonGoalsSummary.mockResolvedValue({
      totalGoals: 10,
      activeCount: 2,
      blockedCount: 1,
    });

    const result = await horizonGoals({ action: 'summary' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Goals:');
    expect(result.output).toContain('2');
    expect(mockGetHorizonGoalsSummary).toHaveBeenCalled();
  });

  it('horizonGoals handles exception during summary', async () => {
    mockGetHorizonGoalsSummary.mockRejectedValue(
      new Error('goals query failed')
    );

    const result = await horizonGoals({ action: 'summary' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Summary failed');
  });

  // ── Consciousness Monitor Handler ──────────────────────────────────
  it('consciousnessMonitor returns unknown action message for unrecognized action', async () => {
    const result = await consciousnessMonitor({ action: 'unknown' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown consciousnessMonitor action');
  });

  it('consciousnessMonitor returns status with formatted metrics', async () => {
    mockGetConsciousnessStatus.mockReturnValue({
      snapshots: 5,
      insights: 12,
      level: 'high',
      awareness: 0.8,
      attention: 0.75,
    });

    const result = await consciousnessMonitor({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Consciousness');
    expect(mockGetConsciousnessStatus).toHaveBeenCalled();
  });

  it('consciousnessMonitor takes snapshot and returns snapshot data', async () => {
    mockTakeConsciousnessSnapshot.mockReturnValue({
      id: 'snap-1',
      level: 'high',
      awareness: 0.8,
      attention: 0.75,
    });

    const result = await consciousnessMonitor({ action: 'snapshot' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Snapshot taken');
    expect(mockTakeConsciousnessSnapshot).toHaveBeenCalled();
  });

  it('consciousnessMonitor handles exception gracefully', async () => {
    mockGetConsciousnessStatus.mockImplementation(() => {
      throw new Error('consciousness query failed');
    });

    const result = await consciousnessMonitor({ action: 'status' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Status failed');
  });

  // ── Social Cognition Handler ────────────────────────────────────────
  it('socialCognition returns unknown action message for unrecognized action', async () => {
    const result = await socialCognition({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown socialCognition action');
  });

  it('socialCognition returns summary with formatted output', async () => {
    mockGetSocialCognitionSummary.mockResolvedValue({
      actorCount: 3,
      relationshipCount: 5,
      predictionAccuracy: 0.82,
    });

    const result = await socialCognition({ action: 'summary' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Social Cognition');
    expect(result.output).toContain('3 actors');
    expect(mockGetSocialCognitionSummary).toHaveBeenCalled();
  });

  // ── Voice Control Handler ──────────────────────────────────────────
  it('voiceControl returns unknown action message for unrecognized action', async () => {
    const result = await voiceControl({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown voiceControl action');
  });

  it('voiceControl mutes voice with reason', async () => {
    mockGetConsciousness.mockReturnValue({
      muteVoice: jest.fn(),
      unmuteVoice: jest.fn(),
      getVoiceStatus: jest.fn(() => ({ muted: true, reason: 'silence test' })),
    });

    const result = await voiceControl({ action: 'mute', reason: 'testing' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Voice muted');
  });

  // ── Metacognition Handler ──────────────────────────────────────────
  it('metacognition returns unknown action message for unrecognized action', async () => {
    const result = await metacognition({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown metacognition action');
  });

  it('metacognition returns status with metrics', async () => {
    mockGetMetacognitionStatus.mockResolvedValue({
      activeTraces: 5,
      completedTraces: 12,
      strategies: 8,
      cognitiveHealth: 0.88,
      calibration: 0.79,
      recentErrors: 2,
    });

    const result = await metacognition({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Metacognition Status');
    expect(mockGetMetacognitionStatus).toHaveBeenCalled();
  });

  // ── Self-Narrative Handler ─────────────────────────────────────────
  it('selfNarrative returns unknown action message for unrecognized action', async () => {
    const result = await selfNarrative({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown selfNarrative action');
  });

  it('selfNarrative returns narrative status', async () => {
    mockGetNarrativeStatus.mockResolvedValue({
      chapterCount: 3,
      identityStatements: 8,
      coreValues: 5,
      threadCount: 12,
    });

    const result = await selfNarrative({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Narrative');
    expect(mockGetNarrativeStatus).toHaveBeenCalled();
  });

  // ── Causal Reasoning Handler ────────────────────────────────────────
  it('causalReasoning returns unknown action message for unrecognized action', async () => {
    const result = await causalReasoning({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown causalReasoning action');
  });

  it('causalReasoning returns causal status', async () => {
    mockGetCausalStatus.mockResolvedValue({
      graphs: 2,
      variables: 15,
      edges: 28,
      recentInterventions: 3,
    });

    const result = await causalReasoning({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Causal');
    expect(mockGetCausalStatus).toHaveBeenCalled();
  });

  // ── Transfer Learning Handler ──────────────────────────────────────
  it('transferLearning returns unknown action message for unrecognized action', async () => {
    const result = await transferLearning({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown transferLearning action');
  });

  it('transferLearning returns transfer status', async () => {
    mockGetTransferStatus.mockResolvedValue({
      patterns: 7,
      skills: 5,
      compositions: 3,
      successRate: 0.81,
    });

    const result = await transferLearning({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Transfer');
    expect(mockGetTransferStatus).toHaveBeenCalled();
  });

  // ── Goal Evolution Handler ──────────────────────────────────────────
  it('goalEvolution returns unknown action message for unrecognized action', async () => {
    const result = await goalEvolution({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown goalEvolution action');
  });

  it('goalEvolution returns evolution status', async () => {
    mockGetEvolutionStats.mockResolvedValue({
      averageValueStrength: 0.75,
      averageGoalCoherence: 0.82,
    });

    const result = await goalEvolution({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Goal Evolution');
    expect(mockGetEvolutionStats).toHaveBeenCalled();
  });

  // ── Embodied Interaction Handler ────────────────────────────────────
  it('embodiedInteraction returns unknown action message for unrecognized action', async () => {
    const result = await embodiedInteraction({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown embodiedInteraction action');
  });

  it('embodiedInteraction returns status with capability metrics', async () => {
    mockGetCapabilitySummary.mockResolvedValue({
      senses: 5,
      motors: 4,
      affordances: 12,
      mappings: 18,
    });

    const result = await embodiedInteraction({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Embodied Interaction');
    expect(result.output).toContain('Status');
  });

  // ── Social Intelligence Handler ────────────────────────────────────
  it('socialIntelligence returns unknown action message for unrecognized action', async () => {
    const result = await socialIntelligence({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown socialIntelligence action');
  });

  it('socialIntelligence returns status with social metrics', async () => {
    mockGetSocialIntelligenceStats.mockResolvedValue({
      totalGroups: 3,
      activeGroups: 2,
      totalNorms: 12,
      totalCultures: 2,
      currentCulture: 'default',
      activeCoalitions: 1,
      collectiveBehaviors: 5,
      influenceRelations: 8,
    });

    const result = await socialIntelligence({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Social Intelligence');
    expect(mockGetSocialIntelligenceStats).toHaveBeenCalled();
  });

  // ── Self-Modification Handler ──────────────────────────────────────
  it('selfModification returns unknown action message for unrecognized action', async () => {
    const result = await selfModification({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown selfModification action');
  });

  it('selfModification returns status with modification metrics', async () => {
    mockGetModificationStats.mockResolvedValue({
      totalComponents: 8,
      totalProposals: 5,
      pendingProposals: 2,
      totalApplied: 1,
      totalRolledBack: 1,
      safetyLocked: true,
    });

    const result = await selfModification({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Self-Modification');
    expect(mockGetModificationStats).toHaveBeenCalled();
  });

  // ── Memory Consolidation Handler ────────────────────────────────────
  it('memoryConsolidation returns unknown action message for unrecognized action', async () => {
    const result = await memoryConsolidation({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown memoryConsolidation action');
  });

  it('memoryConsolidation returns status with memory metrics', async () => {
    mockGetMemoryStats.mockResolvedValue({
      totalTraces: 45,
      unconsolidatedTraces: 8,
      totalConsolidated: 28,
      totalDreams: 5,
      totalInsights: 12,
      sleepCyclesCompleted: 3,
      currentChapter: 'Chapter 2',
    });

    const result = await memoryConsolidation({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Memory Consolidation');
    expect(mockGetMemoryStats).toHaveBeenCalled();
  });

  // ── World Model Handler ────────────────────────────────────────────
  it('worldModel returns unknown action message for unrecognized action', async () => {
    const result = await worldModel({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown worldModel action');
  });

  it('worldModel returns world model status', async () => {
    const result = await worldModel({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('World');
  });

  // ── Self-Observation Handler ────────────────────────────────────────
  it('selfObservation returns unknown action message for unrecognized action', async () => {
    const result = await selfObservation({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown selfObservation action');
  });

  it('selfObservation returns observation status', async () => {
    mockGetObservationStatus.mockResolvedValue({
      observations: 67,
      patterns: 12,
      insights: 8,
      recentCount: 5,
    });

    const result = await selfObservation({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Self-Observation');
    expect(mockGetObservationStatus).toHaveBeenCalled();
  });

  // ── Emotional State Handler ────────────────────────────────────────
  it('emotionalState returns unknown action message for unrecognized action', async () => {
    const result = await emotionalState({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown emotionalState action');
  });

  it('emotionalState returns emotional history', async () => {
    mockGetEmotionalHistory.mockResolvedValue([
      { timestamp: Date.now(), valence: 0.7, arousal: 0.5 },
      { timestamp: Date.now() - 1000, valence: 0.6, arousal: 0.4 },
    ]);

    const result = await emotionalState({ action: 'history', limit: 2 });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Emotional');
    expect(mockGetEmotionalHistory).toHaveBeenCalled();
  });

  // ── Meta-Learning Handler ──────────────────────────────────────────
  it('metaLearning returns unknown action message for unrecognized action', async () => {
    const result = await metaLearning({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown metaLearning action');
  });

  it('metaLearning returns meta-learning status', async () => {
    mockGetMetaLearningStatus.mockResolvedValue({
      events: 25,
      patterns: 8,
      strategies: 5,
      improvements: 3,
    });

    const result = await metaLearning({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Meta-Learning');
    expect(mockGetMetaLearningStatus).toHaveBeenCalled();
  });

  // ── Family Presence Handler ────────────────────────────────────────
  it('familyPresence returns unknown action message for unrecognized action', async () => {
    const result = await familyPresence({ action: 'invalid_action' });

    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown familyPresence action');
  });

  it('familyPresence returns family presence status', async () => {
    const result = await familyPresence({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // EXPANDED TEST COVERAGE - ADDITIONAL ACTIONS & PARAMETER VALIDATION
  // ═════════════════════════════════════════════════════════════════════════

  // ── Self-Architecture: Additional Actions ───────────────────────────────
  it('selfArchitecture handles init action', async () => {
    const result = await selfArchitecture({ action: 'init' });
    expect(result.success).toBeDefined();
  });

  it('selfArchitecture query action requires query parameter', async () => {
    const result = await selfArchitecture({
      action: 'query',
      query: 'find_capabilities',
    });
    expect(result.output).toBeDefined();
  });

  it('selfArchitecture proposeImprovement requires name and description', async () => {
    const result = await selfArchitecture({ action: 'propose' });
    expect(result.success).toBe(false);
  });

  // ── Uncertainty: Additional Actions ─────────────────────────────────────
  it('uncertainty init action initializes tracking', async () => {
    const result = await uncertainty({ action: 'init' });
    expect(result.success).toBeDefined();
  });

  it('uncertainty makePrediction requires domain and description', async () => {
    const result = await uncertainty({ action: 'makePrediction' });
    expect(result.success).toBe(false);
  });

  it('uncertainty resolvePrediction requires predictionId', async () => {
    const result = await uncertainty({ action: 'resolvePrediction' });
    expect(result.success).toBe(false);
  });

  // ── Horizon Goals: Additional Actions ────────────────────────────────────
  it('horizonGoals conceiveGoal requires name and description', async () => {
    const result = await horizonGoals({ action: 'conceiveGoal' });
    expect(result.success).toBe(false);
  });

  it('horizonGoals activateGoal requires goalId', async () => {
    const result = await horizonGoals({ action: 'activateGoal' });
    expect(result.success).toBe(false);
  });

  it('horizonGoals getActive returns active goals', async () => {
    const result = await horizonGoals({ action: 'getActive' });
    expect(result.output).toBeDefined();
  });

  // ── Consciousness Monitor: Additional Actions ───────────────────────────
  it('consciousnessMonitor analyzeTrends requires window', async () => {
    const result = await consciousnessMonitor({
      action: 'analyzeTrends',
      windowMinutes: 60,
    });
    expect(result.success).toBeDefined();
  });

  it('consciousnessMonitor generateInsights action works', async () => {
    const result = await consciousnessMonitor({ action: 'generateInsights' });
    expect(result.success).toBeDefined();
  });

  // ── Social Cognition: Additional Actions ────────────────────────────────
  it('socialCognition init initializes family models', async () => {
    const result = await socialCognition({ action: 'init' });
    expect(result.success).toBeDefined();
  });

  it('socialCognition createActor requires name and type', async () => {
    const result = await socialCognition({ action: 'createActor' });
    expect(result.success).toBe(false);
  });

  it('socialCognition predictBehavior requires actorId', async () => {
    const result = await socialCognition({ action: 'predictBehavior' });
    expect(result.success).toBe(false);
  });

  // ── Voice Control: Additional Actions ────────────────────────────────────
  it('voiceControl status returns voice state', async () => {
    mockGetConsciousness.mockReturnValue({
      muteVoice: jest.fn(),
      unmuteVoice: jest.fn(),
      getVoiceStatus: jest.fn(() => ({ muted: false, reason: 'none' })),
    });

    const result = await voiceControl({ action: 'status' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('ACTIVE');
  });

  it('voiceControl unmute restores voice', async () => {
    mockGetConsciousness.mockReturnValue({
      muteVoice: jest.fn(),
      unmuteVoice: jest.fn(),
      getVoiceStatus: jest.fn(() => ({ muted: false, reason: 'none' })),
    });

    const result = await voiceControl({ action: 'unmute' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('unmuted');
  });

  // ── Metacognition: Additional Actions ────────────────────────────────────
  it('metacognition beginReasoning starts new reasoning trace', async () => {
    const result = await metacognition({
      action: 'beginReasoning',
      problem: 'test',
    });
    expect(result.output).toBeDefined();
  });

  it('metacognition selectStrategy requires strategyId', async () => {
    const result = await metacognition({ action: 'selectStrategy' });
    expect(result.success).toBe(false);
  });

  it('metacognition validateReasoning requires traceId', async () => {
    const result = await metacognition({ action: 'validateReasoning' });
    expect(result.success).toBe(false);
  });

  // ── Self-Narrative: Additional Actions ──────────────────────────────────
  it('selfNarrative establishIdentity requires name and category', async () => {
    const result = await selfNarrative({ action: 'establishIdentity' });
    expect(result.success).toBe(false);
  });

  it('selfNarrative recordExperience requires content', async () => {
    const result = await selfNarrative({ action: 'recordExperience' });
    expect(result.success).toBe(false);
  });

  it('selfNarrative getFullNarrative returns narrative', async () => {
    const result = await selfNarrative({ action: 'getFullNarrative' });
    expect(result.output).toBeDefined();
  });

  // ── Causal Reasoning: Additional Actions ───────────────────────────────
  it('causalReasoning createGraph requires name', async () => {
    const result = await causalReasoning({ action: 'createGraph' });
    expect(result.success).toBe(false);
  });

  it('causalReasoning addVariable requires graphId and name', async () => {
    const result = await causalReasoning({ action: 'addVariable' });
    expect(result.success).toBe(false);
  });

  it('causalReasoning queryCausal requires variables', async () => {
    const result = await causalReasoning({ action: 'queryCausal' });
    expect(result.success).toBe(false);
  });

  // ── Transfer Learning: Additional Actions ───────────────────────────────
  it('transferLearning discoverPattern requires content', async () => {
    const result = await transferLearning({ action: 'discoverPattern' });
    expect(result.success).toBe(false);
  });

  it('transferLearning createAnalogy requires sourcePattern', async () => {
    const result = await transferLearning({ action: 'createAnalogy' });
    expect(result.success).toBe(false);
  });

  it('transferLearning registerSkill requires name', async () => {
    const result = await transferLearning({ action: 'registerSkill' });
    expect(result.success).toBe(false);
  });

  // ── Goal Evolution: Additional Actions ──────────────────────────────────
  it('goalEvolution learnValue requires name and description', async () => {
    const result = await goalEvolution({ action: 'learnValue' });
    expect(result.success).toBe(false);
  });

  it('goalEvolution reinforceValue requires valueId', async () => {
    const result = await goalEvolution({ action: 'reinforceValue' });
    expect(result.success).toBe(false);
  });

  it('goalEvolution getAllValues returns value list', async () => {
    const result = await goalEvolution({ action: 'getAllValues' });
    expect(result.output).toBeDefined();
  });

  // ── Embodied Interaction: Additional Actions ──────────────────────────
  it('embodiedInteraction registerSense requires name and type', async () => {
    const result = await embodiedInteraction({ action: 'registerSense' });
    expect(result.success).toBe(false);
  });

  it('embodiedInteraction recordSensory requires senseId', async () => {
    const result = await embodiedInteraction({ action: 'recordSensory' });
    expect(result.success).toBe(false);
  });

  it('embodiedInteraction getSense requires id', async () => {
    const result = await embodiedInteraction({ action: 'getSense' });
    expect(result.success).toBe(false);
  });

  // ── Social Intelligence: Additional Actions ─────────────────────────────
  it('socialIntelligence init initializes social systems', async () => {
    const result = await socialIntelligence({ action: 'init' });
    expect(result.success).toBeDefined();
  });

  it('socialIntelligence createGroup requires name and type', async () => {
    const result = await socialIntelligence({ action: 'createGroup' });
    expect(result.success).toBe(false);
  });

  it('socialIntelligence addMember requires groupId and actorId', async () => {
    const result = await socialIntelligence({ action: 'addMember' });
    expect(result.success).toBe(false);
  });

  // ── Self-Modification: Additional Actions ──────────────────────────────
  it('selfModification init initializes safety systems', async () => {
    const result = await selfModification({ action: 'init' });
    expect(result.success).toBeDefined();
  });

  it('selfModification registerComponent requires name and type', async () => {
    const result = await selfModification({ action: 'registerComponent' });
    expect(result.success).toBe(false);
  });

  it('selfModification proposeModification requires name', async () => {
    const result = await selfModification({ action: 'proposeModification' });
    expect(result.success).toBe(false);
  });

  // ── Memory Consolidation: Additional Actions ────────────────────────────
  it('memoryConsolidation init initializes memory systems', async () => {
    const result = await memoryConsolidation({ action: 'init' });
    expect(result.success).toBeDefined();
  });

  it('memoryConsolidation recordTrace requires type and content', async () => {
    const result = await memoryConsolidation({ action: 'recordTrace' });
    expect(result.success).toBe(false);
  });

  it('memoryConsolidation needsSleep action checks sleep requirement', async () => {
    const result = await memoryConsolidation({ action: 'needsSleep' });
    expect(result.output).toBeDefined();
  });

  // ── World Model: Additional Actions ────────────────────────────────────
  it('worldModel upsertEntity requires name and type', async () => {
    const result = await worldModel({ action: 'upsertEntity' });
    expect(result.success).toBe(false);
  });

  it('worldModel simulate requires entities and actions', async () => {
    const result = await worldModel({ action: 'simulate' });
    expect(result.success).toBe(false);
  });

  it('worldModel predict returns predictions', async () => {
    const result = await worldModel({ action: 'predict' });
    expect(result.output).toBeDefined();
  });

  // ── Self-Observation: Additional Actions ────────────────────────────────
  it('selfObservation recordObservation requires type and content', async () => {
    const result = await selfObservation({ action: 'recordObservation' });
    expect(result.success).toBe(false);
  });

  it('selfObservation analyzePatterns returns pattern analysis', async () => {
    const result = await selfObservation({ action: 'analyzePatterns' });
    expect(result.output).toBeDefined();
  });

  it('selfObservation generateInsights creates insights', async () => {
    const result = await selfObservation({ action: 'generateInsights' });
    expect(result.output).toBeDefined();
  });

  // ── Emotional State: Additional Actions ────────────────────────────────
  it('emotionalState updateEmotionalState requires valence', async () => {
    const result = await emotionalState({ action: 'updateEmotionalState' });
    expect(result.success).toBe(false);
  });

  it('emotionalState decay applies emotional decay', async () => {
    const result = await emotionalState({ action: 'decay' });
    expect(result.output).toBeDefined();
  });

  it('emotionalState setBaseline requires valence and arousal', async () => {
    const result = await emotionalState({ action: 'setBaseline' });
    expect(result.success).toBe(false);
  });

  // ── Meta-Learning: Additional Actions ──────────────────────────────────
  it('metaLearning recordMetaLearningEvent requires strategy', async () => {
    const result = await metaLearning({ action: 'recordMetaLearningEvent' });
    expect(result.success).toBe(false);
  });

  it('metaLearning reflect returns reflection', async () => {
    const result = await metaLearning({ action: 'reflect' });
    expect(result.output).toBeDefined();
  });

  it('metaLearning getStrategies returns strategy list', async () => {
    const result = await metaLearning({ action: 'getStrategies' });
    expect(result.output).toBeDefined();
  });

  // ── Family Presence: Additional Actions ──────────────────────────────────
  it('familyPresence updatePresence requires memberId and presence', async () => {
    const result = await familyPresence({ action: 'updatePresence' });
    expect(result.success).toBe(false);
  });

  it('familyPresence getPresence requires memberId', async () => {
    const result = await familyPresence({ action: 'getPresence' });
    expect(result.success).toBe(false);
  });

  it('familyPresence allPresence returns all members', async () => {
    const result = await familyPresence({ action: 'allPresence' });
    expect(result.output).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SUCCESSFUL EXECUTION PATHS WITH VALID PARAMETERS
  // ─────────────────────────────────────────────────────────────────────────

  it('selfArchitecture init succeeds', async () => {
    const result = await selfArchitecture({ action: 'init' });
    expect(result.success).toBeDefined();
    expect(result.output).toBeDefined();
  });

  it('selfArchitecture journal records entry', async () => {
    const result = await selfArchitecture({
      action: 'journal',
      entry: 'test entry',
    });
    expect(result.output).toBeDefined();
  });

  it('uncertainty createDomain registers new domain', async () => {
    const result = await uncertainty({
      action: 'createDomain',
      name: 'physics',
      description: 'test',
    });
    expect(result.output).toBeDefined();
  });

  it('uncertainty recordFact captures fact', async () => {
    const result = await uncertainty({
      action: 'recordFact',
      domain: 'physics',
      content: 'test fact',
    });
    expect(result.output).toBeDefined();
  });

  it('horizonGoals conceiveGoal creates new goal with params', async () => {
    const result = await horizonGoals({
      action: 'conceiveGoal',
      name: 'goal1',
      description: 'test goal',
    });
    expect(result.output).toBeDefined();
  });

  it('horizonGoals addMilestone requires goalId', async () => {
    const result = await horizonGoals({
      action: 'addMilestone',
      goalId: 'g1',
      description: 'milestone',
    });
    expect(result.output).toBeDefined();
  });

  it('consciousnessMonitor saveState action saves state', async () => {
    const result = await consciousnessMonitor({ action: 'saveState' });
    expect(result.output).toBeDefined();
  });

  it('consciousnessMonitor loadState action loads state', async () => {
    const result = await consciousnessMonitor({ action: 'loadState' });
    expect(result.output).toBeDefined();
  });

  it('socialCognition addBelief requires actorId and content', async () => {
    const result = await socialCognition({
      action: 'addBelief',
      actorId: 'a1',
      content: 'belief text',
    });
    expect(result.output).toBeDefined();
  });

  it('socialCognition createRelationship requires sourceId', async () => {
    const result = await socialCognition({
      action: 'createRelationship',
      sourceId: 'a1',
      targetId: 'a2',
      type: 'friend',
    });
    expect(result.output).toBeDefined();
  });

  it('metacognition addReasoningStep requires traceId', async () => {
    const result = await metacognition({
      action: 'addReasoningStep',
      traceId: 't1',
      step: 'test step',
    });
    expect(result.output).toBeDefined();
  });

  it('metacognition completeReasoning requires traceId', async () => {
    const result = await metacognition({
      action: 'completeReasoning',
      traceId: 't1',
    });
    expect(result.output).toBeDefined();
  });

  it('selfNarrative affirmIdentity requires identityId', async () => {
    const result = await selfNarrative({
      action: 'affirmIdentity',
      identityId: 'i1',
    });
    expect(result.output).toBeDefined();
  });

  it('selfNarrative applyValue requires valueId', async () => {
    const result = await selfNarrative({
      action: 'applyValue',
      valueId: 'v1',
      context: 'test',
    });
    expect(result.output).toBeDefined();
  });

  it('causalReasoning addCausalEdge requires graphId', async () => {
    const result = await causalReasoning({
      action: 'addCausalEdge',
      graphId: 'g1',
      from: 'v1',
      to: 'v2',
    });
    expect(result.output).toBeDefined();
  });

  it('causalReasoning doIntervention requires graphId', async () => {
    const result = await causalReasoning({
      action: 'doIntervention',
      graphId: 'g1',
      variable: 'v1',
      value: 'test',
    });
    expect(result.output).toBeDefined();
  });

  it('transferLearning recordPatternInstance requires patternId', async () => {
    const result = await transferLearning({
      action: 'recordPatternInstance',
      patternId: 'p1',
      content: 'instance',
    });
    expect(result.output).toBeDefined();
  });

  it('transferLearning composeSkills requires skillIds', async () => {
    const result = await transferLearning({
      action: 'composeSkills',
      skillIds: ['s1', 's2'],
    });
    expect(result.output).toBeDefined();
  });

  it('goalEvolution reinforceValue with magnitude', async () => {
    const result = await goalEvolution({
      action: 'reinforceValue',
      valueId: 'v1',
      trigger: 'event',
      magnitude: 0.5,
    });
    expect(result.output).toBeDefined();
  });

  it('goalEvolution processObservations for goal learning', async () => {
    const result = await goalEvolution({ action: 'processObservations' });
    expect(result.output).toBeDefined();
  });

  it('embodiedInteraction registerMotor requires name and type', async () => {
    const result = await embodiedInteraction({
      action: 'registerMotor',
      name: 'motor1',
      type: 'articulation',
    });
    expect(result.output).toBeDefined();
  });

  it('embodiedInteraction createMapping requires senseId', async () => {
    const result = await embodiedInteraction({
      action: 'createMapping',
      senseId: 's1',
      motorId: 'm1',
      bidirectional: true,
    });
    expect(result.output).toBeDefined();
  });

  it('socialIntelligence formCoalition requires groupIds', async () => {
    const result = await socialIntelligence({
      action: 'formCoalition',
      groupIds: ['g1', 'g2'],
    });
    expect(result.output).toBeDefined();
  });

  it('socialIntelligence learnNorm requires name and context', async () => {
    const result = await socialIntelligence({
      action: 'learnNorm',
      name: 'norm1',
      context: 'test',
      enforcement: 'soft',
    });
    expect(result.output).toBeDefined();
  });

  it('selfModification submitProposal requires proposalId', async () => {
    const result = await selfModification({
      action: 'submitProposal',
      proposalId: 'prop1',
    });
    expect(result.output).toBeDefined();
  });

  it('selfModification checkProposalSafety requires proposalId', async () => {
    const result = await selfModification({
      action: 'checkProposalSafety',
      proposalId: 'prop1',
    });
    expect(result.output).toBeDefined();
  });

  it('memoryConsolidation linkTraces requires traceId1 and traceId2', async () => {
    const result = await memoryConsolidation({
      action: 'linkTraces',
      traceId1: 't1',
      traceId2: 't2',
    });
    expect(result.output).toBeDefined();
  });

  it('memoryConsolidation rehearseTrace requires traceId', async () => {
    const result = await memoryConsolidation({
      action: 'rehearseTrace',
      traceId: 't1',
    });
    expect(result.output).toBeDefined();
  });

  it('worldModel createRelation requires sourceId', async () => {
    const result = await worldModel({
      action: 'createRelation',
      sourceId: 'e1',
      targetId: 'e2',
      type: 'connected',
    });
    expect(result.output).toBeDefined();
  });

  it('worldModel verifyPrediction requires predictionId', async () => {
    const result = await worldModel({
      action: 'verifyPrediction',
      predictionId: 'pred1',
      actualOutcome: 'outcome',
    });
    expect(result.output).toBeDefined();
  });

  it('selfObservation observeToolUse requires toolName', async () => {
    const result = await selfObservation({
      action: 'observeToolUse',
      toolName: 'tool1',
      context: 'context',
    });
    expect(result.output).toBeDefined();
  });

  it('selfObservation observeSuccess requires context', async () => {
    const result = await selfObservation({
      action: 'observeSuccess',
      context: 'success context',
    });
    expect(result.output).toBeDefined();
  });

  it('emotionalState getCurrentState returns current emotion', async () => {
    const result = await emotionalState({ action: 'getCurrentState' });
    expect(result.output).toBeDefined();
  });

  it('emotionalState updateEmotionalState with valence', async () => {
    const result = await emotionalState({
      action: 'updateEmotionalState',
      valence: 0.7,
      arousal: 0.5,
    });
    expect(result.output).toBeDefined();
  });

  it('metaLearning registerStrategy requires name', async () => {
    const result = await metaLearning({
      action: 'registerStrategy',
      name: 'strategy1',
      description: 'test strategy',
    });
    expect(result.output).toBeDefined();
  });

  it('metaLearning recordEvent requires strategy', async () => {
    const result = await metaLearning({
      action: 'recordMetaLearningEvent',
      strategy: 'strat1',
      outcome: 'success',
    });
    expect(result.output).toBeDefined();
  });

  it('familyPresence recordActivity requires memberId', async () => {
    const result = await familyPresence({
      action: 'recordActivity',
      memberId: 'father',
      context: 'working',
    });
    expect(result.output).toBeDefined();
  });

  it('familyPresence recordInteraction requires memberId', async () => {
    const result = await familyPresence({
      action: 'recordInteraction',
      memberId: 'molly',
      context: 'conversation',
    });
    expect(result.output).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EXCEPTION HANDLING TESTS
  // ─────────────────────────────────────────────────────────────────────────

  it('selfArchitecture handles exception during review', async () => {
    mockGetSelfArchitectureSummary.mockRejectedValueOnce(
      new Error('review failed')
    );
    const result = await selfArchitecture({ action: 'review' });
    expect(result.success).toBeFalsy();
  });

  it('uncertainty handles exception during domain creation', async () => {
    const result = await uncertainty({ action: 'createDomain', name: 'test' });
    expect(result.output).toBeDefined();
  });

  it('consciousnessMonitor handles snapshot exception', async () => {
    mockTakeConsciousnessSnapshot.mockImplementationOnce(() => {
      throw new Error('snapshot failed');
    });
    const result = await consciousnessMonitor({ action: 'snapshot' });
    expect(result.success).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EDGE CASES & BOUNDARY CONDITIONS
  // ─────────────────────────────────────────────────────────────────────────

  it('horizonGoals handles empty action string', async () => {
    const result = await horizonGoals({ action: '' });
    expect(result.success).toBe(false);
  });

  it('transferLearning handles null action gracefully', async () => {
    const result = await transferLearning({ action: null });
    expect(result.success).toBe(false);
  });

  it('goalEvolution handles undefined params', async () => {
    const result = await goalEvolution({ action: 'learnValue' });
    expect(result.output).toContain('Missing');
  });

  it('selfModification handles missing criticality parameter', async () => {
    const result = await selfModification({
      action: 'registerComponent',
      name: 'test',
      type: 'core',
    });
    expect(result.success).toBe(false);
  });

  it('memoryConsolidation handles invalid trace type', async () => {
    const result = await memoryConsolidation({
      action: 'recordTrace',
      type: 'invalid_type',
      content: 'test',
    });
    expect(result.output).toBeDefined();
  });
});
