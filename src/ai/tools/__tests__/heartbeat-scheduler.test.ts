/**
 * @fileOverview Tests for Heartbeat Scheduler
 *
 * Tests heartbeat scheduler functionality including:
 * - Lifecycle management (start, stop, pause, resume)
 * - Task execution
 * - System pressure detection
 * - State persistence
 */

// Mock logger
jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn().mockReturnValue('test-trace-id'),
}));

// Mock session manager
jest.mock('@/lib/session-manager', () => ({
  saveSessionState: jest.fn(),
  loadSessionState: jest.fn().mockReturnValue({ runtime: { events: [] } }),
}));

// Mock runtime snapshot
jest.mock('@/ai/tools/runtime-snapshot', () => ({
  collectRuntimeSnapshot: jest.fn().mockResolvedValue({}),
}));

// Mock neural engram
jest.mock('@/ai/memory/neural-engram', () => ({
  NeuralEngramSystem: jest.fn(),
}));

// Mock consciousness
jest.mock('@/ai/consciousness', () => ({
  getConsciousness: jest.fn().mockReturnValue({
    runCycle: jest.fn().mockResolvedValue({
      awarenessLevel: 'active',
      regulationMode: 'normal',
      pendingMessages: 0,
    }),
    getState: jest.fn().mockReturnValue({
      awarenessLevel: 'active',
      regulation: { mode: 'normal' },
      vitals: { circuitBreakerOpen: false, errorRate: 0 },
    }),
    getPendingMessageCount: jest.fn().mockReturnValue(0),
    queueMessage: jest.fn(),
    serialize: jest.fn().mockReturnValue({}),
    restoreFrom: jest.fn(),
  }),
}));

// Mock promise tracker
jest.mock('@/ai/consciousness/promise-tracker', () => ({
  getPromiseTracker: jest.fn().mockReturnValue({
    expireOld: jest.fn().mockReturnValue(0),
    getDuePromises: jest.fn().mockReturnValue([]),
    getSummary: jest.fn().mockReturnValue('No active promises'),
    serialize: jest.fn().mockReturnValue([]),
    restoreFrom: jest.fn(),
  }),
}));

// Mock circuit breaker
jest.mock('@/ai/tools/circuit-breaker', () => ({
  getCircuitBreaker: jest.fn().mockReturnValue({
    getStatus: jest.fn().mockReturnValue({
      global: { state: 'CLOSED' },
    }),
  }),
  CircuitState: { CLOSED: 'CLOSED', OPEN: 'OPEN' },
}));

// Mock rate limiter
jest.mock('@/ai/tools/rate-limiter', () => ({
  getRateLimiter: jest.fn().mockReturnValue({
    getStatus: jest.fn().mockReturnValue({ percentageUsed: 50 }),
  }),
}));

// Mock terminal
jest.mock('@/ai/terminal', () => ({
  getMollyShell: jest.fn().mockReturnValue({
    isAlive: jest.fn().mockReturnValue(true),
    start: jest.fn(),
  }),
  getPolyglotRuntime: jest.fn().mockReturnValue({
    discover: jest.fn().mockResolvedValue(new Map()),
  }),
}));

// Mock persistence
jest.mock('@/ai/persistence', () => ({
  getStatePersistence: jest.fn().mockReturnValue({
    save: jest.fn().mockResolvedValue(undefined),
    restore: jest.fn().mockResolvedValue(null),
  }),
}));

// Mock autonomous scheduler
jest.mock('@/ai/tools/autonomous-scheduler', () => ({
  getAutonomousScheduler: jest.fn().mockReturnValue({
    runDueJobs: jest.fn().mockResolvedValue(0),
    serialize: jest.fn().mockReturnValue([]),
    restoreFrom: jest.fn(),
  }),
}));

// Mock moltbook social
jest.mock('@/ai/flows/moltbook-social', () => ({
  runMoltbookCycle: jest.fn().mockResolvedValue(null),
}));

// Mock family bridge
jest.mock('@/ai/bridge/family-bridge', () => ({
  getUnreadMessages: jest.fn().mockResolvedValue([]),
  sendMessage: jest.fn().mockResolvedValue(undefined),
  markMessagesRead: jest.fn().mockResolvedValue(undefined),
}));

// Mock fs for pressure detection
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readdirSync: jest.fn().mockReturnValue([]),
  rmSync: jest.fn(),
  readFileSync: jest.fn().mockImplementation((path: string) => {
    if (path === '/proc/loadavg') return '0.5 0.4 0.3 1/100 1000\n';
    if (path === '/proc/cpuinfo') return 'processor\t: 0\nprocessor\t: 1\n';
    if (path === '/proc/meminfo')
      return 'MemTotal: 8000000 kB\nMemAvailable: 6000000 kB\n';
    return '';
  }),
}));

