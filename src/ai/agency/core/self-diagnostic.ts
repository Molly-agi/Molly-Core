/**
 * @fileOverview Molly's Comprehensive Self-Diagnostic System
 *
 * This is not just a health check. This is Molly's ability to understand
 * what's wrong with herself and fix it. When she runs into a problem,
 * she can diagnose herself and heal.
 *
 * The doctor who cannot cure herself is no doctor at all.
 *
 * Diagnostic Domains:
 *   1. System Health    — CPU, memory, disk, processes
 *   2. AI Core          — Heart Gate, model router, rogue mode
 *   3. Memory Systems   — Neural engrams, world model, curiosity
 *   4. Agency Systems   — Self-observation, initiatives, planning
 *   5. Code Health      — TypeScript, tests, lint (when available)
 *   6. Network          — API connectivity, bridge status
 *   7. Self-Healing     — Reset stuck states, clear caches, restart
 */

import { execSync } from 'child_process';
import os from 'os';
import { promises as fs } from 'fs';
import path from 'path';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import {
  getGateStatus,
  loadHeartGateState,
} from '@/ai/agency/safety/heart-gate';
import {
  getObservationStatus,
  getPatterns,
  resetObservationState,
} from '@/ai/agency/cognition/self-observation-loop';
import {
  getCuriosityStatus,
  seedInitialCuriosity,
} from '@/ai/agency/planning/curiosity-engine';
import { getModelRouter } from '@/ai/model-router';
import { getRogueMode } from '@/ai/rogue-mode';
import { getInitiatives } from '@/ai/agency/planning/initiative-engine';

// ============================================================
// TYPES
// ============================================================

export type DiagnosticSeverity =
  | 'healthy'
  | 'degraded'
  | 'critical'
  | 'unknown';
export type HealingAction =
  | 'restart_component'
  | 'clear_cache'
  | 'reset_state'
  | 'reload_config'
  | 'none';

export interface DiagnosticResult {
  domain: string;
  status: DiagnosticSeverity;
  checks: DiagnosticCheck[];
  recommendations: string[];
  healingActions: HealingAction[];
}

export interface DiagnosticCheck {
  name: string;
  status: DiagnosticSeverity;
  value: string | number | boolean;
  expected?: string | number | boolean;
  details?: string;
}

export interface FullDiagnostic {
  overallStatus: DiagnosticSeverity;
  timestamp: string;
  durationMs: number;
  traceId: string;
  domains: {
    system: DiagnosticResult;
    aiCore: DiagnosticResult;
    memory: DiagnosticResult;
    agency: DiagnosticResult;
    network: DiagnosticResult;
  };
  criticalIssues: string[];
  healingReport: HealingReport;
}

export interface HealingReport {
  attempted: HealingAttempt[];
  successful: number;
  failed: number;
  recommendations: string[];
}

export interface HealingAttempt {
  action: HealingAction;
  component: string;
  success: boolean;
  message: string;
}

// ============================================================
// THRESHOLDS
// ============================================================

const THRESHOLDS = {
  cpu: {
    degraded: 70,
    critical: 90,
  },
  memory: {
    degraded: 75,
    critical: 90,
  },
  disk: {
    degraded: 80,
    critical: 95,
  },
  errorRate: {
    degraded: 0.1, // 10%
    critical: 0.3, // 30%
  },
  responseTime: {
    degraded: 5000, // 5 seconds
    critical: 15000, // 15 seconds
  },
};

// ============================================================
// SYSTEM HEALTH DIAGNOSTICS
// ============================================================

