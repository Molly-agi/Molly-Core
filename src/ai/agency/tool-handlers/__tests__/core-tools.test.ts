/**
 * @fileOverview Tests for core tool handlers.
 */

const mockRunTests = jest.fn();
const mockDetectIssues = jest.fn();
const mockTrackError = jest.fn();
const mockGetRecentErrors = jest.fn();
const mockClearErrors = jest.fn();
const mockAnalyzeRuntimeErrors = jest.fn();
const mockCheckBuild = jest.fn();
const mockHuntBugs = jest.fn();
const mockQuickHunt = jest.fn();

const mockCritique = jest.fn();
const mockCreateRefinementRequest = jest.fn();
const mockApplyRefinements = jest.fn();
const mockCritiqueAndRefine = jest.fn();
const mockSetStrictness = jest.fn();
const mockSetCriterionEnabled = jest.fn();
const mockSetCriterionThreshold = jest.fn();
const mockGetCriticStatus = jest.fn();
const mockGetRecentCritiques = jest.fn();
const mockSaveCriticState = jest.fn();
const mockLoadCriticState = jest.fn();
const mockResetCriticState = jest.fn();

const mockGetCircuitBreaker = jest.fn();
const mockCreateStructuredError = jest.fn();
const mockWrapError = jest.fn();
const mockIsStructuredError = jest.fn();
const mockGetErrorChain = jest.fn();
const mockExecuteRecoveryChain = jest.fn();
const mockCreateRecoveryChain = jest.fn();
const mockGetHealthMetrics = jest.fn();
const mockGetRecentStructuredErrors = jest.fn();
const mockClearErrorHistory = jest.fn();
const mockResetAllCircuitBreakers = jest.fn();

jest.mock('@/ai/agency/core/bug-hunter', () => ({
  runTests: (...args: unknown[]) => mockRunTests(...args),
  detectIssues: (...args: unknown[]) => mockDetectIssues(...args),
  trackError: (...args: unknown[]) => mockTrackError(...args),
  getRecentErrors: (...args: unknown[]) => mockGetRecentErrors(...args),
  clearErrors: (...args: unknown[]) => mockClearErrors(...args),
  analyzeRuntimeErrors: (...args: unknown[]) => mockAnalyzeRuntimeErrors(...args),
  checkBuild: (...args: unknown[]) => mockCheckBuild(...args),
  huntBugs: (...args: unknown[]) => mockHuntBugs(...args),
  quickHunt: (...args: unknown[]) => mockQuickHunt(...args),
}));

jest.mock('@/ai/agency/core/critic-agent', () => ({
  critique: (...args: unknown[]) => mockCritique(...args),
  createRefinementRequest: (...args: unknown[]) =>
    mockCreateRefinementRequest(...args),
  applyRefinements: (...args: unknown[]) => mockApplyRefinements(...args),
  critiqueAndRefine: (...args: unknown[]) => mockCritiqueAndRefine(...args),
  setStrictness: (...args: unknown[]) => mockSetStrictness(...args),
  setCriterionEnabled: (...args: unknown[]) => mockSetCriterionEnabled(...args),
  setCriterionThreshold: (...args: unknown[]) =>
    mockSetCriterionThreshold(...args),
  getCriticStatus: (...args: unknown[]) => mockGetCriticStatus(...args),
  getRecentCritiques: (...args: unknown[]) => mockGetRecentCritiques(...args),
  saveCriticState: (...args: unknown[]) => mockSaveCriticState(...args),
  loadCriticState: (...args: unknown[]) => mockLoadCriticState(...args),
  resetCriticState: (...args: unknown[]) => mockResetCriticState(...args),
}));

jest.mock('@/ai/agency/core/resiliency', () => ({
  getCircuitBreaker: (...args: unknown[]) => mockGetCircuitBreaker(...args),
  createStructuredError: (...args: unknown[]) =>
    mockCreateStructuredError(...args),
  wrapError: (...args: unknown[]) => mockWrapError(...args),
  isStructuredError: (...args: unknown[]) => mockIsStructuredError(...args),
  getErrorChain: (...args: unknown[]) => mockGetErrorChain(...args),
  executeRecoveryChain: (...args: unknown[]) =>
    mockExecuteRecoveryChain(...args),
  createRecoveryChain: (...args: unknown[]) => mockCreateRecoveryChain(...args),
  getHealthMetrics: (...args: unknown[]) => mockGetHealthMetrics(...args),
  getRecentErrors: (...args: unknown[]) => mockGetRecentStructuredErrors(...args),
  clearErrorHistory: (...args: unknown[]) => mockClearErrorHistory(...args),
  resetAllCircuitBreakers: (...args: unknown[]) =>
    mockResetAllCircuitBreakers(...args),
}));

