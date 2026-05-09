// src/hooks/sessionHooks.ts
// Session-scoped hook registration and execution for skills/agents

export type HookEvent = string; // e.g., 'PreToolUse', 'Stop', etc.
export type HookCommand = { command: string; once?: boolean };
export type HookMatcher = { matcher: string; hooks: HookCommand[] };
export type HooksSettings = Record<HookEvent, HookMatcher[]>;

interface RegisteredHook {
  event: HookEvent;
  matcher: string;
  hook: HookCommand;
  sessionId: string;
  source: string; // skill or agent name
}

const sessionHooks: RegisteredHook[] = [];

export function registerSessionHooks(
  sessionId: string,
  hooks: HooksSettings,
  source: string
) {
  for (const event in hooks) {
    for (const matcherConfig of hooks[event]) {
      for (const hook of matcherConfig.hooks) {
        sessionHooks.push({
          event,
          matcher: matcherConfig.matcher,
          hook,
          sessionId,
          source,
        });
      }
    }
  }
}

export function unregisterSessionHooks(sessionId: string) {
  for (let i = sessionHooks.length - 1; i >= 0; i--) {
    if (sessionHooks[i].sessionId === sessionId) {
      sessionHooks.splice(i, 1);
    }
  }
}

export function executeHooks(
  event: HookEvent,
  payload: unknown,
  sessionId: string
) {
  // Find hooks for this event and session
  const hooksToRun = sessionHooks.filter(
    (h) => h.event === event && h.sessionId === sessionId
  );
  for (const reg of hooksToRun) {
    // TODO: matcher logic (e.g., glob/file matching)
    // For now, run all hooks
    // Execute the hook command (shell, script, etc.)
    // For demo: just log
    console.log(
      `[HOOK] [${reg.source}] Event: ${event}, Command: ${reg.hook.command}`
    );
    // Remove if once:true
    if (reg.hook.once) {
      unregisterHook(reg);
    }
  }
}

function unregisterHook(reg: RegisteredHook) {
  const idx = sessionHooks.indexOf(reg);
  if (idx !== -1) sessionHooks.splice(idx, 1);
}

// For auditability
export function listSessionHooks(sessionId?: string) {
  return sessionHooks.filter((h) => !sessionId || h.sessionId === sessionId);
}
