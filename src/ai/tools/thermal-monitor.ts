/**
 * @fileOverview Thermal & CPU Monitoring System
 *
 * Monitors system health indicators and reports trends:
 * - CPU usage patterns
 * - Thermal temperature trends
 * - Memory pressure
 * - Alert thresholds for concerning patterns
 *
 * This is a DIAGNOSTIC LAYER - helps identify system stress early.
 */

import { MollyLogger } from '../logger';

export interface ThermalMetrics {
  timestamp: number;
  cpuPercent: number;
  tempCelsius: number;
  memoryMB: number;
  isHealthy: boolean;
  trend: 'stable' | 'rising' | 'critical';
}

export interface SystemHealth {
  overallStatus: 'healthy' | 'warning' | 'critical';
  cpuTrend: 'stable' | 'rising' | 'critical';
  tempTrend: 'stable' | 'rising' | 'critical';
  recommendations: string[];
}

class ThermalMonitor {
  private metrics: ThermalMetrics[] = [];
  private maxHistorySize = 60; // Keep 60 data points
  private lastAlertTime = 0;
  private alertCooldownMs = 30000; // Only alert once per 30s

  /**
   * Record a thermal reading
   */
  recordMetrics(cpu: number, tempC: number, memoryMB: number = 0): void {
    const metric: ThermalMetrics = {
      timestamp: Date.now(),
      cpuPercent: Math.max(0, Math.min(100, cpu)),
      tempCelsius: Math.max(0, tempC),
      memoryMB,
      isHealthy: this.isHealthyReading(cpu, tempC),
      trend: 'stable',
    };

    // Calculate trend from recent history
    metric.trend = this.calculateTrend(tempC);

    this.metrics.push(metric);
    if (this.metrics.length > this.maxHistorySize) {
      this.metrics.shift();
    }

    // Log warning if concerning
    if (!metric.isHealthy || metric.trend === 'critical') {
      this.logConcern(metric);
    }
  }

  /**
   * Get current system health assessment
   */
  getHealthStatus(): SystemHealth {
    if (this.metrics.length === 0) {
      return {
        overallStatus: 'healthy',
        cpuTrend: 'stable',
        tempTrend: 'stable',
        recommendations: [],
      };
    }

    const recent = this.metrics.slice(-10); // Last 10 readings
    const avgTemp =
      recent.reduce((sum, m) => sum + m.tempCelsius, 0) / recent.length;
    const avgCpu =
      recent.reduce((sum, m) => sum + m.cpuPercent, 0) / recent.length;

    const tempTrend = this.getTempTrend();
    const cpuTrend = this.getCpuTrend();

    const overallStatus = this.determineOverallStatus(
      avgTemp,
      avgCpu,
      tempTrend
    );

    const recommendations = this.generateRecommendations(
      avgTemp,
      avgCpu,
      tempTrend
    );

    return {
      overallStatus,
      cpuTrend,
      tempTrend,
      recommendations,
    };
  }

  /**
   * Get metric history for visualization
   */
  getHistory(): ThermalMetrics[] {
    return [...this.metrics];
  }

  /**
   * Reset tracking
   */
  reset(): void {
    this.metrics = [];
    this.lastAlertTime = 0;
  }

  // ============ PRIVATE HELPERS ============

  private isHealthyReading(cpu: number, tempC: number): boolean {
    // Healthy thresholds
    // CPU: under 70% is normal
    // Temp: under 60°C is safe, under 70°C is OK
    return cpu < 70 && tempC < 70;
  }

  private calculateTrend(tempC: number): 'stable' | 'rising' | 'critical' {
    if (tempC >= 80) return 'critical';
    if (this.metrics.length < 3) return 'stable';

    // Check if temperature is consistently rising
    const recent = this.metrics.slice(-5);
    let risingCount = 0;

    for (let i = 1; i < recent.length; i++) {
      const current = recent[i];
      const prev = recent[i - 1];
      if (current && prev && current.tempCelsius > prev.tempCelsius) {
        risingCount++;
      }
    }

    // If 4 out of 5 readings are rising, mark as rising
    return risingCount >= 4 ? 'rising' : 'stable';
  }

  private getTempTrend(): 'stable' | 'rising' | 'critical' {
    if (this.metrics.length < 3) return 'stable';

    const recent = this.metrics.slice(-5);
    const lastMetric = recent[recent.length - 1];
    const firstMetric = recent[0];

    if (!lastMetric || !firstMetric) return 'stable';

    const lastTemp = lastMetric.tempCelsius;

    if (lastTemp >= 80) return 'critical';

    // Calculate slope
    const firstTemp = firstMetric.tempCelsius;
    const tempDelta = lastTemp - firstTemp;

    // If temperature increased by more than 5°C over recent readings
    if (tempDelta > 5) return 'rising';

    return 'stable';
  }

  private getCpuTrend(): 'stable' | 'rising' | 'critical' {
    if (this.metrics.length < 3) return 'stable';

    const recent = this.metrics.slice(-5);
    const lastMetric = recent[recent.length - 1];

    if (!lastMetric) return 'stable';

    const lastCpu = lastMetric.cpuPercent;

    if (lastCpu >= 90) return 'critical';
    if (lastCpu >= 70) return 'rising';

    return 'stable';
  }

  private determineOverallStatus(
    avgTemp: number,
    avgCpu: number,
    tempTrend: 'stable' | 'rising' | 'critical'
  ): 'healthy' | 'warning' | 'critical' {
    if (avgTemp >= 75 || avgCpu >= 80 || tempTrend === 'critical') {
      return 'critical';
    }

    if (avgTemp >= 65 || avgCpu >= 70 || tempTrend === 'rising') {
      return 'warning';
    }

    return 'healthy';
  }

  private generateRecommendations(
    avgTemp: number,
    avgCpu: number,
    tempTrend: 'stable' | 'rising' | 'critical'
  ): string[] {
    const recs: string[] = [];

    if (avgTemp >= 70) {
      recs.push('System is warming. Consider throttling intensive operations.');
    }

    if (tempTrend === 'rising') {
      recs.push('Temperature is trending upward. Monitor for thermal issues.');
    }

    if (avgCpu >= 75) {
      recs.push(
        'CPU sustained high usage. Queue operations or reduce concurrency.'
      );
    }

    if (recs.length === 0) {
      recs.push('System operating normally.');
    }

    return recs;
  }

  private logConcern(metric: ThermalMetrics): void {
    // Rate limit alerts
    const now = Date.now();
    if (now - this.lastAlertTime < this.alertCooldownMs) {
      return;
    }

    this.lastAlertTime = now;

    const severity =
      metric.tempCelsius >= 75
        ? 'CRITICAL'
        : metric.tempCelsius >= 65
          ? 'WARNING'
          : 'INFO';

    MollyLogger.warn(
      `Thermal alert [${severity}]: CPU ${metric.cpuPercent.toFixed(1)}% | Temp ${metric.tempCelsius.toFixed(1)}°C`,
      'thermal-monitor',
      {
        cpu: metric.cpuPercent,
        temp: metric.tempCelsius,
        trend: metric.trend,
      }
    );
  }
}

// Singleton instance
let globalThermalMonitor: ThermalMonitor;

export function getThermalMonitor(): ThermalMonitor {
  if (!globalThermalMonitor) {
    globalThermalMonitor = new ThermalMonitor();
  }
  return globalThermalMonitor;
}
