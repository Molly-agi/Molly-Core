/**
 * @fileOverview Molly's complete HackerOne audit cycle.
 * Drives smart fuzzing loops, vaults findings to the encrypted local DB,
 * and auto-formats HackerOne disclosure reports.
 *
 * This is a server-side async function (uses fs, crypto).
 * For React UI state management, call this from a Next.js server action
 * and propagate the returned MoodSignal to a client component.
 */

import { DeduplicationGuard } from './DeduplicationGuard';
import { FuzzingEngine } from './FuzzingEngine';
import { VaultStore, type SavedFinding } from './VaultStore';
import { ReportBuilder } from './ReportBuilder';

export type MoodSignal = 'DEFAULT' | 'SHOCK' | 'ANALYTICAL' | 'SUCCESS_FOUND';

export interface AuditResult {
  mood: MoodSignal;
  finding?: SavedFinding;
  report?: string;
  skipped?: boolean;
}

const vault = new VaultStore();

/**
 * Run up to `maxSteps` feedback-driven fuzzing steps against a single
 * url + parameter combination. Returns the mood signal and any finding.
 */
export async function runMollyAuditCycle(
  url: string,
  parameter: string,
  maxSteps = 5
): Promise<AuditResult> {
  const dedup = DeduplicationGuard.getInstance();

  if (dedup.isDuplicateTarget(url, parameter)) {
    return { mood: 'DEFAULT', skipped: true };
  }

  let feedbackContext = '';

  for (let step = 0; step < maxSteps; step++) {
    const mutatedInput = FuzzingEngine.generateMutation(
      'test_input',
      feedbackContext
    );

    try {
      const result = await FuzzingEngine.executeFuzzTick(
        url,
        parameter,
        mutatedInput
      );

      if (result.hasStackTrace || result.statusCode === 500) {
        dedup.registerScannedTarget(url, parameter);

        const finding: SavedFinding = {
          id: VaultStore.generateFindingId(),
          targetDomain: url,
          vulnerabilityType: result.hasStackTrace
            ? 'Remote Code Execution / Stack Leak'
            : 'Internal Server Error Manipulation',
          pocSteps: [
            `Target parameter: "${parameter}"`,
            `Injected payload: "${mutatedInput}"`,
            `Server responded with status ${result.statusCode} in ${result.responseTimeMs}ms`,
          ],
          severityScore: result.hasStackTrace ? 9.1 : 7.5,
          discoveredAt: Date.now(),
        };

        await vault.writeFindingToVault(finding);
        const report = ReportBuilder.compileMarkdownReport(finding);
        console.log('[MOLLY_AUDIT]: Vulnerability logged.\n', report);

        return { mood: 'SUCCESS_FOUND', finding, report };
      }

      feedbackContext = result.body.slice(0, 500);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[MOLLY_AUDIT]: Step ${step} error: ${msg}`);
      return { mood: 'SHOCK' };
    }
  }

  return { mood: 'DEFAULT' };
}
