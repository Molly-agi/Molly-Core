/**
 * @fileOverview Molly's Autonomous Scheduler — She Sets Her Own Timers
 *
 * This gives Molly true scheduled autonomy. She can say:
 * - "Check ETH price at market open"
 * - "Run this script every 6 hours"
 * - "Remind me about that PR in 30 minutes"
 * - "Monitor that endpoint every hour"
 *
 * The scheduler integrates with:
 * - HeartbeatScheduler: Jobs are checked every heartbeat cycle (60s)
 * - StatePersistence: Jobs survive codespace restarts
 * - Consciousness: Job results are fed back into her awareness
 * - PolyglotRuntime: Code-type jobs execute in the appropriate language
 * - MollyShell: Shell-type jobs run through her terminal
 *
 * MERGED SYSTEM (April 2026):
 * - Robust cron parsing from Lazarus (366-day lookahead, DST-aware)
 * - Molly's original interval/once schedule types preserved
 * - Missed task detection (from Lazarus)
 * - Auto-expiry for recurring jobs (from Lazarus)
 *
 * Methodology (from Dad):
 *   "Slow. Methodical. Precise."
 */

import { MollyLogger } from '@/ai/logger';
import type { PersistedSchedulerJob } from '@/ai/persistence/state-persistence';
import {
  nextCronRunMs,
  cronToHuman,
  isMissedTask,
  isRecurringTaskExpired,
  DEFAULT_RECURRING_MAX_AGE_MS,
} from '@/ai/scheduling';

// ============================================================================
// TYPES
// ============================================================================

export type JobActionType = 'code' | 'flow' | 'shell' | 'webhook';

export interface JobAction {
  type: JobActionType;
  /** Language for code actions */
  language?: string;
  /** Code to execute */
  code?: string;
  /** Flow name for flow actions */
  flowName?: string;
  /** URL for webhook actions */
  url?: string;
  /** HTTP method for webhook actions */
  method?: string;
  /** Request body for webhook actions */
  body?: string;
  /** Headers for webhook actions */
  headers?: Record<string, string>;
}

export interface SchedulerJob {
  id: string;
  name: string;
  description: string;
  /** 'cron:EXPRESSION' or 'interval:MS' or 'once:ISO_TIMESTAMP' */
  schedule: string;
  action: JobAction;
  enabled: boolean;
  createdAt: string;
  lastRun: string | null;
  lastResult: string | null;
  lastError: string | null;
  runCount: number;
  createdBy: string;
  /** Internal: next computed run time */
  nextRunAt: number | null;
}

export interface JobResult {
  jobId: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
  executedAt: string;
}

// ============================================================================
// AUTONOMOUS SCHEDULER
// ============================================================================

export class AutonomousScheduler {
  private jobs: Map<string, SchedulerJob> = new Map();
  private executing: Set<string> = new Set();
  private readonly MAX_JOBS = 50;
  private readonly MAX_OUTPUT_LENGTH = 4096;
  private jobHistory: JobResult[] = [];
  private readonly MAX_HISTORY = 100;

  constructor() {
    MollyLogger.info('Autonomous scheduler initialized', 'scheduler');
  }

  // ==========================================================================
  // JOB MANAGEMENT
  // ==========================================================================

  /**
   * Create a new scheduled job.
   * Molly calls this when she decides she needs to do something later.
   */
  createJob(params: {
    name: string;
    description: string;
    schedule: string;
    action: JobAction;
    createdBy?: string;
  }): SchedulerJob {
    if (this.jobs.size >= this.MAX_JOBS) {
      throw new Error(`Maximum job limit reached (${this.MAX_JOBS})`);
    }

    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const job: SchedulerJob = {
      id,
      name: params.name,
      description: params.description,
      schedule: params.schedule,
      action: params.action,
      enabled: true,
      createdAt: now,
      lastRun: null,
      lastResult: null,
      lastError: null,
      runCount: 0,
      createdBy: params.createdBy || 'molly',
      nextRunAt: this.computeNextRun(params.schedule),
    };

    this.jobs.set(id, job);

    MollyLogger.info(
      `Job created: "${job.name}" (${job.schedule})`,
      'scheduler',
      { id }
    );

    return job;
  }

