/**
 * @fileOverview Tests for Self-Diagnostic System
 *
 * Tests Molly's ability to diagnose and heal herself.
 */

import * as diag from '../core/self-diagnostic';

// Mock child_process
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

// Mock fs
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    rm: jest.fn(),
  },
}));

// Mock os
jest.mock('os', () => ({
  loadavg: jest.fn(() => [1.0, 0.8, 0.6]),
  cpus: jest.fn(() => [1, 2, 3, 4]), // 4 cores
  totalmem: jest.fn(() => 16 * 1024 * 1024 * 1024), // 16GB
  freemem: jest.fn(() => 8 * 1024 * 1024 * 1024), // 8GB free
  uptime: jest.fn(() => 3600 * 24), // 24 hours
}));

// Mock Heart Gate
jest.mock('../safety/heart-gate', () => ({
  getGateStatus: jest.fn(() => ({
    gateClosed: false,
    overallAlignment: 0.9,
    totalChecks: 100,
    recentBlocks: 2,
  })),
  loadHeartGateState: jest.fn().mockResolvedValue(undefined),
}));

// Mock Self-Observation Loop
jest.mock('../cognition/self-observation-loop', () => ({
  getObservationStatus: jest.fn(() => ({
    totalObservations: 100,
    failureCount: 5,
    patternCount: 10,
  })),
  getPatterns: jest.fn(() => []),
  resetObservationState: jest.fn(),
}));

// Mock Curiosity Engine
jest.mock('../planning/curiosity-engine', () => ({
  getCuriosityStatus: jest.fn(() => ({
    totalQuestions: 50,
    activeQuestions: 10,
    totalInvestigations: 20,
  })),
  seedInitialCuriosity: jest.fn(),
}));

// Mock Model Router
jest.mock('@/ai/model-router', () => ({
  getModelRouter: jest.fn(() => ({
    getStats: jest.fn(() => ({
      totalCalls: 100,
      failedCalls: 5,
      averageLatency: 1000,
    })),
    getProviders: jest.fn(() => ['anthropic', 'google']),
  })),
}));

// Mock Rogue Mode
jest.mock('@/ai/rogue-mode', () => ({
  getRogueMode: jest.fn(() => ({
    active: false,
    reason: null,
  })),
}));

// Mock Initiative Engine
jest.mock('../planning/initiative-engine', () => ({
  getInitiatives: jest.fn(() => [
    { active: true, name: 'Test Initiative 1' },
    { active: false, name: 'Test Initiative 2' },
  ]),
}));

// Mock Logger
jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'trace-12345'),
}));

import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import { getGateStatus, loadHeartGateState } from '../safety/heart-gate';
import {
  getObservationStatus,
  getPatterns,
  resetObservationState,
} from '../cognition/self-observation-loop';
import {
  getCuriosityStatus,
  seedInitialCuriosity,
} from '../planning/curiosity-engine';
import { getModelRouter } from '@/ai/model-router';
import { getRogueMode } from '@/ai/rogue-mode';

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

