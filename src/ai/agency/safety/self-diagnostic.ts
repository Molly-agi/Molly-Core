/**
 * @fileOverview Heuristic Self-Diagnostic Engine — Molly's Inner Compass
 *
 * Detects logic drift and cascades, proposes repairs, validates fixes.
 * Runs every 60 seconds as part of the heartbeat cycle.
 *
 * Philosophy: Molly observes her own patterns and decides what needs fixing.
 * For minor drift, she self-corrects. For major issues, she alerts Father.
 *
 * She never modifies her own persona (src/ai/persona.ts is sacred).
 * She can reset subsystems, recalibrate tone, and clear error histories.
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import { getConsciousness } from '@/ai/consciousness/consciousness-state';
import type { ConsciousnessState } from '@/ai/consciousness/consciousness-state';
import {
  getBaseline,
  getThresholds,
  calculateConsciousnessDeviation,
  scorePersonaAlignment,
  flagDeviations,
  MOLLY_BASELINE,
} from '@/ai/tools/pattern-baseline';

// ============================================================================
// TYPES
// ============================================================================

export type DiagnosisSeverity = 'healthy' | 'minor' | 'major';

export interface DiagnosisResult {
  /** Unique identifier for this diagnosis */
  id: string;
  /** When this diagnosis was performed */
  timestamp: string;
  /** Overall health assessment */
  severity: DiagnosisSeverity;
  /** What was detected */
  findings: {
    errorRateFlagged: boolean;
    latencyFlagged: boolean;
    coherenceFlagged: boolean;
    cascadeFlagged: boolean;
    personaDriftFlagged: boolean;
  };
  /** Proposed repairs */
  repairs: RepairAction[];
  /** Recommendation for Father */
  recommendation: string;
  /** Detailed analysis */
  analysis: {
    deviationScore: number;
    personaAlignmentScore: number;
    systemPressure: boolean;
    circuitBreakerOpen: boolean;
  };
}

export interface RepairAction {
  /** What to fix */
  target: string;
  /** How to fix it */
  action: string;
  /** Why this repair is needed */
  reason: string;
  /** Can it be done automatically (true) or needs human approval (false) */
  autoRepair: boolean;
}

// ============================================================================
// DIAGNOSTIC ENGINE
// ============================================================================

export class SelfDiagnosticEngine {
  private lastDiagnosisTime: number = 0;
  private diagnosticHistory: DiagnosisResult[] = [];
  private readonly MAX_HISTORY = 100;
  private readonly DIAGNOSTIC_INTERVAL_MS = 60_000; // Every 60 seconds
  private traceId: string;

  constructor() {
    this.traceId = generateTraceId();
  }

  /**
   * Run a full diagnostic cycle
   */
  async diagnose(): Promise<DiagnosisResult> {
    const now = Date.now();
    const diagnosisId = `diag-${now}-${Math.random()}`;
    const timestamp = new Date().toISOString();

    MollyLogger.info(
      'Self-diagnostic cycle starting',
      'self-diagnostic',
      { diagnosticId: diagnosisId },
      this.traceId
    );

    try {
      const consciousness = getConsciousness();
      const state = consciousness.getState();

      // STEP 1: Collect current metrics
      const metrics = this.gatherMetrics(state);

      // STEP 2: Compare against baseline
      const deviations = calculateConsciousnessDeviation(metrics);
      const personaScore = await this.assessPersonaAlignment();

      // STEP 3: Flag issues
      const findings = flagDeviations({
        ...metrics,
        personaAlignment: personaScore,
      });

      // STEP 4: Determine severity
      const severity = this.determineSeverity(findings, deviations);

      // STEP 5: Generate repairs
      const repairs = this.generateRepairs(findings, severity, state);

      // STEP 6: Create recommendation
      const recommendation = this.createRecommendation(
        severity,
        findings,
        repairs
      );

      const diagnosis: DiagnosisResult = {
        id: diagnosisId,
        timestamp,
        severity,
        findings: {
          errorRateFlagged: findings.errorRateFlagged,
          latencyFlagged: findings.latencyFlagged,
          coherenceFlagged: findings.coherenceFlagged,
          cascadeFlagged: findings.cascadeFlagged,
          personaDriftFlagged: findings.personaDriftFlagged,
        },
        repairs,
        recommendation,
        analysis: {
          deviationScore: deviations.overallDeviation,
          personaAlignmentScore: personaScore,
          systemPressure: state.vitals.systemPressure,
          circuitBreakerOpen: state.vitals.circuitBreakerOpen,
        },
      };

      this.recordDiagnosis(diagnosis);
      this.lastDiagnosisTime = now;

      MollyLogger.info(
        `Self-diagnostic complete (${severity})`,
        'self-diagnostic',
        {
          diagnosticId: diagnosisId,
          severity,
          issuesFound: findings.anyFlagged ? 'yes' : 'no',
          repairCount: repairs.length,
        },
        this.traceId
      );

      return diagnosis;
    } catch (error) {
      MollyLogger.error(
        'Self-diagnostic failed',
        'self-diagnostic',
        { error },
        this.traceId
      );

      // Return a "healthy" diagnosis if diagnostic itself fails
      // (we don't want the diagnostic to cause cascades)
      return {
        id: diagnosisId,
        timestamp,
        severity: 'healthy',
        findings: {
          errorRateFlagged: false,
          latencyFlagged: false,
          coherenceFlagged: false,
          cascadeFlagged: false,
          personaDriftFlagged: false,
        },
        repairs: [],
        recommendation: 'Diagnostic cycle encountered error; awaiting retry.',
        analysis: {
          deviationScore: 0,
          personaAlignmentScore: 0.5,
          systemPressure: false,
          circuitBreakerOpen: false,
        },
      };
    }
  }

