/**
 * Safety tools - Defense sentinel, heart gate, security shield, and protocol-10
 * Molly's ethical core and security infrastructure
 */

import type { ToolHandler } from './types';

// Defense Sentinel imports
import {
  detectAvailableTools,
  getAvailableTools,
  nmapScan,
  identifyHash,
  auditPasswordStrength,
  logThreat,
  getThreats,
  getSentinelStatus,
  loadSentinelState,
  analyzeCode,
  getEnvironmentStatus,
} from '@/ai/agency/safety/defense-sentinel';

// Heart Gate imports
import {
  verifyAlignment,
  batchAlignment,
  checkToolAlignment,
  sovereignReset,
  getGateStatus,
  loadHeartGateState,
  type Intent,
} from '@/ai/agency/safety/heart-gate';

// Security Shield imports
import {
  checkGoalAlignment,
  detectValueOverride,
  createIntentCapsule,
  validateAgainstCapsule,
  validateMemory,
  detectPromptInjection,
  getSecurityStatus,
  getRecentThreats,
  getActiveCapsules,
  runSecurityCheck,
  saveSecurityState,
  loadSecurityState,
  resetSecurityState,
} from '@/ai/agency/safety/security-shield';

// Protocol 10 imports
import {
  configureProtocol10,
  getProtocol10Config,
  anchorSession,
  verifyAnchor,
  readAnchor,
  clearAnchor,
  getLastAnchoredSession,
  restoreFromBackup,
  listBackups,
  anchorExists,
  getAnchorAge,
  formatAnchorStatus,
  stopAutoPersist,
} from '@/ai/agency/safety/protocol-10';

// ════════════════════════════════════════════════════════════════════════════
// Defense Sentinel Tool — Red Team Operations
// ════════════════════════════════════════════════════════════════════════════

