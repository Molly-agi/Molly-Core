/**
 * @fileOverview Tests for evolution-loop flow.
 */

const mockAutonomousSolution = jest.fn();
const mockIntrospect = jest.fn();
const mockLogMethodologyStep = jest.fn();
const mockAnalyzeVision = jest.fn();
const mockNeuralBridgeUI = jest.fn();
const mockGetSystemHealth = jest.fn();
const mockRecallNeuralContext = jest.fn();
const mockStorageSet = jest.fn();
const mockCreateMemoryRecord = jest.fn();
const mockAddChecksum = jest.fn();
const mockGenerateTraceId = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('../../genkit', () => ({
  ai: {
    defineFlow: jest.fn((_config, handler) => handler),
  },
}));

jest.mock('../autonomous-solution', () => ({
  autonomousSolution: (...args: unknown[]) => mockAutonomousSolution(...args),
}));

jest.mock('../introspection', () => ({
  introspect: (...args: unknown[]) => mockIntrospect(...args),
}));

jest.mock('../../methodology', () => ({
  logMethodologyStep: (...args: unknown[]) => mockLogMethodologyStep(...args),
}));

jest.mock('../vision-analysis', () => ({
  analyzeVision: (...args: unknown[]) => mockAnalyzeVision(...args),
}));

jest.mock('../../tools/system', () => ({
  neuralBridgeUI: (...args: unknown[]) => mockNeuralBridgeUI(...args),
  getSystemHealth: (...args: unknown[]) => mockGetSystemHealth(...args),
}));

jest.mock('../experience-recall', () => ({
  recallNeuralContext: (...args: unknown[]) => mockRecallNeuralContext(...args),
}));

jest.mock('../../logger', () => ({
  MollyLogger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
  },
  generateTraceId: (...args: unknown[]) => mockGenerateTraceId(...args),
}));

jest.mock('../../tools/memory-schema', () => ({
  createMemoryRecord: (...args: unknown[]) => mockCreateMemoryRecord(...args),
}));

jest.mock('../../tools/memory-integrity', () => ({
  addChecksum: (...args: unknown[]) => mockAddChecksum(...args),
}));

jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn(() => ({
    set: (...args: unknown[]) => mockStorageSet(...args),
  })),
}));

import { evolutionLoopFlow, runAutonomousEvolution } from '../evolution-loop';

describe('evolution-loop flow', () => {
  const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
    fn: (...args: unknown[]) => void
  ) => {
    fn();
    return 0;
  }) as unknown as typeof setTimeout);

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetSystemHealth.mockResolvedValue({
      batteryLevel: 80,
      temperature: 35,
      powerMode: 'balanced',
    });

    mockRecallNeuralContext.mockResolvedValue({
      strategicSummary: 'Use prior stable baseline pattern',
    });

    mockAutonomousSolution.mockResolvedValue({
      finalCommand: 'npm run test',
      creativeSolution: 'add focused tests',
    });

    mockNeuralBridgeUI.mockResolvedValue({ screenshotUri: 'mock://shot' });

    mockAnalyzeVision.mockResolvedValue({
      observedState: 'Screen looks stable',
      risksDetected: [],
    });

    mockIntrospect.mockResolvedValue({ refactorTargetId: undefined });

    mockGenerateTraceId.mockReturnValue('trace-evolution-test');
    mockCreateMemoryRecord.mockImplementation((payload) => ({
      id: 'memory-1',
      ...payload,
    }));
    mockAddChecksum.mockImplementation((record) => ({
      ...record,
      checksum: 'abc123',
    }));

    mockStorageSet.mockResolvedValue(undefined);
  });

  afterAll(() => {
    setTimeoutSpy.mockRestore();
  });

  it('stops after first stable visual verification and persists success experience', async () => {
    const result = await evolutionLoopFlow({
      objective: 'stabilize ui regressions',
      userId: 'user-1',
      iterations: 3,
    });

    expect(result.stableBaselineReached).toBe(true);
    expect(result.iterationCount).toBe(1);
    expect(result.memoryConsulted).toBe(true);
    expect(result.recalledInsights).toContain('prior stable baseline');

    expect(mockLogMethodologyStep).toHaveBeenCalledWith(
      'user-1',
      'HARDEN',
      expect.stringContaining('Visual stability achieved'),
      true
    );

    expect(mockStorageSet).toHaveBeenCalledWith(
      'users/user-1/experiences',
      'memory-1',
      expect.objectContaining({
        checksum: 'abc123',
        success: true,
      })
    );

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Evolution experience persisted',
      'evolution-loop',
      expect.any(Object)
    );
  });

  it('runs full iteration budget when visual risk persists and introspection requests refactor', async () => {
    mockAnalyzeVision.mockResolvedValue({
      observedState: 'visual artifacts remain',
      risksDetected: ['flicker'],
    });

    mockIntrospect.mockResolvedValue({ refactorTargetId: 'ITER_REFACTOR' });

    const result = await evolutionLoopFlow({
      objective: 'remove persistent flicker',
      userId: 'user-2',
      iterations: 2,
    });

    expect(result.stableBaselineReached).toBe(false);
    expect(result.iterationCount).toBe(2);
    expect(result.visualVerification).toBe('visual artifacts remain');

    expect(mockLogMethodologyStep).toHaveBeenCalledWith(
      'user-2',
      'AUDIT',
      expect.stringContaining('Visual infections remain: flicker'),
      false
    );

    expect(mockAutonomousSolution).toHaveBeenCalledTimes(2);
    expect(mockIntrospect).toHaveBeenCalledTimes(2);
    expect(setTimeoutSpy).toHaveBeenCalled();
  });

  it('handles visual verification exception and continues via introspection path', async () => {
    mockNeuralBridgeUI.mockRejectedValue(new Error('bridge offline'));
    mockIntrospect.mockResolvedValue({ refactorTargetId: undefined });

    const result = await evolutionLoopFlow({
      objective: 'recover from vision outage',
      userId: 'user-3',
      iterations: 3,
    });

    expect(result.stableBaselineReached).toBe(true);
    expect(result.iterationCount).toBe(1);

    expect(mockLogMethodologyStep).toHaveBeenCalledWith(
      'user-3',
      'IMMUNE_RESPONSE',
      'Visual cortex isolated.',
      false
    );
  });

  it('treats persistence failure as non-fatal and still returns flow result', async () => {
    mockStorageSet.mockRejectedValue(new Error('storage unavailable'));

    const result = await runAutonomousEvolution(
      'maintain autonomous stability',
      'user-4',
      1
    );

    expect(result.finalReport).toContain('Autonomous cycle complete');
    expect(result.iterationCount).toBe(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Failed to persist evolution experience — non-fatal',
      'evolution-loop',
      { userId: 'user-4' },
      expect.any(Error)
    );
  });
});