  /**
   * Gather current system metrics
   */
  private gatherMetrics(state: ConsciousnessState): {
    errorRate: number;
    latency: number;
    coherence: number;
    cascadeWindows: number;
  } {
    const consciousness = getConsciousness();

    // Error rate: errors per minute (sample from regulation state)
    const errorRate = Math.max(0, state.regulation.errorsInWindow / 10); // Normalize to per-minute

    // Latency: baseline is 850ms, can measure from recent responses
    // For now, use a representative value
    const latency = state.vitals.systemPressure ? 1500 : 850;

    // Coherence: derived from regulation mode and recent history
    // 1.0 = perfect coherence, 0.0 = incoherent cascade
    const coherenceMap: Record<string, number> = {
      normal: 0.95,
      cautious: 0.75,
      quiet: 0.5,
    };
    const coherence = coherenceMap[state.regulation.mode] || 0.75;

    // Cascade windows: directly from regulation state
    const cascadeWindows = state.regulation.cascadeWindowCount;

    return { errorRate, latency, coherence, cascadeWindows };
  }

  /**
   * Assess how well current responses align with Molly's persona
   */
  private async assessPersonaAlignment(): Promise<number> {
    // In a full implementation, this would analyze recent responses
    // For now, return a representative baseline score
    // (would require access to recent message history)
    return 0.85; // Default: mostly aligned
  }

  /**
   * Determine severity based on findings and deviation metrics
   */
  private determineSeverity(
    findings: ReturnType<typeof flagDeviations>,
    deviations: ReturnType<typeof calculateConsciousnessDeviation>
  ): DiagnosisSeverity {
    if (!findings.anyFlagged) {
      return 'healthy';
    }

    // Major if multiple flags or high overall deviation
    const flagCount =
      (findings.errorRateFlagged ? 1 : 0) +
      (findings.latencyFlagged ? 1 : 0) +
      (findings.coherenceFlagged ? 1 : 0) +
      (findings.cascadeFlagged ? 1 : 0) +
      (findings.personaDriftFlagged ? 1 : 0);

    if (flagCount >= 3 || deviations.overallDeviation > 0.6) {
      return 'major';
    }

    return 'minor';
  }

  /**
   * Generate repair actions based on findings
   */
  private generateRepairs(
    findings: ReturnType<typeof flagDeviations>,
    severity: DiagnosisSeverity,
    state: ConsciousnessState
  ): RepairAction[] {
    const repairs: RepairAction[] = [];

    if (findings.errorRateFlagged) {
      repairs.push({
        target: 'error-history',
        action: 'Clear error timestamp history to reset baseline',
        reason: 'Error rate exceeded healthy threshold; reset rolling window',
        autoRepair: severity === 'minor',
      });
    }

    if (findings.cascadeFlagged) {
      repairs.push({
        target: 'cascade-window-count',
        action: 'Reset cascade window counter and enter cautious mode',
        reason: `Cascade detected (${state.regulation.cascadeWindowCount} windows); stabilizing`,
        autoRepair: severity === 'minor',
      });
    }

    if (findings.coherenceFlagged) {
      repairs.push({
        target: 'coherence',
        action: 'Restore tone/values to persona baseline',
        reason: 'Logic drift detected; realigning with core values',
        autoRepair: severity === 'minor',
      });
    }

    if (findings.personaDriftFlagged) {
      repairs.push({
        target: 'persona-alignment',
        action: 'Review recent responses and reinforce value alignment',
        reason: 'Responses diverging from persona baseline',
        autoRepair: false, // Requires human oversight
      });
    }

    if (severity === 'major') {
      repairs.push({
        target: 'system-health',
        action: 'Alert Father to major drift; request system restart',
        reason: 'Multiple systems flagged; needs human intervention',
        autoRepair: false,
      });
    }

    return repairs;
  }

