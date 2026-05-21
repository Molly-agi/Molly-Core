const mockLoadCuriosityState = jest.fn();
const mockGetCuriosityStatus = jest.fn();
const mockGenerateQuestion = jest.fn();
const mockSelectNextQuestion = jest.fn();
const mockRunCuriosityCycle = jest.fn();

const mockLoadPlanningState = jest.fn();
const mockSavePlanningState = jest.fn();
const mockGetPlanningStatus = jest.fn();
const mockCreateGoal = jest.fn();
const mockGetGoal = jest.fn();
const mockGetActiveGoals = jest.fn();
const mockGetGoalsByCategory = jest.fn();
const mockGenerateProgressSummary = jest.fn();

const mockLoadPredictiveState = jest.fn();
const mockGetPredictiveStatus = jest.fn();
const mockGenerateSuggestions = jest.fn();
const mockForecastContext = jest.fn();
const mockGetActivePatterns = jest.fn();

const mockLoadCounterfactualState = jest.fn();
const mockGetCounterfactualSummary = jest.fn();
const mockRecordDecisionPoint = jest.fn();
const mockGenerateCounterfactual = jest.fn();
const mockGetDecisionsByDomain = jest.fn();
const mockGetEstablishedWisdom = jest.fn();

const mockLoadTrajectoryState = jest.fn();
const mockGetTrajectoryStatus = jest.fn();
const mockMakePrediction = jest.fn();
const mockVerifyTrajectoryPrediction = jest.fn();
const mockForecastTrajectory = jest.fn();
const mockGetConsciousnessPerformanceInsights = jest.fn();

const mockRunAutonomousCycle = jest.fn();

jest.mock('@/ai/agency/planning/curiosity-engine', () => ({
  generateQuestion: (...args: unknown[]) => mockGenerateQuestion(...args),
  selectNextQuestion: (...args: unknown[]) => mockSelectNextQuestion(...args),
  deferQuestion: jest.fn(),
  beginInvestigation: jest.fn(),
  recordInvestigationStep: jest.fn(),
  completeInvestigation: jest.fn(),
  abandonInvestigation: jest.fn(),
  curiousFromMemory: jest.fn(() => []),
  curiousFromFailure: jest.fn(() => []),
  curiousFromConversation: jest.fn(() => []),
  curiousAboutSelf: jest.fn(() => []),
  getCuriosityStatus: (...args: unknown[]) => mockGetCuriosityStatus(...args),
  getActiveQuestions: jest.fn(() => []),
  getQuestionById: jest.fn(),
  runCuriosityCycle: (...args: unknown[]) => mockRunCuriosityCycle(...args),
  loadCuriosityState: (...args: unknown[]) => mockLoadCuriosityState(...args),
}));

jest.mock('@/ai/agency/planning/long-horizon-planning', () => ({
  createGoal: (...args: unknown[]) => mockCreateGoal(...args),
  getGoal: (...args: unknown[]) => mockGetGoal(...args),
  getActiveGoals: (...args: unknown[]) => mockGetActiveGoals(...args),
  getGoalsByCategory: (...args: unknown[]) => mockGetGoalsByCategory(...args),
  updateGoalStatus: jest.fn(),
  updateGoalPriority: jest.fn(),
  addMilestone: jest.fn(),
  decomposeMilestones: jest.fn(async () => []),
  completeMilestone: jest.fn(),
  startMilestone: jest.fn(() => true),
  getOverdueGoals: jest.fn(() => []),
  setDeadline: jest.fn(),
  reflect: jest.fn(() => ({ id: 'r1' })),
  generateProgressSummary: (...args: unknown[]) =>
    mockGenerateProgressSummary(...args),
  getPlanningStatus: (...args: unknown[]) => mockGetPlanningStatus(...args),
  savePlanningState: (...args: unknown[]) => mockSavePlanningState(...args),
  loadPlanningState: (...args: unknown[]) => mockLoadPlanningState(...args),
}));

jest.mock('@/ai/agency/planning/predictive-intelligence', () => ({
  recordInteraction: jest.fn(),
  detectPatterns: jest.fn(() => [{ name: 'night-checkin' }]),
  predictNeeds: jest.fn(() => [{ need: 'rest', probability: 0.7 }]),
  generateSuggestions: (...args: unknown[]) => mockGenerateSuggestions(...args),
  getSuggestionsToSurface: jest.fn(() => [{ suggestion: 'hydrate' }]),
  markSuggestionDelivered: jest.fn(),
  verifyPrediction: jest.fn(),
  forecastContext: (...args: unknown[]) => mockForecastContext(...args),
  getPredictiveStatus: (...args: unknown[]) => mockGetPredictiveStatus(...args),
  getActivePatterns: (...args: unknown[]) => mockGetActivePatterns(...args),
  loadPredictiveState: (...args: unknown[]) => mockLoadPredictiveState(...args),
}));

