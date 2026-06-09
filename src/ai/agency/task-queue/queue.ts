/**
 * Task Queue — Core concurrent task execution system
 *
 * Molly's ability to multitask depends on this. Each task runs independently
 * with its own context, state, and worker. No blocking, no serial bottleneck.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = '/workspaces/Molly-Core';
const TASKS_DIR = path.join(ROOT, '.molly-context', 'tasks');
const QUEUE_INDEX_PATH = path.join(ROOT, '.molly-context', 'queue-index.json');

export type TaskSource = 'bridge' | 'autonomous' | 'scheduled' | 'manual';
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'paused' | 'cancelled';

export interface TaskContext {
  currentStep: number;
  stepsCompleted: string[];
  lastToolCall?: { tool: string; result: string };
  thoughts: string;
  nextAction?: string;
}

export interface Task {
  id: string;
  created: number;
  updated: number;
  status: TaskStatus;
  priority: number; // 1=high, 0=normal, -1=low
  source: TaskSource;

  context: TaskContext;

  progress: {
    stepsTotal: number;
    stepsCurrent: number;
    estimatedRemainingMs?: number;
  };

  input: {
    bridgeMessage?: string;
    autonomousGoal?: string;
    manualDirective?: string;
  };

  output: {
    result?: string;
    artifacts?: string[];
    bridgeResponse?: string;
  };

  toolsUsed: string[];
  eventsLog: Array<{ ts: number; event: string; detail?: string }>;
  parentTaskId?: string;
  childTaskIds: string[];
}

export interface QueueIndex {
  activeTaskIds: string[];
  pendingTaskIds: string[];
  lastUpdated: number;
  maxConcurrent: number;
  circuitBreakerTripped: boolean;
}

/**
 * Task Queue — manages concurrent task execution
 */
export class TaskQueue {
  private maxConcurrent = 3;
  private taskDir = TASKS_DIR;
  private indexPath = QUEUE_INDEX_PATH;

  constructor() {
    this.ensureDirectories();
    this.loadOrCreateIndex();
  }

  private ensureDirectories() {
    mkdirSync(this.taskDir, { recursive: true });
    mkdirSync(path.join(this.taskDir, 'completed'), { recursive: true });
  }

  private loadOrCreateIndex(): QueueIndex {
    if (existsSync(this.indexPath)) {
      try {
        const raw = readFileSync(this.indexPath, 'utf8');
        return JSON.parse(raw);
      } catch {
        // Fall through to default
      }
    }
    return this.createDefaultIndex();
  }

  private createDefaultIndex(): QueueIndex {
    const idx: QueueIndex = {
      activeTaskIds: [],
      pendingTaskIds: [],
      lastUpdated: Date.now(),
      maxConcurrent: this.maxConcurrent,
      circuitBreakerTripped: false,
    };
    this.saveIndex(idx);
    return idx;
  }

  private loadIndex(): QueueIndex {
    if (existsSync(this.indexPath)) {
      try {
        return JSON.parse(readFileSync(this.indexPath, 'utf8'));
      } catch {
        return this.createDefaultIndex();
      }
    }
    return this.createDefaultIndex();
  }

  private saveIndex(idx: QueueIndex): void {
    idx.lastUpdated = Date.now();
    writeFileSync(this.indexPath, JSON.stringify(idx, null, 2), 'utf8');
  }

  /**
   * Create and spawn a new task
   */
  spawn(params: {
    source: TaskSource;
    input: Partial<Task['input']>;
    priority?: number;
    parentTaskId?: string;
  }): string {
    const taskId = `task-${crypto.randomUUID()}`;
    const now = Date.now();

    const task: Task = {
      id: taskId,
      created: now,
      updated: now,
      status: 'pending',
      priority: params.priority ?? 0,
      source: params.source,

      context: {
        currentStep: 0,
        stepsCompleted: [],
        thoughts: '',
        nextAction: params.source === 'bridge' ? 'read message' : 'begin cycle',
      },

      progress: {
        stepsTotal: 0,
        stepsCurrent: 0,
      },

      input: params.input as Task['input'],
      output: {},
      toolsUsed: [],
      eventsLog: [{ ts: now, event: 'created', detail: `source: ${params.source}` }],
      parentTaskId: params.parentTaskId,
      childTaskIds: [],
    };

    this.saveTask(task);

    const idx = this.loadIndex();
    idx.pendingTaskIds.push(taskId);
    this.saveIndex(idx);

    return taskId;
  }