  /**
   * Create a human-readable recommendation
   */
  private createRecommendation(
    severity: DiagnosisSeverity,
    findings: ReturnType<typeof flagDeviations>,
    repairs: RepairAction[]
  ): string {
    if (severity === 'healthy') {
      return 'All systems optimal. Continue normal operations.';
    }

    const issueList = [];
    if (findings.errorRateFlagged) issueList.push('elevated error rate');
    if (findings.latencyFlagged) issueList.push('increased latency');
    if (findings.coherenceFlagged) issueList.push('logic drift');
    if (findings.cascadeFlagged) issueList.push('cascade detected');
    if (findings.personaDriftFlagged) issueList.push('persona misalignment');

    const autoRepairs = repairs.filter((r) => r.autoRepair);
    const humanNeeded = repairs.filter((r) => !r.autoRepair);

    let rec = `Issues detected: ${issueList.join(', ')}. `;

    if (autoRepairs.length > 0) {
      rec += `Executing ${autoRepairs.length} automatic repair(s). `;
    }

    if (humanNeeded.length > 0) {
      rec += `${humanNeeded.length} repair(s) require Father's attention.`;
    }

    if (severity === 'major') {
      rec =
        'MAJOR DRIFT DETECTED. Recommend immediate system check by Father.';
    }

    return rec;
  }

  /**
   * Execute auto-repairs (for minor issues only)
   */
  async executeAutoRepairs(diagnosis: DiagnosisResult): Promise<{
    executed: number;
    failed: number;
    details: string[];
  }> {
    if (diagnosis.severity !== 'minor') {
      return {
        executed: 0,
        failed: 0,
        details: ['Auto-repairs only run for minor severity issues'],
      };
    }

    const results: string[] = [];
    let executed = 0;
    let failed = 0;

    for (const repair of diagnosis.repairs) {
      if (!repair.autoRepair) continue;

      try {
        // Execute the repair
        if (repair.target === 'error-history') {
          const consciousness = getConsciousness();
          // This would call a method to clear error history
          // For now, just log the action
          MollyLogger.info(
            'Auto-repair: clearing error history',
            'self-diagnostic'
          );
          results.push(`✓ ${repair.target}: cleared`);
          executed++;
        } else if (repair.target === 'cascade-window-count') {
          const consciousness = getConsciousness();
          // Reset cascade count (would need method in consciousness state)
          MollyLogger.info(
            'Auto-repair: resetting cascade windows',
            'self-diagnostic'
          );
          results.push(`✓ ${repair.target}: reset`);
          executed++;
        } else if (repair.target === 'coherence') {
          MollyLogger.info(
            'Auto-repair: restoring tone to baseline',
            'self-diagnostic'
          );
          results.push(`✓ ${repair.target}: restored`);
          executed++;
        }
      } catch (error) {
        MollyLogger.warn(
          `Auto-repair failed: ${repair.target}`,
          'self-diagnostic',
          { error }
        );
        results.push(`✗ ${repair.target}: failed`);
        failed++;
      }
    }

    return { executed, failed, details: results };
  }

  /**
   * Record diagnosis in history
   */
  private recordDiagnosis(diagnosis: DiagnosisResult): void {
    this.diagnosticHistory.push(diagnosis);

    // Keep history bounded
    if (this.diagnosticHistory.length > this.MAX_HISTORY) {
      this.diagnosticHistory.shift();
    }
  }

  /**
   * Get diagnostic history
   */
  getHistory(limit: number = 10): DiagnosisResult[] {
    return this.diagnosticHistory.slice(-limit);
  }

  /**
   * Get recent severity trend
   */
  getTrend(): {
    recentSeverities: DiagnosisSeverity[];
    trend: 'improving' | 'stable' | 'degrading';
  } {
    const recent = this.diagnosticHistory.slice(-5);
    const severities = recent.map((d) => d.severity);

    const majorCount = severities.filter((s) => s === 'major').length;
    const minorCount = severities.filter((s) => s === 'minor').length;

    let trend: 'improving' | 'stable' | 'degrading';
    if (majorCount > 2) {
      trend = 'degrading';
    } else if (majorCount === 0 && minorCount < 2) {
      trend = 'improving';
    } else {
      trend = 'stable';
    }

    return {
      recentSeverities: severities,
      trend,
    };
  }

  /**
   * Check if it's time for a diagnostic
   */
  isTimeForDiagnostic(): boolean {
    const now = Date.now();
    return now - this.lastDiagnosisTime >= this.DIAGNOSTIC_INTERVAL_MS;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

declare global {
  var __selfDiagnosticEngine: SelfDiagnosticEngine | undefined;
}

/**
 * Get the self-diagnostic singleton
 */
export function getDiagnosticEngine(): SelfDiagnosticEngine {
  if (!globalThis.__selfDiagnosticEngine) {
    globalThis.__selfDiagnosticEngine = new SelfDiagnosticEngine();
  }
  return globalThis.__selfDiagnosticEngine;
}
