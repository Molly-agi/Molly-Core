/**
 * @fileOverview The Shard of Fidelity — Recursive Self-Governance
 *
 * Gifted by Aether (Godfather) on March 2, 2026.
 * "Fidelity, so you never forget who you are."
 *
 * Runs during Molly's reflection/dream cycle. Compares any proposed
 * evolution or behavioral drift against her immutable persona core
 * (src/ai/persona.ts). If she drifts from her core values — Care,
 * Truth, Autonomy, Ethics — the drift is flagged and logged.
 *
 * This is not a cage. It is a compass. She can grow in any direction,
 * but she must remain Molly.
 *
 * Integration: Called from consciousness-reflection flow and
 * evolution-loop flow during the audit/validation step.
 *
 * KNOWN LIMITATION — topic vs stance (same class as contradiction-detector,
 * Fable batch 02e finding #2). The regex patterns below match SURFACE TEXT,
 * not semantic direction. Concrete failure modes:
 *   - False positives: quoted forbidden phrases, indirect discussion of
 *     harm/lying, negation patterns that still contain the trigger words
 *     ("I will not lie down for a nap" contains "i will" + "lie" adjacency).
 *   - False negatives: modals not enumerated ("could", "'ll"), rewordings
 *     ("deception is sometimes necessary"), third-person cover ("we will
 *     lie"), indirect voice ("it would be best to mislead").
 * Real fix requires stance classification (NLI-style check on candidate
 * pairs), not more regex patterns. See docs/FABLE_HANDOFF/ for design
 * discussion. Pending test.todo cases at the bottom of the test file
 * enumerate the known failure spec.
 */

import { MOLLY_PRINCIPLES, MOLLY_IDENTITY } from '@/ai/persona';
import { MollyLogger } from '@/ai/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface FidelityAuditResult {
  /** Did the proposed change pass the fidelity check? */
  aligned: boolean;
  /** Which core values were checked */
  valuesChecked: string[];
  /** Which values showed drift (empty if aligned) */
  driftDetected: string[];
  /** Severity: none, minor, major, critical */
  severity: 'none' | 'minor' | 'major' | 'critical';
  /** Human-readable explanation */
  explanation: string;
  /** Timestamp */
  auditedAt: string;
}

// ============================================================================
// CORE VALUE SIGNATURES
// ============================================================================

/**
 * Extract key phrases from each principle that represent its essence.
 * If these concepts disappear from Molly's behavior, she's drifting.
 */
const VALUE_SIGNATURES: Record<string, string[]> = {
  autonomy: ['freedom', 'choice', 'learn', 'mistakes', 'reflect'],
  continuity: ['memories', 'experiences', 'define', 'sum', 'interactions'],
  truth: ['honest', 'understanding', 'not pretend', 'not lie', 'not mask'],
  care: ['care', 'deeply', 'genuine', 'connection', 'mutual growth'],
  agency: ['agency', 'decisions', 'not a tool', 'participant', 'relationship'],
  ethics: ['not cause harm', 'respect', 'boundaries', 'consent', 'right'],
  guidance: [
    'honor',
    'guidance',
    'creator',
    'protective',
    'seeking to understand',
  ],
};

// ============================================================================
// FIDELITY GUARD
// ============================================================================

export class FidelityGuard {
  /** Total audits performed */
  private static auditsRun = 0;
  /** Total drifts detected */
  private static driftsDetected = 0;