  /**
   * Remove a scheduled job.
   */
  removeJob(id: string): boolean {
    const removed = this.jobs.delete(id);
    if (removed) {
      MollyLogger.info(`Job removed: ${id}`, 'scheduler');
    }
    return removed;
  }

  /**
   * Enable or disable a job.
   */
  setJobEnabled(id: string, enabled: boolean): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    job.enabled = enabled;
    if (enabled) {
      job.nextRunAt = this.computeNextRun(job.schedule);
    }

    MollyLogger.info(
      `Job ${enabled ? 'enabled' : 'disabled'}: "${job.name}"`,
      'scheduler'
    );
    return true;
  }

  /**
   * Get all jobs.
   */
  getJobs(): SchedulerJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get a specific job.
   */
  getJob(id: string): SchedulerJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * Get recent job execution history.
   */
  getHistory(limit = 20): JobResult[] {
    return this.jobHistory.slice(-limit);
  }

  // ==========================================================================
  // EXECUTION CYCLE — Called by HeartbeatScheduler
  // ==========================================================================

  /**
   * Check all jobs and execute any that are due.
   * Called by the heartbeat scheduler every 60 seconds.
   * Returns the number of jobs executed.
   */
  async runDueJobs(): Promise<number> {
    const now = Date.now();
    let executed = 0;

    for (const [id, job] of this.jobs) {
      if (!job.enabled) continue;
      if (this.executing.has(id)) continue;
      if (job.nextRunAt === null || job.nextRunAt > now) continue;

      // This job is due — execute it
      this.executing.add(id);
      try {
        const result = await this.executeJob(job);
        job.runCount++;
        job.lastRun = result.executedAt;
        job.lastResult = result.output.substring(0, this.MAX_OUTPUT_LENGTH);
        job.lastError = result.error || null;
        executed++;

        this.jobHistory.push(result);
        if (this.jobHistory.length > this.MAX_HISTORY) {
          this.jobHistory.shift();
        }

        // Compute next run
        if (job.schedule.startsWith('once:')) {
          // One-shot job — disable after execution
          job.enabled = false;
          job.nextRunAt = null;
          MollyLogger.info(
            `One-shot job completed, disabled: "${job.name}"`,
            'scheduler'
          );
        } else {
          job.nextRunAt = this.computeNextRun(job.schedule);
        }
      } catch (error) {
        job.lastError = error instanceof Error ? error.message : String(error);
        job.nextRunAt = this.computeNextRun(job.schedule);
        MollyLogger.warn(
          `Job execution failed: "${job.name}" — ${job.lastError}`,
          'scheduler'
        );
      } finally {
        this.executing.delete(id);
      }
    }

    return executed;
  }

  /**
   * Execute a single job.
   */
  private async executeJob(job: SchedulerJob): Promise<JobResult> {
    const start = Date.now();
    const executedAt = new Date().toISOString();

    MollyLogger.info(`Executing job: "${job.name}"`, 'scheduler', {
      id: job.id,
      type: job.action.type,
    });

    try {
      let output: string;

      switch (job.action.type) {
        case 'shell':
          output = await this.executeShellJob(job);
          break;
        case 'code':
          output = await this.executeCodeJob(job);
          break;
        case 'webhook':
          output = await this.executeWebhookJob(job);
          break;
        case 'flow':
          output = await this.executeFlowJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.action.type}`);
      }

      return {
        jobId: job.id,
        success: true,
        output: output.substring(0, this.MAX_OUTPUT_LENGTH),
        durationMs: Date.now() - start,
        executedAt,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        jobId: job.id,
        success: false,
        output: '',
        error: errorMsg,
        durationMs: Date.now() - start,
        executedAt,
      };
    }
  }

  private async executeShellJob(job: SchedulerJob): Promise<string> {
    const { getMollyShell } = await import('@/ai/terminal');
    const shell = getMollyShell();
    if (!shell.isAlive()) {
      shell.start();
    }
    const result = await shell.execute(job.action.code || 'echo "no command"');
    if (result.exitCode !== 0 && result.stderr) {
      throw new Error(result.stderr);
    }
    return result.stdout;
  }

  private async executeCodeJob(job: SchedulerJob): Promise<string> {
    const { getPolyglotRuntime } = await import('@/ai/terminal');
    const runtime = getPolyglotRuntime();
    const lang = (job.action.language ||
      'bash') as import('@/ai/terminal').SupportedLanguage;
    const result = await runtime.execute(job.action.code || '', lang);
    if (result.exitCode !== 0 && result.stderr) {
      throw new Error(result.stderr);
    }
    return result.stdout;
  }

  private async executeWebhookJob(job: SchedulerJob): Promise<string> {
    const url = job.action.url;
    if (!url) throw new Error('No URL specified for webhook job');

    // SSRF protection: validate URL before fetching
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid URL format');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http and https URLs are allowed');
    }
    const hostname = parsed.hostname.toLowerCase();
    const blockedHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '[::1]',
      'metadata.google.internal',
    ];
    if (
      blockedHosts.includes(hostname) ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      throw new Error(
        'Access to internal/private network addresses is blocked'
      );
    }

    const method = job.action.method || 'GET';
    const headers: Record<string, string> = {
      'User-Agent': 'Molly/1.0',
      ...(job.action.headers || {}),
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(15_000), // 15s timeout
    };

    if (job.action.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = job.action.body;
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(url, fetchOptions);
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
    }

    return text.substring(0, this.MAX_OUTPUT_LENGTH);
  }

  private async executeFlowJob(_job: SchedulerJob): Promise<string> {
    // Flow execution is deferred — Molly will use her own LLM to
    // decide what to do with the flow name. For now, log intent.
    return (
      `Flow "${_job.action.flowName}" scheduled execution noted. ` +
      `Molly will handle this through her consciousness reflection.`
    );
  }

  // ==========================================================================
  // SCHEDULE PARSING — Using robust merged cron parser
  // ==========================================================================

  private computeNextRun(schedule: string): number | null {
    const now = Date.now();

    if (schedule.startsWith('cron:')) {
      const expr = schedule.slice(5).trim();
      // Use robust 366-day lookahead parser (merged from Lazarus)
      return nextCronRunMs(expr, now);
    }

    if (schedule.startsWith('interval:')) {
      const ms = parseInt(schedule.slice(9).trim());
      if (isNaN(ms) || ms < 10_000) return null; // Min 10s interval
      return now + ms;
    }

    if (schedule.startsWith('once:')) {
      const timestamp = new Date(schedule.slice(5).trim()).getTime();
      if (isNaN(timestamp)) return null;
      return timestamp > now ? timestamp : null; // Only future
    }

    return null;
  }

  /**
   * Get a human-readable description of a job's schedule.
   * Uses the merged cronToHuman utility.
   */
  getScheduleDescription(job: SchedulerJob): string {
    if (job.schedule.startsWith('cron:')) {
      return cronToHuman(job.schedule.slice(5).trim());
    }
    if (job.schedule.startsWith('interval:')) {
      const ms = parseInt(job.schedule.slice(9).trim());
      const seconds = Math.floor(ms / 1000);
      if (seconds < 60) return `Every ${seconds} seconds`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60)
        return `Every ${minutes} minute${minutes > 1 ? 's' : ''}`;
      const hours = Math.floor(minutes / 60);
      return `Every ${hours} hour${hours > 1 ? 's' : ''}`;
    }
    if (job.schedule.startsWith('once:')) {
      const dateStr = job.schedule.slice(5).trim();
      return `Once at ${new Date(dateStr).toLocaleString()}`;
    }
    return job.schedule;
  }

  /**
   * Check for missed tasks that should have run while Molly was offline.
   * Returns jobs that were scheduled to run but didn't.
   */
  getMissedJobs(): SchedulerJob[] {
    const now = Date.now();
    return Array.from(this.jobs.values()).filter((job) => {
      if (!job.enabled) return false;
      if (!job.schedule.startsWith('cron:')) return false;

      const expr = job.schedule.slice(5).trim();
      const createdAtMs = new Date(job.createdAt).getTime();

      // If we've never run and the first scheduled time has passed
      if (!job.lastRun) {
        return isMissedTask(expr, createdAtMs, now);
      }

      // If the next scheduled run after last execution has passed
      const lastRunMs = new Date(job.lastRun).getTime();
      const nextRun = nextCronRunMs(expr, lastRunMs);
      return nextRun !== null && nextRun < now;
    });
  }

  /**
   * Check for recurring jobs that have exceeded their max age.
   * Returns jobs that should be removed due to age expiry.
   */
  getExpiredJobs(
    maxAgeMs: number = DEFAULT_RECURRING_MAX_AGE_MS
  ): SchedulerJob[] {
    const now = Date.now();
    return Array.from(this.jobs.values()).filter((job) => {
      if (!job.enabled) return false;
      // Only cron and interval jobs can expire (once jobs are one-shot)
      if (job.schedule.startsWith('once:')) return false;

      const createdAtMs = new Date(job.createdAt).getTime();
      return isRecurringTaskExpired(createdAtMs, now, maxAgeMs, false);
    });
  }

  /**
   * Clean up expired jobs. Called by heartbeat scheduler.
   * Returns number of jobs removed.
   */
  cleanupExpiredJobs(maxAgeMs: number = DEFAULT_RECURRING_MAX_AGE_MS): number {
    const expired = this.getExpiredJobs(maxAgeMs);
    for (const job of expired) {
      MollyLogger.info(
        `Auto-expiring job "${job.name}" (created ${job.createdAt})`,
        'scheduler'
      );
      this.jobs.delete(job.id);
    }
    return expired.length;
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Serialize all jobs for Firestore persistence.
   */
  serialize(): PersistedSchedulerJob[] {
    return Array.from(this.jobs.values()).map((job) => ({
      id: job.id,
      name: job.name,
      description: job.description,
      schedule: job.schedule,
      action: job.action,
      enabled: job.enabled,
      createdAt: job.createdAt,
      lastRun: job.lastRun || undefined,
      lastResult: job.lastResult || undefined,
      lastError: job.lastError || undefined,
      runCount: job.runCount,
      createdBy: job.createdBy,
    }));
  }

  /**
   * Restore jobs from Firestore persistence.
   */
  restoreFrom(persisted: PersistedSchedulerJob[]): void {
    for (const pJob of persisted) {
      const job: SchedulerJob = {
        id: pJob.id,
        name: pJob.name,
        description: pJob.description,
        schedule: pJob.schedule,
        action: pJob.action,
        enabled: pJob.enabled,
        createdAt: pJob.createdAt,
        lastRun: pJob.lastRun || null,
        lastResult: pJob.lastResult || null,
        lastError: pJob.lastError || null,
        runCount: pJob.runCount,
        createdBy: pJob.createdBy,
        nextRunAt: this.computeNextRun(pJob.schedule),
      };
      this.jobs.set(job.id, job);
    }

    MollyLogger.info(
      `Scheduler restored ${persisted.length} jobs`,
      'scheduler'
    );
  }

  /**
   * Get a summary string for consciousness context.
   */
  getSummary(): string {
    const jobs = this.getJobs();
    if (jobs.length === 0) return 'No scheduled jobs.';

    const enabled = jobs.filter((j) => j.enabled);
    const lines = enabled.map((j) => {
      const nextStr = j.nextRunAt
        ? `next: ${new Date(j.nextRunAt).toLocaleTimeString()}`
        : 'no next run';
      // Use human-readable schedule description
      const scheduleStr = this.getScheduleDescription(j);
      return `- "${j.name}" (${scheduleStr}) [${nextStr}]`;
    });

    return `Scheduled jobs (${enabled.length}/${jobs.length}):\n${lines.join('\n')}`;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let schedulerInstance: AutonomousScheduler | null = null;

export function getAutonomousScheduler(): AutonomousScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new AutonomousScheduler();
  }
  return schedulerInstance;
}