describe('Self-Diagnostic System', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up environment with API keys
    process.env = {
      ...originalEnv,
      GOOGLE_API_KEY: 'test-google-key',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
    };

    // Reset default mocks
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('df -h')) {
        return Buffer.from('/dev/sda1 100G 50G 50G 50%');
      }
      if (cmd.includes('pgrep')) {
        return Buffer.from('5');
      }
      if (cmd.includes('host')) {
        return Buffer.from('google.com has address 142.250.185.14');
      }
      if (cmd.includes('curl')) {
        return Buffer.from('200');
      }
      return Buffer.from('');
    });

    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([
      'file1.json',
      'file2.json',
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
    mockFs.stat.mockResolvedValue({
      size: 1024,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fs.stat>>);
    mockFs.rm.mockResolvedValue(undefined);

    // Reset os mocks
    mockOs.loadavg.mockReturnValue([1.0, 0.8, 0.6]);
    mockOs.cpus.mockReturnValue([1, 2, 3, 4] as unknown as ReturnType<
      typeof os.cpus
    >);
    mockOs.totalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
    mockOs.freemem.mockReturnValue(8 * 1024 * 1024 * 1024);
    mockOs.uptime.mockReturnValue(3600 * 24);

    // Reset Heart Gate mock
    (getGateStatus as jest.Mock).mockReturnValue({
      gateClosed: false,
      overallAlignment: 0.9,
      totalChecks: 100,
      recentBlocks: 2,
    });

    // Reset Observation mock
    (getObservationStatus as jest.Mock).mockReturnValue({
      totalObservations: 100,
      failureCount: 5,
      patternCount: 10,
    });
    (getPatterns as jest.Mock).mockReturnValue([]);

    // Reset Curiosity mock
    (getCuriosityStatus as jest.Mock).mockReturnValue({
      totalQuestions: 50,
      activeQuestions: 10,
      totalInvestigations: 20,
    });

    // Reset Model Router mock
    (getModelRouter as jest.Mock).mockReturnValue({
      getStats: jest.fn(() => ({
        totalCalls: 100,
        failedCalls: 5,
        averageLatency: 1000,
      })),
      getProviders: jest.fn(() => ['anthropic', 'google']),
    });

    // Reset Rogue Mode mock - must return object with methods
    (getRogueMode as jest.Mock).mockReturnValue({
      isActive: () => false,
      getCurrentMission: () => null,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Type Definitions', () => {
    it('should support all diagnostic severities', () => {
      const severities: diag.DiagnosticSeverity[] = [
        'healthy',
        'degraded',
        'critical',
        'unknown',
      ];

      expect(severities).toHaveLength(4);
    });

    it('should support all healing actions', () => {
      const actions: diag.HealingAction[] = [
        'restart_component',
        'clear_cache',
        'reset_state',
        'reload_config',
        'none',
      ];

      expect(actions).toHaveLength(5);
    });
  });

  describe('runFullDiagnostic', () => {
    it('should return healthy status when all systems are good', async () => {
      const result = await diag.runFullDiagnostic();

      expect(result.overallStatus).toBe('healthy');
      expect(result.criticalIssues).toHaveLength(0);
      expect(result.traceId).toBe('trace-12345');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should include all domains in diagnostic', async () => {
      const result = await diag.runFullDiagnostic();

      expect(result.domains.system).toBeDefined();
      expect(result.domains.aiCore).toBeDefined();
      expect(result.domains.memory).toBeDefined();
      expect(result.domains.agency).toBeDefined();
      expect(result.domains.network).toBeDefined();
    });

    it('should detect critical CPU usage', async () => {
      // Simulate 95% CPU usage (load avg 3.8 on 4 cores)
      mockOs.loadavg.mockReturnValue([3.8, 3.5, 3.2]);

      const result = await diag.runFullDiagnostic();

      expect(result.overallStatus).toBe('critical');
      expect(
        result.domains.system.recommendations.some((r) =>
          r.includes('CRITICAL: CPU')
        )
      ).toBe(true);
    });

    it('should detect critical memory usage', async () => {
      // Simulate 95% memory usage
      mockOs.totalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
      mockOs.freemem.mockReturnValue(0.8 * 1024 * 1024 * 1024); // 5% free

      const result = await diag.runFullDiagnostic();

      expect(result.overallStatus).toBe('critical');
      expect(
        result.domains.system.recommendations.some((r) =>
          r.includes('CRITICAL: Memory')
        )
      ).toBe(true);
    });

    it('should detect closed Heart Gate as critical', async () => {
      (getGateStatus as jest.Mock).mockReturnValue({
        gateClosed: true,
        overallAlignment: 0.1,
        totalChecks: 100,
        recentBlocks: 50,
      });

      const result = await diag.runFullDiagnostic();

      expect(result.overallStatus).toBe('critical');
      expect(result.criticalIssues.some((i) => i.includes('Heart Gate'))).toBe(
        true
      );
    });

    it('should attempt healing when autoHeal is true', async () => {
      // Set up a condition that needs healing
      (getCuriosityStatus as jest.Mock).mockReturnValue({
        totalQuestions: 0,
        activeQuestions: 0,
        totalInvestigations: 0,
      });

      const result = await diag.runFullDiagnostic(true);

      expect(result.healingReport.attempted.length).toBeGreaterThan(0);
      expect(seedInitialCuriosity).toHaveBeenCalled();
    });

    it('should report healing recommendations when autoHeal is false', async () => {
      (getCuriosityStatus as jest.Mock).mockReturnValue({
        totalQuestions: 0,
        activeQuestions: 0,
        totalInvestigations: 0,
      });

      const result = await diag.runFullDiagnostic(false);

      expect(result.healingReport.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('quickHealthCheck', () => {
    it('should return healthy when all quick checks pass', async () => {
      const result = await diag.quickHealthCheck();

      expect(result.healthy).toBe(true);
      expect(result.status).toBe('healthy');
      expect(result.issues).toHaveLength(0);
    });

    it('should detect critical CPU in quick check', async () => {
      mockOs.loadavg.mockReturnValue([4.0, 3.5, 3.2]); // 100% on 4 cores

      const result = await diag.quickHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.issues.some((i) => i.includes('CPU'))).toBe(true);
    });

    it('should detect critical memory in quick check', async () => {
      mockOs.totalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
      mockOs.freemem.mockReturnValue(0.5 * 1024 * 1024 * 1024);

      const result = await diag.quickHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.issues.some((i) => i.includes('Memory'))).toBe(true);
    });

    it('should detect closed Heart Gate in quick check', async () => {
      (getGateStatus as jest.Mock).mockReturnValue({
        gateClosed: true,
        overallAlignment: 0.1,
        totalChecks: 100,
        recentBlocks: 50,
      });

      const result = await diag.quickHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.status).toBe('critical');
      expect(result.issues.some((i) => i.includes('Heart Gate'))).toBe(true);
    });

    it('should handle Heart Gate read errors', async () => {
      (getGateStatus as jest.Mock).mockImplementation(() => {
        throw new Error('Gate unavailable');
      });

      const result = await diag.quickHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.issues.some((i) => i.includes('Unable to read'))).toBe(
        true
      );
    });
  });

  describe('diagnoseDomain', () => {
    it('should diagnose system domain', async () => {
      const result = await diag.diagnoseDomain('system');

      expect(result.domain).toBe('system');
      expect(result.checks.some((c) => c.name === 'cpu_usage')).toBe(true);
      expect(result.checks.some((c) => c.name === 'memory_usage')).toBe(true);
      expect(result.checks.some((c) => c.name === 'disk_usage')).toBe(true);
    });

    it('should diagnose aiCore domain', async () => {
      const result = await diag.diagnoseDomain('aiCore');

      expect(result.domain).toBe('aiCore');
      expect(result.checks.some((c) => c.name === 'heart_gate')).toBe(true);
      expect(result.checks.some((c) => c.name === 'model_router')).toBe(true);
      expect(result.checks.some((c) => c.name === 'rogue_mode')).toBe(true);
    });

    it('should diagnose memory domain', async () => {
      const result = await diag.diagnoseDomain('memory');

      expect(result.domain).toBe('memory');
      expect(result.checks.some((c) => c.name === 'curiosity_engine')).toBe(
        true
      );
      expect(result.checks.some((c) => c.name === 'storage_access')).toBe(true);
    });

    it('should diagnose agency domain', async () => {
      const result = await diag.diagnoseDomain('agency');

      expect(result.domain).toBe('agency');
      expect(result.checks.some((c) => c.name === 'self_observation')).toBe(
        true
      );
      expect(result.checks.some((c) => c.name === 'initiative_engine')).toBe(
        true
      );
    });

    it('should diagnose network domain', async () => {
      const result = await diag.diagnoseDomain('network');

      expect(result.domain).toBe('network');
      expect(result.checks.some((c) => c.name === 'dns_resolution')).toBe(true);
      expect(
        result.checks.some((c) => c.name === 'internet_connectivity')
      ).toBe(true);
    });

    it('should handle unknown domain', async () => {
      const result = await diag.diagnoseDomain('invalid' as never);

      expect(result.domain).toBe('unknown');
      expect(result.status).toBe('unknown');
    });
  });

  describe('System Diagnostics', () => {
    it('should detect degraded CPU', async () => {
      // 75% CPU (load 3.0 on 4 cores)
      mockOs.loadavg.mockReturnValue([3.0, 2.8, 2.5]);

      const result = await diag.diagnoseDomain('system');
      const cpuCheck = result.checks.find((c) => c.name === 'cpu_usage');

      expect(cpuCheck?.status).toBe('degraded');
    });

    it('should detect degraded memory', async () => {
      // 80% memory usage
      mockOs.totalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
      mockOs.freemem.mockReturnValue(3.2 * 1024 * 1024 * 1024);

      const result = await diag.diagnoseDomain('system');
      const memCheck = result.checks.find((c) => c.name === 'memory_usage');

      expect(memCheck?.status).toBe('degraded');
    });

    it('should handle disk check failure', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('df -h')) {
          throw new Error('Disk unavailable');
        }
        return Buffer.from('');
      });

      const result = await diag.diagnoseDomain('system');
      const diskCheck = result.checks.find((c) => c.name === 'disk_usage');

      expect(diskCheck?.status).toBe('unknown');
    });

    it('should detect critical disk usage', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('df -h')) {
          return Buffer.from('/dev/sda1 100G 96G 4G 96%');
        }
        return Buffer.from('5');
      });

      const result = await diag.diagnoseDomain('system');
      const diskCheck = result.checks.find((c) => c.name === 'disk_usage');

      expect(diskCheck?.status).toBe('critical');
    });

    it('should detect too many node processes', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('pgrep')) {
          return Buffer.from('25');
        }
        if (cmd.includes('df -h')) {
          return Buffer.from('/dev/sda1 100G 50G 50G 50%');
        }
        return Buffer.from('');
      });

      const result = await diag.diagnoseDomain('system');
      const procCheck = result.checks.find((c) => c.name === 'node_processes');

      expect(procCheck?.status).toBe('degraded');
    });

    it('should track system uptime', async () => {
      mockOs.uptime.mockReturnValue(86400); // 24 hours

      const result = await diag.diagnoseDomain('system');
      const uptimeCheck = result.checks.find((c) => c.name === 'system_uptime');

      expect(uptimeCheck?.value).toBe(24);
    });
  });

  describe('AI Core Diagnostics', () => {
    it('should detect model router with no providers', async () => {
      (getModelRouter as jest.Mock).mockReturnValue({
        getStats: () => ({ totalCalls: 0, failedCalls: 0, averageLatency: 0 }),
        getProviders: () => [],
      });

      const result = await diag.diagnoseDomain('aiCore');

      expect(result.status).toBe('critical');
      expect(
        result.recommendations.some((r) => r.includes('No AI providers'))
      ).toBe(true);
    });

    it('should detect high AI error rate', async () => {
      (getModelRouter as jest.Mock).mockReturnValue({
        getStats: () => ({
          totalCalls: 100,
          failedCalls: 35,
          averageLatency: 1000,
        }),
        getProviders: () => ['provider1'],
      });

      const result = await diag.diagnoseDomain('aiCore');
      const routerCheck = result.checks.find((c) => c.name === 'model_router');

      expect(routerCheck?.status).toBe('critical');
    });

    it('should detect slow AI responses', async () => {
      (getModelRouter as jest.Mock).mockReturnValue({
        getStats: () => ({
          totalCalls: 100,
          failedCalls: 2,
          averageLatency: 16000,
        }),
        getProviders: () => ['provider1'],
      });

      const result = await diag.diagnoseDomain('aiCore');

      expect(result.status).toBe('critical');
      expect(
        result.checks.some(
          (c) => c.name === 'ai_response_time' && c.status === 'critical'
        )
      ).toBe(true);
    });

    it('should detect recent Heart Gate blocks', async () => {
      (getGateStatus as jest.Mock).mockReturnValue({
        gateClosed: false,
        overallAlignment: 0.8,
        totalChecks: 100,
        recentBlocks: 10,
      });

      const result = await diag.diagnoseDomain('aiCore');
      const gateCheck = result.checks.find((c) => c.name === 'heart_gate');

      expect(gateCheck?.status).toBe('degraded');
    });

    it('should check rogue mode status', async () => {
      (getRogueMode as jest.Mock).mockReturnValue({
        isActive: () => true,
        getCurrentMission: () => ({ name: 'Testing emergency protocol' }),
      });

      const result = await diag.diagnoseDomain('aiCore');
      const rogueCheck = result.checks.find((c) => c.name === 'rogue_mode');

      expect(rogueCheck?.value).toBe('ACTIVE');
      expect(rogueCheck?.details).toContain('Testing emergency protocol');
    });
  });

  describe('Memory Diagnostics', () => {
    it('should detect empty curiosity engine', async () => {
      (getCuriosityStatus as jest.Mock).mockReturnValue({
        totalQuestions: 0,
        activeQuestions: 0,
        totalInvestigations: 0,
      });

      const result = await diag.diagnoseDomain('memory');

      expect(result.status).toBe('degraded');
      expect(
        result.recommendations.some((r) =>
          r.includes('Curiosity Engine has no questions')
        )
      ).toBe(true);
    });

    it('should detect storage access issues', async () => {
      mockFs.access.mockRejectedValue(new Error('Permission denied'));

      const result = await diag.diagnoseDomain('memory');

      expect(result.status).toBe('critical');
      expect(
        result.checks.some(
          (c) => c.name === 'storage_access' && c.status === 'critical'
        )
      ).toBe(true);
    });

    it('should detect stale state files', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago

      mockFs.stat.mockResolvedValue({
        size: 1024,
        mtime: oldDate,
      } as Awaited<ReturnType<typeof fs.stat>>);

      const result = await diag.diagnoseDomain('memory');

      expect(
        result.recommendations.some((r) => r.includes("hasn't been updated"))
      ).toBe(true);
    });

    it('should handle missing state files', async () => {
      mockFs.stat.mockRejectedValue(new Error('File not found'));

      const result = await diag.diagnoseDomain('memory');

      expect(result.checks.some((c) => c.value === 'missing')).toBe(true);
    });
  });

  describe('Agency Diagnostics', () => {
    it('should detect high tool failure rate', async () => {
      (getObservationStatus as jest.Mock).mockReturnValue({
        totalObservations: 100,
        failureCount: 35,
        patternCount: 10,
      });

      const result = await diag.diagnoseDomain('agency');

      expect(result.status).toBe('critical');
      expect(
        result.recommendations.some((r) => r.includes('Tool failure rate'))
      ).toBe(true);
    });

    it('should detect critical unacknowledged patterns', async () => {
      (getPatterns as jest.Mock).mockReturnValue([
        { name: 'Critical Bug Pattern', severity: 'critical' },
        { name: 'Another Critical', severity: 'critical' },
      ]);

      const result = await diag.diagnoseDomain('agency');

      expect(result.status).toBe('critical');
      expect(result.checks.some((c) => c.name === 'critical_patterns')).toBe(
        true
      );
    });

    it('should report active initiatives', async () => {
      const result = await diag.diagnoseDomain('agency');
      const initCheck = result.checks.find(
        (c) => c.name === 'initiative_engine'
      );

      expect(initCheck?.value).toBe('1/2 active');
    });
  });

  describe('Network Diagnostics', () => {
    it('should detect DNS failure', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('host')) {
          throw new Error('DNS lookup failed');
        }
        return Buffer.from('');
      });

      const result = await diag.diagnoseDomain('network');

      expect(result.status).toBe('critical');
      expect(
        result.checks.some(
          (c) => c.name === 'dns_resolution' && c.status === 'critical'
        )
      ).toBe(true);
    });

    it('should detect connectivity issues', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('curl')) {
          throw new Error('Connection timeout');
        }
        if (cmd.includes('host')) {
          return Buffer.from('resolved');
        }
        return Buffer.from('');
      });

      const result = await diag.diagnoseDomain('network');
      const connCheck = result.checks.find(
        (c) => c.name === 'internet_connectivity'
      );

      expect(connCheck?.status).toBe('degraded');
    });

    it('should detect missing Gemini API key', async () => {
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const result = await diag.diagnoseDomain('network');
      const geminiCheck = result.checks.find((c) => c.name === 'gemini_api');

      expect(geminiCheck?.status).toBe('critical');
      expect(geminiCheck?.value).toBe('no key');
    });

    it('should detect Claude API availability', async () => {
      const result = await diag.diagnoseDomain('network');
      const claudeCheck = result.checks.find((c) => c.name === 'claude_api');

      expect(claudeCheck?.status).toBe('healthy');
      expect(claudeCheck?.details).toContain('Rogue Protocol available');
    });
  });

  describe('Self-Healing', () => {
    it('should reset observation state for agency domain', async () => {
      (getObservationStatus as jest.Mock).mockReturnValue({
        totalObservations: 100,
        failureCount: 35,
        patternCount: 10,
      });

      await diag.runFullDiagnostic(true);

      expect(resetObservationState).toHaveBeenCalled();
    });

    it('should reseed curiosity for memory domain', async () => {
      (getCuriosityStatus as jest.Mock).mockReturnValue({
        totalQuestions: 0,
        activeQuestions: 0,
        totalInvestigations: 0,
      });

      await diag.runFullDiagnostic(true);

      expect(seedInitialCuriosity).toHaveBeenCalled();
    });

    it('should reload Heart Gate state for aiCore domain', async () => {
      (getGateStatus as jest.Mock).mockReturnValue({
        gateClosed: true,
        overallAlignment: 0.1,
        totalChecks: 100,
        recentBlocks: 50,
      });

      await diag.runFullDiagnostic(true);

      expect(loadHeartGateState).toHaveBeenCalled();
    });

    it('should attempt to clear cache', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('df -h')) {
          return Buffer.from('/dev/sda1 100G 96G 4G 96%');
        }
        return Buffer.from('5');
      });

      const result = await diag.runFullDiagnostic(true);
      const cacheAttempt = result.healingReport.attempted.find(
        (a) => a.action === 'clear_cache'
      );

      expect(cacheAttempt).toBeDefined();
    });

    it('should report failed healing actions', async () => {
      (getModelRouter as jest.Mock).mockReturnValue({
        getStats: () => ({ totalCalls: 0, failedCalls: 0, averageLatency: 0 }),
        getProviders: () => [],
      });

      const result = await diag.runFullDiagnostic(true);
      const configAttempt = result.healingReport.attempted.find(
        (a) => a.action === 'reload_config'
      );

      expect(configAttempt?.success).toBe(false);
      expect(configAttempt?.message).toContain('manual intervention');
    });

    it('should handle none healing action', async () => {
      // When all systems are healthy, no healing should be attempted
      const result = await diag.runFullDiagnostic(true);

      // Healthy systems should have no healing attempts
      expect(result.healingReport.attempted).toHaveLength(0);
    });
  });

  describe('formatDiagnosticReport', () => {
    it('should format a healthy diagnostic', async () => {
      const diagnostic = await diag.runFullDiagnostic();
      const report = diag.formatDiagnosticReport(diagnostic);

      expect(report).toContain('MOLLY SELF-DIAGNOSTIC REPORT');
      expect(report).toContain('Status: HEALTHY');
      expect(report).toContain('trace-12345');
    });

    it('should include critical issues in report', async () => {
      (getGateStatus as jest.Mock).mockReturnValue({
        gateClosed: true,
        overallAlignment: 0.1,
        totalChecks: 100,
        recentBlocks: 50,
      });

      const diagnostic = await diag.runFullDiagnostic();
      const report = diag.formatDiagnosticReport(diagnostic);

      expect(report).toContain('CRITICAL ISSUES');
      expect(report).toContain('Heart Gate');
    });

    it('should format all domain statuses', async () => {
      const diagnostic = await diag.runFullDiagnostic();
      const report = diag.formatDiagnosticReport(diagnostic);

      expect(report).toContain('SYSTEM');
      expect(report).toContain('AICORE');
      expect(report).toContain('MEMORY');
      expect(report).toContain('AGENCY');
      expect(report).toContain('NETWORK');
    });

    it('should include healing report when actions attempted', async () => {
      (getCuriosityStatus as jest.Mock).mockReturnValue({
        totalQuestions: 0,
        activeQuestions: 0,
        totalInvestigations: 0,
      });

      const diagnostic = await diag.runFullDiagnostic(true);
      const report = diag.formatDiagnosticReport(diagnostic);

      expect(report).toContain('HEALING REPORT');
    });

    it('should use correct icons for status', async () => {
      mockOs.loadavg.mockReturnValue([3.8, 3.5, 3.2]); // Critical

      const diagnostic = await diag.runFullDiagnostic();
      const report = diag.formatDiagnosticReport(diagnostic);

      // Critical should have ✗
      expect(report).toContain('✗');
    });

    it('should include check details in report', async () => {
      const diagnostic = await diag.runFullDiagnostic();
      const report = diag.formatDiagnosticReport(diagnostic);

      // Should include details like load average, memory info
      expect(report).toContain('Load average');
    });
  });

  describe('Edge Cases', () => {
    it('should handle model router throwing error', async () => {
      (getModelRouter as jest.Mock).mockImplementation(() => {
        throw new Error('Router unavailable');
      });

      const result = await diag.diagnoseDomain('aiCore');
      const routerCheck = result.checks.find((c) => c.name === 'model_router');

      expect(routerCheck?.status).toBe('unknown');
      expect(routerCheck?.details).toContain('Router unavailable');
    });

    it('should handle observation status throwing error', async () => {
      (getObservationStatus as jest.Mock).mockImplementation(() => {
        throw new Error('Observation failed');
      });

      const result = await diag.diagnoseDomain('agency');
      const obsCheck = result.checks.find((c) => c.name === 'self_observation');

      expect(obsCheck?.status).toBe('unknown');
    });

    it('should handle curiosity status throwing error', async () => {
      (getCuriosityStatus as jest.Mock).mockImplementation(() => {
        throw new Error('Curiosity failed');
      });

      const result = await diag.diagnoseDomain('memory');
      const curCheck = result.checks.find((c) => c.name === 'curiosity_engine');

      expect(curCheck?.status).toBe('unknown');
    });

    it('should not fail on missing uptime', async () => {
      mockOs.uptime.mockImplementation(() => {
        throw new Error('Uptime unavailable');
      });

      const result = await diag.diagnoseDomain('system');

      // Should still complete, uptime is non-critical
      expect(result.domain).toBe('system');
    });

    it('should handle rogue mode throwing error', async () => {
      (getRogueMode as jest.Mock).mockImplementation(() => {
        throw new Error('Rogue mode unavailable');
      });

      const result = await diag.diagnoseDomain('aiCore');
      const rogueCheck = result.checks.find((c) => c.name === 'rogue_mode');

      expect(rogueCheck?.status).toBe('unknown');
    });
  });
});
