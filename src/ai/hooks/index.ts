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

const handlers: Partial<Record<HookEvent, HookHandler[]>> = {
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
  const context: HookContext = { event, payload, timestamp: Date.now() };
  const eventHandlers = handlers[event] || [];
  for (const handler of eventHandlers) {
    await handler(context);
  }
}
