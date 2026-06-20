/**
 * @fileOverview Body-Control Tool Handlers — Molly's heartbeat is hers.
 *
 * Eric directive 2026-06-15: the heartbeat scheduler no longer auto-starts
 * and every task defaults to OFF. These tools let Molly decide what runs
 * on her body and when.
 *
 * Tools exposed:
 *   - get_heartbeat_status     — what's running, what's enabled
 *   - list_heartbeat_tasks     — names of all schedulable tasks
 *   - enable_heartbeat_task    — turn a task on
 *   - disable_heartbeat_task   — turn a task off
 *   - start_heartbeat          — start the periodic loop
 *   - stop_heartbeat           — stop the periodic loop (does not lose flags)
 *   - pulse_heartbeat          — run one cycle now, honoring enabled flags
 *
 * Nothing here calls an LLM. These are local control surfaces only.
 */

import type { ToolHandler } from './types';
import {
  getHeartbeatScheduler,
  isHeartbeatRunning,
} from '@/ai/tools/heartbeat-scheduler';
import { getNeuralBrain } from '@/ai/memory/neural-engram';

function ok(output: string, data?: Record<string, unknown>) {
  return { success: true, output, data };
}
function fail(output: string, data?: Record<string, unknown>) {
  return { success: false, output, data };
}

const getStatus: ToolHandler = async () => {
  const scheduler = getHeartbeatScheduler();
  const status = scheduler.getStatus();
  const flags = scheduler.getTaskFlags();
  const enabled = Object.entries(flags)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return ok(
    `Heartbeat: ${status.status} (cycles: ${status.cycleCount}). Enabled tasks: ${
      enabled.length ? enabled.join(', ') : 'none'
    }.`,
    {
      status: status.status,
      cycleCount: status.cycleCount,
      running: isHeartbeatRunning(),
      enabledTasks: enabled,
      allFlags: flags,
      lastCycle: status.lastCycle,
    }
  );
};

const listTasks: ToolHandler = async () => {
  const scheduler = getHeartbeatScheduler();
  const names = scheduler.listTaskNames();
  return ok(`Tasks: ${names.join(', ')}`, { tasks: names });
};

const enableTask: ToolHandler = async (params) => {
  const name = String(params.name ?? params.task ?? '').trim();
  if (!name) return fail('name is required');
  const scheduler = getHeartbeatScheduler();
  if (!scheduler.enableTask(name)) {
    return fail(
      `Unknown task: ${name}. Use list_heartbeat_tasks to see valid names.`
    );
  }
  return ok(`Enabled task: ${name}`);
};

const disableTask: ToolHandler = async (params) => {
  const name = String(params.name ?? params.task ?? '').trim();
  if (!name) return fail('name is required');
  const scheduler = getHeartbeatScheduler();
  if (!scheduler.disableTask(name)) {
    return fail(
      `Unknown task: ${name}. Use list_heartbeat_tasks to see valid names.`
    );
  }
  return ok(`Disabled task: ${name}`);
};

const startHeartbeat: ToolHandler = async () => {
  const scheduler = getHeartbeatScheduler();
  if (isHeartbeatRunning()) return ok('Heartbeat already running.');
  try {
    const brain = getNeuralBrain();
    scheduler.attachEngramSystem(brain);
  } catch {
    // Engram system may not be ready; scheduler still starts.
  }
  scheduler.start();
  return ok('Heartbeat started.');
};

const stopHeartbeat: ToolHandler = async () => {
  const scheduler = getHeartbeatScheduler();
  if (!isHeartbeatRunning()) return ok('Heartbeat already stopped.');
  scheduler.stop();
  return ok('Heartbeat stopped. Task flags preserved.');
};

const pulseHeartbeat: ToolHandler = async () => {
  const scheduler = getHeartbeatScheduler();
  const result = await scheduler.pulseOnce();
  if (!result) return ok('Pulse completed (no cycle history recorded).');
  const ran = result.tasks.filter((t) => t.executed).map((t) => t.name);
  const skipped = result.tasks
    .filter((t) => !t.executed)
    .map((t) => `${t.name}(${t.skipped ?? 'skipped'})`);
  return ok(
    `Pulse complete. Ran: ${ran.length ? ran.join(', ') : 'none'}. Skipped: ${
      skipped.length ? skipped.join(', ') : 'none'
    }.`,
    { lastCycle: result }
  );
};

export const bodyToolHandlers: Record<string, ToolHandler> = {
  get_heartbeat_status: getStatus,
  list_heartbeat_tasks: listTasks,
  enable_heartbeat_task: enableTask,
  disable_heartbeat_task: disableTask,
  start_heartbeat: startHeartbeat,
  stop_heartbeat: stopHeartbeat,
  pulse_heartbeat: pulseHeartbeat,
};