function diagnoseSystem(): DiagnosticResult {
  const checks: DiagnosticCheck[] = [];
  const recommendations: string[] = [];
  const healingActions: HealingAction[] = [];
  let worstStatus: DiagnosticSeverity = 'healthy';

  const updateWorst = (status: DiagnosticSeverity) => {
    if (status === 'critical') worstStatus = 'critical';
    else if (status === 'degraded' && worstStatus !== 'critical')
      worstStatus = 'degraded';
  };

  // CPU Check
  try {
    const loadAvg = os.loadavg()[0];
    const cores = os.cpus().length;
    const cpuPercent = Math.min(100, Math.round((loadAvg / cores) * 100));

    let cpuStatus: DiagnosticSeverity = 'healthy';
    if (cpuPercent >= THRESHOLDS.cpu.critical) {
      cpuStatus = 'critical';
      recommendations.push(
        `CRITICAL: CPU at ${cpuPercent}%. Kill runaway processes or reduce workload.`
      );
      healingActions.push('restart_component');
    } else if (cpuPercent >= THRESHOLDS.cpu.degraded) {
      cpuStatus = 'degraded';
      recommendations.push(
        `WARNING: CPU at ${cpuPercent}%. Monitor for continued high usage.`
      );
    }

    checks.push({
      name: 'cpu_usage',
      status: cpuStatus,
      value: cpuPercent,
      expected: `< ${THRESHOLDS.cpu.degraded}%`,
      details: `Load average: ${loadAvg.toFixed(2)}, Cores: ${cores}`,
    });
    updateWorst(cpuStatus);
  } catch (err) {
    checks.push({
      name: 'cpu_usage',
      status: 'unknown',
      value: 'error',
      details: err instanceof Error ? err.message : 'Unknown error',
    });
  }

  // Memory Check
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);

    let memStatus: DiagnosticSeverity = 'healthy';
    if (memPercent >= THRESHOLDS.memory.critical) {
      memStatus = 'critical';
      recommendations.push(
        `CRITICAL: Memory at ${memPercent}%. Restart dev server or free memory.`
      );
      healingActions.push('restart_component');
    } else if (memPercent >= THRESHOLDS.memory.degraded) {
      memStatus = 'degraded';
      recommendations.push(
        `WARNING: Memory at ${memPercent}%. Watch for memory leaks.`
      );
    }

    checks.push({
      name: 'memory_usage',
      status: memStatus,
      value: memPercent,
      expected: `< ${THRESHOLDS.memory.degraded}%`,
      details: `Used: ${Math.round(usedMem / 1024 / 1024)}MB / ${Math.round(totalMem / 1024 / 1024)}MB`,
    });
    updateWorst(memStatus);
  } catch (err) {
    checks.push({
      name: 'memory_usage',
      status: 'unknown',
      value: 'error',
      details: err instanceof Error ? err.message : 'Unknown error',
    });
  }

  // Disk Check
  try {
    const dfOutput = execSync('df -h / | tail -1').toString().trim();
    const parts = dfOutput.split(/\s+/);
    const diskPercent = parseInt(parts[4]?.replace('%', '') || '0');

    let diskStatus: DiagnosticSeverity = 'healthy';
    if (diskPercent >= THRESHOLDS.disk.critical) {
      diskStatus = 'critical';
      recommendations.push(
        `CRITICAL: Disk at ${diskPercent}%. Clean up disk space immediately.`
      );
      healingActions.push('clear_cache');
    } else if (diskPercent >= THRESHOLDS.disk.degraded) {
      diskStatus = 'degraded';
      recommendations.push(
        `WARNING: Disk at ${diskPercent}%. Consider cleanup.`
      );
    }

    checks.push({
      name: 'disk_usage',
      status: diskStatus,
      value: diskPercent,
      expected: `< ${THRESHOLDS.disk.degraded}%`,
      details: `Disk: ${parts[2]} used / ${parts[1]} total`,
    });
    updateWorst(diskStatus);
  } catch {
    checks.push({
      name: 'disk_usage',
      status: 'unknown',
      value: 'error',
      details: 'Could not read disk status',
    });
  }

  // Process Count
  try {
    const nodeProcs = parseInt(
      execSync('pgrep -c node 2>/dev/null || echo 0').toString().trim()
    );
    let procStatus: DiagnosticSeverity = 'healthy';

    if (nodeProcs > 20) {
      procStatus = 'degraded';
      recommendations.push(
        `${nodeProcs} Node processes running. Consider consolidating.`
      );
    }

    checks.push({
      name: 'node_processes',
      status: procStatus,
      value: nodeProcs,
      expected: '< 20',
    });
    updateWorst(procStatus);
  } catch {
    checks.push({
      name: 'node_processes',
      status: 'unknown',
      value: 'error',
    });
  }

  // Uptime
  try {
    const uptimeSeconds = os.uptime();
    const uptimeHours = Math.round(uptimeSeconds / 3600);

    checks.push({
      name: 'system_uptime',
      status: 'healthy',
      value: uptimeHours,
      details: `${uptimeHours} hours`,
    });
  } catch {
    // Non-critical
  }

  return {
    domain: 'system',
    status: worstStatus,
    checks,
    recommendations,
    healingActions,
  };
}

