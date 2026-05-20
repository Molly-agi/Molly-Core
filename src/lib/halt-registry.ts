/**
 * Halt Controller Registry — Synchronous utility for abort controller tracking.
 * Separate from server actions because Next.js requires server actions to be async.
 */

// Global halt state
export let emergencyHaltActive = false;
export let haltTimestamp: string | null = null;
export let haltReason: string | null = null;

// Registry of active AbortControllers
export const activeControllers: Set<AbortController> = new Set();

/**
 * Set halt state (called by server action)
 */
export function setHaltState(
  active: boolean,
  timestamp: string | null,
  reason: string | null
): void {
  emergencyHaltActive = active;
  haltTimestamp = timestamp;
  haltReason = reason;
}

/**
 * Register an AbortController for emergency halt capability.
 * Call this at the start of any autonomous operation.
 */
export function registerAbortController(controller: AbortController): void {
  activeControllers.add(controller);
  // Auto-cleanup when aborted
  controller.signal.addEventListener('abort', () => {
    activeControllers.delete(controller);
  });
}

/**
 * Abort all registered controllers and clear the registry.
 * Returns the count of aborted controllers.
 */
export function abortAllControllers(): number {
  const count = activeControllers.size;
  for (const controller of activeControllers) {
    try {
      controller.abort(
        new Error('EMERGENCY_HALT: Operation terminated by kill switch')
      );
    } catch {
      // Controller may already be aborted
    }
  }
  activeControllers.clear();
  return count;
}

/**
 * Check if halt is active (sync version for hot paths)
 */
export function isHalted(): boolean {
  return emergencyHaltActive;
}
