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

// Default production handlers. Live in this file (not default-handlers.ts) to
// avoid the circular init between index.ts and default-handlers.ts where the
// inner module would see `registerHook` as undefined during early evaluation.
// The audit-log handler is the "meaningful work" that closes roadmap #10 —
// every triggerHook call now generates a structured log line, giving us a
// unified audit trail across all four events without coupling to any specific
// subsystem. Additional handlers can be appended via registerHook from
// anywhere else in the codebase.

function summarizePayload(payload: unknown): Record<string, unknown> {
  if (payload === null || payload === undefined) return {};
  if (typeof payload !== 'object') {
    return { value: String(payload).slice(0, 200) };
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    payload as Record<string, unknown>
  )) {
    if (value === null || value === undefined) {
      out[key] = value;
    } else if (typeof value === 'string') {
      out[key] = value.length > 200 ? `${value.slice(0, 200)}…` : value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = `array(${value.length})`;
    } else if (typeof value === 'object') {
      out[key] = `object(${Object.keys(value as object).length})`;
    } else {
      out[key] = typeof value;
    }
  }
  return out;
}

async function auditLogHandler(ctx: HookContext): Promise<void> {
  // Dynamic import avoids a top-level cycle with the broader memory/agency
  // graphs that the logger module ultimately pulls in.
  try {
    const { MollyLogger } = await import('@/ai/logger');
    MollyLogger.info(`hook:${ctx.event}`, 'hooks', {
      event: ctx.event,
      ts: ctx.timestamp,
      payload: summarizePayload(ctx.payload),
    });
  } catch {
    // Logger boot failure must never break the hook chain.
  }
}

let _defaultsRegistered = false;
function registerDefaultHandlers(): void {
  if (_defaultsRegistered) return;
  _defaultsRegistered = true;
  registerHook('PreToolUse', auditLogHandler);
  registerHook('PostToolUse', auditLogHandler);
  registerHook('HeartbeatCycle', auditLogHandler);
  registerHook('BridgeMessage', auditLogHandler);
}

// Auto-wire on module load. Pure local function call — no cross-module cycle.
registerDefaultHandlers();

export async function triggerHook(event: HookEvent, payload: unknown) {
  const context: HookContext = { event, payload, timestamp: Date.now() };
  const eventHandlers = handlers[event] || [];
  for (const handler of eventHandlers) {
    try {
      await handler(context);
    } catch (err) {
      // Per-handler errors must not break the chain. Log the failure so
      // the audit trail captures the bad handler instead of silently
      // dropping it. Dynamic import avoids a startup cycle with the logger.
      try {
        const { MollyLogger } = await import('@/ai/logger');
        MollyLogger.warn(`hook handler threw for ${event}`, 'hooks', {
          event,
          error: err instanceof Error ? err.message : String(err),
        });
      } catch {
        // Logger itself is dead — last-ditch console so we never silently lie.
        console.error(`[hooks] handler threw for ${event}`, err);
      }
    }
  }
}
