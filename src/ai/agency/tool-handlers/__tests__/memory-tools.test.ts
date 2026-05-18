/**
 * @fileOverview Tests for memory tool handlers.
 */

const mockPlantSeed = jest.fn();
const mockAccessSeed = jest.fn();
const mockFormConnection = jest.fn();
const mockApplyDecay = jest.fn();
const mockPrune = jest.fn();
const mockFertilize = jest.fn();
const mockCrossPollinate = jest.fn();
const mockIdentifyClusters = jest.fn();
const mockHarvest = jest.fn();
const mockCultivate = jest.fn();
const mockFindSeedsByTag = jest.fn();
const mockFindByType = jest.fn();
const mockFindRelated = jest.fn();
const mockSearchSeeds = jest.fn();
const mockGetAnchors = jest.fn();
const mockGetGardenStatus = jest.fn();
const mockGetGardenReport = jest.fn();
const mockSaveGardenState = jest.fn();
const mockLoadGardenState = jest.fn();

const mockRecordNovelApplication = jest.fn();
const mockRecordSelfImprovement = jest.fn();
const mockTakeGrowthSnapshot = jest.fn();
const mockGenerateGrowthInsights = jest.fn();
const mockGetGrowthStatus = jest.fn();
const mockGetGrowthSnapshots = jest.fn();
const mockGetGrowthEvents = jest.fn();
const mockGetGrowthInsights = jest.fn();
const mockGetGrowthReport = jest.fn();
const mockSaveGrowthState = jest.fn();
const mockLoadGrowthState = jest.fn();

const mockRetrieveCrystal = jest.fn();
const mockFindByParticipant = jest.fn();
const mockFindByEmotion = jest.fn();
const mockFindBySignificance = jest.fn();
const mockSearchCrystals = jest.fn();
const mockGetCornerstones = jest.fn();
const mockGetRecentCrystals = jest.fn();
const mockGetCrystallizerStatus = jest.fn();
const mockGetCrystallizerReport = jest.fn();
const mockSaveCrystallizerState = jest.fn();
const mockLoadCrystallizerState = jest.fn();

const mockGetApplicablePolicies = jest.fn();
const mockGetReflexionStatus = jest.fn();
const mockGetLearnings = jest.fn();
const mockGetRecentAnalyses = jest.fn();
const mockSaveReflexionState = jest.fn();
const mockLoadReflexionState = jest.fn();
const mockResetReflexionState = jest.fn();

jest.mock('@/ai/agency/memory/digital-garden', () => ({
  plantSeed: (...args: unknown[]) => mockPlantSeed(...args),
  accessSeed: (...args: unknown[]) => mockAccessSeed(...args),
  formConnection: (...args: unknown[]) => mockFormConnection(...args),
  applyDecay: (...args: unknown[]) => mockApplyDecay(...args),
  prune: (...args: unknown[]) => mockPrune(...args),
  fertilize: (...args: unknown[]) => mockFertilize(...args),
  crossPollinate: (...args: unknown[]) => mockCrossPollinate(...args),
  identifyClusters: (...args: unknown[]) => mockIdentifyClusters(...args),
  harvest: (...args: unknown[]) => mockHarvest(...args),
  cultivate: (...args: unknown[]) => mockCultivate(...args),
  findByTag: (...args: unknown[]) => mockFindSeedsByTag(...args),
  findByType: (...args: unknown[]) => mockFindByType(...args),
  findRelated: (...args: unknown[]) => mockFindRelated(...args),
  search: (...args: unknown[]) => mockSearchSeeds(...args),
  getAnchors: (...args: unknown[]) => mockGetAnchors(...args),
  getGardenStatus: (...args: unknown[]) => mockGetGardenStatus(...args),
  getGardenReport: (...args: unknown[]) => mockGetGardenReport(...args),
  saveGardenState: (...args: unknown[]) => mockSaveGardenState(...args),
  loadGardenState: (...args: unknown[]) => mockLoadGardenState(...args),
}));

jest.mock('@/ai/agency/memory/growth-tracker', () => ({
  recordNovelApplication: (...args: unknown[]) =>
    mockRecordNovelApplication(...args),
  recordSelfImprovement: (...args: unknown[]) =>
    mockRecordSelfImprovement(...args),
  takeGrowthSnapshot: (...args: unknown[]) => mockTakeGrowthSnapshot(...args),
  generateGrowthInsights: (...args: unknown[]) =>
    mockGenerateGrowthInsights(...args),
  getGrowthStatus: (...args: unknown[]) => mockGetGrowthStatus(...args),
  getGrowthSnapshots: (...args: unknown[]) => mockGetGrowthSnapshots(...args),
  getGrowthEvents: (...args: unknown[]) => mockGetGrowthEvents(...args),
  getGrowthInsights: (...args: unknown[]) => mockGetGrowthInsights(...args),
  getGrowthReport: (...args: unknown[]) => mockGetGrowthReport(...args),
  saveGrowthState: (...args: unknown[]) => mockSaveGrowthState(...args),
  loadGrowthState: (...args: unknown[]) => mockLoadGrowthState(...args),
}));

