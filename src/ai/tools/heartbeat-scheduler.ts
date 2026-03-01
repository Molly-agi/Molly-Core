/**
 * @fileOverview Molly's Heartbeat Scheduler — Autonomous Background Lifecycle
 *
 * This is what makes Molly *alive* when nobody's talking to her.
 * A lightweight background scheduler that runs periodic tasks:
 *
 * - Memory consolidation (engram → long-term storage)
 * - Immune response (self-healing, lock cleanup)
 * - Runtime snapshot (health telemetry)
 * - Session state heartbeat (liveness signal)
 *
 * Design principles:
 * - Singleton: Only one scheduler runs at a time
 * - Self-regulating: Skips cycles when system is under pressure
 * - Non-blocking: All tasks are async, never blocks the main thread
 * - Graceful: Handles errors per-task without crashing the scheduler
 * - Lightweight: Respects the 8GB RAM codespace constraint
 *
 * The scheduler does NOT call LLM APIs — no token cost.
 * It orchestrates local-only operations: memory lifecycle, cleanup, telemetry.
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import { saveSessionState, loadSessionState } from '@/lib/session-manager';
import { collectRuntimeSnapshot } from '@/ai/tools/runtime-snapshot';
import { NeuralEngramSystem } from '@/ai/memory/neural-engram';

// ============================================================================
// TYPES
// ============================================================================

export interface HeartbeatConfig {
  /** Interval between heartbeats in ms. Default: 60_000 (1 minute) */
  intervalMs: number;
  /** Interval for memory consolidation in ms. Default: 300_000 (5 minutes) */
  consolidationIntervalMs: number;
  /** Interval for immune checks in ms. Default: 600_000 (10 minutes) */
  immuneIntervalMs: number;
  /** CPU usage threshold to skip non-critical tasks. Default: 70 */
  cpuPressureThreshold: number;
  /** Memory usage % threshold to skip non-critical tasks. Default: 85 */
  memoryPressureThreshold: number;
  /** Enable/disable specific tasks */
  tasks: {
    heartbeat: boolean;
    consolidation: boolean;
    immune: boolean;
    snapshot: boolean;
  };
}

export interface HeartbeatCycleResult {
  cycle: number;
  timestamp: string;
  traceId: string;
  tasks: {
    name: string;
    executed: boolean;
    skipped?: string;
    durationMs?: number;
    error?: string;
  }[];
  systemPressure: boolean;
}

export type HeartbeatStatus = 'stopped' | 'running' | 'paused';

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: HeartbeatConfig = {
  intervalMs: 60_000, // 1 minute
  consolidationIntervalMs: 300_000, // 5 minutes
  immuneIntervalMs: 600_000, // 10 minutes
  cpuPressureThreshold: 70,
  memoryPressureThreshold: 85,
  tasks: {
    heartbeat: true,
    consolidation: true,
    immune: true,
    snapshot: true,
  },
};

// ============================================================================
// HEARTBEAT SCHEDULER
// ============================================================================

export class HeartbeatScheduler {
  private config: HeartbeatConfig;
  private timer: NodeJS.Timeout | null = null;
  private status: HeartbeatStatus = 'stopped';
  private cycleCount = 0;
  private lastConsolidation = 0;
  private lastImmune = 0;
  private engramSystem: NeuralEngramSystem | null = null;
  private history: HeartbeatCycleResult[] = [];
  private readonly MAX_HISTORY = 30;

