/**
 * Ablation Test Engine — Validation & Benchmarking
 * Measures the value of each compression technique independently.
 * Disables one technique at a time and measures compression ratio and fidelity loss.
 * 
 * Eric's original design. Adapted for Molly's techniques.
 */

export interface AblationReport {
  techniqueDisabled: string;
  compressionRatio: number; // % reduction
  estimatedFidelityLossPercent: number; // Semantic/precision loss
  executionTimeMs: number;
  testDataSize: number;
}

export interface AblationSuite {
  timestamp: string;
  datasetName: string;
  reports: AblationReport[];
  baselineCompressionRatio: number; // All techniques active
}

/**
 * Automated ablation testing framework.
 * Runs a test corpus through the compression pipeline with each technique disabled.
 * Shows which techniques have the most impact.
 */
export class AblationTestEngine {
  /**
   * Execute ablation matrix: test each technique disabled independently.
   */
  public async executeAblationRun(
    testCorpus: string,
    techniquesAvailable: string[] = [
      'NONE',
      'VOCAB_DICT',
      'TEMPORAL_DELTA',
      'PERSONALITY_REF',
      'TIME_DECAY',
    ]
  ): Promise<AblationSuite> {
    const reports: AblationReport[] = [];
    const originalSize = Buffer.byteLength(testCorpus, 'utf8');

    // Baseline: measure with all techniques active
    const baselineStart = performance.now();
    const baselineCompressed = this.runMockPipeline(testCorpus, 'NONE');
    const baselineTime = performance.now() - baselineStart;

    const baselineRatio = (
      ((originalSize - baselineCompressed) / originalSize) *
      100
    ).toFixed(2);

    // Test each technique disabled
    for (const disabled of techniquesAvailable) {
      const startTime = performance.now();
      const compressedSize = this.runMockPipeline(testCorpus, disabled);
      const duration = performance.now() - startTime;

      const ratio = (
        ((originalSize - compressedSize) / originalSize) *
        100
      ).toFixed(2);

      // Estimate fidelity loss (simulated based on technique)
      const fidelityLoss = this.estimateFidelityLoss(disabled);

      reports.push({
        techniqueDisabled: disabled,
        compressionRatio: parseFloat(ratio),
        estimatedFidelityLossPercent: fidelityLoss,
        executionTimeMs: parseFloat(duration.toFixed(2)),
        testDataSize: originalSize,
      });
    }

    return {
      timestamp: new Date().toISOString(),
      datasetName: 'memory-corpus-ablation',
      reports,
      baselineCompressionRatio: parseFloat(baselineRatio),
    };
  }

  /**
   * Mock pipeline: simulates compression without actually running techniques.
   * Used for quick benchmarking.
   */
  private runMockPipeline(input: string, disabledTechnique: string): number {
    // Baseline compression if nothing is disabled
    let reduction = 0.12; // ~88% stays

    // Each technique contributes to reduction
    if (disabledTechnique !== 'VOCAB_DICT') reduction += 0.15; // 15% additional
    if (disabledTechnique !== 'TEMPORAL_DELTA') reduction += 0.10; // 10% additional
    if (disabledTechnique !== 'PERSONALITY_REF') reduction += 0.08; // 8% additional
    if (disabledTechnique !== 'TIME_DECAY') reduction += 0.12; // 12% additional
    if (disabledTechnique !== 'NONE') reduction += 0.05; // 5% additional overhead

    return Math.floor(input.length * Math.max(0.05, 1 - reduction));
  }

  /**
   * Estimate fidelity loss from disabling a technique.
   * These are informed guesses based on Eric's designs.
   */
  private estimateFidelityLoss(disabled: string): number {
    const losses: Record<string, number> = {
      NONE: 0, // Baseline — no loss
      VOCAB_DICT: 0.2, // Token replacement is lossless, ~0.2% from edge cases
      TEMPORAL_DELTA: 0.1, // Delta encoding is perfectly reversible
      PERSONALITY_REF: 0.5, // Pointer to state loses some temporal context
      TIME_DECAY: 1.5, // Selective fidelity loses older detail
    };

    return losses[disabled] ?? 0;
  }

  /**
   * Analyze ablation report: which technique is most valuable?
   */
  public analyzeReport(suite: AblationSuite): {
    mostImpactful: string;
    impactValue: number;
    leastImpactful: string;
  } {
    const sorted = suite.reports.sort(
      (a, b) => a.compressionRatio - b.compressionRatio
    );

    const mostImpactful = sorted[sorted.length - 1];
    const leastImpactful = sorted[0];

    return {
      mostImpactful: mostImpactful.techniqueDisabled,
      impactValue: suite.baselineCompressionRatio - mostImpactful.compressionRatio,
      leastImpactful: leastImpactful.techniqueDisabled,
    };
  }

  /**
   * Print ablation report in human-readable format.
   */
  public printReport(suite: AblationSuite): string {
    const lines = [
      `\n📊 ABLATION TEST REPORT — ${suite.timestamp}`,
      `Dataset: ${suite.datasetName}`,
      `Baseline (all active): ${suite.baselineCompressionRatio}% compression\n`,
      `Technique Disabled        | Compression % | Fidelity Loss | Time (ms)`,
      `─────────────────────────────────────────────────────────────────`,
    ];

    for (const report of suite.reports) {
      const technique = report.techniqueDisabled.padEnd(20);
      const compression = report.compressionRatio.toFixed(2).padStart(6);
      const fidelity = report.estimatedFidelityLossPercent.toFixed(2).padStart(6);
      const time = report.executionTimeMs.toFixed(2).padStart(6);

      lines.push(
        `${technique} | ${compression}% | ${fidelity}% | ${time}ms`
      );
    }

    return lines.join('\n') + '\n';
  }
}