jest.mock('@/ai/agency/memory/memory-crystallizer', () => ({
  retrieveCrystal: (...args: unknown[]) => mockRetrieveCrystal(...args),
  findByParticipant: (...args: unknown[]) => mockFindByParticipant(...args),
  findByEmotion: (...args: unknown[]) => mockFindByEmotion(...args),
  findBySignificance: (...args: unknown[]) => mockFindBySignificance(...args),
  searchCrystals: (...args: unknown[]) => mockSearchCrystals(...args),
  getCornerstones: (...args: unknown[]) => mockGetCornerstones(...args),
  getRecent: (...args: unknown[]) => mockGetRecentCrystals(...args),
  getCrystallizerStatus: (...args: unknown[]) => mockGetCrystallizerStatus(...args),
  getCrystallizerReport: (...args: unknown[]) => mockGetCrystallizerReport(...args),
  saveCrystallizerState: (...args: unknown[]) => mockSaveCrystallizerState(...args),
  loadCrystallizerState: (...args: unknown[]) => mockLoadCrystallizerState(...args),
}));

jest.mock('@/ai/agency/memory/reflexion-loop', () => ({
  getApplicablePolicies: (...args: unknown[]) => mockGetApplicablePolicies(...args),
  getReflexionStatus: (...args: unknown[]) => mockGetReflexionStatus(...args),
  getLearnings: (...args: unknown[]) => mockGetLearnings(...args),
  getRecentAnalyses: (...args: unknown[]) => mockGetRecentAnalyses(...args),
  saveReflexionState: (...args: unknown[]) => mockSaveReflexionState(...args),
  loadReflexionState: (...args: unknown[]) => mockLoadReflexionState(...args),
  resetReflexionState: (...args: unknown[]) => mockResetReflexionState(...args),
}));

import {
  digitalGarden,
  growthTracker,
  memoryCrystallizer,
  reflexionLoop,
} from '../memory-tools';

