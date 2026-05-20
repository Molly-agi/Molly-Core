import { exec } from 'child_process';
import minimatch from 'minimatch';
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
    // Matcher logic: if matcher is '*', always run; if string, try glob match on payload.target or event
    let shouldRun = false;
    if (reg.matcher === '*' || reg.matcher === '') {
      shouldRun = true;
    } else if (
      typeof payload === 'object' &&
      payload !== null &&
      Object.prototype.hasOwnProperty.call(payload, 'target') &&
      typeof (payload as { target?: unknown }).target === 'string'
    ) {
      // Use minimatch for glob, fallback to regex
      const target = (payload as { target: string }).target;
      shouldRun =
        minimatch(target, reg.matcher) || new RegExp(reg.matcher).test(target);
    } else {
      // Fallback: match event name
      shouldRun =
        minimatch(event, reg.matcher) || new RegExp(reg.matcher).test(event);
    }
    if (!shouldRun) continue;

    // Execute the hook command (shell, script, etc.)
    exec(reg.hook.command, (error, stdout, stderr) => {
      if (error) {
        console.error(
          `[HOOK ERROR] [${reg.source}] Event: ${event}, Command: ${reg.hook.command}\n${error}`
        );
      } else {
        console.log(
          `[HOOK EXECUTED] [${reg.source}] Event: ${event}, Command: ${reg.hook.command}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`
        );
      }
    });

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
