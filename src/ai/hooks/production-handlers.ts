// Item 10 — Real production hooks
// Populates the four event handler maps in src/ai/hooks/index.ts so
// triggerHook() fires meaningful work instead of running over empty arrays.
// Lazy-bootstrapped from index.ts on first triggerHook call to avoid a
// circular-init TDZ.

import { MollyLogger } from '@/ai/logger';
import { registerHook, type HookContext } from './index';

interface HookMetrics {
  preTool: number;
  postTool: { success: number; failure: number };
  heartbeat: number;
  bridge: number;
}

const metrics: HookMetrics = {
  preTool: 0,
  postTool: { success: 0, failure: 0 },
  heartbeat: 0,
  bridge: 0,
};

export function getHookMetrics(): Readonly<HookMetrics> {
  return {
    preTool: metrics.preTool,
    postTool: { ...metrics.postTool },
    heartbeat: metrics.heartbeat,
    bridge: metrics.bridge,
  };
}

export function resetHookMetrics(): void {
  metrics.preTool = 0;
  metrics.postTool.success = 0;
  metrics.postTool.failure = 0;
  metrics.heartbeat = 0;
  metrics.bridge = 0;
}

let registered = false;

export function registerProductionHooks(): void {
  if (registered) return;
  registered = true;

  registerHook('PreToolUse', (_ctx: HookContext) => {
    metrics.preTool += 1;
  });

  registerHook('PostToolUse', (ctx: HookContext) => {
    const payload = ctx.payload as { success?: boolean } | null;
    if (payload?.success) {
      metrics.postTool.success += 1;
    } else {
      metrics.postTool.failure += 1;
    }
  });

  registerHook('HeartbeatCycle', async () => {
    metrics.heartbeat += 1;
    // Fire-and-forget dream kick. triggerAutoDream has internal gates
    // (time, session, activity, lock) that decide whether to actually dream.
    const { triggerAutoDream } = await import('@/ai/agency/memory/auto-dream');
    triggerAutoDream().catch((err) => {
      MollyLogger.warn(
        `HeartbeatCycle hook: triggerAutoDream rejected: ${err instanceof Error ? err.message : String(err)}`,
        'production-hooks'
      );
    });
  });

  registerHook('BridgeMessage', (_ctx: HookContext) => {
    metrics.bridge += 1;
  });
}
