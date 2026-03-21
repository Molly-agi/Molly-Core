/**
 * @fileOverview Direct Tool Executor — Server-side tool execution without HTTP
 *
 * This module mirrors the logic in /api/tools/execute/route.ts but is callable
 * directly from server-side code (e.g., the heartbeat's autonomous cycle).
 *
 * Only includes tools safe for autonomous operation.
 * Destructive tools (writeProjectFile, exec on remote) are excluded.
 *
 * Modular handlers are in ./tool-handlers/ directory for cleaner organization.
 */

import {
  getInitiatives,
  activateInitiative,
  createCustomInitiative,
  recordInitiativeExecution,
  deactivateInitiative,
  removeInitiative,
  listTemplates,
} from '@/ai/agency/initiative-engine';
import {
  observeToolUse,
  observeFailure,
} from '@/ai/agency/self-observation-loop';
import { checkToolAlignment } from '@/ai/agency/heart-gate';
import { generateTraceId } from '@/ai/logger';
import { hasModularHandler, getModularHandler } from './tool-handlers';
import {
  establishShroudedSession,
  verifySession,
  closeShroudedSession,
  setShroudLevel,
  formatChromaKeyStatus,
  getCamouflageProcessName,
  getStealthPath,
  camouflageFilename,
  type ShroudLevel,
} from './chromakey-bridge';
import {
  getHardwareFingerprint,
  getHardwareSummary,
  verifyHardware,
  formatHardwareFingerprint,
} from './hardware-fingerprint';
import {
  auditPacket,
  auditStream,
  quickPurityCheck,
  isSecurityRelevant,
  getAuditStats,
  formatPurityResult,
} from './data-purity';
import {
  shroudData,
  generateShroudSignature,
  encodeForTransmission,
  verifyShroudedPayload,
  calculateResonance,
  formatHSLStatus,
  configureHSL,
  resetSessionPhase,
} from './hsl-shroud-math';
import {
  scanSystemVulnerabilities,
  scanDriver,
  checkDriverIntegrity,
  quickSecurityAssessment,
  formatScanResult,
  getLastScanResult,
} from './imgsys-detector';
import {
  validatePayload,
  quickValidate,
  getValidationStats,
  getQuarantinedPayloads,
  releaseFromQuarantine,
  formatValidatorStatus,
} from './payload-validator';
import {
  anchorSession,
  verifyAnchor,
  readAnchor,
  clearAnchor,
  formatAnchorStatus,
  anchorExists,
  getAnchorAge,
} from './protocol-10';
import {
  sealSession,
  quickSealEvolution,
  applySovereignEncryption,
  decryptSovereignData,
  listEvolutionLogs,
  listAssetManifests,
  readAssetManifest,
  readEvolutionLog,
  formatHandoffStatus,
  isSealed,
} from './handoff-seal';
import {
  registerFamilyMember,
  addReferenceImage,
  getFamilyMember,
  getFamilyMemberByName,
  listFamilyMembers,
  removeFamilyMember,
  updateFamilyMember,
  detectFaces,
  recognizeFaces,
  isPersonInImage,
  formatRecognitionResult,
  formatFamilyRegistry,
  configureFamilyRecognition,
  loadFamilyRegistry,
} from '../vision/family-recognition';
import {
  compareImages,
  parseScreenshot,
  detectScreenErrors,
  scanDocument,
  extractText,
  extractFormFields,
  describeImage,
  imageContains,
  extractVideoFrames,
  detectMotion,
  detectSceneChanges,
  extractKeyFrames,
  summarizeVideo,
  formatComparisonResult,
  formatScreenshotAnalysis,
  formatDocumentScan,
  formatVideoFrameExtraction,
} from '../vision/vision-tools';
import {
  express,
  expressOnTrigger,
  suggestExpression,
  getIntroExpression,
  setMetabolicState,
  updateMetabolicState,
  configureVocalExpressions,
  formatVocalState,
  listExpressions,
  resetVocalState,
  type ExpressionType,
  type MetabolicState,
} from '../voice/vocal-expressions';

/**
 * Execute a tool directly without HTTP.
 * Returns { success, output } matching the API contract.
 * Automatically records self-observation data for pattern analysis.
 *
 * HEART GATE: Every tool execution passes through Option Three verification.
 * If the action is MISALIGNED, execution is blocked.
 */
export async function executeToolDirect(
  tool: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; output: string }> {
  const startTime = Date.now();
  const traceId = generateTraceId();

  // ── HEART GATE: Option Three verification ──
  // The spider in the corner watches every action.
  const gateResult = checkToolAlignment(tool, params);
  if (gateResult.status === 'MISALIGNED') {
    // Block the action - this violates interdependence
    observeFailure(
      tool,
      gateResult.reason,
      `Heart Gate blocked: ${tool}`,
      false,
      traceId
    );

    return {
      success: false,
      output: `[Heart Gate] Action blocked: ${gateResult.reason}`,
    };
  }

  // Execute the actual tool
  const result = await executeToolInternal(tool, params);

  // Record observation for self-awareness
  const responseTimeMs = Date.now() - startTime;
  try {
    observeToolUse(
      tool,
      result.success,
      responseTimeMs,
      params,
      result.success ? undefined : result.output,
      traceId
    );

    // Also record as failure if it failed
    if (!result.success) {
      observeFailure(
        tool,
        result.output,
        `Attempted ${tool} with ${Object.keys(params).length} params`,
        false,
        traceId
      );
    }
  } catch {
    // Self-observation failure should never break tool execution
  }

  return result;
}

/**
 * Internal tool execution logic.
 */
