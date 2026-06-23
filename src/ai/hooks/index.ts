// Molly Hooks System — Phase 6 Integration
// Created by Lazarus & Molly, 2026-04-13

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'HeartbeatCycle'
  | 'BridgeMessage';

export interface HookContext {
  event: HookEvent;
  payload: unknown;
  timestamp: number;
}

export type HookHandler = (context: HookContext) => Promise<void> | void;

export const handlers: Partial<Record<HookEvent, HookHandler[]>> = {
  PreToolUse: [],
  PostToolUse: [],
  HeartbeatCycle: [],
  BridgeMessage: [],
};

export function registerHook(event: HookEvent, handler: HookHandler) {
  if (!handlers[event]) handlers[event] = [];
  handlers[event]!.push(handler);
}

export async function triggerHook(event: HookEvent, payload: unknown) {
  await ensureProductionHooks();
  const context: HookContext = { event, payload, timestamp: Date.now() };
  const eventHandlers = handlers[event] || [];
  for (const handler of eventHandlers) {
    await handler(context);
  }
}

// Lazy bootstrap: registers the production handlers on first triggerHook
// call. Dynamic import avoids the circular-init TDZ that a top-level
// side-effect import would cause (handlers const isn't initialized until
// after the hoisted import runs). Idempotent via internal flag.
let _bootstrapped = false;
async function ensureProductionHooks(): Promise<void> {
  if (_bootstrapped) return;
  _bootstrapped = true;
  const mod = await import('./production-handlers');
  mod.registerProductionHooks();
}