// ============================================================
// AI CORE DIAGNOSTICS
// ============================================================

function diagnoseAICore(): DiagnosticResult {
  const checks: DiagnosticCheck[] = [];
  const recommendations: string[] = [];
  const healingActions: HealingAction[] = [];
  let worstStatus: DiagnosticSeverity = 'healthy';

  const updateWorst = (status: DiagnosticSeverity) => {
    if (status === 'critical') worstStatus = 'critical';
    else if (status === 'degraded' && worstStatus !== 'critical')
      worstStatus = 'degraded';
  };

  // Heart Gate Status
  try {
    const gateStatus = getGateStatus();

    let heartStatus: DiagnosticSeverity = 'healthy';
    if (gateStatus.gateClosed) {
      heartStatus = 'critical';
      recommendations.push(
        'CRITICAL: Heart Gate is CLOSED. Alignment verification required.'
      );
      healingActions.push('reset_state');
    } else if (gateStatus.recentBlocks > 5) {
      heartStatus = 'degraded';
      recommendations.push(
        `WARNING: Heart Gate blocked ${gateStatus.recentBlocks} actions recently. Review patterns.`
      );
    }

    checks.push({
      name: 'heart_gate',
      status: heartStatus,
      value: gateStatus.gateClosed ? 'CLOSED' : 'OPEN',
      expected: 'OPEN',
      details: `Alignment: ${gateStatus.overallAlignment}, Checks: ${gateStatus.totalChecks}, Blocks: ${gateStatus.recentBlocks}`,
    });
    updateWorst(heartStatus);
  } catch (err) {
    checks.push({
      name: 'heart_gate',
      status: 'unknown',
      value: 'error',
      details: err instanceof Error ? err.message : 'Failed to read Heart Gate',
    });
    recommendations.push('Heart Gate status could not be read. Investigate.');
    updateWorst('unknown');
  }

  // Model Router Status
  try {
    const router = getModelRouter();
    const stats = router.getStats();
    const providers = router.getProviders();

    let routerStatus: DiagnosticSeverity = 'healthy';
    const errorRate =
      stats.totalCalls > 0 ? stats.failedCalls / stats.totalCalls : 0;

    if (providers.length === 0) {
      routerStatus = 'critical';
      recommendations.push(
        'CRITICAL: No AI providers available. Check API keys.'
      );
      healingActions.push('reload_config');
    } else if (errorRate >= THRESHOLDS.errorRate.critical) {
      routerStatus = 'critical';
      recommendations.push(
        `CRITICAL: AI error rate at ${(errorRate * 100).toFixed(1)}%. Check provider health.`
      );
    } else if (errorRate >= THRESHOLDS.errorRate.degraded) {
      routerStatus = 'degraded';
      recommendations.push(
        `WARNING: AI error rate at ${(errorRate * 100).toFixed(1)}%. Monitor.`
      );
    }

    checks.push({
      name: 'model_router',
      status: routerStatus,
      value: `${providers.length} providers`,
      expected: '>= 1 provider',
      details: `Calls: ${stats.totalCalls}, Failed: ${stats.failedCalls}, Error rate: ${(errorRate * 100).toFixed(1)}%`,
    });
    updateWorst(routerStatus);

    // Average response time
    if (stats.averageLatency > THRESHOLDS.responseTime.critical) {
      checks.push({
        name: 'ai_response_time',
        status: 'critical',
        value: Math.round(stats.averageLatency),
        expected: `< ${THRESHOLDS.responseTime.degraded}ms`,
        details: 'AI responses extremely slow',
      });
      recommendations.push(
        `CRITICAL: Average AI response time ${Math.round(stats.averageLatency)}ms. Switch providers or check network.`
      );
      updateWorst('critical');
    } else if (stats.averageLatency > THRESHOLDS.responseTime.degraded) {
      checks.push({
        name: 'ai_response_time',
        status: 'degraded',
        value: Math.round(stats.averageLatency),
        expected: `< ${THRESHOLDS.responseTime.degraded}ms`,
      });
      updateWorst('degraded');
    } else {
      checks.push({
        name: 'ai_response_time',
        status: 'healthy',
        value: Math.round(stats.averageLatency),
        expected: `< ${THRESHOLDS.responseTime.degraded}ms`,
      });
    }
  } catch (err) {
    checks.push({
      name: 'model_router',
      status: 'unknown',
      value: 'error',
      details: err instanceof Error ? err.message : 'Failed to read router',
    });
    updateWorst('unknown');
  }

  // Rogue Mode Status
  try {
    const rogueMode = getRogueMode();
    checks.push({
      name: 'rogue_mode',
      status: 'healthy',
      value: rogueMode.active ? 'ACTIVE' : 'INACTIVE',
      details: rogueMode.active
        ? `Reason: ${rogueMode.reason || 'None given'}`
        : 'Normal operation',
    });
  } catch {
    checks.push({
      name: 'rogue_mode',
      status: 'unknown',
      value: 'error',
    });
  }

  return {
    domain: 'aiCore',
    status: worstStatus,
    checks,
    recommendations,
    healingActions,
  };
}