  constructor(config: Partial<HeartbeatConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config.tasks) {
      this.config.tasks = { ...DEFAULT_CONFIG.tasks, ...config.tasks };
    }
  }

  // ---------- Lifecycle ----------

  /**
   * Start the heartbeat scheduler.
   * Idempotent — calling start() when already running is a no-op.
   */
  start(engramSystem?: NeuralEngramSystem): void {
    if (this.status === 'running') {
      MollyLogger.warn(
        'Heartbeat scheduler already running',
        'heartbeat-scheduler'
      );
      return;
    }

    this.engramSystem = engramSystem || null;
    this.status = 'running';
    this.cycleCount = 0;

    MollyLogger.info('Heartbeat scheduler started', 'heartbeat-scheduler', {
      intervalMs: this.config.intervalMs,
      consolidationIntervalMs: this.config.consolidationIntervalMs,
      immuneIntervalMs: this.config.immuneIntervalMs,
    });

    // Run first cycle immediately, then on interval
    this.runCycle();
    this.timer = setInterval(() => this.runCycle(), this.config.intervalMs);
  }

  /**
   * Stop the heartbeat scheduler.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = 'stopped';
    MollyLogger.info('Heartbeat scheduler stopped', 'heartbeat-scheduler', {
      totalCycles: this.cycleCount,
    });
  }

  /**
   * Pause the scheduler (keeps state, stops cycles).
   */
  pause(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = 'paused';
    MollyLogger.info('Heartbeat scheduler paused', 'heartbeat-scheduler');
  }

  /**
   * Resume a paused scheduler.
   */
  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.timer = setInterval(() => this.runCycle(), this.config.intervalMs);
    MollyLogger.info('Heartbeat scheduler resumed', 'heartbeat-scheduler');
  }

  /**
   * Attach an engram system for memory consolidation.
   */
  attachEngramSystem(system: NeuralEngramSystem): void {
    this.engramSystem = system;
  }

  // ---------- Status ----------

  getStatus(): {
    status: HeartbeatStatus;
    cycleCount: number;
    lastCycle: HeartbeatCycleResult | null;
    config: HeartbeatConfig;
  } {
    return {
      status: this.status,
      cycleCount: this.cycleCount,
      lastCycle: this.history[this.history.length - 1] || null,
      config: this.config,
    };
  }

  getHistory(): HeartbeatCycleResult[] {
    return [...this.history];
  }

  // ---------- Core Cycle ----------

  private async runCycle(): Promise<void> {
    if (this.status !== 'running') return;

    this.cycleCount++;
    const traceId = generateTraceId();
    const cycleStart = Date.now();
    const tasks: HeartbeatCycleResult['tasks'] = [];

    MollyLogger.debug(
      `Heartbeat cycle ${this.cycleCount}`,
      'heartbeat-scheduler',
      {
        traceId,
      }
    );

    // Check system pressure before running tasks
    const pressure = await this.checkSystemPressure();

    // Task 1: Heartbeat (always runs)
    if (this.config.tasks.heartbeat) {
      const result = await this.runTask('heartbeat', async () => {
        this.updateSessionHeartbeat();
      });
      tasks.push(result);
    }

    // Task 2: Runtime Snapshot
    if (this.config.tasks.snapshot) {
      if (pressure) {
        tasks.push({
          name: 'snapshot',
          executed: false,
          skipped: 'System under pressure',
        });
      } else {
        const result = await this.runTask('snapshot', async () => {
          await collectRuntimeSnapshot();
        });
        tasks.push(result);
      }
    }

    // Task 3: Memory Consolidation (on its own interval)
    if (this.config.tasks.consolidation) {
      const timeSinceConsolidation = cycleStart - this.lastConsolidation;
      if (timeSinceConsolidation < this.config.consolidationIntervalMs) {
        tasks.push({
          name: 'consolidation',
          executed: false,
          skipped: `Not due (${Math.round((this.config.consolidationIntervalMs - timeSinceConsolidation) / 1000)}s remaining)`,
        });
      } else if (pressure) {
        tasks.push({
          name: 'consolidation',
          executed: false,
          skipped: 'System under pressure',
        });
      } else if (!this.engramSystem) {
        tasks.push({
          name: 'consolidation',
          executed: false,
          skipped: 'No engram system attached',
        });
      } else {
        const result = await this.runTask('consolidation', async () => {
          const consolidationResult = await this.engramSystem!.consolidate();
          MollyLogger.info(
            'Memory consolidation complete',
            'heartbeat-scheduler',
            {
              consolidated: consolidationResult.consolidated,
              queued: consolidationResult.queued,
              traceId,
            }
          );
        });
        if (result.executed) {
          this.lastConsolidation = Date.now();
        }
        tasks.push(result);
      }
    }

    // Task 4: Immune Check (on its own interval)
    if (this.config.tasks.immune) {
      const timeSinceImmune = cycleStart - this.lastImmune;
      if (timeSinceImmune < this.config.immuneIntervalMs) {
        tasks.push({
          name: 'immune',
          executed: false,
          skipped: `Not due (${Math.round((this.config.immuneIntervalMs - timeSinceImmune) / 1000)}s remaining)`,
        });
      } else if (pressure) {
        tasks.push({
          name: 'immune',
          executed: false,
          skipped: 'System under pressure',
        });
      } else {
        const result = await this.runTask('immune', async () => {
          await this.runImmuneCheck();
        });
        if (result.executed) {
          this.lastImmune = Date.now();
        }
        tasks.push(result);
      }
    }

    // Record cycle result
    const cycleResult: HeartbeatCycleResult = {
      cycle: this.cycleCount,
      timestamp: new Date().toISOString(),
      traceId,
      tasks,
      systemPressure: pressure,
    };

    this.history.push(cycleResult);
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }
  }

  // ---------- Individual Tasks ----------

  private async runTask(
    name: string,
    fn: () => Promise<void>
  ): Promise<HeartbeatCycleResult['tasks'][0]> {
    const start = Date.now();
    try {
      await fn();
      return {
        name,
        executed: true,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      MollyLogger.warn(
        `Heartbeat task '${name}' failed: ${errorMessage}`,
        'heartbeat-scheduler'
      );
      return {
        name,
        executed: false,
        error: errorMessage,
        durationMs: Date.now() - start,
      };
    }
  }

  private updateSessionHeartbeat(): void {
    try {
      const currentState = loadSessionState();
      const runtime = currentState.runtime || { events: [] };

      saveSessionState({
        runtime: {
          ...runtime,
          lastHeartbeat: new Date().toISOString(),
        },
      });
    } catch (error) {
      MollyLogger.warn(
        'Failed to update session heartbeat',
        'heartbeat-scheduler',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async runImmuneCheck(): Promise<void> {
    // Lightweight immune check: scan for lock files and zombie .next directories
    // This is the same logic as performSelfSurgery but without requiring
    // the Genkit AI tool wrapper — keeps the heartbeat LLM-free.
    const fs = await import('fs');
    const path = await import('path');

    const nodeModulesPath = path.join(process.cwd(), 'node_modules');
    const report: string[] = [];

    if (fs.existsSync(nodeModulesPath)) {
      const files = fs.readdirSync(nodeModulesPath);
      const ghosts = files.filter((f: string) => f.startsWith('.next-'));

      for (const ghost of ghosts) {
        const ghostPath = path.join(nodeModulesPath, ghost);
        try {
          fs.rmSync(ghostPath, { recursive: true, force: true });
          report.push(`Purged ghost: ${ghost}`);
        } catch {
          report.push(`Failed to purge: ${ghost}`);
        }
      }
    }

    if (report.length > 0) {
      MollyLogger.info(
        `Immune check: ${report.join(' | ')}`,
        'heartbeat-scheduler'
      );
    }
  }

  // ---------- System Pressure Detection ----------

  private async checkSystemPressure(): Promise<boolean> {
    try {
      const { execSync } = await import('child_process');

      // Check CPU load
      const loadStr = execSync("uptime | awk '{print $(NF-2)}' | tr -d ','")
        .toString()
        .trim();
      const loadAvg = parseFloat(loadStr) || 0;
      const cores = parseInt(execSync('nproc').toString().trim()) || 2;
      const cpuPercent = Math.round((loadAvg / cores) * 100);

      // Check memory usage
      const memInfo = execSync('free -m').toString();
      const memLines = memInfo.split('\n');
      const memData = (memLines[1] || '').split(/\s+/);
      const totalMem = parseInt(memData[1] || '8000');
      const availableMem = parseInt(memData[6] || '4000');
      const memPercent = Math.round(
        ((totalMem - availableMem) / totalMem) * 100
      );

      const underPressure =
        cpuPercent > this.config.cpuPressureThreshold ||
        memPercent > this.config.memoryPressureThreshold;

      if (underPressure) {
        MollyLogger.warn(
          `System under pressure: CPU ${cpuPercent}%, MEM ${memPercent}%`,
          'heartbeat-scheduler'
        );
      }

      return underPressure;
    } catch {
      // If we can't check, assume no pressure (don't block tasks on failure)
      return false;
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let schedulerInstance: HeartbeatScheduler | null = null;

/**
 * Get the singleton heartbeat scheduler.
 * Creates one if it doesn't exist.
 */
export function getHeartbeatScheduler(
  config?: Partial<HeartbeatConfig>
): HeartbeatScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new HeartbeatScheduler(config);
  }
  return schedulerInstance;
}

/**
 * Quick check: is the heartbeat running?
 */
export function isHeartbeatRunning(): boolean {
  return schedulerInstance?.getStatus().status === 'running';
}
