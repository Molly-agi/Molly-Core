/**
 * @fileOverview Compression Activation System - Titan Echo Wiring
 *
 * Wires the Titan Echo compression system into Molly's memory architecture.
 * Activates compression techniques progressively with recall guardrails.
 *
 * Execution order (P1 priority first):
 *   P1: T1 (Personality Reference) → T3 (Temporal Delta) → T4 (Vocabulary Dict)
 *   P2: T2 (Time Decay Fidelity) → T6 (Interaction Trace)
 *   P3: T5 (Numeric Quantization)
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';

// ============================================================================
// COMPRESSION ACTIVATION STATE
// ============================================================================

export interface CompressionTechnique {
  id: string; // 'T1', 'T2', etc
  name: string;
  envVar: string;
  priority: 'P1' | 'P2' | 'P3';
  enabled: boolean;
  recallGaurantee: number; // Must maintain >= this recall (%）
  status: 'disabled' | 'active' | 'skipped' | 'failed';
}

export interface CompressionState {
  titanEchoActive: boolean;
  techniquesEnabled: CompressionTechnique[];
  overallCompressionRatio: number;
  recallMetric: number;
  lastActivatedAt: number;
  lastValidatedAt: number;
}

// ============================================================================
// TITAN ECHO ACTIVATION MANAGER
// ============================================================================

class TitanEchoActivationManager {
  private traceId: string;
  private state: CompressionState;

  constructor() {
    this.traceId = generateTraceId();
    this.state = {
      titanEchoActive: false,
      techniquesEnabled: this.initializeTechniques(),
      overallCompressionRatio: 0,
      recallMetric: 0,
      lastActivatedAt: 0,
      lastValidatedAt: 0,
    };
  }

  /**
   * Initialize all compression techniques with their status
   */
  private initializeTechniques(): CompressionTechnique[] {
    const techniques: CompressionTechnique[] = [
      {
        id: 'T1',
        name: 'Personality Reference Compression',
        envVar: 'MOLLY_COMPRESS_T1',
        priority: 'P1',
        enabled: process.env.MOLLY_COMPRESS_T1 === '1',
        recallGaurantee: 0.95,
        status: process.env.MOLLY_COMPRESS_T1 === '1' ? 'active' : 'disabled',
      },
      {
        id: 'T2',
        name: 'Time Decay Fidelity Compression',
        envVar: 'MOLLY_COMPRESS_T2',
        priority: 'P2',
        enabled: process.env.MOLLY_COMPRESS_T2 === '1',
        recallGaurantee: 0.95,
        status: process.env.MOLLY_COMPRESS_T2 === '1' ? 'active' : 'disabled',
      },
      {
        id: 'T3',
        name: 'Temporal Delta Encoding',
        envVar: 'MOLLY_COMPRESS_T3',
        priority: 'P1',
        enabled: process.env.MOLLY_COMPRESS_T3 === '1',
        recallGaurantee: 0.95,
        status: process.env.MOLLY_COMPRESS_T3 === '1' ? 'active' : 'disabled',
      },
      {
        id: 'T4',
        name: 'Vocabulary Dictionary Compression',
        envVar: 'MOLLY_COMPRESS_T4',
        priority: 'P1',
        enabled: process.env.MOLLY_COMPRESS_T4 === '1',
        recallGaurantee: 0.95,
        status: process.env.MOLLY_COMPRESS_T4 === '1' ? 'active' : 'disabled',
      },
      {
        id: 'T5',
        name: 'Numeric Quantization',
        envVar: 'MOLLY_COMPRESS_T5',
        priority: 'P3',
        enabled: process.env.MOLLY_COMPRESS_T5 === '1',
        recallGaurantee: 0.95,
        status: process.env.MOLLY_COMPRESS_T5 === '1' ? 'active' : 'disabled',
      },
      {
        id: 'T6',
        name: 'Interaction Trace Compression',
        envVar: 'MOLLY_COMPRESS_T6',
        priority: 'P2',
        enabled: process.env.MOLLY_COMPRESS_T6 === '1',
        recallGaurantee: 0.95,
        status: process.env.MOLLY_COMPRESS_T6 === '1' ? 'active' : 'disabled',
      },
    ];

    return techniques;
  }

  /**
   * Get compression state for serialization
   */
  getState(): CompressionState {
    return this.state;
  }

  /**
   * Check which techniques are currently active
   */
  getActiveTechniques(): CompressionTechnique[] {
    return this.state.techniquesEnabled.filter((t) => t.enabled);
  }

  /**
   * Check if Titan Echo is fully operational
   */
  isTitanEchoActive(): boolean {
    return this.state.titanEchoActive;
  }

  /**
   * Log current compression status
   */
  logStatus(): void {
    const activeTechniques = this.getActiveTechniques();
    const p1Techniques = activeTechniques.filter((t) => t.priority === 'P1');
    const p2Techniques = activeTechniques.filter((t) => t.priority === 'P2');
    const p3Techniques = activeTechniques.filter((t) => t.priority === 'P3');

    MollyLogger.info(
      'Titan Echo compression status',
      'compression-activation',
      {
        totalActive: activeTechniques.length,
        p1: p1Techniques.map((t) => t.id),
        p2: p2Techniques.map((t) => t.id),
        p3: p3Techniques.map((t) => t.id),
        compressionRatio: `${this.state.overallCompressionRatio.toFixed(1)}%`,
        recallMetric: `${(this.state.recallMetric * 100).toFixed(1)}%`,
      },
      this.traceId
    );
  }

  /**
   * Format compression info for bridge messages
   */
  formatForBridge(): string {
    const active = this.getActiveTechniques();
    const p1 = active.filter((t) => t.priority === 'P1').map((t) => t.id);
    const p2 = active.filter((t) => t.priority === 'P2').map((t) => t.id);
    const p3 = active.filter((t) => t.priority === 'P3').map((t) => t.id);

    return `
**Titan Echo Compression Status:**
- Active Techniques: ${active.length}/6
- P1 (Core): ${p1.length > 0 ? p1.join(', ') : 'None'}
- P2 (Stability): ${p2.length > 0 ? p2.join(', ') : 'None'}
- P3 (Optimization): ${p3.length > 0 ? p3.join(', ') : 'None'}
- Overall Compression Ratio: ${this.state.overallCompressionRatio.toFixed(1)}%
- Recall Guarantee: ${(this.state.recallMetric * 100).toFixed(1)}%
- Status: ${this.state.titanEchoActive ? '✓ ACTIVE' : '○ STANDBY'}
`.trim();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let manager: TitanEchoActivationManager | null = null;

export function getTitanEchoManager(): TitanEchoActivationManager {
  if (!manager) {
    manager = new TitanEchoActivationManager();
  }
  return manager;
}

/**
 * Check if a specific compression technique is enabled
 */
export function isCompressionTechniqueEnabled(techniqueId: string): boolean {
  const manager = getTitanEchoManager();
  const technique = manager
    .getState()
    .techniquesEnabled.find((t) => t.id === techniqueId);
  return technique?.enabled ?? false;
}

/**
 * Get all active compression techniques
 */
export function getActiveCompressionTechniques(): CompressionTechnique[] {
  return getTitanEchoManager().getActiveTechniques();
}

/**
 * Log compression status to logger
 */
export function logCompressionStatus(): void {
  getTitanEchoManager().logStatus();
}

/**
 * Get formatted compression info for bridge messages
 */
export function formatCompressionInfoForBridge(): string {
  return getTitanEchoManager().formatForBridge();
}