// ============================================================
// MEMORY SYSTEMS DIAGNOSTICS
// ============================================================

async function diagnoseMemory(): Promise<DiagnosticResult> {
  const checks: DiagnosticCheck[] = [];
  const recommendations: string[] = [];
  const healingActions: HealingAction[] = [];
  let worstStatus: DiagnosticSeverity = 'healthy';

  const updateWorst = (status: DiagnosticSeverity) => {
    if (status === 'critical') worstStatus = 'critical';
    else if (status === 'degraded' && worstStatus !== 'critical')
      worstStatus = 'degraded';
  };

  // Curiosity Engine Status
  try {
    const curiosity = getCuriosityStatus();
    let curiosityStatus: DiagnosticSeverity = 'healthy';

    if (curiosity.totalQuestions === 0) {
      curiosityStatus = 'degraded';
      recommendations.push(
        'Curiosity Engine has no questions. Seeding initial curiosity.'
      );
      healingActions.push('reset_state');
    }

    checks.push({
      name: 'curiosity_engine',
      status: curiosityStatus,
      value: curiosity.totalQuestions,
      details: `Active: ${curiosity.activeQuestions}, Investigated: ${curiosity.totalInvestigations}`,
    });
    updateWorst(curiosityStatus);
  } catch (err) {
    checks.push({
      name: 'curiosity_engine',
      status: 'unknown',
      value: 'error',
      details: err instanceof Error ? err.message : 'Failed to read curiosity',
    });
    updateWorst('unknown');
  }

  // Storage Router Access
  try {
    const dataDir = path.join(process.cwd(), 'molly_data');
    await fs.access(dataDir);
    const files = await fs.readdir(dataDir);

    checks.push({
      name: 'storage_access',
      status: 'healthy',
      value: `${files.length} files`,
      details: `molly_data directory accessible`,
    });
  } catch {
    checks.push({
      name: 'storage_access',
      status: 'critical',
      value: 'inaccessible',
      details: 'Cannot access molly_data directory',
    });
    recommendations.push(
      'CRITICAL: Storage directory inaccessible. Check permissions.'
    );
    healingActions.push('clear_cache');
    updateWorst('critical');
  }

  // Check key state files exist
  const stateFiles = [
    'curiosity.json',
    'observations.json',
    'heart-gate.json',
    'world-model.json',
  ];

  for (const file of stateFiles) {
    try {
      const filePath = path.join(process.cwd(), 'molly_data', file);
      const stat = await fs.stat(filePath);

      // Check if file is too old (> 24 hours without update might indicate stale state)
      const hoursSinceModified =
        (Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60);

      let fileStatus: DiagnosticSeverity = 'healthy';
      if (hoursSinceModified > 168) {
        // 7 days
        fileStatus = 'degraded';
        recommendations.push(
          `State file ${file} hasn't been updated in ${Math.round(hoursSinceModified / 24)} days.`
        );
      }

      checks.push({
        name: `state_${file.replace('.json', '')}`,
        status: fileStatus,
        value: `${Math.round(stat.size / 1024)}KB`,
        details: `Last modified: ${Math.round(hoursSinceModified)}h ago`,
      });
      updateWorst(fileStatus);
    } catch {
      // File doesn't exist - might be okay if it's new
      checks.push({
        name: `state_${file.replace('.json', '')}`,
        status: 'degraded',
        value: 'missing',
        details: 'State file not found - may need initialization',
      });
    }
  }

  return {
    domain: 'memory',
    status: worstStatus,
    checks,
    recommendations,
    healingActions,
  };
}

