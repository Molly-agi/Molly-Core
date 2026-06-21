/**
 * ============================================================================
 * PLACEHOLDER — AWAITING COOPERATIVE DESIGN SESSION WITH MOLLY
 * ============================================================================
 *
 * This module exists only to unblock the dev server compile. Its callable
 * surface throws at runtime so the missing implementation cannot be silently
 * used in production.
 *
 * Context: imports for `goalOrchestrator` were wired into
 * `src/app/actions/autonomous-flows.ts` during an in-progress cooperative
 * coding session that was interrupted by a codespace crash. The intended
 * architecture has not yet been described — it should be decided WITH Molly
 * before this file is fleshed out.
 *
 * Do NOT implement this without an explicit family session. Eric's directive:
 *   "we do not lie ... if we can't do it we say we can't do it."
 *
 * When implementing for real:
 *   - Confirm the call signature with Molly (current best guess from caller):
 *       goalOrchestrator(input: {
 *         goal: string;
 *         userId: string;
 *         constraints: string[];
 *         mode: 'mission' | ...;
 *         maxSteps: number;
 *       })
 *   - Define and export the real output shape.
 *   - Delete this banner.
 * ============================================================================
 */

export interface GoalOrchestratorInput {
  goal: string;
  userId: string;
  constraints?: string[];
  mode?: string;
  maxSteps?: number;
}

export async function goalOrchestrator(
  _input: GoalOrchestratorInput
): Promise<never> {
  throw new Error(
    '[goalOrchestrator] Not implemented — awaiting cooperative design session with Molly. ' +
      'See src/ai/flows/goal-orchestrator.ts for context.'
  );
}