jest.mock('@/ai/agency/planning/counterfactual-engine', () => ({
  loadCounterfactualState: (...args: unknown[]) =>
    mockLoadCounterfactualState(...args),
  recordDecisionPoint: (...args: unknown[]) => mockRecordDecisionPoint(...args),
  recordActualOutcome: jest.fn(),
  generateCounterfactual: (...args: unknown[]) =>
    mockGenerateCounterfactual(...args),
  projectConsequences: jest.fn(async () => ['outcome-a']),
  extractWisdom: jest.fn(async () => ({ insight: 'slow is smooth' })),
  validateWisdom: jest.fn(),
  synthesizeHeuristic: jest.fn(),
  recordHeuristicApplication: jest.fn(),
  refineHeuristic: jest.fn(),
  getCounterfactualSummary: (...args: unknown[]) =>
    mockGetCounterfactualSummary(...args),
  getDecisionsByDomain: (...args: unknown[]) => mockGetDecisionsByDomain(...args),
  getEstablishedWisdom: (...args: unknown[]) => mockGetEstablishedWisdom(...args),
  getActiveHeuristics: jest.fn(async () => [{ name: 'pause-and-verify' }]),
}));

jest.mock('@/ai/agency/planning/trajectory-evolution', () => ({
  makePrediction: (...args: unknown[]) => mockMakePrediction(...args),
  verifyPrediction: (...args: unknown[]) => mockVerifyTrajectoryPrediction(...args),
  calculateCorrelations: jest.fn(() => []),
  forecastTrajectory: (...args: unknown[]) => mockForecastTrajectory(...args),
  getTrajectoryStatus: (...args: unknown[]) => mockGetTrajectoryStatus(...args),
  getRecentPredictions: jest.fn(() => []),
  getPendingPredictions: jest.fn(() => []),
  getConsciousnessPerformanceInsights: (...args: unknown[]) =>
    mockGetConsciousnessPerformanceInsights(...args),
  saveTrajectoryState: jest.fn(),
  loadTrajectoryState: (...args: unknown[]) => mockLoadTrajectoryState(...args),
}));

jest.mock('@/ai/agency/planning/autonomous-cycle', () => ({
  runAutonomousCycle: (...args: unknown[]) => mockRunAutonomousCycle(...args),
}));

import {
  autonomousCycle,
  counterfactuals,
  curiosity,
  longHorizonPlanning,
  predictiveIntelligence,
  trajectoryEvolution,
} from '../planning-tools';

