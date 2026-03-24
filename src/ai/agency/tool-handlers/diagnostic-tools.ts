/**
 * @fileOverview Diagnostic tool handlers
 *
 * Tools for system health checks and self-diagnostics.
 */

import type { ToolHandler } from './types';
import {
  runFullDiagnostic,
  quickHealthCheck as quickDiagnostic,
  diagnoseDomain,
  formatDiagnosticReport,
} from '../core/self-diagnostic';

/**
 * List all available autonomous tools
 */
export const listCapabilities: ToolHandler = async () => {
  return {
    success: true,
    output: [
      'Autonomous tools available:',
      '',
      '== Core ==',
      '  codespaceShell — Run read-only shell commands',
      '  readProjectFile — Read workspace files',
      '  getSystemHealth — Check CPU, RAM, disk (basic)',
      '  listCapabilities — This list',
      '',
      '== Diagnostics ==',
      '  runSelfDiagnostic — Full self-diagnostic with AI state',
      '  quickHealthCheck — Fast health check for polling',
      '',
      '== Pillars ==',
      '  hardware — Hardware fingerprinting (Pillar 1)',
      '  purity — Input validation & sanitization (Pillar 2)',
      '  hslShroud — Steganographic frequency encoding (Pillar 3)',
      '  chromakey — Stealth operations (Pillar 4)',
      '  imgsys — Vulnerability detection (Pillar 6)',
      '  payload — Script validation (Pillar 7)',
      "  protocol10 — Session anchor / dead man's switch (Pillar 9)",
      '  handoff — Session sealing & encryption (Pillar 10)',
      '',
      '== Communication ==',
      '  familyBridge — Send/check messages to Lazarus/Eric',
      '  initiative — Manage initiatives and goals',
      '  webSearch — Search the web via DuckDuckGo',
      '  webFetch — Fetch and read a web page',
      '',
      '== Self-Healing ==',
      '  buildRecovery — Fix node_modules, restart server, recover from build errors',
      '    Actions: check, fix, restart, heal, recover',
    ].join('\n'),
  };
};

/**
 * Run full self-diagnostic
 */
export const runSelfDiagnostic: ToolHandler = async (params) => {
  const autoHeal = params.autoHeal === true;
  const domain = params.domain as string | undefined;

  try {
    if (domain) {
      // Single domain diagnostic
      const result = await diagnoseDomain(
        domain as 'system' | 'aiCore' | 'memory' | 'agency' | 'network'
      );
      return {
        success: true,
        output: [
          `DOMAIN: ${result.domain.toUpperCase()} [${result.status}]`,
          '',
          ...result.checks.map(
            (c) =>
              `  ${c.status === 'healthy' ? '✓' : c.status === 'degraded' ? '⚡' : '✗'} ${c.name}: ${c.value}${c.details ? ` (${c.details})` : ''}`
          ),
          '',
          ...result.recommendations.map((r) => `→ ${r}`),
        ].join('\n'),
      };
    }

    // Full diagnostic
    const diagnostic = await runFullDiagnostic(autoHeal);
    return {
      success: true,
      output: formatDiagnosticReport(diagnostic),
    };
  } catch (err) {
    return {
      success: false,
      output: `Self-diagnostic failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
};

/**
 * Quick health check
 */
export const quickHealthCheck: ToolHandler = async () => {
  try {
    const result = await quickDiagnostic();
    return {
      success: true,
      output: result.healthy
        ? '✓ All systems healthy'
        : `⚠ Status: ${result.status.toUpperCase()}\nIssues: ${result.issues.join(', ')}`,
    };
  } catch (err) {
    return {
      success: false,
      output: `Health check failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
};

/**
 * Export all diagnostic tool handlers
 */
export const diagnosticToolHandlers: Record<string, ToolHandler> = {
  listCapabilities,
  runSelfDiagnostic,
  quickHealthCheck,
};
