/**
 * Compression Metrics Collector
 * 
 * Real-time tracking of compression performance across memory consolidation cycles.
 * Monitors:
 * - Compression ratios per technique
 * - Fidelity loss tracking
 * - Throughput metrics
 * - Target achievement (75-80% compression)
 */

import { MollyLogger } from '../../logger';
import { CompressionMetrics } from './compression-manager';

export interface CompressionMetricsSnapshot {
  timestamp: Date;
  batchSize: number;
  originalBytes: number;
  compressedBytes: number;
  compressionRatio: number;
  fidelityLoss: number;
  techniquesApplied: string[];
  processingTimeMs: number;
  throughputEngramsPerSecond: number;
}

export interface MetricsAggregation {
  totalBatches: number;
  totalEngramsProcessed: number;
  averageCompressionRatio: number;
  averageFidelityLoss: number;
  peakCompressionRatio: number;
  minCompressionRatio: number;
  targetMet: boolean; // 75-80% target
  snapshots: CompressionMetricsSnapshot[];
  startTime: Date;
  lastUpdate: Date;
}

class CompressionMetricsCollector {
  private static instance: CompressionMetricsCollector;
  private aggregation: MetricsAggregation;
  private readonly maxSnapshots = 1000; // Keep last 1000 snapshots

  private constructor() {
    this.aggregation = {
      totalBatches: 0,
      totalEngramsProcessed: 0,
      averageCompressionRatio: 0,
      averageFidelityLoss: 0,
      peakCompressionRatio: 0,
      minCompressionRatio: 100,
      targetMet: false,
      snapshots: [],
      startTime: new Date(),
      lastUpdate: new Date(),
    };
  }

  static getInstance(): CompressionMetricsCollector {
    if (!CompressionMetricsCollector.instance) {
      CompressionMetricsCollector.instance = new CompressionMetricsCollector();
    }
    return CompressionMetricsCollector.instance;
  }

  /**
   * Record a compression batch result
   */
  recordBatch(
    metrics: CompressionMetrics,
    batchSize: number,
    processingTimeMs: number,
  ): void {
    const compressionRatio = metrics.compressionRatio * 100;
    const fidelityLoss = metrics.fidelityLoss || 0;

    const snapshot: CompressionMetricsSnapshot = {
      timestamp: new Date(),
      batchSize,
      originalBytes: metrics.originalSize,
      compressedBytes: metrics.compressedSize,
      compressionRatio,
      fidelityLoss,
      techniquesApplied: metrics.techniquesUsed || [],
      processingTimeMs,
      throughputEngramsPerSecond: (batchSize / processingTimeMs) * 1000,
    };

    // Update aggregation
    this.aggregation.totalBatches++;
    this.aggregation.totalEngramsProcessed += batchSize;
    this.aggregation.snapshots.push(snapshot);

    // Keep only last N snapshots
    if (this.aggregation.snapshots.length > this.maxSnapshots) {
      this.aggregation.snapshots.shift();
    }

    // Update rolling averages
    this._updateAverages();

    // Update peak/min
    this.aggregation.peakCompressionRatio = Math.max(
      this.aggregation.peakCompressionRatio,
      compressionRatio,
    );
    this.aggregation.minCompressionRatio = Math.min(
      this.aggregation.minCompressionRatio,
      compressionRatio,
    );

    // Check target (75-80%)
    this.aggregation.targetMet =
      compressionRatio >= 75 && compressionRatio <= 80;

    this.aggregation.lastUpdate = new Date();

    // Log to system logger
    MollyLogger.info('Compression batch recorded', 'metrics-collector', {
      compressionRatio: compressionRatio.toFixed(2),
      batchSize,
      targetMet: this.aggregation.targetMet,
      throughput: snapshot.throughputEngramsPerSecond.toFixed(0),
    });
  }

  /**
   * Get current aggregation
   */
  getAggregation(): MetricsAggregation {
    return { ...this.aggregation };
  }

  /**
   * Get recent snapshots (last N)
   */
  getRecentSnapshots(count: number = 10): CompressionMetricsSnapshot[] {
    const start = Math.max(0, this.aggregation.snapshots.length - count);
    return this.aggregation.snapshots.slice(start);
  }

  /**
   * Get summary for reporting
   */
  getSummary(): string {
    const agg = this.aggregation;
    const uptime = new Date().getTime() - agg.startTime.getTime();
    const uptimeMinutes = (uptime / 1000 / 60).toFixed(1);

    return `
╔════════════════════════════════════════════════════════════╗
║           COMPRESSION METRICS SUMMARY                      ║
╠════════════════════════════════════════════════════════════╣
║  Uptime: ${uptimeMinutes} minutes
║  Total Batches: ${agg.totalBatches}
║  Total Engramsprocessed: ${agg.totalEngramsProcessed.toLocaleString()}
║
║  Compression Ratio (avg): ${agg.averageCompressionRatio.toFixed(2)}%
║  Peak Compression: ${agg.peakCompressionRatio.toFixed(2)}%
║  Min Compression: ${agg.minCompressionRatio.toFixed(2)}%
║
║  Average Fidelity Loss: ${agg.averageFidelityLoss.toFixed(4)}
║  Target (75-80%): ${agg.targetMet ? '✅ MET' : '⏳ NOT YET'}
║
║  Last Update: ${agg.lastUpdate.toISOString()}
╚════════════════════════════════════════════════════════════╝
    `;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.aggregation = {
      totalBatches: 0,
      totalEngramsProcessed: 0,
      averageCompressionRatio: 0,
      averageFidelityLoss: 0,
      peakCompressionRatio: 0,
      minCompressionRatio: 100,
      targetMet: false,
      snapshots: [],
      startTime: new Date(),
      lastUpdate: new Date(),
    };
    MollyLogger.info('Compression metrics reset', 'metrics-collector', {});
  }

  // ─────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────

  private _updateAverages(): void {
    if (this.aggregation.snapshots.length === 0) return;

    const snapshots = this.aggregation.snapshots;
    const sum = snapshots.reduce((acc, s) => acc + s.compressionRatio, 0);
    const fidelitySum = snapshots.reduce((acc, s) => acc + s.fidelityLoss, 0);

    this.aggregation.averageCompressionRatio = sum / snapshots.length;
    this.aggregation.averageFidelityLoss = fidelitySum / snapshots.length;
  }
}

export const getMetricsCollector = (): CompressionMetricsCollector => {
  return CompressionMetricsCollector.getInstance();
};

export default CompressionMetricsCollector;