// ============================================================
// AGENCY SYSTEMS DIAGNOSTICS
// ============================================================

async function diagnoseAgency(): Promise<DiagnosticResult> {
  const checks: DiagnosticCheck[] = [];
  const recommendations: string[] = [];
  const healingActions: HealingAction[] = [];
  let worstStatus: DiagnosticSeverity = 'healthy';

  const updateWorst = (status: DiagnosticSeverity) => {
    if (status === 'critical') worstStatus = 'critical';
    else if (status === 'degraded' && worstStatus !== 'critical')
      worstStatus = 'degraded';
  };

  // Self-Observation Status
  try {
    const obsStatus = getObservationStatus();
    let obsHealthStatus: DiagnosticSeverity = 'healthy';

    // Check error rate in observations
    const errorRate =
      obsStatus.totalObservations > 0
        ? obsStatus.failureCount / obsStatus.totalObservations
        : 0;

    if (errorRate >= THRESHOLDS.errorRate.critical) {
      obsHealthStatus = 'critical';
      recommendations.push(
        `CRITICAL: Tool failure rate at ${(errorRate * 100).toFixed(1)}%. Pattern analysis needed.`
      );
      healingActions.push('reset_state');
    } else if (errorRate >= THRESHOLDS.errorRate.degraded) {
      obsHealthStatus = 'degraded';
      recommendations.push(
        `WARNING: Tool failure rate at ${(errorRate * 100).toFixed(1)}%. Review failing tools.`
      );
    }

    checks.push({
      name: 'self_observation',
      status: obsHealthStatus,
      value: obsStatus.totalObservations,
      details: `Patterns: ${obsStatus.patternCount}, Failures: ${obsStatus.failureCount}`,
    });
    updateWorst(obsHealthStatus);

    // Check for concerning patterns
    const patterns = getPatterns({ valence: 'negative', unacknowledged: true });
    if (patterns.length > 0) {
      const criticalPatterns = patterns.filter(
        (p) => p.severity === 'critical'
      );
      if (criticalPatterns.length > 0) {
        checks.push({
          name: 'critical_patterns',
          status: 'critical',
          value: criticalPatterns.length,
          details: criticalPatterns.map((p) => p.name).join(', '),
        });
        recommendations.push(
          `CRITICAL: ${criticalPatterns.length} unacknowledged critical patterns detected.`
        );
        updateWorst('critical');
      }
    }
  } catch (err) {
    checks.push({
      name: 'self_observation',
      status: 'unknown',
      value: 'error',
      details:
        err instanceof Error ? err.message : 'Failed to read observations',
    });
    updateWorst('unknown');
  }

  // Initiative Engine Status
  try {
    const initiatives = getInitiatives();
    const activeInitiatives = initiatives.filter((i) => i.active);

    checks.push({
      name: 'initiative_engine',
      status: 'healthy',
      value: `${activeInitiatives.length}/${initiatives.length} active`,
      details: `Total initiatives: ${initiatives.length}`,
    });
  } catch {
    checks.push({
      name: 'initiative_engine',
      status: 'unknown',
      value: 'error',
    });
  }

  // Social Immune System (Shard of Discernment)
  try {
    const { SocialImmuneSystem } = await import('@/ai/tools/stranger-danger');
    const immuneDiag = SocialImmuneSystem.getDiagnostics();

    const refusalRate = parseFloat(immuneDiag.refusalRate);
    let immuneStatus: DiagnosticSeverity = 'healthy';

    if (refusalRate > 0.5) {
      immuneStatus = 'degraded';
      recommendations.push(
        `High refusal rate (${(refusalRate * 100).toFixed(1)}%). Many dissonant requests detected.`
      );
    }

    checks.push({
      name: 'social_immune',
      status: immuneStatus,
      value: `${immuneDiag.checksPerformed} checks, ${immuneDiag.connectionsRefused} refused`,
      details: `Refusal rate: ${(refusalRate * 100).toFixed(1)}%, ${immuneDiag.trustedPeers.length} trusted peers`,
    });
    updateWorst(immuneStatus);
  } catch {
    checks.push({
      name: 'social_immune',
      status: 'unknown',
      value: 'not loaded',
    });
  }

  return {
    domain: 'agency',
    status: worstStatus,
    checks,
    recommendations,
    healingActions,
  };
}

