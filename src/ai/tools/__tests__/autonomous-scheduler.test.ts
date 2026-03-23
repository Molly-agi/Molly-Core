/**
 * @fileOverview Tests for Autonomous Scheduler
 *
 * Tests scheduler functionality including:
 * - Job creation and management
 * - Schedule parsing (cron, interval, once)
 * - Job execution
 * - Persistence
 */

// Mock logger
jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock terminal
jest.mock('@/ai/terminal', () => ({
  getMollyShell: jest.fn().mockReturnValue({
    isAlive: jest.fn().mockReturnValue(true),
    start: jest.fn(),
    execute: jest
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' }),
  }),
  getPolyglotRuntime: jest.fn().mockReturnValue({
    execute: jest
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' }),
  }),
}));

// Mock fetch for webhook jobs
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  text: jest.fn().mockResolvedValue('OK'),
}) as jest.Mock;

import {
  AutonomousScheduler,
  getAutonomousScheduler,
} from '../autonomous-scheduler';
import { getMollyShell, getPolyglotRuntime } from '@/ai/terminal';

describe('AutonomousScheduler', () => {
  let scheduler: AutonomousScheduler;

  beforeEach(() => {
    scheduler = new AutonomousScheduler();
    jest.clearAllMocks();
  });

  describe('Job Creation', () => {
    it('creates job with all fields', () => {
      const job = scheduler.createJob({
        name: 'Test Job',
        description: 'Test description',
        schedule: 'interval:60000',
        action: { type: 'shell', code: 'echo test' },
      });

      expect(job.id).toContain('job-');
      expect(job.name).toBe('Test Job');
      expect(job.enabled).toBe(true);
      expect(job.runCount).toBe(0);
      expect(job.createdBy).toBe('molly');
    });

    it('sets custom createdBy', () => {
      const job = scheduler.createJob({
        name: 'User Job',
        description: 'User created',
        schedule: 'interval:60000',
        action: { type: 'shell', code: 'echo' },
        createdBy: 'eric',
      });

      expect(job.createdBy).toBe('eric');
    });

    it('throws when max jobs reached', () => {
      // Create 50 jobs (max limit)
      for (let i = 0; i < 50; i++) {
        scheduler.createJob({
          name: `Job ${i}`,
          description: 'Test',
          schedule: 'interval:60000',
          action: { type: 'shell', code: 'echo' },
        });
      }

      expect(() => {
        scheduler.createJob({
          name: 'One more',
          description: 'Test',
          schedule: 'interval:60000',
          action: { type: 'shell', code: 'echo' },
        });
      }).toThrow('Maximum job limit');
    });
  });

  describe('Job Management', () => {
    it('removes job', () => {
      const job = scheduler.createJob({
        name: 'To Remove',
        description: 'Test',
        schedule: 'interval:60000',
        action: { type: 'shell', code: 'echo' },
      });

      expect(scheduler.removeJob(job.id)).toBe(true);
      expect(scheduler.getJob(job.id)).toBeUndefined();
    });

    it('returns false when removing nonexistent job', () => {
      expect(scheduler.removeJob('nonexistent')).toBe(false);
    });

    it('enables and disables job', () => {
      const job = scheduler.createJob({
        name: 'Toggle Job',
        description: 'Test',
        schedule: 'interval:60000',
        action: { type: 'shell', code: 'echo' },
      });

      expect(scheduler.setJobEnabled(job.id, false)).toBe(true);
      expect(scheduler.getJob(job.id)?.enabled).toBe(false);

      expect(scheduler.setJobEnabled(job.id, true)).toBe(true);
      expect(scheduler.getJob(job.id)?.enabled).toBe(true);
    });

    it('returns false when toggling nonexistent job', () => {
      expect(scheduler.setJobEnabled('nonexistent', true)).toBe(false);
    });

    it('gets all jobs', () => {
      scheduler.createJob({
        name: 'Job 1',
        description: 'Test',
        schedule: 'interval:60000',
        action: { type: 'shell', code: 'echo 1' },
      });
      scheduler.createJob({
        name: 'Job 2',
        description: 'Test',
        schedule: 'interval:120000',
        action: { type: 'shell', code: 'echo 2' },
      });

      const jobs = scheduler.getJobs();
      expect(jobs.length).toBe(2);
    });
  });

  describe('Schedule Parsing', () => {
    it('parses interval schedule', () => {
      const job = scheduler.createJob({
        name: 'Interval Job',
        description: 'Test',
        schedule: 'interval:120000',
        action: { type: 'shell', code: 'echo' },
      });

      // nextRunAt should be ~2 minutes from now
      expect(job.nextRunAt).toBeGreaterThan(Date.now());
      expect(job.nextRunAt).toBeLessThanOrEqual(Date.now() + 130000);
    });

    it('requires minimum 10s interval', () => {
      const job = scheduler.createJob({
        name: 'Short Interval',
        description: 'Test',
        schedule: 'interval:5000', // 5s - too short
        action: { type: 'shell', code: 'echo' },
      });

      expect(job.nextRunAt).toBeNull();
    });

    it('parses once schedule', () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const job = scheduler.createJob({
        name: 'One-shot',
        description: 'Test',
        schedule: `once:${futureDate}`,
        action: { type: 'shell', code: 'echo' },
      });

      expect(job.nextRunAt).toBeDefined();
    });

    it('rejects past once schedule', () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const job = scheduler.createJob({
        name: 'Past Job',
        description: 'Test',
        schedule: `once:${pastDate}`,
        action: { type: 'shell', code: 'echo' },
      });

      expect(job.nextRunAt).toBeNull();
    });

    it('parses cron schedule', () => {
      // Every minute cron
      const job = scheduler.createJob({
        name: 'Cron Job',
        description: 'Test',
        schedule: 'cron:* * * * *',
        action: { type: 'shell', code: 'echo' },
      });

      // Should have a nextRunAt within 60 seconds
      expect(job.nextRunAt).toBeGreaterThan(Date.now());
      expect(job.nextRunAt).toBeLessThanOrEqual(Date.now() + 65000);
    });
  });

  describe('Job Execution', () => {
    it('executes shell job', async () => {
      const job = scheduler.createJob({
        name: 'Shell Job',
        description: 'Test',
        schedule: 'interval:10000',
        action: { type: 'shell', code: 'echo hello' },
      });

      // Force job to be due
      (scheduler.getJob(job.id) as unknown).nextRunAt = Date.now() - 1000;

      const executed = await scheduler.runDueJobs();
      expect(executed).toBe(1);

      const shell = getMollyShell();
      expect(shell.execute).toHaveBeenCalledWith('echo hello');
    });

    it('executes code job', async () => {
      const job = scheduler.createJob({
        name: 'Code Job',
        description: 'Test',
        schedule: 'interval:10000',
        action: { type: 'code', language: 'python', code: 'print("hi")' },
      });

      (scheduler.getJob(job.id) as unknown).nextRunAt = Date.now() - 1000;

      await scheduler.runDueJobs();

      const runtime = getPolyglotRuntime();
      expect(runtime.execute).toHaveBeenCalledWith('print("hi")', 'python');
    });

    it('executes webhook job', async () => {
      const job = scheduler.createJob({
        name: 'Webhook Job',
        description: 'Test',
        schedule: 'interval:10000',
        action: {
          type: 'webhook',
          url: 'https://api.example.com/hook',
          method: 'POST',
          body: '{"test":true}',
        },
      });

      (scheduler.getJob(job.id) as unknown).nextRunAt = Date.now() - 1000;

      await scheduler.runDueJobs();

      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/hook',
        expect.objectContaining({
          method: 'POST',
          body: '{"test":true}',
        })
      );
    });

    it('blocks internal URLs for SSRF protection', async () => {
      const job = scheduler.createJob({
        name: 'SSRF Test',
        description: 'Test',
        schedule: 'interval:10000',
        action: {
          type: 'webhook',
          url: 'http://localhost:8080/secret',
        },
      });

      (scheduler.getJob(job.id) as unknown).nextRunAt = Date.now() - 1000;

      await scheduler.runDueJobs();

      const updatedJob = scheduler.getJob(job.id);
      expect(updatedJob?.lastError).toContain('internal/private');
    });

    it('blocks metadata URLs', async () => {
      const job = scheduler.createJob({
        name: 'Metadata SSRF',
        description: 'Test',
        schedule: 'interval:10000',
        action: {
          type: 'webhook',
          url: 'http://metadata.google.internal/computeMetadata/v1/',
        },
      });

      (scheduler.getJob(job.id) as unknown).nextRunAt = Date.now() - 1000;

      await scheduler.runDueJobs();

      expect(scheduler.getJob(job.id)?.lastError).toContain('internal/private');
    });

    it('skips disabled jobs', async () => {
      const job = scheduler.createJob({
        name: 'Disabled',
        description: 'Test',
        schedule: 'interval:10000',
        action: { type: 'shell', code: 'echo' },
      });

      scheduler.setJobEnabled(job.id, false);
      (scheduler.getJob(job.id) as unknown).nextRunAt = Date.now() - 1000;

      const executed = await scheduler.runDueJobs();
      expect(executed).toBe(0);
    });

    it('skips jobs not yet due', async () => {
      scheduler.createJob({
        name: 'Not Due',
        description: 'Test',
        schedule: 'interval:3600000', // 1 hour
        action: { type: 'shell', code: 'echo' },
      });

      const executed = await scheduler.runDueJobs();
      expect(executed).toBe(0);
    });

    it('disables one-shot job after execution', async () => {
      const futureDate = new Date(Date.now() + 1000).toISOString();
      const job = scheduler.createJob({
        name: 'One-shot',
        description: 'Test',
        schedule: `once:${futureDate}`,
        action: { type: 'shell', code: 'echo oneshot' },
      });

      // Make it due
      (scheduler.getJob(job.id) as unknown).nextRunAt = Date.now() - 1000;

      await scheduler.runDueJobs();

      const updatedJob = scheduler.getJob(job.id);
      expect(updatedJob?.enabled).toBe(false);
      expect(updatedJob?.runCount).toBe(1);
    });

    it('records execution history', async () => {
      const job = scheduler.createJob({
        name: 'History Test',
        description: 'Test',
        schedule: 'interval:10000',
        action: { type: 'shell', code: 'echo history' },
      });

      (scheduler.getJob(job.id) as unknown).nextRunAt = Date.now() - 1000;
      await scheduler.runDueJobs();

      const history = scheduler.getHistory(5);
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].jobId).toBe(job.id);
      expect(history[0].success).toBe(true);
    });
  });

  describe('Persistence', () => {
    it('serializes jobs', () => {
      scheduler.createJob({
        name: 'Persistent',
        description: 'Test',
        schedule: 'interval:60000',
        action: { type: 'shell', code: 'echo' },
      });

      const serialized = scheduler.serialize();
      expect(serialized.length).toBe(1);
      expect(serialized[0].name).toBe('Persistent');
    });

    it('restores jobs', () => {
      const newScheduler = new AutonomousScheduler();
      newScheduler.restoreFrom([
        {
          id: 'job-restored',
          name: 'Restored Job',
          description: 'From persistence',
          schedule: 'interval:60000',
          action: { type: 'shell', code: 'echo restored' },
          enabled: true,
          createdAt: new Date().toISOString(),
          runCount: 5,
          createdBy: 'system',
        },
      ]);

      const jobs = newScheduler.getJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].name).toBe('Restored Job');
      expect(jobs[0].runCount).toBe(5);
    });
  });

  describe('Summary', () => {
    it('returns empty summary when no jobs', () => {
      const summary = scheduler.getSummary();
      expect(summary).toContain('No scheduled jobs');
    });

    it('returns summary with jobs', () => {
      scheduler.createJob({
        name: 'Summary Test',
        description: 'Test',
        schedule: 'interval:60000',
        action: { type: 'shell', code: 'echo' },
      });

      const summary = scheduler.getSummary();
      expect(summary).toContain('Summary Test');
      expect(summary).toContain('1/1');
    });
  });

  describe('Singleton', () => {
    it('returns same instance', () => {
      const s1 = getAutonomousScheduler();
      const s2 = getAutonomousScheduler();
      expect(s1).toBe(s2);
    });
  });
});