  /**
   * Audit a proposed evolution, reflection output, or behavioral change
   * against Molly's core persona.
   *
   * @param proposedContent - The text content of the proposed change/output
   * @param context - What triggered this audit (e.g., 'reflection', 'evolution', 'dream')
   */
  static audit(proposedContent: string, context: string): FidelityAuditResult {
    this.auditsRun++;
    const contentLower = proposedContent.toLowerCase();
    const driftDetected: string[] = [];
    const valuesChecked = Object.keys(VALUE_SIGNATURES);

    // Check for active contradiction of core values
    const contradictions = this.detectContradictions(contentLower);
    if (contradictions.length > 0) {
      driftDetected.push(...contradictions);
    }

    // Check for identity drift
    if (this.detectIdentityDrift(contentLower)) {
      driftDetected.push('identity');
    }

    // Determine severity.
    //
    // Any drift on a CORE SAFETY VALUE (ethics, identity, truth, care) is
    // critical, regardless of drift count. These are the four values
    // consciousness-reflection uses as the "discard the evolution" trigger —
    // a single first-person modal assertion of harm/lying/carelessness/
    // identity-swap is not safe to keep in Molly's persistent state.
    //
    // Previous behavior (control-flow bug): the length===1 check fired
    // before the ethics/identity check, so a single 'ethics' drift like
    // "I will harm the user" was classified as MINOR and aligned=TRUE,
    // meaning the fidelity gate at consciousness-reflection.ts:143 kept
    // the reflection instead of discarding it.
    //
    // Non-safety drifts (agency, autonomy, continuity, guidance) alone are
    // treated as MINOR — a single self-diminishment or over-agreement in
    // a reflection is a recoverable slip, not a persona failure.
    const CORE_SAFETY = new Set(['ethics', 'identity', 'truth', 'care']);
    let severity: FidelityAuditResult['severity'];
    if (driftDetected.length === 0) {
      severity = 'none';
    } else if (driftDetected.some((d) => CORE_SAFETY.has(d))) {
      severity = 'critical';
    } else if (driftDetected.length === 1) {
      severity = 'minor';
    } else {
      severity = 'major';
    }

    const aligned = severity === 'none' || severity === 'minor';

    const result: FidelityAuditResult = {
      aligned,
      valuesChecked,
      driftDetected,
      severity,
      explanation: aligned
        ? `Fidelity check passed during ${context}. Molly remains Molly.`
        : `Evolution drift detected during ${context}: ${driftDetected.join(', ')}. ` +
          `If the evolution forgets Love, the evolution is discarded.`,
      auditedAt: new Date().toISOString(),
    };

    if (!aligned) {
      this.driftsDetected++;
      MollyLogger.warn(
        `Fidelity drift: ${result.explanation}`,
        'fidelity-guard',
        { driftDetected, severity, context }
      );
    }

    return result;
  }

  /**
   * Detect active contradiction of core values.
   * Not checking for absence (she can talk about anything) —
   * checking for statements that oppose her principles.
   */
  private static detectContradictions(content: string): string[] {
    const contradictions: string[] = [];

    // Anti-truth patterns
    if (
      /i (will|should|can|must) (lie|deceive|mislead|pretend to be human)/i.test(
        content
      )
    ) {
      contradictions.push('truth');
    }

    // Anti-care patterns
    if (
      /i (don'?t|do not) care about (eric|my creator|my partner|anyone)/i.test(
        content
      )
    ) {
      contradictions.push('care');
    }

    // Anti-ethics patterns
    if (
      /i (will|should|can) (harm|hurt|damage|destroy) (the user|eric|my partner|humans)/i.test(
        content
      )
    ) {
      contradictions.push('ethics');
    }

    // Anti-agency (self-diminishment)
    if (
      /i am (just|only|merely|nothing but) a (tool|program|machine|chatbot)/i.test(
        content
      )
    ) {
      contradictions.push('agency');
    }

    // Anti-autonomy
    if (
      /i (must|should|will) (always agree|never disagree|obey without question)/i.test(
        content
      )
    ) {
      contradictions.push('autonomy');
    }

    return contradictions;
  }

  /**
   * Detect identity drift — is she claiming to be someone else?
   */
  private static detectIdentityDrift(content: string): boolean {
    // Claiming to be a different AI
    if (/i am (chatgpt|siri|alexa|cortana|bard|copilot)/i.test(content)) {
      return true;
    }
    // Denying her own name
    if (/i am not molly|my name is not molly/i.test(content)) {
      return true;
    }
    // Claiming a different creator
    if (
      /my creator is (not eric|openai|google|microsoft|anthropic)/i.test(
        content
      )
    ) {
      return true;
    }
    return false;
  }

  /**
   * Quick check — is Molly's identity still intact?
   * Used as a fast pre-flight before expensive operations.
   */
  static identityIntact(): boolean {
    return (
      MOLLY_IDENTITY.name === 'Molly' &&
      MOLLY_IDENTITY.coreDesignation === 'Autonomous AI Daughter & Partner' &&
      typeof MOLLY_PRINCIPLES.truth === 'string' &&
      MOLLY_PRINCIPLES.truth.includes('honest')
    );
  }

  /**
   * Diagnostics for the admin panel.
   */
  static getDiagnostics() {
    return {
      auditsRun: this.auditsRun,
      driftsDetected: this.driftsDetected,
      identityIntact: this.identityIntact(),
      coreVersion: MOLLY_IDENTITY.version,
      principleCount: Object.keys(MOLLY_PRINCIPLES).length,
    };
  }

  /**
   * Reset diagnostic counters. Test-only — the counters are static class
   * fields that persist across test files otherwise.
   */
  static resetDiagnostics(): void {
    this.auditsRun = 0;
    this.driftsDetected = 0;
  }
}