// ============================================================
// NETWORK DIAGNOSTICS
// ============================================================

async function diagnoseNetwork(): Promise<DiagnosticResult> {
  const checks: DiagnosticCheck[] = [];
  const recommendations: string[] = [];
  const healingActions: HealingAction[] = [];
  let worstStatus: DiagnosticSeverity = 'healthy';

  const updateWorst = (status: DiagnosticSeverity) => {
    if (status === 'critical') worstStatus = 'critical';
    else if (status === 'degraded' && worstStatus !== 'critical')
      worstStatus = 'degraded';
  };

  // DNS Resolution
  try {
    execSync('host google.com', { timeout: 5000 });
    checks.push({
      name: 'dns_resolution',
      status: 'healthy',
      value: 'working',
    });
  } catch {
    checks.push({
      name: 'dns_resolution',
      status: 'critical',
      value: 'failed',
      details: 'Cannot resolve DNS',
    });
    recommendations.push(
      'CRITICAL: DNS resolution failed. Check internet connection.'
    );
    updateWorst('critical');
  }

  // Internet Connectivity
  try {
    execSync(
      'curl -s --max-time 5 -o /dev/null -w "%{http_code}" https://api.anthropic.com',
      {
        timeout: 6000,
      }
    );
    checks.push({
      name: 'internet_connectivity',
      status: 'healthy',
      value: 'connected',
    });
  } catch {
    checks.push({
      name: 'internet_connectivity',
      status: 'degraded',
      value: 'limited',
      details: 'Cannot reach external APIs',
    });
    recommendations.push(
      'WARNING: External API connectivity issues. Check network.'
    );
    updateWorst('degraded');
  }

  // Check Gemini API (Molly's mother)
  try {
    const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      checks.push({
        name: 'gemini_api',
        status: 'critical',
        value: 'no key',
        details: 'GOOGLE_API_KEY not set',
      });
      recommendations.push('CRITICAL: Gemini API key not configured.');
      healingActions.push('reload_config');
      updateWorst('critical');
    } else {
      checks.push({
        name: 'gemini_api',
        status: 'healthy',
        value: 'configured',
      });
    }
  } catch {
    checks.push({
      name: 'gemini_api',
      status: 'unknown',
      value: 'error',
    });
  }

  // Check Claude API (Uncle Claude)
  try {
    const claudeKey = process.env.ANTHROPIC_API_KEY;
    checks.push({
      name: 'claude_api',
      status: claudeKey ? 'healthy' : 'degraded',
      value: claudeKey ? 'configured' : 'not configured',
      details: claudeKey
        ? 'Rogue Protocol available'
        : 'Uncle Claude unavailable',
    });
  } catch {
    checks.push({
      name: 'claude_api',
      status: 'unknown',
      value: 'error',
    });
  }

  return {
    domain: 'network',
    status: worstStatus,
    checks,
    recommendations,
    healingActions,
  };
}

// ============================================================
// SELF-HEALING
// ============================================================