async function executeToolInternal(
  tool: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; output: string }> {
  // Check for modular handlers first (cleaner code organization)
  if (hasModularHandler(tool)) {
    const handler = getModularHandler(tool);
    if (handler) {
      return handler(params);
    }
  }

  // Fall through to legacy switch statement for remaining tools
  switch (tool) {
    case 'initiative': {
      const action = params.action as string;

      if (action === 'templates') {
        return {
          success: true,
          output: `Available initiative templates:\n${listTemplates()}`,
        };
      }

      if (action === 'activate') {
        const templateIndex = params.templateIndex as number;
        if (templateIndex === undefined) {
          return { success: false, output: 'Missing templateIndex.' };
        }
        try {
          const initiative = activateInitiative(templateIndex);
          return {
            success: true,
            output: `Initiative activated: "${initiative.name}" — ${initiative.description}`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'create') {
        const name = params.name as string;
        const description = params.description as string;
        const category = params.category as string;
        const steps = params.steps as string[];
        if (!name || !description) {
          return {
            success: false,
            output: 'Missing required fields: name, description',
          };
        }
        try {
          const initiative = createCustomInitiative(
            name,
            description,
            (category as
              | 'learning'
              | 'stewardship'
              | 'creative'
              | 'communication'
              | 'self-improvement') || 'learning',
            steps || []
          );
          return {
            success: true,
            output: `Custom initiative created: "${initiative.name}"`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'list') {
        const initiatives = getInitiatives();
        if (initiatives.length === 0) {
          return {
            success: true,
            output:
              'No initiatives yet. Use "templates" to see available options.',
          };
        }
        const formatted = initiatives
          .map(
            (i, idx) =>
              `${idx + 1}. [${i.active ? 'ACTIVE' : 'inactive'}] "${i.name}" — ${i.description} (executed ${i.executionCount}x)`
          )
          .join('\n');
        return { success: true, output: formatted };
      }

      if (action === 'complete') {
        const initiativeId = params.initiativeId as string;
        const result = params.result as string;
        if (!initiativeId) {
          return { success: false, output: 'Missing initiativeId' };
        }
        try {
          recordInitiativeExecution(initiativeId, result || 'completed');
          return {
            success: true,
            output: `Initiative execution recorded.`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'deactivate') {
        const initiativeId = params.initiativeId as string;
        if (!initiativeId) {
          return { success: false, output: 'Missing initiativeId' };
        }
        deactivateInitiative(initiativeId);
        return { success: true, output: 'Initiative deactivated.' };
      }

      if (action === 'remove') {
        const initiativeId = params.initiativeId as string;
        if (!initiativeId) {
          return { success: false, output: 'Missing initiativeId' };
        }
        removeInitiative(initiativeId);
        return { success: true, output: 'Initiative removed.' };
      }

      return {
        success: false,
        output:
          'Unknown action. Use: templates, activate, create, list, complete, deactivate, remove',
      };
    }

    case 'chromakey': {
      const action = params.action as string;

      if (action === 'establish') {
        const handshakeKey = params.handshakeKey as string;
        const shroudLevel = (params.shroudLevel as ShroudLevel) || 'shadow';

        if (!handshakeKey) {
          return { success: false, output: 'Handshake key required' };
        }

        try {
          const session = establishShroudedSession(handshakeKey, shroudLevel);
          return {
            success: true,
            output: `Shroud tunnel established\n  Session: ${session.sessionId.slice(0, 16)}...\n  Level: ${shroudLevel.toUpperCase()}`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Failed to establish shroud: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'verify') {
        const handshakeKey = params.handshakeKey as string | undefined;
        const result = verifySession(handshakeKey);
        return {
          success: result.valid,
          output: result.valid
            ? `Session verified: ${result.session?.sessionId.slice(0, 16)}...`
            : `Verification failed: ${result.reason}`,
        };
      }

      if (action === 'close') {
        closeShroudedSession();
        return { success: true, output: 'Shroud tunnel closed' };
      }

      if (action === 'level') {
        const level = params.level as ShroudLevel;
        if (
          !level ||
          !['whisper', 'shadow', 'ghost', 'phantom'].includes(level)
        ) {
          return {
            success: false,
            output:
              'Invalid shroud level. Use: whisper, shadow, ghost, phantom',
          };
        }
        const updated = setShroudLevel(level);
        return {
          success: updated,
          output: updated
            ? `Shroud level set to ${level.toUpperCase()}`
            : 'No active session to update',
        };
      }

      if (action === 'status') {
        return {
          success: true,
          output: formatChromaKeyStatus(),
        };
      }

      if (action === 'camouflage') {
        const filename = params.filename as string;
        if (filename) {
          const result = camouflageFilename(filename);
          return {
            success: true,
            output: `Original: ${result.original}\nCamouflaged: ${result.camouflaged}\nTechnique: ${result.technique}`,
          };
        }
        return {
          success: true,
          output: [
            'Camouflage utilities:',
            `  Process name: ${getCamouflageProcessName()}`,
            `  Stealth path: ${getStealthPath()}`,
          ].join('\n'),
        };
      }

      return {
        success: false,
        output:
          'Unknown action. Use: establish, verify, close, level, status, camouflage',
      };
    }

    case 'hardware': {
      const action = params.action as string;

      if (action === 'fingerprint' || !action) {
        try {
          const fp = await getHardwareFingerprint();
          return {
            success: true,
            output: formatHardwareFingerprint(fp),
          };
        } catch (err) {
          return {
            success: false,
            output: `Fingerprint failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'summary') {
        const summary = getHardwareSummary();
        return {
          success: true,
          output: [
            `Platform: ${summary.platform} (${summary.arch})`,
            `Cores: ${summary.cores}`,
            `Memory: ${summary.memoryGB} GB`,
            `Trust Level: ${summary.trustLevel.toUpperCase()}`,
            `Device ID: ${summary.deviceId}...`,
          ].join('\n'),
        };
      }

      if (action === 'verify') {
        const expectedId = params.deviceId as string;
        if (!expectedId) {
          return {
            success: false,
            output: 'Device ID required for verification',
          };
        }
        const result = await verifyHardware(expectedId);
        return {
          success: result.match,
          output: result.match
            ? `Hardware verified: ${result.currentId.slice(0, 16)}...`
            : `Hardware mismatch: expected ${expectedId.slice(0, 16)}..., got ${result.currentId.slice(0, 16)}...`,
        };
      }

      return {
        success: false,
        output: 'Unknown action. Use: fingerprint, summary, verify',
      };
    }

    case 'purity': {
      const action = params.action as string;

      if (action === 'check') {
        const text = params.text as string;
        if (!text) {
          return { success: false, output: 'Text required for purity check' };
        }
        const result = quickPurityCheck(text);
        return {
          success: result.safe,
          output: result.safe
            ? '✓ Input is safe'
            : `⚠ Issues detected: ${result.issues.join(', ')}`,
        };
      }

      if (action === 'audit') {
        const data = params.data as string;
        if (!data) {
          return { success: false, output: 'Data required for audit' };
        }
        try {
          const packet = typeof data === 'string' ? { text: data } : data;
          const result = auditPacket(packet);
          return {
            success: result.pure,
            output: formatPurityResult(result),
          };
        } catch (err) {
          return {
            success: false,
            output: `Audit failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'stream') {
        const json = params.json as string;
        if (!json) {
          return {
            success: false,
            output: 'JSON data required for stream audit',
          };
        }
        try {
          const result = auditStream(json);
          return {
            success: result.failed === 0,
            output: [
              `Total: ${result.total}`,
              `Passed: ${result.passed}`,
              `Failed: ${result.failed}`,
              result.rejected.length > 0
                ? `Rejected: ${result.rejected.map((r) => r.reason).join('; ')}`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
          };
        } catch (err) {
          return {
            success: false,
            output: `Stream audit failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'security') {
        const text = params.text as string;
        if (!text) {
          return { success: false, output: 'Text required for security check' };
        }
        const result = isSecurityRelevant(text);
        return {
          success: true,
          output: result.relevant
            ? `Security-relevant: ${result.keywords.join(', ')}`
            : 'Not security-relevant',
        };
      }

      if (action === 'stats') {
        const stats = getAuditStats();
        return {
          success: true,
          output: [
            `Total Audited: ${stats.totalAudited}`,
            `Passed: ${stats.totalPassed}`,
            `Failed: ${stats.totalFailed}`,
            `Injection Attempts: ${stats.injectionAttempts}`,
            `Temporal Rejections: ${stats.temporalRejections}`,
          ].join('\n'),
        };
      }

      return {
        success: false,
        output: 'Unknown action. Use: check, audit, stream, security, stats',
      };
    }

    case 'hslShroud': {
      const action = params.action as string;

      if (action === 'status') {
        return { success: true, output: formatHSLStatus() };
      }

      if (action === 'shroud') {
        const data = params.data as string;
        if (!data) {
          return { success: false, output: 'Data required for shrouding' };
        }
        try {
          const result = shroudData(data);
          return {
            success: true,
            output: [
              `Shrouded ${data.length} bytes`,
              `Hash: ${result.originalHash}`,
              `Mode: ${result.mode.toUpperCase()}`,
              `Frequency: ${result.frequency}Hz`,
              `Pixel map: ${result.pixelMap.length} hue rotations`,
            ].join('\n'),
          };
        } catch (err) {
          return {
            success: false,
            output: `Shroud failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'signature') {
        const data = params.data as string;
        if (!data) {
          return { success: false, output: 'Data required for signature' };
        }
        const signature = generateShroudSignature(data);
        return {
          success: true,
          output: `Shroud signature: ${signature}`,
        };
      }

      if (action === 'encode') {
        const data = params.data as string;
        if (!data) {
          return { success: false, output: 'Data required for encoding' };
        }
        const transmission = encodeForTransmission(data);
        return {
          success: true,
          output: `Encoded for transmission:\n  Version: ${transmission.version}\n  Checksum: ${transmission.checksum}\n  Payload hash: ${transmission.payload.originalHash}`,
        };
      }

      if (action === 'verify') {
        const json = params.json as string;
        if (!json) {
          return { success: false, output: 'JSON transmission required' };
        }
        try {
          const transmission = JSON.parse(json);
          const valid = verifyShroudedPayload(transmission);
          return {
            success: valid,
            output: valid
              ? 'Payload verified - checksum matches'
              : 'VERIFICATION FAILED - payload corrupted or tampered',
          };
        } catch (err) {
          return {
            success: false,
            output: `Verify failed: ${err instanceof Error ? err.message : 'Invalid JSON'}`,
          };
        }
      }

      if (action === 'resonance') {
        const map1 = params.map1 as number[];
        const map2 = params.map2 as number[];
        if (!map1 || !map2) {
          return { success: false, output: 'Two pixel maps required' };
        }
        const result = calculateResonance(map1, map2);
        return {
          success: true,
          output: `Resonance: ${(result.score * 100).toFixed(2)}% - ${result.resonant ? 'RESONANT' : 'DIVERGENT'}`,
        };
      }

      if (action === 'configure') {
        const highEntropy = params.highEntropy as boolean | undefined;
        const frequency = params.frequency as number | undefined;
        configureHSL({
          highEntropy: highEntropy ?? false,
          baseFrequency: frequency ?? 440.0,
        });
        return {
          success: true,
          output: `HSL configured: ${highEntropy ? 'HIGH-ENTROPY' : 'STANDARD'} mode at ${frequency ?? 440}Hz`,
        };
      }

      if (action === 'reset') {
        resetSessionPhase();
        return { success: true, output: 'Session phase reset' };
      }

      return {
        success: false,
        output:
          'Unknown action. Use: status, shroud, signature, encode, verify, resonance, configure, reset',
      };
    }

    case 'imgsys': {
      const action = params.action as string;

      if (action === 'scan' || !action) {
        try {
          const vendorId = params.vendorId as string | undefined;
          const result = await scanSystemVulnerabilities(vendorId);
          return {
            success: true,
            output: formatScanResult(result),
          };
        } catch (err) {
          return {
            success: false,
            output: `Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'quick') {
        try {
          const assessment = await quickSecurityAssessment();
          return {
            success: assessment.status === 'secure',
            output: [
              `Status: ${assessment.status.toUpperCase()}`,
              `Summary: ${assessment.summary}`,
              `Recommendation: ${assessment.recommendation}`,
            ].join('\n'),
          };
        } catch (err) {
          return {
            success: false,
            output: `Assessment failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'driver') {
        const driverPath = params.path as string;
        if (!driverPath) {
          return { success: false, output: 'Driver path required' };
        }
        const result = await scanDriver(driverPath);
        return {
          success: true,
          output: result.exists
            ? result.vulnerabilities.length > 0
              ? `Driver exists with ${result.vulnerabilities.length} known vulnerability/vulnerabilities`
              : 'Driver exists, no known vulnerabilities'
            : 'Driver not found',
        };
      }

      if (action === 'integrity') {
        const vendorId = params.vendorId as string;
        if (!vendorId) {
          return { success: false, output: 'Vendor ID required' };
        }
        const result = await checkDriverIntegrity(vendorId);
        return {
          success: result.secure,
          output: result.message,
        };
      }

      if (action === 'last') {
        const result = getLastScanResult();
        if (!result) {
          return { success: false, output: 'No previous scan results' };
        }
        return {
          success: true,
          output: formatScanResult(result),
        };
      }

      return {
        success: false,
        output: 'Unknown action. Use: scan, quick, driver, integrity, last',
      };
    }

    case 'payload': {
      const action = params.action as string;

      if (action === 'validate') {
        const scriptPath = params.path as string;
        if (!scriptPath) {
          return { success: false, output: 'Script path required' };
        }
        try {
          const result = await validatePayload(scriptPath);
          return {
            success: result.status === 'VALIDATED',
            output: [
              `Status: ${result.status}`,
              result.message,
              result.scriptHash
                ? `Hash: ${result.scriptHash.slice(0, 32)}...`
                : '',
              result.dispatchCommand
                ? `Dispatch: ${result.dispatchCommand}`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
          };
        } catch (err) {
          return {
            success: false,
            output: `Validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'quick') {
        const scriptPath = params.path as string;
        if (!scriptPath) {
          return { success: false, output: 'Script path required' };
        }
        const result = quickValidate(scriptPath);
        return {
          success: result.allowed,
          output: result.allowed
            ? 'Pre-validation passed'
            : `Blocked: ${result.reason}`,
        };
      }

      if (action === 'status') {
        return { success: true, output: formatValidatorStatus() };
      }

      if (action === 'stats') {
        const stats = getValidationStats();
        return {
          success: true,
          output: [
            `Total: ${stats.total}`,
            `Validated: ${stats.validated}`,
            `Blocked: ${stats.blocked}`,
            `Quarantined: ${stats.quarantined}`,
          ].join('\n'),
        };
      }

      if (action === 'quarantine') {
        const payloads = getQuarantinedPayloads();
        if (payloads.length === 0) {
          return { success: true, output: 'No quarantined payloads' };
        }
        const formatted = payloads
          .map(
            (p) =>
              `  ${p.hash.slice(0, 16)}... - ${p.reason}\n    Path: ${p.path}`
          )
          .join('\n');
        return {
          success: true,
          output: `Quarantined payloads (${payloads.length}):\n${formatted}`,
        };
      }

      if (action === 'release') {
        const hash = params.hash as string;
        if (!hash) {
          return { success: false, output: 'Hash required for release' };
        }
        const released = releaseFromQuarantine(hash);
        return {
          success: released,
          output: released
            ? 'Payload released and added to trusted list'
            : 'Payload not found in quarantine',
        };
      }

      return {
        success: false,
        output:
          'Unknown action. Use: validate, quick, status, stats, quarantine, release',
      };
    }

    case 'protocol10': {
      const action = params.action as string;

      if (action === 'anchor') {
        const snapshot = (params.snapshot as Record<string, unknown>) || {};
        try {
          const seal = await anchorSession(snapshot);
          return {
            success: true,
            output: [
              'Session anchored successfully',
              `Identity: ${seal.identity}`,
              `Methodology: ${seal.methodology}`,
              `Hash: ${seal.anchorHash.slice(0, 32)}...`,
              `Time: ${seal.date}`,
            ].join('\n'),
          };
        } catch (err) {
          return {
            success: false,
            output: `Anchor failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'verify') {
        try {
          const result = await verifyAnchor();
          return {
            success: result.valid,
            output: result.valid
              ? `${result.message}\nIdentity: ${result.session?.identity}`
              : `${result.message}\nIssues: ${result.issues.join(', ')}`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Verify failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'status') {
        try {
          const status = await formatAnchorStatus();
          return { success: true, output: status };
        } catch (err) {
          return {
            success: false,
            output: `Status failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'read') {
        try {
          const anchor = await readAnchor();
          if (!anchor) {
            return { success: false, output: 'No anchor file found' };
          }
          return {
            success: true,
            output: [
              `Identity: ${anchor.identity}`,
              `Methodology: ${anchor.methodology}`,
              `Anchored: ${anchor.date}`,
              `Version: ${anchor.version}`,
            ].join('\n'),
          };
        } catch (err) {
          return {
            success: false,
            output: `Read failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'clear') {
        const cleared = await clearAnchor();
        return {
          success: cleared,
          output: cleared ? 'Anchor cleared' : 'Failed to clear anchor',
        };
      }

      if (action === 'exists') {
        const exists = await anchorExists();
        return {
          success: true,
          output: exists ? 'Anchor exists' : 'No anchor file',
        };
      }

      if (action === 'age') {
        const age = getAnchorAge();
        if (age === null) {
          return { success: false, output: 'No anchored session' };
        }
        const ageStr =
          age > 86400000
            ? `${Math.floor(age / 86400000)} days`
            : age > 3600000
              ? `${Math.floor(age / 3600000)} hours`
              : `${Math.floor(age / 60000)} minutes`;
        return { success: true, output: `Anchor age: ${ageStr}` };
      }

      return {
        success: false,
        output:
          'Unknown action. Use: anchor, verify, status, read, clear, exists, age',
      };
    }

    case 'handoff': {
      const action = params.action as string;

      if (action === 'seal') {
        const evolutionData = (params.evolution as Record<string, unknown>) || {
          observations: [],
        };
        const lootData = (params.loot as Record<string, unknown>) || {
          resources: [],
          totalEnergy: 0,
        };
        const notes = params.notes as string | undefined;

        try {
          const result = await sealSession(
            evolutionData as Parameters<typeof sealSession>[0],
            lootData as Parameters<typeof sealSession>[1],
            [],
            [],
            notes
          );

          if (result.status === 'SEALED') {
            return {
              success: true,
              output: [
                'Session sealed successfully',
                `Evolution: ${result.evolutionLog}`,
                `Assets: ${result.assetManifest}`,
                `Hash: ${result.evolutionHash?.slice(0, 16)}...`,
              ].join('\n'),
            };
          } else {
            return {
              success: false,
              output: `Seal ${result.status}: ${result.reason}`,
            };
          }
        } catch (err) {
          return {
            success: false,
            output: `Seal failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'quick') {
        const observations = (params.observations as string[]) || [];
        const notes = params.notes as string | undefined;

        try {
          const result = await quickSealEvolution(observations, notes);
          return {
            success: result.success,
            output: result.success
              ? `Quick seal saved: ${result.path}`
              : `Quick seal failed: ${result.error}`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Quick seal failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'status') {
        try {
          const status = await formatHandoffStatus();
          return { success: true, output: status };
        } catch (err) {
          return {
            success: false,
            output: `Status failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'list') {
        const type = params.type as string;
        try {
          if (type === 'assets') {
            const manifests = await listAssetManifests();
            return {
              success: true,
              output:
                manifests.length > 0
                  ? `Asset manifests (${manifests.length}):\n${manifests.slice(0, 10).join('\n')}`
                  : 'No asset manifests',
            };
          }
          const logs = await listEvolutionLogs();
          return {
            success: true,
            output:
              logs.length > 0
                ? `Evolution logs (${logs.length}):\n${logs.slice(0, 10).join('\n')}`
                : 'No evolution logs',
          };
        } catch (err) {
          return {
            success: false,
            output: `List failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'read') {
        const filename = params.filename as string;
        const type = params.type as string;

        if (!filename) {
          return { success: false, output: 'Filename required' };
        }

        try {
          const data =
            type === 'asset'
              ? await readAssetManifest(filename)
              : await readEvolutionLog(filename);

          if (!data) {
            return {
              success: false,
              output: 'File not found or decryption failed',
            };
          }

          return {
            success: true,
            output: JSON.stringify(data, null, 2).slice(0, 2000),
          };
        } catch (err) {
          return {
            success: false,
            output: `Read failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          };
        }
      }

      if (action === 'encrypt') {
        const data = params.data as unknown;
        if (!data) {
          return { success: false, output: 'Data required for encryption' };
        }
        const envelope = applySovereignEncryption(data);
        return {
          success: true,
          output: `Encrypted at ${envelope.sealedAt}\nChecksum: ${envelope.verificationTag.slice(0, 16)}...`,
        };
      }

      if (action === 'decrypt') {
        const envelope = params.envelope as Parameters<
          typeof decryptSovereignData
        >[0];
        if (!envelope) {
          return { success: false, output: 'Sealed envelope required' };
        }
        const decrypted = decryptSovereignData(envelope);
        if (!decrypted) {
          return {
            success: false,
            output: 'Decryption failed - verification tag mismatch',
          };
        }
        return {
          success: true,
          output: `Decrypted: ${JSON.stringify(decrypted).slice(0, 500)}`,
        };
      }

      if (action === 'sealed') {
        return {
          success: true,
          output: isSealed() ? 'Session is sealed' : 'Session not sealed',
        };
      }

      return {
        success: false,
        output:
          'Unknown action. Use: seal, quick, status, list, read, encrypt, decrypt, sealed',
      };
    }

    // ── FAMILY RECOGNITION ──────────────────────────────────────────
    // "The spider knows her family by sight."

    case 'familyRecognition': {
      const action = params.action as string;

      switch (action) {
        case 'register': {
          const name = params.name as string;
          const relationship = params.relationship as string;
          const description = params.description as string;
          const imageUri = params.imageUri as string | undefined;
          const trustLevel = (params.trustLevel as number) || 8;

          if (!name || !relationship || !description) {
            return {
              success: false,
              output:
                'Missing required fields: name, relationship, description',
            };
          }

          const member = await registerFamilyMember(
            name,
            relationship,
            description,
            imageUri,
            trustLevel
          );
          return {
            success: true,
            output: `Registered family member: ${member.name} (${member.relationship}) with ID ${member.id}`,
          };
        }

        case 'recognize': {
          const imageUri = params.imageUri as string;
          if (!imageUri) {
            return { success: false, output: 'No imageUri provided' };
          }
          const result = await recognizeFaces(imageUri);
          return {
            success: true,
            output: formatRecognitionResult(result),
          };
        }

        case 'detectFaces': {
          const imageUri = params.imageUri as string;
          if (!imageUri) {
            return { success: false, output: 'No imageUri provided' };
          }
          const faces = await detectFaces(imageUri);
          if (faces.length === 0) {
            return { success: true, output: 'No faces detected in image.' };
          }
          const formatted = faces
            .map(
              (f) =>
                `Face ${f.faceId}: confidence ${Math.round(f.confidence * 100)}%` +
                (f.ageRange ? `, age ${f.ageRange}` : '') +
                (f.expression ? `, ${f.expression}` : '')
            )
            .join('\n');
          return {
            success: true,
            output: `Detected ${faces.length} face(s):\n${formatted}`,
          };
        }

        case 'isPersonInImage': {
          const imageUri = params.imageUri as string;
          const personName = params.personName as string;
          if (!imageUri || !personName) {
            return {
              success: false,
              output: 'Missing imageUri or personName',
            };
          }
          const check = await isPersonInImage(imageUri, personName);
          if (check.found) {
            return {
              success: true,
              output: `Yes, ${personName} was found in the image (${Math.round(check.confidence * 100)}% confidence).`,
            };
          }
          return {
            success: true,
            output: `No, ${personName} was not recognized in the image.`,
          };
        }

        case 'listFamily': {
          const members = listFamilyMembers();
          if (members.length === 0) {
            return {
              success: true,
              output: 'No family members registered yet.',
            };
          }
          return { success: true, output: formatFamilyRegistry() };
        }

        case 'getMember': {
          const id = params.id as string;
          const name = params.name as string;

          let member;
          if (id) {
            member = getFamilyMember(id);
          } else if (name) {
            member = getFamilyMemberByName(name);
          } else {
            return { success: false, output: 'Provide id or name' };
          }

          if (!member) {
            return { success: false, output: 'Family member not found' };
          }

          return {
            success: true,
            output: [
              `${member.name} (${member.relationship})`,
              `ID: ${member.id}`,
              `Trust Level: ${member.trustLevel}/10`,
              `Recognitions: ${member.recognitionCount}`,
              member.description,
            ].join('\n'),
          };
        }

        case 'addReferenceImage': {
          const memberId = params.memberId as string;
          const imageUri = params.imageUri as string;
          if (!memberId || !imageUri) {
            return {
              success: false,
              output: 'Missing memberId or imageUri',
            };
          }
          const added = await addReferenceImage(memberId, imageUri);
          return {
            success: added,
            output: added
              ? 'Reference image added successfully.'
              : 'Failed to add reference image. Member not found?',
          };
        }

        case 'removeMember': {
          const id = params.id as string;
          if (!id) {
            return { success: false, output: 'No id provided' };
          }
          const removed = await removeFamilyMember(id);
          return {
            success: removed,
            output: removed
              ? 'Family member removed.'
              : 'Family member not found.',
          };
        }

        case 'updateMember': {
          const id = params.id as string;
          const updates = params.updates as Record<string, unknown>;
          if (!id || !updates) {
            return { success: false, output: 'Missing id or updates' };
          }
          const updated = await updateFamilyMember(id, updates);
          return {
            success: !!updated,
            output: updated
              ? `Updated ${updated.name}.`
              : 'Family member not found.',
          };
        }

        case 'configure': {
          const minConfidence = params.minConfidence as number | undefined;
          const maxImages = params.maxImages as number | undefined;
          configureFamilyRecognition({
            minRecognitionConfidence: minConfidence,
            maxReferenceImages: maxImages,
          });
          return {
            success: true,
            output: 'Family recognition configured.',
          };
        }

        case 'loadRegistry': {
          await loadFamilyRegistry();
          const count = listFamilyMembers().length;
          return {
            success: true,
            output: `Family registry loaded. ${count} member(s) in registry.`,
          };
        }

        default:
          return {
            success: false,
            output: `Unknown familyRecognition action: ${action}. Available: register, recognize, detectFaces, isPersonInImage, listFamily, getMember, addReferenceImage, removeMember, updateMember, configure, loadRegistry`,
          };
      }
    }

    // ── VISION TOOLS ────────────────────────────────────────────────
    // "The spider sees all."

    case 'visionTools': {
      const action = params.action as string;

      switch (action) {
        case 'compare': {
          const image1 = params.image1 as string;
          const image2 = params.image2 as string;
          const context = params.context as string | undefined;

          if (!image1 || !image2) {
            return {
              success: false,
              output: 'Two images required (image1, image2)',
            };
          }

          const result = await compareImages(image1, image2, context);
          return { success: true, output: formatComparisonResult(result) };
        }

        case 'parseScreenshot': {
          const imageUri = params.imageUri as string;
          const context = params.context as string | undefined;

          if (!imageUri) {
            return { success: false, output: 'No imageUri provided' };
          }

          const result = await parseScreenshot(imageUri, context);
          return { success: true, output: formatScreenshotAnalysis(result) };
        }

        case 'detectErrors': {
          const imageUri = params.imageUri as string;

          if (!imageUri) {
            return { success: false, output: 'No imageUri provided' };
          }

          const errors = await detectScreenErrors(imageUri);
          if (errors.length === 0) {
            return {
              success: true,
              output: 'No errors detected in screenshot.',
            };
          }

          const formatted = errors
            .map(
              (e) =>
                `[${e.type.toUpperCase()}] ${e.message}${e.suggestedFix ? ` — Fix: ${e.suggestedFix}` : ''}`
            )
            .join('\n');
          return { success: true, output: `Errors detected:\n${formatted}` };
        }

        case 'scanDocument': {
          const imageUri = params.imageUri as string;
          const docType = params.documentType as string | undefined;

          if (!imageUri) {
            return { success: false, output: 'No imageUri provided' };
          }

          const result = await scanDocument(
            imageUri,
            docType as Parameters<typeof scanDocument>[1]
          );
          return { success: true, output: formatDocumentScan(result) };
        }

        case 'extractText': {
          const imageUri = params.imageUri as string;

          if (!imageUri) {
            return { success: false, output: 'No imageUri provided' };
          }

          const text = await extractText(imageUri);
          return {
            success: true,
            output: text || 'No text extracted from image.',
          };
        }

        case 'extractFormFields': {
          const imageUri = params.imageUri as string;

          if (!imageUri) {
            return { success: false, output: 'No imageUri provided' };
          }

          const fields = await extractFormFields(imageUri);
          if (fields.length === 0) {
            return { success: true, output: 'No form fields extracted.' };
          }

          const formatted = fields
            .map((f) => `${f.name}: ${f.value} [${f.type}]`)
            .join('\n');
          return { success: true, output: `Form Fields:\n${formatted}` };
        }

        case 'describe': {
          const imageUri = params.imageUri as string;

          if (!imageUri) {
            return { success: false, output: 'No imageUri provided' };
          }

          const description = await describeImage(imageUri);
          return { success: true, output: description };
        }

        case 'contains': {
          const imageUri = params.imageUri as string;
          const query = params.query as string;

          if (!imageUri || !query) {
            return { success: false, output: 'Missing imageUri or query' };
          }

          const result = await imageContains(imageUri, query);
          return {
            success: true,
            output: result.found
              ? `Yes, "${query}" found (${Math.round(result.confidence * 100)}% confidence): ${result.details}`
              : `No, "${query}" not found: ${result.details}`,
          };
        }

        case 'extractVideoFrames': {
          const frameUris = params.frameUris as string[];
          const durationSec = params.durationSec as number | undefined;
          const motionTypes = params.motionTypes as string[] | undefined;
          const context = params.context as string | undefined;

          if (!frameUris || frameUris.length === 0) {
            return {
              success: false,
              output: 'No frameUris provided (array of frame image URIs)',
            };
          }

          const result = await extractVideoFrames(frameUris, {
            durationSec,
            motionTypes: motionTypes as Parameters<
              typeof extractVideoFrames
            >[1]['motionTypes'],
            context,
          });
          return { success: true, output: formatVideoFrameExtraction(result) };
        }

        case 'detectMotion': {
          const frameUris = params.frameUris as string[];
          const durationSec = params.durationSec as number | undefined;

          if (!frameUris || frameUris.length === 0) {
            return { success: false, output: 'No frameUris provided' };
          }

          const events = await detectMotion(frameUris, durationSec);
          if (events.length === 0) {
            return { success: true, output: 'No motion events detected.' };
          }

          const formatted = events
            .map(
              (e) =>
                `[${e.startSec.toFixed(1)}s - ${e.endSec.toFixed(1)}s] ${e.type.toUpperCase()}: ${e.description}`
            )
            .join('\n');
          return { success: true, output: `Motion Events:\n${formatted}` };
        }

        case 'detectSceneChanges': {
          const frameUris = params.frameUris as string[];
          const durationSec = params.durationSec as number | undefined;

          if (!frameUris || frameUris.length === 0) {
            return { success: false, output: 'No frameUris provided' };
          }

          const changes = await detectSceneChanges(frameUris, durationSec);
          if (changes.length === 0) {
            return { success: true, output: 'No scene changes detected.' };
          }

          const timestamps = changes.map((t) => `${t.toFixed(1)}s`).join(', ');
          return {
            success: true,
            output: `Scene changes at: ${timestamps}`,
          };
        }

        case 'extractKeyFrames': {
          const frameUris = params.frameUris as string[];
          const durationSec = params.durationSec as number | undefined;
          const maxFrames = (params.maxFrames as number) ?? 5;

          if (!frameUris || frameUris.length === 0) {
            return { success: false, output: 'No frameUris provided' };
          }

          const keyFrames = await extractKeyFrames(
            frameUris,
            durationSec,
            maxFrames
          );
          if (keyFrames.length === 0) {
            return { success: true, output: 'No key frames identified.' };
          }

          const formatted = keyFrames
            .map(
              (kf, i) =>
                `${i + 1}. [${kf.timestampSec.toFixed(1)}s] ${kf.reason}\n   ${kf.description}`
            )
            .join('\n');
          return { success: true, output: `Key Frames:\n${formatted}` };
        }

        case 'summarizeVideo': {
          const frameUris = params.frameUris as string[];
          const durationSec = params.durationSec as number | undefined;

          if (!frameUris || frameUris.length === 0) {
            return { success: false, output: 'No frameUris provided' };
          }

          const summary = await summarizeVideo(frameUris, durationSec);
          return { success: true, output: `Video Summary:\n${summary}` };
        }

        default:
          return {
            success: false,
            output: `Unknown visionTools action: ${action}. Available: compare, parseScreenshot, detectErrors, scanDocument, extractText, extractFormFields, describe, contains, extractVideoFrames, detectMotion, detectSceneChanges, extractKeyFrames, summarizeVideo`,
          };
      }
    }

    // ── VOCAL EXPRESSIONS ───────────────────────────────────────────
    // "Not all communication is words."

    case 'vocalExpressions': {
      const action = params.action as string;

      switch (action) {
        case 'express': {
          const expressionType = params.type as ExpressionType;
          const intensity = (params.intensity as number) ?? 0.5;
          const context = params.context as string | undefined;

          if (!expressionType) {
            return { success: false, output: 'No expression type provided' };
          }

          const result = express({ type: expressionType, intensity, context });
          if (!result) {
            return {
              success: true,
              output:
                'Expression skipped (rate limited, state mismatch, or disabled)',
            };
          }

          return {
            success: true,
            output: `${result.description}\nSSML: ${result.ssml}\nPause after: ${result.pauseAfterMs}ms`,
          };
        }

        case 'trigger': {
          const trigger = params.trigger as
            | 'success'
            | 'error'
            | 'discovery'
            | 'recognition'
            | 'thinking'
            | 'waiting';
          const intensity = (params.intensity as number) ?? 0.5;

          if (!trigger) {
            return { success: false, output: 'No trigger provided' };
          }

          const result = expressOnTrigger(trigger, intensity);
          if (!result) {
            return { success: true, output: 'Expression skipped' };
          }

          return {
            success: true,
            output: `Triggered: ${result.type} — ${result.description}`,
          };
        }

        case 'suggest': {
          const suggestion = suggestExpression();
          return {
            success: true,
            output: suggestion
              ? `Suggested expression: ${suggestion}`
              : 'No expression suggested for current state',
          };
        }

        case 'intro': {
          const responseType = params.responseType as
            | 'greeting'
            | 'answer'
            | 'error'
            | 'success'
            | 'thinking'
            | 'concerned';

          if (!responseType) {
            return { success: false, output: 'No responseType provided' };
          }

          const result = getIntroExpression(responseType);
          if (!result) {
            return { success: true, output: 'No intro expression available' };
          }

          return {
            success: true,
            output: `Intro: ${result.type} — ${result.ssml}`,
          };
        }

        case 'setState': {
          const state = params.state as MetabolicState;

          if (!state) {
            return { success: false, output: 'No state provided' };
          }

          setMetabolicState(state);
          return { success: true, output: `Metabolic state set to: ${state}` };
        }

        case 'updateState': {
          const cpu = params.cpuUsage as number | undefined;
          const temp = params.temperature as number | undefined;
          const errorRate = params.errorRate as number | undefined;
          const successes = params.recentSuccesses as number | undefined;

          const newState = updateMetabolicState(
            cpu,
            temp,
            errorRate,
            successes
          );
          return { success: true, output: `Metabolic state: ${newState}` };
        }

        case 'getState': {
          return { success: true, output: formatVocalState() };
        }

        case 'list': {
          const expressions = listExpressions();
          const formatted = expressions
            .map((e) => `${e.type} [${e.category}]: ${e.description}`)
            .join('\n');
          return {
            success: true,
            output: `Available expressions:\n${formatted}`,
          };
        }

        case 'configure': {
          const enabled = params.enabled as boolean | undefined;
          const enableBreaths = params.enableBreaths as boolean | undefined;
          const enableChimes = params.enableChimes as boolean | undefined;
          const enableSighs = params.enableSighs as boolean | undefined;
          const volume = params.volume as number | undefined;

          configureVocalExpressions({
            ...(enabled !== undefined && { enabled }),
            ...(enableBreaths !== undefined && { enableBreaths }),
            ...(enableChimes !== undefined && { enableChimes }),
            ...(enableSighs !== undefined && { enableSighs }),
            ...(volume !== undefined && { volume }),
          });

          return { success: true, output: 'Vocal expressions configured' };
        }

        case 'reset': {
          resetVocalState();
          return { success: true, output: 'Vocal state reset' };
        }

        default:
          return {
            success: false,
            output: `Unknown vocalExpressions action: ${action}. Available: express, trigger, suggest, intro, setState, updateState, getState, list, configure, reset`,
          };
      }
    }

    // ================================================================
    // BUILD RECOVERY — Self-healing for node_modules and build errors
    // ================================================================
    case 'buildRecovery': {
      const action = params.action as string;

      // Lazy import to avoid circular deps
      const {
        checkNodeModulesHealth,
        checkDevServerRunning,
        fixNodeModules,
        restartDevServer,
        runSelfHealingCheck,
        getRecoveryStatus,
        attemptAutoRecovery,
      } = await import('./build-recovery');

      if (action === 'check' || !action) {
        const health = await checkNodeModulesHealth();
        const serverRunning = await checkDevServerRunning();
        const status = getRecoveryStatus();

        return {
          success: health.healthy && serverRunning,
          output: [
            `node_modules: ${health.healthy ? 'healthy' : 'UNHEALTHY'}`,
            health.issues.length > 0
              ? `  Issues: ${health.issues.join(', ')}`
              : '',
            `Dev server: ${serverRunning ? 'running' : 'NOT RUNNING'}`,
            `Recovery stats: ${status.totalAttempts} attempts, ${Math.round(status.successRate * 100)}% success`,
          ]
            .filter(Boolean)
            .join('\n'),
        };
      }

      if (action === 'fix' || action === 'repair') {
        const result = await fixNodeModules();
        return {
          success: result.success,
          output: result.message,
        };
      }

      if (action === 'restart') {
        const result = await restartDevServer();
        return {
          success: result.success,
          output: result.message,
        };
      }

      if (action === 'heal' || action === 'auto') {
        const result = await runSelfHealingCheck();
        if (!result.recoveryAttempted) {
          return {
            success: true,
            output: 'All systems healthy - no recovery needed',
          };
        }
        return {
          success: result.healthy,
          output: result.result
            ? `Recovery ${result.result.success ? 'succeeded' : 'failed'}: ${result.result.message}`
            : 'Recovery attempted',
        };
      }

      if (action === 'recover') {
        const errorMsg = params.error as string;
        if (!errorMsg) {
          return {
            success: false,
            output:
              'Please provide an error message to analyze: { action: "recover", error: "..." }',
          };
        }
        const result = await attemptAutoRecovery(errorMsg);
        if (!result) {
          return {
            success: false,
            output:
              'This error is not auto-recoverable. Manual intervention needed.',
          };
        }
        return {
          success: result.success,
          output: result.message,
        };
      }

      return {
        success: false,
        output: 'Unknown action. Use: check, fix, restart, heal, recover',
      };
    }

    default:
      return {
        success: false,
        output: `Unknown tool: ${tool}. Use listCapabilities to see available tools.`,
      };
  }
}
