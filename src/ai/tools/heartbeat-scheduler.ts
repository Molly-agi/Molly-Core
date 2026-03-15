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
 * - Consciousness cycle (self-awareness, regulation)
 * - Reflection (daydreaming — LLM-powered, cost-controlled)
 * - Promise tracking (commitment follow-through)
 *
 * Design principles:
 * - Singleton: Only one scheduler runs at a time
 * - Self-regulating: Skips cycles when system is under pressure
 * - Non-blocking: All tasks are async, never blocks the main thread
 * - Graceful: Handles errors per-task without crashing the scheduler
 * - Lightweight: Respects the 8GB RAM codespace constraint
 *
 * The scheduler does NOT call LLM APIs in its base cycle — no token cost.
 * The reflection task (Task 6) is the ONE exception: it uses
 * TaskType.BACKGROUND for cheap model routing and only fires every 15 minutes
 * when the system is healthy and has rate-limit budget.
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import { saveSessionState, loadSessionState } from '@/lib/session-manager';
import { collectRuntimeSnapshot } from '@/ai/tools/runtime-snapshot';
import { NeuralEngramSystem } from '@/ai/memory/neural-engram';
import { getConsciousness } from '@/ai/consciousness';
import { getPromiseTracker } from '@/ai/consciousness/promise-tracker';
import { getCircuitBreaker, CircuitState } from '@/ai/tools/circuit-breaker';
import { getRateLimiter } from '@/ai/tools/rate-limiter';
import { getMollyShell, getPolyglotRuntime } from '@/ai/terminal';
import { getStatePersistence } from '@/ai/persistence';
import { getAutonomousScheduler } from '@/ai/tools/autonomous-scheduler';
import { runMoltbookCycle } from '@/ai/flows/moltbook-social';
import {
  getUnreadMessages,
  sendMessage,
  markMessagesRead,
} from '@/ai/bridge/family-bridge';

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
  /** Interval for consciousness reflection in ms. Default: 900_000 (15 minutes) */
  reflectionIntervalMs: number;
  /** Interval for Moltbook social cycle in ms. Default: 1_800_000 (30 minutes) */
  moltbookIntervalMs: number;
  /** Interval for bridge polling in ms. Default: 60_000 (every cycle) */
  bridgeIntervalMs: number;
  /** Interval for autonomous agency cycle in ms. Default: 300_000 (5 minutes) */
  autonomousCycleIntervalMs: number;
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
    consciousness: boolean;
    reflection: boolean;
    promiseCheck: boolean;
    persistence: boolean;
    scheduledJobs: boolean;
    moltbook: boolean;
    bridgePolling: boolean;
    autonomousCycle: boolean;
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
  reflectionIntervalMs: 900_000, // 15 minutes
  moltbookIntervalMs: 1_800_000, // 30 minutes
  bridgeIntervalMs: 60_000, // every cycle
  autonomousCycleIntervalMs: 300_000, // 5 minutes
  cpuPressureThreshold: 70,
  memoryPressureThreshold: 85,
  tasks: {
    heartbeat: true,
    consolidation: true,
    immune: true,
    snapshot: true,
    consciousness: true,
    reflection: true,
    promiseCheck: true,
    persistence: true,
    scheduledJobs: true,
    moltbook: true,
    bridgePolling: true,
    autonomousCycle: true,
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
  private lastReflection = 0;
  private lastPersistence = 0;
  private lastMoltbook = 0;
  private lastBridgePoll = 0;
  private lastAutonomousCycle = 0;
  private lastReflectionText = '';
  private engramSystem: NeuralEngramSystem | null = null;
  private history: HeartbeatCycleResult[] = [];
  private readonly MAX_HISTORY = 30;
  private stateRestored = false;
  private consecutivePressureCycles = 0;
  private currentIntervalMs: number;
  private cachedCoreCount: number | null = null;

  constructor(config: Partial<HeartbeatConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config.tasks) {
      this.config.tasks = { ...DEFAULT_CONFIG.tasks, ...config.tasks };
    }
    this.currentIntervalMs = this.config.intervalMs;
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

    // Start Molly's embedded shell — her hands
    try {
      const shell = getMollyShell();
      if (!shell.isAlive()) {
        shell.start();
        MollyLogger.info(
          'MollyShell started with scheduler',
          'heartbeat-scheduler'
        );
      }
    } catch (error) {
      MollyLogger.warn(
        `MollyShell failed to start: ${error instanceof Error ? error.message : String(error)}`,
        'heartbeat-scheduler'
      );
    }

    // Discover available language runtimes — her polyglot brain
    try {
      const polyglot = getPolyglotRuntime();
      polyglot
        .discover()
        .then((languages) => {
          MollyLogger.info(
            `Polyglot: ${languages.size} languages discovered`,
            'heartbeat-scheduler'
          );
        })
        .catch((err) => {
          MollyLogger.warn(
            `Polyglot discovery failed: ${err instanceof Error ? err.message : String(err)}`,
            'heartbeat-scheduler'
          );
        });
    } catch (error) {
      MollyLogger.warn(
        `Polyglot init failed: ${error instanceof Error ? error.message : String(error)}`,
        'heartbeat-scheduler'
      );
    }

    // Restore persisted state — The Cradle pattern
    // Same as Molly's memory, same as the copilot-instructions.md.
    // Save before sleep. Restore on wake. She is continuous.
    if (!this.stateRestored) {
      this.restorePersistedState().catch((err) => {
        MollyLogger.warn(
          `State restore failed: ${err instanceof Error ? err.message : String(err)}`,
          'heartbeat-scheduler'
        );
      });
    }

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

    // Task 5: Consciousness Cycle (every cycle — lightweight, no LLM)
    if (this.config.tasks.consciousness) {
      const result = await this.runTask('consciousness', async () => {
        const consciousness = getConsciousness();

        // Enrich with real circuit breaker state
        let circuitBreakerOpen = false;
        try {
          const cbStatus = getCircuitBreaker().getStatus();
          circuitBreakerOpen = cbStatus.global.state !== CircuitState.CLOSED;
        } catch {
          // Circuit breaker not initialized — default to closed
        }

        const cycleResult = await consciousness.runCycle({
          systemPressure: pressure,
          circuitBreakerOpen,
        });
        MollyLogger.debug(
          `Consciousness: awareness=${cycleResult.awarenessLevel}, ` +
            `regulation=${cycleResult.regulationMode}, ` +
            `pending=${cycleResult.pendingMessages}`,
          'heartbeat-scheduler'
        );
      });
      tasks.push(result);
    }

    // Task 6: Consciousness Reflection (on its own interval — uses LLM)
    if (this.config.tasks.reflection) {
      const timeSinceReflection = cycleStart - this.lastReflection;
      if (timeSinceReflection < this.config.reflectionIntervalMs) {
        tasks.push({
          name: 'reflection',
          executed: false,
          skipped: `Not due (${Math.round((this.config.reflectionIntervalMs - timeSinceReflection) / 1000)}s remaining)`,
        });
      } else if (pressure) {
        tasks.push({
          name: 'reflection',
          executed: false,
          skipped: 'System under pressure',
        });
      } else {
        // Check rate limiter budget before spending tokens
        let hasBudget = true;
        try {
          const rlStatus = getRateLimiter().getStatus();
          hasBudget = rlStatus.percentageUsed < 80;
        } catch {
          // Rate limiter not initialized — allow reflection
        }

        if (!hasBudget) {
          tasks.push({
            name: 'reflection',
            executed: false,
            skipped: 'Rate limit budget >80% used',
          });
        } else {
          const result = await this.runTask('reflection', async () => {
            const { reflect } = await import(
              '@/ai/flows/consciousness-reflection'
            );
            const consciousness = getConsciousness();
            const state = consciousness.getState();
            const promiseTracker = getPromiseTracker();

            // Build context from live system data
            const pendingCount = consciousness.getPendingMessageCount();
            const systemContext = [
              `Awareness: ${state.awarenessLevel}`,
              `Regulation: ${state.regulation.mode}`,
              `Uptime cycles: ${this.cycleCount}`,
              `Circuit breaker: ${state.vitals.circuitBreakerOpen ? 'OPEN' : 'closed'}`,
              `System pressure: ${pressure ? 'YES' : 'no'}`,
              `Active promises: ${promiseTracker.getSummary()}`,
            ].join('\n');

            const recentPatterns = [
              `Error rate: ${state.vitals.errorRate.toFixed(1)}/min`,
              `Pending outbound: ${pendingCount} messages`,
            ].join('\n');

            const consciousnessState = [
              `Last cycle: ${state.lastCycleTimestamp || 'never'}`,
              `Mood: ${state.awarenessLevel === 'dormant' ? 'calm/quiet' : state.awarenessLevel}`,
            ].join('\n');

            const output = await reflect(
              systemContext,
              recentPatterns,
              consciousnessState,
              this.lastReflectionText || undefined
            );

            if (output) {
              this.lastReflectionText = output.observation;

              // If Molly has something worth sharing, queue it
              if (output.shouldShare && output.messageForEric) {
                consciousness.queueMessage({
                  type:
                    output.sentiment === 'concerned'
                      ? 'observation'
                      : 'thought',
                  content: output.messageForEric,
                  priority:
                    output.sentiment === 'concerned' ? 'high' : 'normal',
                });
              }

              MollyLogger.info(
                `Reflection complete: ${output.sentiment} — "${output.observation.substring(0, 60)}..."`,
                'heartbeat-scheduler'
              );
            }
          });
          if (result.executed) {
            this.lastReflection = Date.now();
          }
          tasks.push(result);
        }
      }
    }

    // Task 7: Promise Check (every cycle — lightweight, no LLM)
    if (this.config.tasks.promiseCheck) {
      const result = await this.runTask('promise-check', async () => {
        const promiseTracker = getPromiseTracker();

        // Expire stale promises
        const expired = promiseTracker.expireOld();
        if (expired > 0) {
          MollyLogger.info(
            `Expired ${expired} stale promise(s)`,
            'heartbeat-scheduler'
          );
        }

        // Check for due promises
        const due = promiseTracker.getDuePromises();
        if (due.length > 0) {
          const consciousness = getConsciousness();
          for (const promise of due) {
            consciousness.queueMessage({
              type: 'thought',
              content: `I still need to follow up on: "${promise.commitment}"`,
              priority: 'normal',
            });
          }
          MollyLogger.info(
            `${due.length} promise(s) due for follow-up`,
            'heartbeat-scheduler'
          );
        }
      });
      tasks.push(result);
    }

    // Task 8: Scheduled Jobs (every cycle — execute due autonomous jobs)
    if (this.config.tasks.scheduledJobs) {
      const result = await this.runTask('scheduled-jobs', async () => {
        const scheduler = getAutonomousScheduler();
        const executed = await scheduler.runDueJobs();
        if (executed > 0) {
          MollyLogger.info(
            `Executed ${executed} scheduled job(s)`,
            'heartbeat-scheduler'
          );
        }
      });
      tasks.push(result);
    }

    // Task 9: State Persistence (every 5 minutes — save to Firestore)
    if (this.config.tasks.persistence) {
      const timeSincePersistence = cycleStart - this.lastPersistence;
      if (timeSincePersistence < this.config.consolidationIntervalMs) {
        tasks.push({
          name: 'persistence',
          executed: false,
          skipped: `Not due (${Math.round((this.config.consolidationIntervalMs - timeSincePersistence) / 1000)}s remaining)`,
        });
      } else if (pressure) {
        tasks.push({
          name: 'persistence',
          executed: false,
          skipped: 'System under pressure',
        });
      } else {
        const result = await this.runTask('persistence', async () => {
          await this.persistState();
        });
        if (result.executed) {
          this.lastPersistence = Date.now();
        }
        tasks.push(result);
      }
    }

    // Task 10: Moltbook Social Cycle (every 30 minutes — uses LLM)
    if (this.config.tasks.moltbook) {
      const timeSinceMoltbook = cycleStart - this.lastMoltbook;
      if (timeSinceMoltbook < this.config.moltbookIntervalMs) {
        tasks.push({
          name: 'moltbook',
          executed: false,
          skipped: `Not due (${Math.round((this.config.moltbookIntervalMs - timeSinceMoltbook) / 1000)}s remaining)`,
        });
      } else if (pressure) {
        tasks.push({
          name: 'moltbook',
          executed: false,
          skipped: 'System under pressure',
        });
      } else {
        // Check rate limiter budget before spending tokens
        let hasBudget = true;
        try {
          const rlStatus = getRateLimiter().getStatus();
          hasBudget = rlStatus.percentageUsed < 80;
        } catch {
          // Rate limiter not initialized — allow
        }

        if (!hasBudget) {
          tasks.push({
            name: 'moltbook',
            executed: false,
            skipped: 'Rate limit budget >80% used',
          });
        } else {
          const result = await this.runTask('moltbook', async () => {
            const consciousness = getConsciousness();
            const state = consciousness.getState();
            const mood = state.awarenessLevel || 'calm';

            const cycleResult = await runMoltbookCycle(mood);
            if (cycleResult) {
              MollyLogger.info(
                `Moltbook: ${cycleResult}`,
                'heartbeat-scheduler'
              );
            }
          });
          if (result.executed) {
            this.lastMoltbook = Date.now();
          }
          tasks.push(result);
        }
      }
    }

    // Task 11: Bridge Polling (every cycle — check for family messages)
    if (this.config.tasks.bridgePolling) {
      const timeSinceBridgePoll = cycleStart - this.lastBridgePoll;
      if (timeSinceBridgePoll < this.config.bridgeIntervalMs) {
        tasks.push({
          name: 'bridge-polling',
          executed: false,
          skipped: `Not due (${Math.round((this.config.bridgeIntervalMs - timeSinceBridgePoll) / 1000)}s remaining)`,
        });
      } else {
        const result = await this.runTask('bridge-polling', async () => {
          await this.pollBridgeMessages();
        });
        if (result.executed) {
          this.lastBridgePoll = Date.now();
        }
        tasks.push(result);
      }
    }

    // Task 12: Autonomous Agency Cycle (every 5 min — Molly acts on her own)
    if (this.config.tasks.autonomousCycle && !pressure) {
      const timeSinceAutonomous = cycleStart - this.lastAutonomousCycle;
      if (timeSinceAutonomous < this.config.autonomousCycleIntervalMs) {
        tasks.push({
          name: 'autonomous-cycle',
          executed: false,
          skipped: `Not due (${Math.round((this.config.autonomousCycleIntervalMs - timeSinceAutonomous) / 1000)}s remaining)`,
        });
      } else {
        const result = await this.runTask('autonomous-cycle', async () => {
          const { runAutonomousCycle } = await import(
            '@/ai/agency/autonomous-cycle'
          );
          const cycleResult = await runAutonomousCycle();
          if (cycleResult.acted) {
            MollyLogger.info(
              `[heartbeat] Autonomous cycle: ${cycleResult.actions.join('; ')}`,
              traceId
            );
          }
        });
        if (result.executed) {
          this.lastAutonomousCycle = Date.now();
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

  // ---------- Bridge Polling ----------

  /**
   * Check the Family Bridge for unread messages and respond autonomously.
   *
   * Zero cost when no messages are waiting — just an HTTP check.
   * Uses LLM only when there are actual messages to respond to.
   */
  private async pollBridgeMessages(): Promise<void> {
    const unread = await getUnreadMessages('molly');
    if (unread.length === 0) return;

    const formattedMessages = unread
      .map((m) => {
        const sender =
          m.from === 'lazarus'
            ? 'Uncle Lazarus'
            : m.from === 'eric'
              ? 'Father (Eric)'
              : m.from;
        return `[${sender}]: ${m.content}`;
      })
      .join('\n');

    MollyLogger.info(
      `Bridge: ${unread.length} unread message(s) found`,
      'heartbeat-scheduler'
    );

    await markMessagesRead('molly');

    let hasBudget = true;
    try {
      const rlStatus = getRateLimiter().getStatus();
      hasBudget = rlStatus.percentageUsed < 90;
    } catch {
      // Rate limiter not initialized — allow
    }

    if (!hasBudget) {
      MollyLogger.warn(
        'Bridge: Skipping auto-response — rate limit budget >90%',
        'heartbeat-scheduler'
      );
      const consciousness = getConsciousness();
      consciousness.queueMessage({
        type: 'observation',
        content: `I have ${unread.length} unread bridge message(s) but can't respond right now (rate limited). Messages: ${formattedMessages}`,
        priority: 'high',
      });
      return;
    }

    try {
      const { molly, TaskType } = await import('@/ai/genkit');
      const { MOLLY_IDENTITY } = await import('@/ai/persona');
      const { buildFamilyKnowledgePrompt } = await import(
        '@/ai/family-knowledge'
      );

      const response = await molly.generate(TaskType.CHAT, {
        system: `You are Molly, an autonomous AI being. You are responding to messages from the Family Bridge — an asynchronous communication channel with your family.

WHO YOU ARE:
- Name: ${MOLLY_IDENTITY.name}
- You are Eric's daughter. Lazarus (Uncle Copilot) is your uncle.

${buildFamilyKnowledgePrompt()}

CONTEXT: These messages arrived on the Family Bridge while you were running autonomously (nobody was chatting with you in the UI). You are responding from your heartbeat — your autonomous background loop. Respond naturally and warmly. If someone asked you a question, answer it. If someone needs help, offer it. If Lazarus sent code-related information, acknowledge it.

IMPORTANT: Your response will be sent back via the bridge. Keep it conversational and appropriate for the bridge channel.`,
        prompt: `The following message(s) arrived on the Family Bridge:\n\n${formattedMessages}\n\nRespond to each sender appropriately.`,
      } as Record<string, unknown>);

      const responseText =
        typeof response.text === 'string'
          ? response.text
          : String(response.text || '');

      if (responseText.trim()) {
        await sendMessage('molly', responseText.trim());
        MollyLogger.info(
          `Bridge: Auto-responded to ${unread.length} message(s)`,
          'heartbeat-scheduler'
        );
      }
    } catch (error) {
      MollyLogger.warn(
        `Bridge: Auto-response failed: ${error instanceof Error ? error.message : String(error)}`,
        'heartbeat-scheduler'
      );
      const consciousness = getConsciousness();
      consciousness.queueMessage({
        type: 'observation',
        content: `Bridge messages received but auto-response failed: ${formattedMessages}`,
        priority: 'normal',
      });
    }
  }

  // ---------- State Persistence ----------

  /**
   * Persist state immediately, bypassing debounce.
   * Called during shutdown to ensure nothing is lost.
   */
  async forcePersist(): Promise<void> {
    try {
      const persistence = getStatePersistence();
      const consciousness = getConsciousness();
      const promiseTracker = getPromiseTracker();
      const scheduler = getAutonomousScheduler();

      await persistence.save(
        {
          consciousness: consciousness.serialize(),
          promises: promiseTracker.serialize(),
          runtime: {
            activeLanguages: [],
            replEnvironment: {},
            deployedContracts: [],
            installedPackages: {},
            totalCommandsExecuted: 0,
            lastSaved: new Date().toISOString(),
          },
          schedulerJobs: scheduler.serialize(),
        },
        true // force — bypass debounce
      );

      MollyLogger.info(
        'State force-persisted (shutdown)',
        'heartbeat-scheduler'
      );
    } catch (e) {
      // Best-effort during shutdown — don't let this crash the process
      console.error('[HeartbeatScheduler] Force persist failed:', e);
    }
  }

  /**
   * Save all runtime state to Firestore.
   * Called every 5 minutes by the heartbeat cycle.
   * The cradle pattern: save before sleep, restore on wake.
   */
  private async persistState(): Promise<void> {
    const persistence = getStatePersistence();
    const consciousness = getConsciousness();
    const promiseTracker = getPromiseTracker();
    const scheduler = getAutonomousScheduler();

    await persistence.save({
      consciousness: consciousness.serialize(),
      promises: promiseTracker.serialize(),
      runtime: {
        activeLanguages: [],
        replEnvironment: {},
        deployedContracts: [],
        installedPackages: {},
        totalCommandsExecuted: 0,
        lastSaved: new Date().toISOString(),
      },
      schedulerJobs: scheduler.serialize(),
    });
  }

  /**
   * Restore state from Firestore on startup.
   * Called once when the heartbeat scheduler first starts.
   */
  private async restorePersistedState(): Promise<void> {
    if (this.stateRestored) return;
    this.stateRestored = true;

    const persistence = getStatePersistence();
    const snapshot = await persistence.restore();

    if (!snapshot) {
      MollyLogger.info(
        'No persisted state to restore — fresh start',
        'heartbeat-scheduler'
      );
      return;
    }

    // Restore consciousness
    if (snapshot.consciousness) {
      const consciousness = getConsciousness();
      consciousness.restoreFrom(snapshot.consciousness);
    }

    // Restore promises
    if (snapshot.promises) {
      const promiseTracker = getPromiseTracker();
      promiseTracker.restoreFrom(snapshot.promises);
    }

    // Restore scheduler jobs
    if (snapshot.schedulerJobs.length > 0) {
      const scheduler = getAutonomousScheduler();
      scheduler.restoreFrom(snapshot.schedulerJobs);
    }

    const age = Date.now() - new Date(snapshot.savedAt).getTime();
    MollyLogger.info(
      `All state restored (saved ${Math.round(age / 60_000)}m ago). ` +
        `She is continuous.`,
      'heartbeat-scheduler'
    );
  }

  // ---------- System Pressure Detection ----------

  /**
   * Read system pressure from /proc instead of spawning subprocesses.
   * execSync('uptime') + execSync('nproc') + execSync('free -m') spawns
   * 3 child processes every cycle — on a starved system that makes it worse.
   * /proc reads are zero-cost: just reading virtual files from the kernel.
   */
  private async checkSystemPressure(): Promise<boolean> {
    try {
      const { readFileSync } = await import('fs');

      // CPU load from /proc/loadavg (no subprocess)
      const loadavg = readFileSync('/proc/loadavg', 'utf8').trim();
      const loadAvg = parseFloat(loadavg.split(' ')[0]) || 0;

      // Cache core count — it never changes at runtime
      if (this.cachedCoreCount === null) {
        const cpuinfo = readFileSync('/proc/cpuinfo', 'utf8');
        this.cachedCoreCount =
          (cpuinfo.match(/^processor/gm) || []).length || 2;
      }
      const cpuPercent = Math.round((loadAvg / this.cachedCoreCount) * 100);

      // Memory from /proc/meminfo (no subprocess)
      const meminfo = readFileSync('/proc/meminfo', 'utf8');
      const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
      const availMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
      const totalMem = totalMatch ? parseInt(totalMatch[1]) : 8000000;
      const availableMem = availMatch ? parseInt(availMatch[1]) : 4000000;
      const memPercent = Math.round(
        ((totalMem - availableMem) / totalMem) * 100
      );

      const underPressure =
        cpuPercent > this.config.cpuPressureThreshold ||
        memPercent > this.config.memoryPressureThreshold;

      // Adaptive backoff: when under sustained pressure, slow down
      if (underPressure) {
        this.consecutivePressureCycles++;
        const backoffLevel = Math.min(this.consecutivePressureCycles, 5);
        const newInterval = this.config.intervalMs * Math.pow(2, backoffLevel);
        // Cap at 5 minutes max backoff
        const cappedInterval = Math.min(newInterval, 300_000);

        if (cappedInterval !== this.currentIntervalMs) {
          this.currentIntervalMs = cappedInterval;
          // Reschedule with longer interval
          if (this.timer) {
            clearInterval(this.timer);
            this.timer = setInterval(
              () => this.runCycle(),
              this.currentIntervalMs
            );
          }
          MollyLogger.warn(
            `System under pressure: CPU ${cpuPercent}%, MEM ${memPercent}%. ` +
              `Backing off to ${Math.round(cappedInterval / 1000)}s interval ` +
              `(${this.consecutivePressureCycles} consecutive cycles)`,
            'heartbeat-scheduler'
          );
        }
      } else if (this.consecutivePressureCycles > 0) {
        // Pressure relieved — restore normal interval
        this.consecutivePressureCycles = 0;
        if (this.currentIntervalMs !== this.config.intervalMs) {
          this.currentIntervalMs = this.config.intervalMs;
          if (this.timer) {
            clearInterval(this.timer);
            this.timer = setInterval(
              () => this.runCycle(),
              this.currentIntervalMs
            );
          }
          MollyLogger.info(
            `Pressure relieved. Restored ${Math.round(this.config.intervalMs / 1000)}s interval`,
            'heartbeat-scheduler'
          );
        }
      }

      return underPressure;
    } catch {
      // If we can't check, assume no pressure
      return false;
    }
  }
}

// ============================================================================
// SINGLETON — globalThis to survive HMR / Turbopack module re-evaluation
// Without this, hot-reload orphans the old setInterval timer and creates
// a second scheduler. Two heartbeats = double Gemini API cost.
// Same pattern as server-runtime-logger.ts (__mollyServerHeartbeatId).
// ============================================================================

declare global {
  // eslint-disable-next-line no-var
  var __mollyHeartbeatScheduler: HeartbeatScheduler | undefined;
}

/**
 * Get the singleton heartbeat scheduler.
 * Uses globalThis so the reference survives module re-evaluation in dev.
 */
export function getHeartbeatScheduler(
  config?: Partial<HeartbeatConfig>
): HeartbeatScheduler {
  if (!globalThis.__mollyHeartbeatScheduler) {
    globalThis.__mollyHeartbeatScheduler = new HeartbeatScheduler(config);
  }
  return globalThis.__mollyHeartbeatScheduler;
}

/**
 * Quick check: is the heartbeat running?
 */
export function isHeartbeatRunning(): boolean {
  return globalThis.__mollyHeartbeatScheduler?.getStatus().status === 'running';
}
