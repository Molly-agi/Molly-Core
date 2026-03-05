/**
 * @fileOverview Tests for Molly's Autonomous Scheduler
 *
 * Tests job creation, cron parsing, execution cycle, and persistence.
 */

// Mock the terminal module to avoid spawning real processes
jest.mock('@/ai/terminal', () => ({
  getMollyShell: () => ({
    isAlive: () => true,
    start: jest.fn(),
    execute: jest.fn().mockResolvedValue({
      stdout: 'mock output',
      stderr: '',
      exitCode: 0,
    }),
  }),
  getPolyglotRuntime: () => ({
    execute: jest.fn().mockResolvedValue({
      stdout: 'mock code output',
      stderr: '',
      exitCode: 0,
    }),
  }),
}));

describe('AutonomousScheduler', () => {
  let AutonomousScheduler: typeof import('@/ai/tools/autonomous-scheduler').AutonomousScheduler;

  beforeEach(() => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/ai/tools/autonomous-scheduler');
    AutonomousScheduler = mod.AutonomousScheduler;
  });

  describe('Job Creation', () => {
    it('should create a job with valid schedule', () => {
      const scheduler = new AutonomousScheduler();
      const job = scheduler.createJob({
        name: 'Test Job',
        description: 'A test job',
        schedule: 'interval:60000',
        action: { type: 'shell', code: 'echo hello' },
      });

      expect(job.id).toBeDefined();
      expect(job.name).toBe('Test Job');
      expect(job.enabled).toBe(true);
      expect(job.runCount).toBe(0);
    });

    it('should create a cron job', () => {
      const scheduler = new AutonomousScheduler();
      const job = scheduler.createJob({
        name: 'Cron Job',
        description: 'Every hour',
        schedule: 'cron:0 * * * *',
        action: { type: 'shell', code: 'date' },
      });

      expect(job.schedule).toBe('cron:0 * * * *');
      expect(job.nextRunAt).not.toBeNull();
    });

    it('should create a one-shot job', () => {
      const scheduler = new AutonomousScheduler();
      const futureTime = new Date(Date.now() + 3600_000).toISOString();
      const job = scheduler.createJob({
        name: 'One Shot',
        description: 'Run once',
        schedule: `once:${futureTime}`,
        action: { type: 'shell', code: 'echo done' },
      });

      expect(job.schedule).toBe(`once:${futureTime}`);
    });

    it('should enforce max job limit', () => {
      const scheduler = new AutonomousScheduler();
      for (let i = 0; i < 50; i++) {
        scheduler.createJob({
          name: `Job ${i}`,
          description: 'test',
          schedule: 'interval:60000',
          action: { type: 'shell', code: 'echo' },
        });
      }

      expect(() =>
        scheduler.createJob({
          name: 'Over Limit',
          description: 'test',
          schedule: 'interval:60000',
          action: { type: 'shell', code: 'echo' },
        })
      ).toThrow('Maximum job limit');
    });
  });

  describe('Job Management', () => {
    it('should list all jobs', () => {
      const scheduler = new AutonomousScheduler();
      scheduler.createJob({
        name: 'Job 1',
        description: 'test',
        schedule: 'interval:60000',
        action: { type: 'shell', code: 'echo 1' },
      });
      scheduler.createJob({
        name: 'Job 2',
        description: 'test',
        schedule: 'interval:60000',
        action: { type: 'shell', code: 'echo 2' },
      });

      expect(scheduler.getJobs()).toHaveLength(2);
    });

    it('should remove a job', () => {
      const scheduler = new AutonomousScheduler();
      const job = scheduler.createJob({
        name: 'To Remove',
        description: 'test',
        schedule: 'interval:60000',
        action: { type: 'shell', code: 'echo' },
      });

      expect(scheduler.removeJob(job.id)).toBe(true);
      expect(scheduler.getJobs()).toHaveLength(0);
    });

    it('should enable/disable a job', () => {
      const scheduler = new AutonomousScheduler();
      const job = scheduler.createJob({
        name: 'Toggle',
        description: 'test',
        schedule: 'interval:60000',
        action: { type: 'shell', code: 'echo' },
      });

      expect(scheduler.setJobEnabled(job.id, false)).toBe(true);
      expect(scheduler.getJob(job.id)?.enabled).toBe(false);
    });
  });

  describe('Execution', () => {
    it('should execute due interval jobs', async () => {
      const scheduler = new AutonomousScheduler();
      const job = scheduler.createJob({
        name: 'Due Job',
        description: 'test',
        schedule: 'interval:1000', // 1 second
        action: { type: 'shell', code: 'echo hello' },
      });

      // Manually set nextRunAt to past
      const internalJob = scheduler.getJob(job.id);
      if (internalJob) {
        internalJob.nextRunAt = Date.now() - 1000;
      }

      const executed = await scheduler.runDueJobs();
      expect(executed).toBe(1);
      expect(scheduler.getJob(job.id)?.runCount).toBe(1);
    });

    it('should not execute disabled jobs', async () => {
      const scheduler = new AutonomousScheduler();
      const job = scheduler.createJob({
        name: 'Disabled Job',
        description: 'test',
        schedule: 'interval:1000',
        action: { type: 'shell', code: 'echo' },
      });
      scheduler.setJobEnabled(job.id, false);

      const executed = await scheduler.runDueJobs();
      expect(executed).toBe(0);
    });

    it('should not execute future jobs', async () => {
      const scheduler = new AutonomousScheduler();
      scheduler.createJob({
        name: 'Future Job',
        description: 'test',
        schedule: 'interval:3600000', // 1 hour
        action: { type: 'shell', code: 'echo' },
      });

      const executed = await scheduler.runDueJobs();
      expect(executed).toBe(0);
    });

    it('should execute webhook jobs', async () => {
      // Mock fetch and AbortSignal.timeout for test environment
      const originalFetch = global.fetch;
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{"status":"ok"}'),
      });
      (global as Record<string, unknown>).fetch = mockFetch;

      const originalTimeout = AbortSignal.timeout;
      if (!AbortSignal.timeout) {
        (AbortSignal as unknown as Record<string, unknown>).timeout = () =>
          new AbortController().signal;
      }

      try {
        const scheduler = new AutonomousScheduler();
        const job = scheduler.createJob({
          name: 'Webhook Job',
          description: 'test webhook',
          schedule: 'interval:1000',
          action: {
            type: 'webhook',
            url: 'https://example.com/api',
            method: 'GET',
          },
        });

        // Make it due
        const internalJob = scheduler.getJob(job.id);
        if (internalJob) {
          internalJob.nextRunAt = Date.now() - 1000;
        }

        const executed = await scheduler.runDueJobs();
        expect(executed).toBe(1);
        expect(mockFetch).toHaveBeenCalled();
      } finally {
        global.fetch = originalFetch;
        (AbortSignal as unknown as Record<string, unknown>).timeout =
          originalTimeout;
      }
    });
  });

  describe('Serialization & Restoration', () => {
    it('should serialize jobs', () => {
      const scheduler = new AutonomousScheduler();
      scheduler.createJob({
        name: 'Persist Me',
        description: 'test',
        schedule: 'interval:60000',
        action: { type: 'shell', code: 'echo hello' },
        createdBy: 'molly',
      });

      const serialized = scheduler.serialize();
      expect(serialized).toHaveLength(1);
      expect(serialized[0].name).toBe('Persist Me');
    });

    it('should restore jobs from persisted state', () => {
      const scheduler = new AutonomousScheduler();
      scheduler.restoreFrom([
        {
          id: 'job-restored',
          name: 'Restored Job',
          description: 'was persisted',
          schedule: 'interval:60000',
          action: { type: 'shell', code: 'echo restored' },
          enabled: true,
          createdAt: new Date().toISOString(),
          runCount: 5,
          createdBy: 'molly',
        },
      ]);

      const jobs = scheduler.getJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe('Restored Job');
      expect(jobs[0].runCount).toBe(5);
    });
  });

  describe('Summary', () => {
    it('should return empty summary with no jobs', () => {
      const scheduler = new AutonomousScheduler();
      expect(scheduler.getSummary()).toBe('No scheduled jobs.');
    });

    it('should return formatted summary with jobs', () => {
      const scheduler = new AutonomousScheduler();
      scheduler.createJob({
        name: 'Check Price',
        description: 'Check ETH price',
        schedule: 'cron:0 * * * *',
        action: { type: 'shell', code: 'echo' },
      });

      const summary = scheduler.getSummary();
      expect(summary).toContain('Check Price');
      expect(summary).toContain('Scheduled jobs');
    });
  });
});