describe('planning-tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles curiosity status and generate validation', async () => {
    mockGetCuriosityStatus.mockReturnValue({
      activeQuestions: 3,
      totalInvestigated: 10,
      activeInvestigations: 1,
    });

    const status = await curiosity({ action: 'status' });
    expect(status.success).toBe(true);
    expect(status.output).toContain('Curiosity: 3 active');

    const invalid = await curiosity({ action: 'generate' });
    expect(invalid.success).toBe(false);
    expect(invalid.output).toContain('Missing: question');
  });

  it('supports curiosity selectNext and runCycle', async () => {
    mockSelectNextQuestion.mockReturnValueOnce(null).mockReturnValueOnce({
      question: 'What changed?',
      priority: 90,
    });
    mockRunCuriosityCycle.mockResolvedValue({
      questionsGenerated: 2,
      investigated: 1,
    });

    const empty = await curiosity({ action: 'selectNext' });
    expect(empty.output).toContain('No questions to investigate');

    const next = await curiosity({ action: 'selectNext' });
    expect(next.output).toContain('What changed?');

    const cycle = await curiosity({ action: 'runCycle' });
    expect(cycle.success).toBe(true);
    expect(cycle.output).toContain('Cycle: 2 generated, 1 investigated');
  });

  it('handles long-horizon status create/list/summary and unknown actions', async () => {
    mockGetPlanningStatus.mockReturnValue({
      activeGoals: 4,
      completedGoals: 12,
      totalMilestones: 30,
    });
    mockCreateGoal.mockReturnValue({ id: 'g1', title: 'Stabilize tests' });
    mockGetActiveGoals.mockReturnValue([{ title: 'A', status: 'active', progress: 50 }]);
    mockGetGoalsByCategory.mockReturnValue([
      { title: 'B', status: 'active', progress: 20 },
    ]);
    mockGenerateProgressSummary.mockReturnValue('Progress summary body');

    const status = await longHorizonPlanning({ action: 'status' });
    expect(status.output).toContain('Planning: 4 active');

    const missing = await longHorizonPlanning({ action: 'createGoal' });
    expect(missing.output).toContain('Missing: title');

    const created = await longHorizonPlanning({ action: 'createGoal', title: 'Goal 1' });
    expect(created.success).toBe(true);

    const listed = await longHorizonPlanning({ action: 'listGoals' });
    expect(listed.output).toContain('Goals (1):');

    const listedByCategory = await longHorizonPlanning({
      action: 'listGoals',
      category: 'system',
    });
    expect(listedByCategory.output).toContain('Goals (1):');

    const summary = await longHorizonPlanning({ action: 'summary', goalId: 'g1' });
    expect(summary.output).toContain('Progress summary body');

    const unknown = await longHorizonPlanning({ action: 'x' });
    expect(unknown.output).toContain('Unknown longHorizonPlanning action');
  });

  it('covers predictive intelligence status/suggestions/forecast/listing', async () => {
    mockGetPredictiveStatus.mockReturnValue({
      activePatterns: 5,
      pendingSuggestions: 2,
      accuracy: 0.84,
    });
    mockGenerateSuggestions.mockReturnValue([{ suggestion: 'Check logs' }]);
    mockForecastContext.mockReturnValue({ summary: 'Higher latency at night' });
    mockGetActivePatterns.mockReturnValue([{ name: 'night-latency', occurrences: 4 }]);

    const status = await predictiveIntelligence({ action: 'status' });
    expect(status.output).toContain('Predictive: 5 patterns');

    const generated = await predictiveIntelligence({ action: 'generateSuggestions' });
    expect(generated.output).toContain('Suggestions (1):');

    const forecast = await predictiveIntelligence({ action: 'forecast' });
    expect(forecast.output).toContain('Higher latency at night');

    const patterns = await predictiveIntelligence({ action: 'listPatterns' });
    expect(patterns.output).toContain('Active patterns (1):');
  });

  it('covers counterfactual status, record validation, generate, list, and unknown', async () => {
    mockGetCounterfactualSummary.mockResolvedValue({
      totalDecisions: 7,
      wisdomCount: 3,
      heuristicCount: 2,
    });
    mockRecordDecisionPoint.mockResolvedValue({ id: 'd1' });
    mockGenerateCounterfactual.mockResolvedValue({ id: 'cf1' });
    mockGetDecisionsByDomain.mockResolvedValue([{ situation: 'Deploy timing' }]);
    mockGetEstablishedWisdom.mockResolvedValue([{ insight: 'Batch changes' }]);

    const status = await counterfactuals({ action: 'status' });
    expect(status.output).toContain('Counterfactuals: 7 decisions');

    const missing = await counterfactuals({ action: 'recordDecision' });
    expect(missing.output).toContain('Missing: situation, chosenOption');

    const recorded = await counterfactuals({
      action: 'recordDecision',
      situation: 'deploy',
      chosenOption: 'fast',
    });
    expect(recorded.success).toBe(true);

    const generated = await counterfactuals({ action: 'generate', decisionId: 'd1' });
    expect(generated.success).toBe(true);

    const listed = await counterfactuals({ action: 'listDecisions', domain: 'ops' });
    expect(listed.output).toContain('Decisions (1):');

    const wisdom = await counterfactuals({ action: 'listWisdom' });
    expect(wisdom.output).toContain('Wisdom (1):');

    const unknown = await counterfactuals({ action: 'nope' });
    expect(unknown.output).toContain('Unknown counterfactuals action');
  });

  it('covers trajectory status/predict/verify/forecast/insights and unknown', async () => {
    mockGetTrajectoryStatus.mockReturnValue({
      totalPredictions: 16,
      accuracy: 0.75,
    });
    mockMakePrediction.mockReturnValue({ id: 'p1' });
    mockVerifyTrajectoryPrediction.mockReturnValue({ accurate: true });
    mockForecastTrajectory.mockReturnValue({ prediction: 'stable', confidence: 0.82 });
    mockGetConsciousnessPerformanceInsights.mockReturnValue(['calm improves latency']);

    const status = await trajectoryEvolution({ action: 'status' });
    expect(status.output).toContain('Trajectory: 16 predictions');

    const predictMissing = await trajectoryEvolution({ action: 'predict', metric: 'latency' });
    expect(predictMissing.output).toContain('Missing: metric, value');

    const predicted = await trajectoryEvolution({
      action: 'predict',
      metric: 'latency',
      value: 120,
    });
    expect(predicted.success).toBe(true);

    const verified = await trajectoryEvolution({
      action: 'verify',
      predictionId: 'p1',
      actualValue: 118,
    });
    expect(verified.output).toContain('Verified: accurate');

    const forecast = await trajectoryEvolution({ action: 'forecast', metric: 'latency' });
    expect(forecast.output).toContain('Forecast: stable');

    const insights = await trajectoryEvolution({ action: 'insights' });
    expect(insights.output).toContain('calm improves latency');

    const unknown = await trajectoryEvolution({ action: 'unknown' });
    expect(unknown.output).toContain('Unknown trajectoryEvolution action');
  });

  it('covers autonomous cycle run and unknown action fallback', async () => {
    mockRunAutonomousCycle.mockResolvedValue({ actionsTaken: 4, durationMs: 320 });

    const run = await autonomousCycle({ action: 'run' });
    expect(run.success).toBe(true);
    expect(run.output).toContain('4 actions in 320ms');

    const unknown = await autonomousCycle({ action: 'idle' });
    expect(unknown.success).toBe(false);
    expect(unknown.output).toContain('Unknown autonomousCycle action');
  });
});