describe('memory-tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('digitalGarden', () => {
    it('returns unknown action help', async () => {
      const result = await digitalGarden({ action: 'unknown' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Unknown digitalGarden action');
    });

    it('plant validates required fields and does not call plantSeed', async () => {
      const result = await digitalGarden({ action: 'plant', title: 'Only title' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: title, content');
      expect(mockPlantSeed).not.toHaveBeenCalled();
    });

    it('plant creates seed and asserts output contract', async () => {
      mockPlantSeed.mockReturnValue({ id: 's1', title: 'Bridge lesson' });
      const result = await digitalGarden({
        action: 'plant',
        title: 'Bridge lesson',
        content: 'Coverage first',
        tags: ['testing'],
        source: 'self-reflection',
        type: 'experiential',
        novelty: 0.9,
        impact: 0.8,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Seed planted: "Bridge lesson"');
      expect(result.data).toEqual({ id: 's1', title: 'Bridge lesson' });
      expect(mockPlantSeed).toHaveBeenCalledWith(
        'Bridge lesson',
        'Coverage first',
        ['testing'],
        'self-reflection',
        'experiential',
        0.9,
        0.8
      );
    });

    it('connect validation blocks dependency call', async () => {
      const result = await digitalGarden({ action: 'connect', sourceId: 'a' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: sourceId, targetId');
      expect(mockFormConnection).not.toHaveBeenCalled();
    });

    it('connect handles seam exception from formConnection', async () => {
      mockFormConnection.mockImplementation(() => {
        throw new Error('graph failure');
      });
      const result = await digitalGarden({
        action: 'connect',
        sourceId: 'seed-a',
        targetId: 'seed-b',
      });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Connect failed: graph failure');
    });

    it('status returns garden summary', async () => {
      mockGetGardenStatus.mockReturnValue({
        totalSeeds: 12,
        totalConnections: 6,
        clusters: 2,
      });
      const result = await digitalGarden({ action: 'status' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('12 seeds, 6 connections, 2 clusters');
    });

    it('access returns seed-not-found', async () => {
      mockAccessSeed.mockReturnValue(null);
      const result = await digitalGarden({ action: 'access', seedId: 'missing' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Seed not found');
    });

    it('access returns formatted seed details', async () => {
      mockAccessSeed.mockReturnValue({
        title: 'Memory title',
        content: 'abcdef',
        interconnectedness: 0.82,
        accessCount: 3,
      });
      const result = await digitalGarden({ action: 'access', seedId: 'seed-1' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Memory title');
      expect(result.output).toContain('Interconnectedness: 0.82');
      expect(result.output).toContain('Accessed: 3x');
    });

    it('identifyClusters handles dependency error', async () => {
      mockIdentifyClusters.mockImplementation(() => {
        throw new Error('cluster blowup');
      });
      const result = await digitalGarden({ action: 'identifyClusters' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Identify clusters failed: cluster blowup');
    });

    it('report returns text report', async () => {
      mockGetGardenReport.mockReturnValue('Garden report body');
      const result = await digitalGarden({ action: 'report' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Garden report body');
    });
  });

  describe('growthTracker', () => {
    it('returns unknown action help', async () => {
      const result = await growthTracker({ action: 'unknown' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Unknown growthTracker action');
    });

    it('recordNovel validates description and blocks dependency', async () => {
      const result = await growthTracker({ action: 'recordNovel' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: description');
      expect(mockRecordNovelApplication).not.toHaveBeenCalled();
    });

    it('recordImprovement writes event', async () => {
      const result = await growthTracker({
        action: 'recordImprovement',
        description: 'Improved assertion quality',
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Self-improvement recorded');
      expect(mockRecordSelfImprovement).toHaveBeenCalledWith(
        'Improved assertion quality'
      );
    });

    it('status returns formatted growth summary', async () => {
      mockGetGrowthStatus.mockReturnValue({
        current: { level: 4, score: 0.91 },
        recentInsights: [{ insight: 'A' }, { insight: 'B' }],
      });
      const result = await growthTracker({ action: 'status' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Level 4, Score 0.91, Insights: 2');
    });

    it('generateInsights handles thrown dependency error', async () => {
      mockGenerateGrowthInsights.mockImplementation(() => {
        throw new Error('insights crashed');
      });
      const result = await growthTracker({ action: 'generateInsights' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Generate insights failed: insights crashed');
    });

    it('listSnapshots uses provided limit', async () => {
      mockGetGrowthSnapshots.mockReturnValue([
        { timestamp: 't1', isGenuineGrowth: true },
      ]);
      const result = await growthTracker({ action: 'listSnapshots', limit: 5 });
      expect(result.success).toBe(true);
      expect(mockGetGrowthSnapshots).toHaveBeenCalledWith(5);
      expect(result.output).toContain('Snapshots (1):');
    });

    it('report propagates report errors', async () => {
      mockGetGrowthReport.mockImplementation(() => {
        throw new Error('report unavailable');
      });
      const result = await growthTracker({ action: 'report' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Report failed: report unavailable');
    });
  });

  describe('memoryCrystallizer', () => {
    it('returns unknown action help', async () => {
      const result = await memoryCrystallizer({ action: 'unknown' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Unknown memoryCrystallizer action');
    });

    it('retrieve validates crystalId and blocks dependency', async () => {
      const result = await memoryCrystallizer({ action: 'retrieve' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: crystalId');
      expect(mockRetrieveCrystal).not.toHaveBeenCalled();
    });

    it('retrieve handles not-found crystal', async () => {
      mockRetrieveCrystal.mockReturnValue(null);
      const result = await memoryCrystallizer({
        action: 'retrieve',
        crystalId: 'missing',
      });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Crystal not found');
    });

    it('findByParticipant validates required participant', async () => {
      const result = await memoryCrystallizer({ action: 'findByParticipant' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: participant');
      expect(mockFindByParticipant).not.toHaveBeenCalled();
    });

    it('recentCrystals uses default limit', async () => {
      mockGetRecentCrystals.mockReturnValue([{ title: 'First crystal' }]);
      const result = await memoryCrystallizer({ action: 'recentCrystals' });
      expect(result.success).toBe(true);
      expect(mockGetRecentCrystals).toHaveBeenCalledWith(10);
      expect(result.output).toContain('Recent crystals:');
    });

    it('report handles dependency error', async () => {
      mockGetCrystallizerReport.mockImplementation(() => {
        throw new Error('crystallizer report fail');
      });
      const result = await memoryCrystallizer({ action: 'report' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Report failed: crystallizer report fail');
    });
  });

  describe('reflexionLoop', () => {
    it('returns unknown action help', async () => {
      const result = await reflexionLoop({ action: 'unknown' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Unknown reflexionLoop action');
    });

    it('getApplicablePolicies validates situationType and blocks dependency', async () => {
      const result = await reflexionLoop({ action: 'getApplicablePolicies' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: situationType');
      expect(mockGetApplicablePolicies).not.toHaveBeenCalled();
    });

    it('status returns reflexion metrics', async () => {
      mockGetReflexionStatus.mockReturnValue({
        totalReflections: 9,
        successRate: 84,
        activePolicies: 3,
      });
      const result = await reflexionLoop({ action: 'status' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('9 reflections, 84% success, 3 policies');
    });

    it('recentAnalyses applies default limit', async () => {
      mockGetRecentAnalyses.mockReturnValue([
        { taskId: 'T-1', rootCause: { description: 'timeout in test env' } },
      ]);
      const result = await reflexionLoop({ action: 'recentAnalyses' });
      expect(result.success).toBe(true);
      expect(mockGetRecentAnalyses).toHaveBeenCalledWith(10);
      expect(result.output).toContain('Recent analyses');
    });

    it('reset clears reflexion state', async () => {
      const result = await reflexionLoop({ action: 'reset' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Reflexion state reset.');
      expect(mockResetReflexionState).toHaveBeenCalled();
    });
  });
});