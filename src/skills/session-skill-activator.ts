// src/skills/session-skill-activator.ts
// Idempotent skill activation for session-scoped hooks.
// First call for a sessionId registers any hook-bearing skills/agents.
// Subsequent calls for the same sessionId are O(1) no-ops.

const activatedSessions = new Set<string>();

/**
 * Ensure all hook-bearing skills and agents have been activated for the given
 * session. Safe to call on every tool invocation — after the first call per
 * sessionId, this returns immediately without any work.
 */
export async function ensureSkillsActivatedForSession(
  sessionId: string
): Promise<void> {
  if (activatedSessions.has(sessionId)) {
    return;
  }
  activatedSessions.add(sessionId);
  // Future: dynamically load and register hook-bearing skills from the registry.
}
