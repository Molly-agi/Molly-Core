/**
 * @fileOverview Security Tool Handlers
 *
 * Extracted from tool-executor.ts for cleaner modular organization.
 * Handles chromakey (shroud tunnel), hardware fingerprinting,
 * data purity, HSL shroud, imgsys scanning, and payload validation.
 */

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
} from '../chromakey-bridge';
import {
  getHardwareFingerprint,
  getHardwareSummary,
  verifyHardware,
  formatHardwareFingerprint,
} from '../hardware-fingerprint';
import {
  auditPacket,
  auditStream,
  quickPurityCheck,
  isSecurityRelevant,
  getAuditStats,
  formatPurityResult,
} from '../safety/data-purity';
import {
  shroudData,
  generateShroudSignature,
  encodeForTransmission,
  verifyShroudedPayload,
  calculateResonance,
  formatHSLStatus,
  configureHSL,
  resetSessionPhase,
} from '../hsl-shroud-math';
import {
  scanSystemVulnerabilities,
  scanDriver,
  checkDriverIntegrity,
  quickSecurityAssessment,
  formatScanResult,
  getLastScanResult,
} from '../imgsys-detector';
import {
  validatePayload,
  quickValidate,
  getValidationStats,
  getQuarantinedPayloads,
  releaseFromQuarantine,
  formatValidatorStatus,
} from '../safety/payload-validator';
import type { ToolResult, ToolHandlerMap } from './types';

async function handleChromakey(
  params: Record<string, unknown>
): Promise<ToolResult> {
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
    if (!level || !['whisper', 'shadow', 'ghost', 'phantom'].includes(level)) {
      return {
        success: false,
        output: 'Invalid shroud level. Use: whisper, shadow, ghost, phantom',
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

async function handleHardware(
  params: Record<string, unknown>
): Promise<ToolResult> {
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

async function handlePurity(
  params: Record<string, unknown>
): Promise<ToolResult> {
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

async function handleHslShroud(
  params: Record<string, unknown>
): Promise<ToolResult> {
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

async function handleImgsys(
  params: Record<string, unknown>
): Promise<ToolResult> {
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

async function handlePayload(
  params: Record<string, unknown>
): Promise<ToolResult> {
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
          result.scriptHash ? `Hash: ${result.scriptHash.slice(0, 32)}...` : '',
          result.dispatchCommand ? `Dispatch: ${result.dispatchCommand}` : '',
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
        (p) => `  ${p.hash.slice(0, 16)}... - ${p.reason}\n    Path: ${p.path}`
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

export const securityToolHandlers: ToolHandlerMap = {
  chromakey: handleChromakey,
  hardware: handleHardware,
  purity: handlePurity,
  hslShroud: handleHslShroud,
  imgsys: handleImgsys,
  payload: handlePayload,
};
