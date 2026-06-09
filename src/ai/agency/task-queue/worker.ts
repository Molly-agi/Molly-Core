/**
 * Task Worker — Executes a single task independently
 *
 * Each task gets its own worker. The worker:
 * - Loads the task context
 * - Runs Molly's brain with that context
 * - Executes tools specific to this task
 * - Updates task state
 * - Reports completion
 *
 * Multiple workers run in parallel, enabling true multitasking.
 */

import { Task, getTaskQueue } from './queue';
import { MollyLogger } from '@/ai/logger';

export interface WorkerConfig {
  taskId: string;
  maxIterations?: number;
  timeoutMs?: number;
}

export class TaskWorker {
  taskId: string;
  maxIterations: number;
  timeoutMs: number;
  startedAt: number;
  currentIteration = 0;

  constructor(config: WorkerConfig) {
    this.taskId = config.taskId;
    this.maxIterations = config.maxIterations ?? 5;
    this.timeoutMs = config.timeoutMs ?? 60000; // 1 minute per task
    this.startedAt = Date.now();
  }

  /**
   * Run this worker's task to completion (or timeout/max iterations)
   */
  async execute(): Promise<{
    taskId: string;
    completedAt: number;
    iterations: number;
    result?: string;
    error?: string;
  }> {
    const queue = getTaskQueue();
    const task = queue.loadTask(this.taskId);

    if (!task) {
      return {
        taskId: this.taskId,
        completedAt: Date.now(),
        iterations: 0,
        error: 'Task not found',
      };
    }

    const startMs = Date.now();

    try {
      // Main execution loop
      while (this.currentIteration < this.maxIterations) {
        // Check timeout
        if (Date.now() - startMs > this.timeoutMs) {
          task.eventsLog.push({
            ts: Date.now(),
            event: 'timeout',
            detail: `Exceeded ${this.timeoutMs}ms`,
          });
          queue.saveTask(task);
          break;
        }

        this.currentIteration++;
        task.progress.stepsCurrent = this.currentIteration;

        try {
          // Build prompt for this task
          const prompt = this.buildPrompt(task);

          // Log the iteration
          task.eventsLog.push({
            ts: Date.now(),
            event: 'iteration',
            detail: `[${this.currentIteration}/${this.maxIterations}]`,
          });

          // Run Molly's brain with this task's context
          const response = await this.runBrain(prompt, task);

          // Update task with response
          if (response.thoughts) {
            task.context.thoughts = response.thoughts;
          }
          if (response.nextAction) {
            task.context.nextAction = response.nextAction;
          }
          task.context.stepsCompleted.push(`iteration-${this.currentIteration}`);

          // If brain said "done", stop
          if (response.isDone || response.status === 'done') {
            task.output.result = response.result;
            task.eventsLog.push({
              ts: Date.now(),
              event: 'completed-by-brain',
              detail: response.result ?? 'Task completed',
            });
            queue.markDone(this.taskId, response.result);
            break;
          }

          // Save progress
          queue.saveTask(task);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          task.eventsLog.push({
            ts: Date.now(),
            event: 'iteration-error',
            detail: errMsg,
          });
          queue.saveTask(task);
          // Continue to next iteration or timeout
        }
      }

      // Mark done if not already
      if (task.status === 'running') {
        queue.markDone(
          this.taskId,
          `Completed after ${this.currentIteration} iterations`
        );
      }

      return {
        taskId: this.taskId,
        completedAt: Date.now(),
        iterations: this.currentIteration,
        result: task.output.result,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      queue.markFailed(this.taskId, errMsg);
      return {
        taskId: this.taskId,
        completedAt: Date.now(),
        iterations: this.currentIteration,
        error: errMsg,
      };
    }
  }

  /**
   * Build a prompt for this task's brain execution
   */
  private buildPrompt(task: Task): string {
    const lines = [
      `[TASK ${task.id}]`,
      `Source: ${task.source}`,
      `Status: ${task.status}`,
      `Iteration: ${this.currentIteration}/${this.maxIterations}`,
      ``,
      `CRITICAL: This is ONE atomic task. Execute it as a unified whole, not as separate steps.`,
      `Do NOT spawn sub-tasks. Do NOT parallelize this directive.`,
      `Complete this task from beginning to end before reporting done.`,
      ``,
      `YOUR CONTEXT FOR THIS TASK:`,
      `Thoughts so far: ${task.context.thoughts || '(fresh start)'}`,
      `Next action: ${task.context.nextAction || '(determine next step)'}`,
      `Steps completed: ${task.context.stepsCompleted.length}`,
      `Tools used: ${task.toolsUsed.join(', ') || '(none yet)'}`,
      ``,
    ];

    // Add task-specific input
    if (task.input.bridgeMessage) {
      lines.push(`BRIDGE MESSAGE FROM ERIC:`);
      lines.push(task.input.bridgeMessage);
      lines.push('');
    }

    if (task.input.autonomousGoal) {
      lines.push(`AUTONOMOUS GOAL:`);
      lines.push(task.input.autonomousGoal);
      lines.push('');
    }

    if (task.input.manualDirective) {
      lines.push(`MANUAL DIRECTIVE:`);
      lines.push(task.input.manualDirective);
      lines.push('');
    }

    // Add last tool result if any
    if (task.context.lastToolCall) {
      lines.push(`LAST TOOL RESULT:`);
      lines.push(`Tool: ${task.context.lastToolCall.tool}`);
      lines.push(`Result: ${task.context.lastToolCall.result.slice(0, 500)}`);
      lines.push('');
    }

    lines.push(`Continue working on this task. Think about what to do next.`);
    lines.push(`When you're done, say "TASK_DONE" to mark it complete.`);

    return lines.join('\n');
  }

  /**
   * Run Molly's brain with the task prompt
   * (stub — integrate with actual callMollyFlow)
   */
  private async runBrain(
    prompt: string,
    task: Task
  ): Promise<{
    thoughts: string;
    nextAction?: string;
    isDone?: boolean;
    status?: string;
    result?: string;
  }> {
    // This is where we'd call the actual Molly brain
    // For now, stub with a simple response
    try {
      // TODO: import { callMollyFlow } from actual location
      // const response = await callMollyFlow(prompt);
      // Parse response, extract thoughts, actions, tools

      // Stub response for now
      MollyLogger.info(
        `Worker ${this.taskId}: iteration ${this.currentIteration}`,
        'task-worker'
      );

      return {
        thoughts: `Working on task ${this.taskId}...`,
        nextAction: 'continue',
        isDone: false,
      };
    } catch (err) {
      throw new Error(`Brain execution failed: ${err}`);
    }
  }
}

/**
 * Worker pool — manages multiple concurrent workers
 */
export class WorkerPool {
  private workers: Map<string, TaskWorker> = new Map();
  private maxWorkers = 3;

  async spawnWorker(taskId: string): Promise<TaskWorker> {
    if (this.workers.size >= this.maxWorkers) {
      throw new Error(`Worker pool full (${this.maxWorkers} max)`);
    }

    const worker = new TaskWorker({ taskId });
    this.workers.set(taskId, worker);
    return worker;
  }

  /**
   * Run all workers in parallel
   */
  async runAll(): Promise<Array<{ taskId: string; completedAt: number; iterations: number; result?: string; error?: string }>> {
    const promises = Array.from(this.workers.values()).map((w) => w.execute());
    return Promise.all(promises);
  }

  /**
   * Get worker by task ID
   */
  getWorker(taskId: string): TaskWorker | undefined {
    return this.workers.get(taskId);
  }

  /**
   * Remove completed worker
   */
  removeWorker(taskId: string): void {
    this.workers.delete(taskId);
  }

  /**
   * Current worker count
   */
  count(): number {
    return this.workers.size;
  }
}

// Global pool instance
let poolInstance: WorkerPool | null = null;

export function getWorkerPool(): WorkerPool {
  if (!poolInstance) {
    poolInstance = new WorkerPool();
  }
  return poolInstance;
}