import { bugHunter, criticAgent, resiliency } from '../core-tools';

describe('core-tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCircuitBreaker.mockReturnValue({ getState: () => 'closed' });
  });

  describe('bugHunter', () => {
    it('returns unknown action help', async () => {
      const result = await bugHunter({ action: 'unknown' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Unknown bugHunter action');
    });

    it('runTests returns formatted pass/fail counts', async () => {
      mockRunTests.mockResolvedValue({
        success: true,
        passed: 10,
        failed: 1,
        skipped: 2,
      });
      const result = await bugHunter({ action: 'runTests', testPath: 'src/**' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('10 passed');
      expect(mockRunTests).toHaveBeenCalledWith({ testPath: 'src/**', watch: undefined });
    });

    it('runTests handles thrown error', async () => {
      mockRunTests.mockRejectedValue(new Error('jest crashed'));
      const result = await bugHunter({ action: 'runTests' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Test run failed: jest crashed');
    });

    it('detectIssues validates filePath', async () => {
      const result = await bugHunter({ action: 'detectIssues' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: filePath');
      expect(mockDetectIssues).not.toHaveBeenCalled();
    });

    it('detectIssues succeeds when no critical/error issues', async () => {
      mockDetectIssues.mockResolvedValue({
        issues: [
          { severity: 'warning', message: 'minor warning' },
          { severity: 'info', message: 'fyi' },
        ],
      });
      const result = await bugHunter({ action: 'detectIssues', filePath: 'a.ts' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Issues in a.ts (2)');
    });

    it('detectIssues returns failure on critical/error issue', async () => {
      mockDetectIssues.mockResolvedValue({
        issues: [{ severity: 'critical', message: 'bad bug' }],
      });
      const result = await bugHunter({ action: 'detectIssues', filePath: 'a.ts' });
      expect(result.success).toBe(false);
    });

    it('trackError validates message', async () => {
      const result = await bugHunter({ action: 'trackError' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: message');
      expect(mockTrackError).not.toHaveBeenCalled();
    });

    it('trackError stores error details', async () => {
      const result = await bugHunter({
        action: 'trackError',
        message: 'error message',
        source: 'unit-test',
        stack: 'stacktrace',
      });
      expect(result.success).toBe(true);
      expect(mockTrackError).toHaveBeenCalledWith({
        message: 'error message',
        source: 'unit-test',
        stack: 'stacktrace',
      });
    });

    it('clearErrors clears state', async () => {
      const result = await bugHunter({ action: 'clearErrors' });
      expect(result.success).toBe(true);
      expect(mockClearErrors).toHaveBeenCalled();
    });

    it('checkBuild handles thrown error', async () => {
      mockCheckBuild.mockRejectedValue(new Error('build exception'));
      const result = await bugHunter({ action: 'checkBuild' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Build check failed: build exception');
    });

    it('hunt returns aggregated bug hunt result', async () => {
      mockHuntBugs.mockResolvedValue({
        overallSuccess: true,
        totalIssues: 7,
        filesScanned: 23,
      });
      const result = await bugHunter({ action: 'hunt' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('7 issues found across 23 files');
    });

    it('quickHunt handles thrown error', async () => {
      mockQuickHunt.mockRejectedValue(new Error('quick crash'));
      const result = await bugHunter({ action: 'quickHunt' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Quick hunt failed: quick crash');
    });
  });

  describe('criticAgent', () => {
    it('returns unknown action help', async () => {
      const result = await criticAgent({ action: 'unknown' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Unknown criticAgent action');
    });

    it('load handles error', async () => {
      mockLoadCriticState.mockRejectedValue(new Error('load failed'));
      const result = await criticAgent({ action: 'load' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Load failed: load failed');
    });

    it('status returns critic summary', async () => {
      mockGetCriticStatus.mockReturnValue({
        strictness: 0.8,
        totalCritiques: 12,
        averageScore: 0.74,
      });
      const result = await criticAgent({ action: 'status' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('strictness 0.8');
      expect(result.output).toContain('12 critiques');
    });

    it('critique validates content', async () => {
      const result = await criticAgent({ action: 'critique' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: content');
      expect(mockCritique).not.toHaveBeenCalled();
    });

    it('createRefinement validates required fields', async () => {
      const result = await criticAgent({ action: 'createRefinement', content: 'x' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: content, critiqueResult');
      expect(mockCreateRefinementRequest).not.toHaveBeenCalled();
    });

    it('createRefinement handles error', async () => {
      mockCreateRefinementRequest.mockImplementation(() => {
        throw new Error('bad create');
      });
      const result = await criticAgent({
        action: 'createRefinement',
        content: 'x',
        critiqueResult: { overallScore: 0.5 },
      });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Create failed: bad create');
    });

    it('applyRefinements validates request', async () => {
      const result = await criticAgent({ action: 'applyRefinements' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: request');
      expect(mockApplyRefinements).not.toHaveBeenCalled();
    });

    it('critiqueAndRefine returns combined summary', async () => {
      mockCritiqueAndRefine.mockReturnValue({
        critique: { overallScore: 0.81 },
        refinement: { improved: true, appliedCount: 2 },
      });
      const result = await criticAgent({ action: 'critiqueAndRefine', content: 'x' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('81%');
      expect(result.output).toContain('2 refinements');
    });

    it('setStrictness validates level', async () => {
      const result = await criticAgent({ action: 'setStrictness' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: level');
      expect(mockSetStrictness).not.toHaveBeenCalled();
    });

    it('setCriterionEnabled toggles criterion', async () => {
      const result = await criticAgent({
        action: 'setCriterionEnabled',
        criterion: 'clarity',
        enabled: true,
      });
      expect(result.success).toBe(true);
      expect(mockSetCriterionEnabled).toHaveBeenCalledWith('clarity', true);
    });

    it('setCriterionThreshold sets threshold', async () => {
      const result = await criticAgent({
        action: 'setCriterionThreshold',
        criterion: 'clarity',
        threshold: 0.75,
      });
      expect(result.success).toBe(true);
      expect(mockSetCriterionThreshold).toHaveBeenCalledWith('clarity', 0.75);
    });

    it('reset clears critic state', async () => {
      const result = await criticAgent({ action: 'reset' });
      expect(result.success).toBe(true);
      expect(mockResetCriticState).toHaveBeenCalled();
    });
  });

  describe('resiliency', () => {
    it('returns unknown action help', async () => {
      const result = await resiliency({ action: 'unknown' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Unknown resiliency action');
    });

    it('health returns success when score >= 0.7', async () => {
      mockGetHealthMetrics.mockReturnValue({
        healthScore: 0.9,
        errorCount: 1,
        circuitBreakers: 2,
      });
      const result = await resiliency({ action: 'health' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Health: 90%');
    });

    it('getCircuit validates name', async () => {
      const result = await resiliency({ action: 'getCircuit' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: name');
    });

    it('resetCircuits calls reset', async () => {
      const result = await resiliency({ action: 'resetCircuits' });
      expect(result.success).toBe(true);
      expect(mockResetAllCircuitBreakers).toHaveBeenCalled();
    });

    it('clearErrors clears history', async () => {
      const result = await resiliency({ action: 'clearErrors' });
      expect(result.success).toBe(true);
      expect(mockClearErrorHistory).toHaveBeenCalled();
    });

    it('createError validates required fields', async () => {
      const result = await resiliency({ action: 'createError', code: 'E_X' });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing: code, message');
      expect(mockCreateStructuredError).not.toHaveBeenCalled();
    });

    it('wrapError wraps error', async () => {
      mockWrapError.mockReturnValue({ code: 'E_WRAP' });
      const result = await resiliency({
        action: 'wrapError',
        code: 'E_WRAP',
        message: 'wrapped',
        cause: new Error('cause'),
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Error wrapped: E_WRAP');
    });

    it('getErrorChain validates structured error', async () => {
      mockIsStructuredError.mockReturnValue(false);
      const result = await resiliency({ action: 'getErrorChain', error: {} });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Missing or invalid: error');
      expect(mockGetErrorChain).not.toHaveBeenCalled();
    });

    it('createRecoveryChain succeeds', async () => {
      mockCreateRecoveryChain.mockReturnValue({ actions: [{ id: 1 }, { id: 2 }] });
      const result = await resiliency({
        action: 'createRecoveryChain',
        name: 'recover-api',
        actions: [{ id: 1 }, { id: 2 }],
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain('2 actions');
    });

    it('executeRecovery handles thrown error', async () => {
      mockExecuteRecoveryChain.mockRejectedValue(new Error('recovery blew up'));
      const result = await resiliency({
        action: 'executeRecovery',
        chain: { actions: [] },
      });
      expect(result.success).toBe(false);
      expect(result.output).toContain('Recovery failed: recovery blew up');
    });
  });
});