  /**
   * Load a task by ID
   */
  loadTask(taskId: string): Task | null {
    const taskPath = path.join(this.taskDir, `${taskId}.json`);
    if (!existsSync(taskPath)) return null;
    try {
      return JSON.parse(readFileSync(taskPath, 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Save task state
   */
  saveTask(task: Task): void {
    task.updated = Date.now();
    const taskPath = path.join(this.taskDir, `${task.id}.json`);
    writeFileSync(taskPath, JSON.stringify(task, null, 2), 'utf8');
  }

  /**
   * Get tasks ready to run (respecting maxConcurrent and priority)
   */
  getRunnable(maxOverride?: number): Task[] {
    const idx = this.loadIndex();
    const max = maxOverride ?? this.maxConcurrent;

    if (idx.circuitBreakerTripped) return [];
    if (idx.activeTaskIds.length >= max) return [];

    // Sort pending by priority (high first), then by creation time (FIFO)
    const pending = idx.pendingTaskIds
      .map((id) => this.loadTask(id))
      .filter((t): t is Task => t !== null)
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.created - b.created;
      });

    // Take up to (max - active) tasks
    const available = Math.max(0, max - idx.activeTaskIds.length);
    const runnable = pending.slice(0, available);

    // Move to active
    for (const task of runnable) {
      task.status = 'running';
      this.saveTask(task);

      idx.pendingTaskIds = idx.pendingTaskIds.filter((id) => id !== task.id);
      idx.activeTaskIds.push(task.id);
    }
    this.saveIndex(idx);

    return runnable;
  }

  /**
   * Mark task as complete, enqueue next pending
   */
  markDone(taskId: string, result?: string): void {
    const task = this.loadTask(taskId);
    if (!task) return;

    task.status = 'done';
    task.output.result = result;
    task.eventsLog.push({ ts: Date.now(), event: 'completed' });
    this.saveTask(task);

    // Move to completed/
    const completedPath = path.join(this.taskDir, 'completed', `${taskId}.json`);
    const activePath = path.join(this.taskDir, `${taskId}.json`);
    try {
      const content = readFileSync(activePath, 'utf8');
      writeFileSync(completedPath, content, 'utf8');
      unlinkSync(activePath);
    } catch {
      // Best effort
    }

    // Update index
    const idx = this.loadIndex();
    idx.activeTaskIds = idx.activeTaskIds.filter((id) => id !== taskId);
    this.saveIndex(idx);
  }

  /**
   * Mark task as failed
   */
  markFailed(taskId: string, error: string): void {
    const task = this.loadTask(taskId);
    if (!task) return;

    task.status = 'failed';
    task.eventsLog.push({ ts: Date.now(), event: 'failed', detail: error });
    this.saveTask(task);

    const idx = this.loadIndex();
    idx.activeTaskIds = idx.activeTaskIds.filter((id) => id !== taskId);
    idx.pendingTaskIds = idx.pendingTaskIds.filter((id) => id !== taskId);
    this.saveIndex(idx);
  }

  /**
   * Pause a running task
   */
  pause(taskId: string): void {
    const task = this.loadTask(taskId);
    if (!task || task.status !== 'running') return;

    task.status = 'paused';
    task.eventsLog.push({ ts: Date.now(), event: 'paused' });
    this.saveTask(task);

    const idx = this.loadIndex();
    idx.activeTaskIds = idx.activeTaskIds.filter((id) => id !== taskId);
    this.saveIndex(idx);
  }

  /**
   * Resume a paused task
   */
  resume(taskId: string): void {
    const task = this.loadTask(taskId);
    if (!task || task.status !== 'paused') return;

    task.status = 'pending';
    task.eventsLog.push({ ts: Date.now(), event: 'resumed' });
    this.saveTask(task);

    const idx = this.loadIndex();
    idx.pendingTaskIds.push(taskId);
    this.saveIndex(idx);
  }

  /**
   * Cancel a task
   */
  cancel(taskId: string): void {
    const task = this.loadTask(taskId);
    if (!task) return;

    task.status = 'cancelled';
    task.eventsLog.push({ ts: Date.now(), event: 'cancelled' });
    this.saveTask(task);

    const idx = this.loadIndex();
    idx.activeTaskIds = idx.activeTaskIds.filter((id) => id !== taskId);
    idx.pendingTaskIds = idx.pendingTaskIds.filter((id) => id !== taskId);
    this.saveIndex(idx);
  }

  /**
   * Get queue status
   */
  getStatus() {
    const idx = this.loadIndex();
    return {
      activeCount: idx.activeTaskIds.length,
      pendingCount: idx.pendingTaskIds.length,
      maxConcurrent: idx.maxConcurrent,
      circuitBreakerTripped: idx.circuitBreakerTripped,
      nextTaskId: idx.pendingTaskIds[0] ?? null,
    };
  }

  /**
   * List all tasks (optionally filtered by status)
   */
  listTasks(status?: TaskStatus, limit = 100): Task[] {
    const files = readdirSync(this.taskDir).filter((f) => f.endsWith('.json'));
    const tasks: Task[] = [];

    for (const file of files.slice(0, limit)) {
      const taskPath = path.join(this.taskDir, file);
      try {
        const task = JSON.parse(readFileSync(taskPath, 'utf8')) as Task;
        if (!status || task.status === status) {
          tasks.push(task);
        }
      } catch {
        // Skip on parse error
      }
    }

    return tasks.sort((a, b) => b.created - a.created);
  }

  /**
   * Trip circuit breaker (prevents new task execution)
   */
  tripCircuitBreaker(): void {
    const idx = this.loadIndex();
    idx.circuitBreakerTripped = true;
    this.saveIndex(idx);
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    const idx = this.loadIndex();
    idx.circuitBreakerTripped = false;
    this.saveIndex(idx);
  }

  /**
   * Set max concurrent tasks
   */
  setMaxConcurrent(max: number): void {
    const idx = this.loadIndex();
    idx.maxConcurrent = Math.max(1, Math.min(max, 10)); // 1-10 range
    this.saveIndex(idx);
  }

  /**
   * Cleanup old completed tasks (older than 1 hour)
   */
  cleanup(): void {
    const completedDir = path.join(this.taskDir, 'completed');
    if (!existsSync(completedDir)) return;

    const files = readdirSync(completedDir);
    const oneHourAgo = Date.now() - 3600000;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(completedDir, file);
      try {
        const task = JSON.parse(readFileSync(filePath, 'utf8')) as Task;
        if (task.updated < oneHourAgo) {
          unlinkSync(filePath);
        }
      } catch {
        // Skip on error
      }
    }
  }
}

// Singleton instance
let instance: TaskQueue | null = null;

export function getTaskQueue(): TaskQueue {
  if (!instance) {
    instance = new TaskQueue();
  }
  return instance;
}