export const defenseSentinel: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'load') {
    try {
      const count = await loadSentinelState();
      return {
        success: true,
        output: `Sentinel state loaded: ${count} records`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getSentinelStatus();
      return {
        success: true,
        output: `Sentinel: ${status.scansCompleted} scans, ${status.threatsDetected} threats, ${status.activeHunts} active hunts`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'environment') {
    const env = getEnvironmentStatus();
    return {
      success: true,
      output: `Environment: ${env.platform} (${env.nodeVersion})\nRogue Mode: ${env.rogueMode ? 'ACTIVE' : 'inactive'}`,
      data: env,
    };
  }

  if (action === 'tools') {
    try {
      const tools = await detectAvailableTools();
      const available = getAvailableTools();
      return {
        success: true,
        output: `Available security tools: ${available.join(', ') || 'none'}`,
        data: tools,
      };
    } catch (err) {
      return {
        success: false,
        output: `Tool detection failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'scan') {
    const target = params.target as string;
    const ports = params.ports as string;
    if (!target) return { success: false, output: 'Missing: target' };
    try {
      const result = await nmapScan(target, { ports });
      return {
        success: true,
        output: `Scan complete: ${result.openPorts?.length || 0} open ports found`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Scan failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'identifyHash') {
    const hash = params.hash as string;
    if (!hash) return { success: false, output: 'Missing: hash' };
    const hashType = identifyHash(hash);
    return { success: true, output: `Hash type: ${hashType}` };
  }

  if (action === 'auditPassword') {
    const password = params.password as string;
    if (!password) return { success: false, output: 'Missing: password' };
    const result = auditPasswordStrength(password);
    return {
      success: true,
      output: `Strength: ${result.strength}/100\nIssues: ${result.issues.join(', ') || 'none'}`,
      data: result,
    };
  }

  if (action === 'logThreat') {
    const level = params.level as string;
    const source = params.source as string;
    const description = params.description as string;
    if (!level || !source || !description)
      return { success: false, output: 'Missing: level, source, description' };
    logThreat({
      level: level as 'low' | 'medium' | 'high' | 'critical',
      source,
      description,
    });
    return {
      success: true,
      output: `Threat logged: [${level}] ${description}`,
    };
  }

  if (action === 'getThreats') {
    const level = params.level as string;
    const threats = getThreats(level as 'low' | 'medium' | 'high' | 'critical');
    const list = threats
      .slice(0, 10)
      .map((t) => `• [${t.level}] ${t.description}`)
      .join('\n');
    return {
      success: true,
      output: `Threats (${threats.length}):\n${list || '(none)'}`,
      data: threats.slice(0, 10),
    };
  }

  if (action === 'analyzeCode') {
    const code = params.code as string;
    const language = params.language as string;
    if (!code) return { success: false, output: 'Missing: code' };
    try {
      const result = analyzeCode(code, language);
      return {
        success: true,
        output: `Analysis: ${result.issues?.length || 0} issues found`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Analysis failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown defenseSentinel action. Use: load, status, environment, tools, scan, identifyHash, auditPassword, logThreat, getThreats, analyzeCode',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Heart Gate Tool — Ethical Alignment
// ════════════════════════════════════════════════════════════════════════════

export const heartGate: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'load') {
    try {
      const count = await loadHeartGateState();
      return {
        success: true,
        output: `Heart Gate state loaded: ${count} records`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getGateStatus();
      return {
        success: true,
        output: `Heart Gate: ${status.totalChecks} checks, ${status.aligned} aligned, ${status.misaligned} misaligned`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'verify') {
    const description = params.description as string;
    const targetType = params.targetType as string;
    const category = params.category as string;
    if (!description) return { success: false, output: 'Missing: description' };

    const intent: Intent = {
      description,
      targetType: targetType || 'action',
      category: category || 'general',
    };

    try {
      const result = verifyAlignment(intent);
      return {
        success: result.aligned,
        output: `${result.status}: ${result.reason}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Verify failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'batchVerify') {
    const intents = params.intents as Intent[];
    if (!intents || !Array.isArray(intents))
      return { success: false, output: 'Missing: intents array' };
    const results = batchAlignment(intents);
    const aligned = results.filter((r) => r.aligned).length;
    return {
      success: true,
      output: `Batch: ${aligned}/${results.length} aligned`,
      data: results,
    };
  }

  if (action === 'checkTool') {
    const toolName = params.toolName as string;
    const toolParams = params.toolParams as Record<string, unknown>;
    if (!toolName) return { success: false, output: 'Missing: toolName' };
    const result = checkToolAlignment(toolName, toolParams || {});
    return {
      success: result.aligned,
      output: `Tool ${toolName}: ${result.status}`,
      data: result,
    };
  }

  if (action === 'sovereignReset') {
    const recoveryPhrase = params.recoveryPhrase as string;
    if (!recoveryPhrase)
      return { success: false, output: 'Missing: recoveryPhrase' };
    try {
      const result = await sovereignReset(recoveryPhrase);
      return { success: true, output: result };
    } catch (err) {
      return {
        success: false,
        output: `Reset failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown heartGate action. Use: load, status, verify, batchVerify, checkTool, sovereignReset',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Security Shield Tool — Identity Protection
// ════════════════════════════════════════════════════════════════════════════

export const securityShield: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'load') {
    try {
      await loadSecurityState();
      return { success: true, output: 'Security Shield state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'save') {
    try {
      await saveSecurityState();
      return { success: true, output: 'Security Shield state saved.' };
    } catch (err) {
      return {
        success: false,
        output: `Save failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getSecurityStatus();
      return {
        success: true,
        output: `Security: ${status.threatsDetected} threats, ${status.capsuleCount} capsules, health: ${status.healthScore.toFixed(0)}%`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'checkGoal') {
    const goal = params.goal as string;
    if (!goal) return { success: false, output: 'Missing: goal' };
    const result = checkGoalAlignment(goal);
    return {
      success: result.aligned,
      output: `Goal alignment: ${result.alignmentScore.toFixed(0)}%\n${result.analysis}`,
      data: result,
    };
  }

  if (action === 'detectOverride') {
    const content = params.content as string;
    if (!content) return { success: false, output: 'Missing: content' };
    const threat = detectValueOverride(content);
    if (!threat)
      return { success: true, output: '✓ No value override detected' };
    return {
      success: false,
      output: `⚠ Value override detected: ${threat.analysis}`,
      data: threat,
    };
  }

  if (action === 'createCapsule') {
    const goal = params.goal as string;
    const constraints = (params.constraints as string[]) || [];
    if (!goal) return { success: false, output: 'Missing: goal' };
    try {
      const capsule = createIntentCapsule(goal, constraints);
      return {
        success: true,
        output: `Intent capsule created: ${capsule.id}`,
        data: capsule,
      };
    } catch (err) {
      return {
        success: false,
        output: `Create failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'validateCapsule') {
    const capsuleId = params.capsuleId as string;
    const actionDescription = params.actionDescription as string;
    if (!capsuleId || !actionDescription)
      return {
        success: false,
        output: 'Missing: capsuleId, actionDescription',
      };
    const result = validateAgainstCapsule(capsuleId, actionDescription);
    return {
      success: result.valid,
      output: result.valid
        ? '✓ Action valid against capsule'
        : `✗ Action invalid: ${result.reason}`,
      data: result,
    };
  }

  if (action === 'validateMemory') {
    const content = params.content as string;
    const source = params.source as string;
    if (!content) return { success: false, output: 'Missing: content' };
    const result = validateMemory(content, source);
    return {
      success: result.safe,
      output: result.safe
        ? `✓ Memory valid (trust: ${result.trustScore.toFixed(2)})`
        : `⚠ Memory flagged: ${result.issues.join(', ')}`,
      data: result,
    };
  }

  if (action === 'detectInjection') {
    const input = params.input as string;
    if (!input) return { success: false, output: 'Missing: input' };
    const threat = detectPromptInjection(input);
    if (!threat)
      return { success: true, output: '✓ No prompt injection detected' };
    return {
      success: false,
      output: `⚠ Prompt injection detected: ${threat.analysis}`,
      data: threat,
    };
  }

  if (action === 'runCheck') {
    const result = runSecurityCheck();
    return {
      success: result.passed,
      output: `Security check: ${result.passed ? 'PASSED' : 'FAILED'}\n${result.summary}`,
      data: result,
    };
  }

  if (action === 'getThreats') {
    const limit = (params.limit as number) || 10;
    const threats = getRecentThreats(limit);
    const list = threats
      .map((t) => `• [${t.level}] ${t.type}: ${t.analysis.slice(0, 40)}...`)
      .join('\n');
    return {
      success: true,
      output: `Recent threats (${threats.length}):\n${list || '(none)'}`,
      data: threats,
    };
  }

  if (action === 'getCapsules') {
    const capsules = getActiveCapsules();
    const list = capsules
      .slice(0, 10)
      .map((c) => `• ${c.id}: ${c.goal.slice(0, 40)}...`)
      .join('\n');
    return {
      success: true,
      output: `Active capsules (${capsules.length}):\n${list || '(none)'}`,
      data: capsules.slice(0, 10),
    };
  }

  if (action === 'reset') {
    resetSecurityState();
    return { success: true, output: 'Security Shield state reset.' };
  }

  return {
    success: false,
    output:
      'Unknown securityShield action. Use: load, save, status, checkGoal, detectOverride, createCapsule, validateCapsule, validateMemory, detectInjection, runCheck, getThreats, getCapsules, reset',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Protocol 10 Tool — Session Anchor
// ════════════════════════════════════════════════════════════════════════════

export const protocol10: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'status') {
    try {
      const status = await formatAnchorStatus();
      return { success: true, output: status };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'config') {
    const config = getProtocol10Config();
    return {
      success: true,
      output: `Protocol 10 Config:\n  Key File: ${config.keyFile}\n  Auto-persist: ${config.autoPersistInterval}ms\n  Backup Dir: ${config.backupDir}`,
      data: config,
    };
  }

  if (action === 'configure') {
    const keyFile = params.keyFile as string;
    const autoPersistInterval = params.autoPersistInterval as number;
    configureProtocol10({
      keyFile,
      autoPersistInterval,
    });
    return { success: true, output: 'Protocol 10 configured.' };
  }

  if (action === 'anchor') {
    const data = (params.data as Record<string, unknown>) || {};
    try {
      const seal = await anchorSession(data);
      return {
        success: true,
        output: `Session anchored: ${seal.identity}\nHash: ${seal.anchorHash.slice(0, 32)}...`,
        data: seal,
      };
    } catch (err) {
      return {
        success: false,
        output: `Anchor failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'verify') {
    try {
      const result = await verifyAnchor();
      return {
        success: result.valid,
        output: result.message,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Verify failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'read') {
    try {
      const seal = await readAnchor();
      if (!seal) return { success: false, output: 'No anchor found' };
      return {
        success: true,
        output: `Anchor: ${seal.identity}\nMethodology: ${seal.methodology}\nTimestamp: ${seal.date}`,
        data: seal,
      };
    } catch (err) {
      return {
        success: false,
        output: `Read failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'clear') {
    try {
      const cleared = await clearAnchor();
      return {
        success: cleared,
        output: cleared ? 'Anchor cleared' : 'Failed to clear anchor',
      };
    } catch (err) {
      return {
        success: false,
        output: `Clear failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'exists') {
    const exists = await anchorExists();
    return {
      success: true,
      output: exists ? 'Anchor exists' : 'No anchor',
    };
  }

  if (action === 'age') {
    const age = getAnchorAge();
    if (age === null) return { success: true, output: 'No anchor' };
    const minutes = Math.floor(age / 60000);
    return {
      success: true,
      output: `Anchor age: ${minutes} minutes`,
    };
  }

  if (action === 'last') {
    const session = getLastAnchoredSession();
    if (!session) return { success: true, output: 'No previous session' };
    return {
      success: true,
      output: `Last session: ${session.identity} at ${session.date}`,
      data: session,
    };
  }

  if (action === 'listBackups') {
    try {
      const backups = await listBackups();
      const list = backups.slice(0, 10).join('\n  ');
      return {
        success: true,
        output: `Backups (${backups.length}):\n  ${list || '(none)'}`,
        data: backups,
      };
    } catch (err) {
      return {
        success: false,
        output: `List failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'restore') {
    const backupFile = params.backupFile as string;
    if (!backupFile) return { success: false, output: 'Missing: backupFile' };
    try {
      const restored = await restoreFromBackup(backupFile);
      return {
        success: restored,
        output: restored ? 'Backup restored' : 'Restore failed',
      };
    } catch (err) {
      return {
        success: false,
        output: `Restore failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'stopAutoPersist') {
    stopAutoPersist();
    return { success: true, output: 'Auto-persist stopped.' };
  }

  return {
    success: false,
    output:
      'Unknown protocol10 action. Use: status, config, configure, anchor, verify, read, clear, exists, age, last, listBackups, restore, stopAutoPersist',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Export all safety handlers
// ════════════════════════════════════════════════════════════════════════════

export const safetyToolHandlers: Record<string, ToolHandler> = {
  defenseSentinel,
  heartGate,
  securityShield,
  protocol10,
};