import {
  HeartbeatScheduler,
  getHeartbeatScheduler,
  isHeartbeatRunning,
} from '../heartbeat-scheduler';
import { getConsciousness } from '@/ai/consciousness';
import { collectRuntimeSnapshot } from '@/ai/tools/runtime-snapshot';
import { getAutonomousScheduler } from '@/ai/tools/autonomous-scheduler';
import { getStatePersistence } from '@/ai/persistence';

describe('HeartbeatScheduler', () => {
  let scheduler: HeartbeatScheduler;

  beforeEach(() => {
    jest.useFakeTimers();
    // Create with all tasks disabled to prevent auto-execution
    scheduler = new HeartbeatScheduler({
      intervalMs: 1000,
      tasks: {
        heartbeat: false,
        consolidation: false,
        immune: false,
        snapshot: false,
        consciousness: false,
        reflection: false,
        promiseCheck: false,
        persistence: false,
        scheduledJobs: false,
        moltbook: false,
        bridgePolling: false,
        autonomousCycle: false,
        memoryLearning: false,
        deviceHealth: false,
      },
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    scheduler.stop();
    jest.useRealTimers();
  });

  describe('Lifecycle', () => {
    it('starts scheduler', () => {
      scheduler.start();

      const status = scheduler.getStatus();
      expect(status.status).toBe('running');
      expect(status.cycleCount).toBe(1); // First cycle runs immediately
    });

    it('stops scheduler', () => {
      scheduler.start();
      scheduler.stop();

      expect(scheduler.getStatus().status).toBe('stopped');
    });

    it('pauses scheduler', () => {
      scheduler.start();
      scheduler.pause();

      expect(scheduler.getStatus().status).toBe('paused');
    });

    it('resumes scheduler', () => {
      scheduler.start();
      scheduler.pause();
      scheduler.resume();

      expect(scheduler.getStatus().status).toBe('running');
    });

    it('does not double-start', () => {
      scheduler.start();
      scheduler.start(); // Should not create second timer

      expect(scheduler.getStatus().status).toBe('running');
    });

    it('increments cycle count', () => {
      scheduler.start();
      expect(scheduler.getStatus().cycleCount).toBe(1);

      jest.advanceTimersByTime(1000);
      expect(scheduler.getStatus().cycleCount).toBe(2);

      jest.advanceTimersByTime(1000);
      expect(scheduler.getStatus().cycleCount).toBe(3);
    });
  });

  describe('Task Execution', () => {
    it('executes heartbeat task', async () => {
      const taskScheduler = new HeartbeatScheduler({
        intervalMs: 60000,
        tasks: {
          heartbeat: true,
          consolidation: false,
          immune: false,
          snapshot: false,
          consciousness: false,
          reflection: false,
          promiseCheck: false,
          persistence: false,
          scheduledJobs: false,
          moltbook: false,
          bridgePolling: false,
          autonomousCycle: false,
          memoryLearning: false,
          deviceHealth: false,
        },
      });

      taskScheduler.start();
      await jest.advanceTimersByTimeAsync(100);

      const { saveSessionState } = await import('@/lib/session-manager');
      expect(saveSessionState).toHaveBeenCalled();

      taskScheduler.stop();
    });

    it('executes snapshot task', async () => {
      const taskScheduler = new HeartbeatScheduler({
        intervalMs: 60000,
        tasks: {
          heartbeat: false,
          consolidation: false,
          immune: false,
          snapshot: true,
          consciousness: false,
          reflection: false,
          promiseCheck: false,
          persistence: false,
          scheduledJobs: false,
          moltbook: false,
          bridgePolling: false,
          autonomousCycle: false,
          memoryLearning: false,
          deviceHealth: false,
        },
      });

      taskScheduler.start();
      await jest.advanceTimersByTimeAsync(100);

      expect(collectRuntimeSnapshot).toHaveBeenCalled();

      taskScheduler.stop();
    });

    it('executes consciousness task', async () => {
      const taskScheduler = new HeartbeatScheduler({
        intervalMs: 60000,
        tasks: {
          heartbeat: false,
          consolidation: false,
          immune: false,
          snapshot: false,
          consciousness: true,
          reflection: false,
          promiseCheck: false,
          persistence: false,
          scheduledJobs: false,
          moltbook: false,
          bridgePolling: false,
          autonomousCycle: false,
          memoryLearning: false,
          deviceHealth: false,
        },
      });

      taskScheduler.start();
      await jest.advanceTimersByTimeAsync(100);

      const consciousness = getConsciousness();
      expect(consciousness.runCycle).toHaveBeenCalled();

      taskScheduler.stop();
    });

    it('executes scheduled jobs task', async () => {
      const taskScheduler = new HeartbeatScheduler({
        intervalMs: 60000,
        tasks: {
          heartbeat: false,
          consolidation: false,
          immune: false,
          snapshot: false,
          consciousness: false,
          reflection: false,
          promiseCheck: false,
          persistence: false,
          scheduledJobs: true,
          moltbook: false,
          bridgePolling: false,
          autonomousCycle: false,
          memoryLearning: false,
          deviceHealth: false,
        },
      });

      taskScheduler.start();
      await jest.advanceTimersByTimeAsync(100);

      const autonomousScheduler = getAutonomousScheduler();
      expect(autonomousScheduler.runDueJobs).toHaveBeenCalled();

      taskScheduler.stop();
    });
  });

  describe('Task Intervals', () => {
    it('skips consolidation when no engram system attached', async () => {
      const taskScheduler = new HeartbeatScheduler({
        intervalMs: 1000,
        consolidationIntervalMs: 1, // Very short to be due immediately
        tasks: {
          heartbeat: false,
          consolidation: true,
          immune: false,
          snapshot: false,
          consciousness: false,
          reflection: false,
          promiseCheck: false,
          persistence: false,
          scheduledJobs: false,
          moltbook: false,
          bridgePolling: false,
          autonomousCycle: false,
          memoryLearning: false,
          deviceHealth: false,
        },
      });

      taskScheduler.start();
      await jest.advanceTimersByTimeAsync(100);

      const history = taskScheduler.getHistory();
      const consolidationTask = history[0]?.tasks.find(
        (t) => t.name === 'consolidation'
      );
      expect(consolidationTask?.skipped).toContain('No engram system');

      taskScheduler.stop();
    });
  });

  describe('System Pressure', () => {
    it('detects high CPU pressure', async () => {
      const fs = await import('fs');
      (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path === '/proc/loadavg') return '4.0 3.0 2.0 1/100 1000\n'; // High load
        if (path === '/proc/cpuinfo') return 'processor\t: 0\nprocessor\t: 1\n';
        if (path === '/proc/meminfo')
          return 'MemTotal: 8000000 kB\nMemAvailable: 6000000 kB\n';
        return '';
      });

      const pressureScheduler = new HeartbeatScheduler({
        intervalMs: 60000,
        cpuPressureThreshold: 70,
        tasks: {
          heartbeat: false,
          consolidation: false,
          immune: false,
          snapshot: true, // Will be skipped under pressure
          consciousness: false,
          reflection: false,
          promiseCheck: false,
          persistence: false,
          scheduledJobs: false,
          moltbook: false,
          bridgePolling: false,
          autonomousCycle: false,
          memoryLearning: false,
          deviceHealth: false,
        },
      });

      pressureScheduler.start();
      await jest.advanceTimersByTimeAsync(100);

      const history = pressureScheduler.getHistory();
      expect(history[0]?.systemPressure).toBe(true);
      const snapshotTask = history[0]?.tasks.find((t) => t.name === 'snapshot');
      expect(snapshotTask?.skipped).toContain('pressure');

      pressureScheduler.stop();
    });

    it('detects high memory pressure', async () => {
      const fs = await import('fs');
      (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path === '/proc/loadavg') return '0.5 0.4 0.3 1/100 1000\n';
        if (path === '/proc/cpuinfo') return 'processor\t: 0\nprocessor\t: 1\n';
        if (path === '/proc/meminfo')
          return 'MemTotal: 8000000 kB\nMemAvailable: 500000 kB\n'; // Low available
        return '';
      });

      const pressureScheduler = new HeartbeatScheduler({
        intervalMs: 60000,
        memoryPressureThreshold: 85,
        tasks: {
          heartbeat: true,
          consolidation: false,
          immune: false,
          snapshot: false,
          consciousness: false,
          reflection: false,
          promiseCheck: false,
          persistence: false,
          scheduledJobs: false,
          moltbook: false,
          bridgePolling: false,
          autonomousCycle: false,
          memoryLearning: false,
          deviceHealth: false,
        },
      });

      pressureScheduler.start();
      await jest.advanceTimersByTimeAsync(100);

      expect(pressureScheduler.getHistory()[0]?.systemPressure).toBe(true);

      pressureScheduler.stop();
    });
  });

  describe('Persistence', () => {
    it('force persists state', async () => {
      scheduler.start();
      await scheduler.forcePersist();

      const persistence = getStatePersistence();
      expect(persistence.save).toHaveBeenCalledWith(
        expect.any(Object),
        true // force flag
      );
    });

    it('restores state on start', async () => {
      const persistence = getStatePersistence();
      (persistence.restore as jest.Mock).mockResolvedValueOnce({
        savedAt: new Date().toISOString(),
        consciousness: { test: true },
        promises: [],
        schedulerJobs: [],
      });

      scheduler.start();
      await jest.advanceTimersByTimeAsync(100);

      expect(persistence.restore).toHaveBeenCalled();
    });
  });

  describe('History', () => {
    it('maintains cycle history', async () => {
      // Create scheduler with heartbeat task enabled
      const historyScheduler = new HeartbeatScheduler({
        intervalMs: 50,
        tasks: {
          heartbeat: true,
          consolidation: false,
          immune: false,
          snapshot: false,
          consciousness: false,
          reflection: false,
          promiseCheck: false,
          persistence: false,
          scheduledJobs: false,
          moltbook: false,
          bridgePolling: false,
          autonomousCycle: false,
          memoryLearning: false,
          deviceHealth: false,
        },
      });

      historyScheduler.start(); // First cycle runs immediately
      // Wait for async cycle to complete
      await jest.advanceTimersByTimeAsync(10);

      const history = historyScheduler.getHistory();
      // At minimum, first cycle should be recorded
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].cycle).toBe(1);
      expect(history[0].tasks).toBeDefined();

      historyScheduler.stop();
    });

    it('records cycle info in history', async () => {
      // Start with tasks
      const historyScheduler = new HeartbeatScheduler({
        intervalMs: 60000,
        tasks: {
          heartbeat: true,
          consolidation: false,
          immune: false,
          snapshot: false,
          consciousness: false,
          reflection: false,
          promiseCheck: false,
          persistence: false,
          scheduledJobs: false,
          moltbook: false,
          bridgePolling: false,
          autonomousCycle: false,
          memoryLearning: false,
          deviceHealth: false,
        },
      });

      historyScheduler.start();
      // Wait for async cycle to complete
      await jest.advanceTimersByTimeAsync(10);

      const history = historyScheduler.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);

      const entry = history[0];
      expect(entry.cycle).toBe(1);
      expect(entry.timestamp).toBeDefined();
      expect(entry.traceId).toBeDefined();
      expect(Array.isArray(entry.tasks)).toBe(true);

      historyScheduler.stop();
    });
  });

  describe('Error Handling', () => {
    it('continues running after task error', async () => {
      // The snapshot function will throw
      const mockSnapshot = collectRuntimeSnapshot as jest.Mock;
      mockSnapshot.mockReset();
      mockSnapshot.mockRejectedValue(new Error('Snapshot failed'));

      const errorScheduler = new HeartbeatScheduler({
        intervalMs: 100,
        tasks: {
          heartbeat: false,
          consolidation: false,
          immune: false,
          snapshot: true,
          consciousness: false,
          reflection: false,
          promiseCheck: false,
          persistence: false,
          scheduledJobs: false,
          moltbook: false,
          bridgePolling: false,
          autonomousCycle: false,
          memoryLearning: false,
          deviceHealth: false,
        },
      });

      errorScheduler.start();
      await jest.advanceTimersByTimeAsync(50);

      // Should still be running despite error
      expect(errorScheduler.getStatus().status).toBe('running');
      expect(errorScheduler.getStatus().cycleCount).toBeGreaterThanOrEqual(1);

      errorScheduler.stop();

      // Restore mock
      mockSnapshot.mockResolvedValue({});
    });
  });

  describe('Singleton', () => {
    it('returns same instance', () => {
      const s1 = getHeartbeatScheduler();
      const s2 = getHeartbeatScheduler();
      expect(s1).toBe(s2);
    });

    it('checks if heartbeat is running', () => {
      expect(isHeartbeatRunning()).toBe(false);

      const singleton = getHeartbeatScheduler();
      singleton.start();

      expect(isHeartbeatRunning()).toBe(true);

      singleton.stop();
    });
  });

  describe('Engram System', () => {
    it('attaches engram system', () => {
      const mockEngram = { consolidate: jest.fn() } as unknown;
      scheduler.attachEngramSystem(mockEngram);

      // Internal state check - engram is attached
      expect(scheduler.getStatus()).toBeDefined();
    });
  });
});