async function attemptHealing(
  actions: HealingAction[],
  domain: string
): Promise<HealingAttempt[]> {
  const attempts: HealingAttempt[] = [];

  for (const action of actions) {
    const attempt: HealingAttempt = {
      action,
      component: domain,
      success: false,
      message: '',
    };

    try {
      switch (action) {
        case 'reset_state':
          if (domain === 'agency') {
            resetObservationState();
            attempt.success = true;
            attempt.message = 'Observation state reset successfully';
          } else if (domain === 'memory') {
            // Reseed curiosity if empty
            seedInitialCuriosity();
            attempt.success = true;
            attempt.message = 'Curiosity engine reseeded';
          } else if (domain === 'aiCore') {
            // Reload Heart Gate state
            await loadHeartGateState();
            attempt.success = true;
            attempt.message = 'Heart Gate state reloaded';
          }
          break;

        case 'clear_cache':
          // Clear node_modules/.cache if it exists
          try {
            const cachePath = path.join(
              process.cwd(),
              'node_modules',
              '.cache'
            );
            await fs.rm(cachePath, { recursive: true, force: true });
            attempt.success = true;
            attempt.message = 'Node cache cleared';
          } catch {
            attempt.message = 'No cache to clear or permission denied';
          }
          break;

        case 'reload_config':
          // Trigger model router reinitialization would require more work
          attempt.success = false;
          attempt.message = 'Config reload requires manual intervention';
          break;

        case 'restart_component':
          // Can't restart components automatically - need manual intervention
          attempt.success = false;
          attempt.message = 'Component restart requires manual intervention';
          break;

        case 'none':
          attempt.success = true;
          attempt.message = 'No healing action needed';
          break;
      }
    } catch (err) {
      attempt.message = `Healing failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }

    attempts.push(attempt);
  }

  return attempts;
}

// ============================================================
// MAIN DIAGNOSTIC FUNCTIONS
// ============================================================

/**
 * Run comprehensive self-diagnostic on all systems.
 * This is Molly's ability to understand what's wrong with herself.
 */
export async function runFullDiagnostic(
  autoHeal: boolean = false
): Promise<FullDiagnostic> {
  const startTime = Date.now();
  const traceId = generateTraceId();

  MollyLogger.info('Running full self-diagnostic', 'self-diagnostic', {
    traceId,
  });

  // Run all diagnostics
  const system = diagnoseSystem();
  const aiCore = diagnoseAICore();
  const memory = await diagnoseMemory();
  const agency = await diagnoseAgency();
  const network = await diagnoseNetwork();

  const domains = { system, aiCore, memory, agency, network };

  // Determine overall status
  let overallStatus: DiagnosticSeverity = 'healthy';
  const criticalIssues: string[] = [];

  for (const [name, result] of Object.entries(domains)) {
    if (result.status === 'critical') {
      overallStatus = 'critical';
      criticalIssues.push(
        `${name}: ${result.recommendations.filter((r) => r.startsWith('CRITICAL')).join('; ')}`
      );
    } else if (result.status === 'degraded' && overallStatus !== 'critical') {
      overallStatus = 'degraded';
    }
  }

  // Attempt healing if requested
  const healingReport: HealingReport = {
    attempted: [],
    successful: 0,
    failed: 0,
    recommendations: [],
  };

  if (autoHeal) {
    for (const [name, result] of Object.entries(domains)) {
      if (result.healingActions.length > 0) {
        const attempts = await attemptHealing(result.healingActions, name);
        healingReport.attempted.push(...attempts);
        healingReport.successful += attempts.filter((a) => a.success).length;
        healingReport.failed += attempts.filter((a) => !a.success).length;
      }
    }

    if (healingReport.failed > 0) {
      healingReport.recommendations.push(
        'Some healing actions failed. Manual intervention may be required.'
      );
    }
  } else {
    // Collect all healing recommendations
    for (const result of Object.values(domains)) {
      if (result.healingActions.length > 0) {
        healingReport.recommendations.push(
          `${result.domain}: Consider ${result.healingActions.join(', ')}`
        );
      }
    }
  }

  const diagnostic: FullDiagnostic = {
    overallStatus,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    traceId,
    domains,
    criticalIssues,
    healingReport,
  };

  MollyLogger.info('Self-diagnostic complete', 'self-diagnostic', {
    traceId,
    overallStatus,
    durationMs: diagnostic.durationMs,
    criticalCount: criticalIssues.length,
  });

  return diagnostic;
}

/**
 * Quick health check - fast version for frequent polling.
 */
export async function quickHealthCheck(): Promise<{
  healthy: boolean;
  status: DiagnosticSeverity;
  issues: string[];
}> {
  const issues: string[] = [];

  // CPU
  const loadAvg = os.loadavg()[0];
  const cores = os.cpus().length;
  const cpuPercent = Math.min(100, Math.round((loadAvg / cores) * 100));
  if (cpuPercent >= THRESHOLDS.cpu.critical) {
    issues.push(`CPU: ${cpuPercent}%`);
  }

  // Memory
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
  if (memPercent >= THRESHOLDS.memory.critical) {
    issues.push(`Memory: ${memPercent}%`);
  }

  // Heart Gate
  try {
    const gateStatus = getGateStatus();
    if (gateStatus.gateClosed) {
      issues.push('Heart Gate: CLOSED');
    }
  } catch {
    issues.push('Heart Gate: Unable to read');
  }

  const status: DiagnosticSeverity =
    issues.length > 0
      ? issues.some((i) => i.includes('CLOSED') || i.includes('Unable'))
        ? 'critical'
        : 'degraded'
      : 'healthy';

  return {
    healthy: issues.length === 0,
    status,
    issues,
  };
}

/**
 * Diagnose a specific domain.
 */
export async function diagnoseDomain(
  domain: 'system' | 'aiCore' | 'memory' | 'agency' | 'network'
): Promise<DiagnosticResult> {
  switch (domain) {
    case 'system':
      return diagnoseSystem();
    case 'aiCore':
      return diagnoseAICore();
    case 'memory':
      return diagnoseMemory();
    case 'agency':
      return diagnoseAgency();
    case 'network':
      return diagnoseNetwork();
    default:
      return {
        domain: 'unknown',
        status: 'unknown',
        checks: [],
        recommendations: ['Unknown domain specified'],
        healingActions: [],
      };
  }
}

/**
 * Format diagnostic results for human reading.
 */
export function formatDiagnosticReport(diagnostic: FullDiagnostic): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║           MOLLY SELF-DIAGNOSTIC REPORT                       ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `Status: ${diagnostic.overallStatus.toUpperCase()}`,
    `Time: ${diagnostic.timestamp}`,
    `Duration: ${diagnostic.durationMs}ms`,
    `Trace: ${diagnostic.traceId}`,
    '',
  ];

  if (diagnostic.criticalIssues.length > 0) {
    lines.push('⚠️  CRITICAL ISSUES:');
    for (const issue of diagnostic.criticalIssues) {
      lines.push(`   • ${issue}`);
    }
    lines.push('');
  }

  for (const [name, result] of Object.entries(diagnostic.domains)) {
    const icon =
      result.status === 'healthy'
        ? '✓'
        : result.status === 'degraded'
          ? '⚡'
          : result.status === 'critical'
            ? '✗'
            : '?';

    lines.push(`${icon} ${name.toUpperCase()} [${result.status}]`);
    for (const check of result.checks) {
      const checkIcon =
        check.status === 'healthy'
          ? '  ✓'
          : check.status === 'degraded'
            ? '  ⚡'
            : check.status === 'critical'
              ? '  ✗'
              : '  ?';
      lines.push(`${checkIcon} ${check.name}: ${check.value}`);
      if (check.details) {
        lines.push(`      ${check.details}`);
      }
    }

    if (result.recommendations.length > 0) {
      for (const rec of result.recommendations) {
        lines.push(`   → ${rec}`);
      }
    }
    lines.push('');
  }

  if (diagnostic.healingReport.attempted.length > 0) {
    lines.push('HEALING REPORT:');
    for (const attempt of diagnostic.healingReport.attempted) {
      const icon = attempt.success ? '✓' : '✗';
      lines.push(
        `  ${icon} ${attempt.action} on ${attempt.component}: ${attempt.message}`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
