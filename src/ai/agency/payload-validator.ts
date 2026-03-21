/**
 * @fileOverview Payload Validator — Molly's Execution Gatekeeper
 *
 * Pillar 7: Trust But Verify
 *
 * Validates research scripts against Defense Sentinel status
 * before permitting interaction with secure environments.
 * Execution is denied if the environment is RED (compromised).
 *
 * This ensures Molly never executes untrusted code in a
 * compromised environment where it could be intercepted or
 * manipulated by adversaries.
 *
 * "The spider does not step onto a damaged web."
 */

import path from 'path';
import { promises as fs } from 'fs';
import crypto from 'node:crypto';
import { MollyLogger } from '@/ai/logger';
import { getEnvironmentStatus, SentinelStatus } from './defense-sentinel';

// ============================================================
// TYPES
// ============================================================

export type ValidationStatus =
  | 'VALIDATED'
  | 'BLOCKED'
  | 'QUARANTINED'
  | 'PENDING';

export interface ValidationResult {
  /** Validation status */
  status: ValidationStatus;
  /** Human-readable message */
  message: string;
  /** Script path that was validated */
  scriptPath: string;
  /** SHA-256 hash of the script content */
  scriptHash?: string;
  /** Sentinel status at time of validation */
  sentinelStatus: SentinelStatus;
  /** Timestamp of validation */
  timestamp: number;
  /** Dispatch command if validated */
  dispatchCommand?: string;
}

export interface PayloadConfig {
  /** Allowed script extensions */
  allowedExtensions: string[];
  /** Maximum script size in bytes */
  maxScriptSize: number;
  /** Require script hash verification */
  requireHashVerification: boolean;
  /** Known safe script hashes */
  trustedHashes: Set<string>;
  /** Proot command template */
  prootTemplate: string;
}

export interface QuarantinedPayload {
  /** Script path */
  path: string;
  /** Script hash */
  hash: string;
  /** Reason for quarantine */
  reason: string;
  /** Quarantine timestamp */
  timestamp: number;
}

// ============================================================
// DEFAULT CONFIGURATION
// ============================================================

const DEFAULT_CONFIG: PayloadConfig = {
  allowedExtensions: ['.sh', '.py', '.rb', '.pl', '.js', '.ts'],
  maxScriptSize: 1024 * 1024, // 1MB
  requireHashVerification: false,
  trustedHashes: new Set(),
  prootTemplate: 'proot -0 -w /root/kali-arm64 -b /dev -b /proc -b /sys',
};

// ============================================================
// STATE
// ============================================================

let currentConfig: PayloadConfig = { ...DEFAULT_CONFIG };
const quarantine: QuarantinedPayload[] = [];
const validationHistory: ValidationResult[] = [];

// ============================================================
// VALIDATION FUNCTIONS
// ============================================================

/**
 * Validate a script file before execution.
 */
export async function validatePayload(
  scriptPath: string
): Promise<ValidationResult> {
  const timestamp = Date.now();

  MollyLogger.info('Validating payload', 'payload-validator', { scriptPath });

  // Step 1: Check Defense Sentinel status
  const sentinelStatus = getEnvironmentStatus();

  if (sentinelStatus === 'RED') {
    const result: ValidationResult = {
      status: 'BLOCKED',
      message: 'BLOCK: Defense Sentinel is RED. Execution denied.',
      scriptPath,
      sentinelStatus,
      timestamp,
    };

    validationHistory.push(result);

    MollyLogger.warn('Payload blocked - Sentinel RED', 'payload-validator', {
      scriptPath,
    });

    return result;
  }

  // Step 2: Check file extension
  const ext = path.extname(scriptPath).toLowerCase();
  if (!currentConfig.allowedExtensions.includes(ext)) {
    const result: ValidationResult = {
      status: 'BLOCKED',
      message: `BLOCK: File extension '${ext}' not in allowed list.`,
      scriptPath,
      sentinelStatus,
      timestamp,
    };

    validationHistory.push(result);
    return result;
  }

  // Step 3: Read and hash the script
  let scriptContent: Buffer;
  let scriptHash: string;

  try {
    const stats = await fs.stat(scriptPath);

    if (stats.size > currentConfig.maxScriptSize) {
      const result: ValidationResult = {
        status: 'BLOCKED',
        message: `BLOCK: Script size ${stats.size} exceeds maximum ${currentConfig.maxScriptSize}.`,
        scriptPath,
        sentinelStatus,
        timestamp,
      };

      validationHistory.push(result);
      return result;
    }

    scriptContent = await fs.readFile(scriptPath);
    scriptHash = crypto
      .createHash('sha256')
      .update(scriptContent)
      .digest('hex');
  } catch (error) {
    const result: ValidationResult = {
      status: 'BLOCKED',
      message: `BLOCK: Cannot read script - ${error instanceof Error ? error.message : 'Unknown error'}`,
      scriptPath,
      sentinelStatus,
      timestamp,
    };

    validationHistory.push(result);
    return result;
  }

  // Step 4: Check hash verification if required
  if (
    currentConfig.requireHashVerification &&
    !currentConfig.trustedHashes.has(scriptHash)
  ) {
    // Quarantine the payload
    quarantine.push({
      path: scriptPath,
      hash: scriptHash,
      reason: 'Hash not in trusted list',
      timestamp,
    });

    const result: ValidationResult = {
      status: 'QUARANTINED',
      message: `QUARANTINE: Script hash not in trusted list. Hash: ${scriptHash.slice(0, 16)}...`,
      scriptPath,
      scriptHash,
      sentinelStatus,
      timestamp,
    };

    validationHistory.push(result);

    MollyLogger.warn('Payload quarantined', 'payload-validator', {
      scriptPath,
      hashPrefix: scriptHash.slice(0, 16),
    });

    return result;
  }

  // Step 5: Check for obvious dangers in script content
  const contentStr = scriptContent.toString('utf-8');
  const dangerPatterns = [
    /rm\s+-rf\s+\/[^/]/i,
    /:(){ \|:& };:/,
    /dd\s+if=.*of=\/dev\//i,
    /mkfs\./i,
    />\s*\/dev\/sd[a-z]/i,
  ];

  for (const pattern of dangerPatterns) {
    if (pattern.test(contentStr)) {
      quarantine.push({
        path: scriptPath,
        hash: scriptHash,
        reason: 'Dangerous pattern detected',
        timestamp,
      });

      const result: ValidationResult = {
        status: 'QUARANTINED',
        message: 'QUARANTINE: Dangerous pattern detected in script content.',
        scriptPath,
        scriptHash,
        sentinelStatus,
        timestamp,
      };

      validationHistory.push(result);

      MollyLogger.warn(
        'Payload quarantined - dangerous pattern',
        'payload-validator',
        { scriptPath }
      );

      return result;
    }
  }

  // Step 6: All checks passed - generate dispatch command
  const dispatchCommand = `${currentConfig.prootTemplate} -- ${scriptPath}`;

  const result: ValidationResult = {
    status: 'VALIDATED',
    message: `VALIDATED: Ready for dispatch via ${currentConfig.prootTemplate}`,
    scriptPath,
    scriptHash,
    sentinelStatus,
    timestamp,
    dispatchCommand,
  };

  validationHistory.push(result);

  MollyLogger.info('Payload validated', 'payload-validator', {
    scriptPath,
    hashPrefix: scriptHash.slice(0, 16),
  });

  return result;
}

/**
 * Quick validation check without reading file content.
 */
export function quickValidate(scriptPath: string): {
  allowed: boolean;
  reason: string;
} {
  // Check sentinel status
  const sentinelStatus = getEnvironmentStatus();
  if (sentinelStatus === 'RED') {
    return { allowed: false, reason: 'Defense Sentinel is RED' };
  }

  // Check extension
  const ext = path.extname(scriptPath).toLowerCase();
  if (!currentConfig.allowedExtensions.includes(ext)) {
    return { allowed: false, reason: `Extension '${ext}' not allowed` };
  }

  return { allowed: true, reason: 'Pre-validation passed' };
}

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * Configure the payload validator.
 */
export function configureValidator(config: Partial<PayloadConfig>): void {
  currentConfig = { ...currentConfig, ...config };

  MollyLogger.info('Validator configured', 'payload-validator', {
    allowedExtensions: currentConfig.allowedExtensions,
    requireHashVerification: currentConfig.requireHashVerification,
  });
}

/**
 * Add a trusted hash to the whitelist.
 */
export function addTrustedHash(hash: string): void {
  currentConfig.trustedHashes.add(hash.toLowerCase());
  MollyLogger.info('Trusted hash added', 'payload-validator', {
    hashPrefix: hash.slice(0, 16),
  });
}

/**
 * Remove a hash from the trusted list.
 */
export function removeTrustedHash(hash: string): boolean {
  return currentConfig.trustedHashes.delete(hash.toLowerCase());
}

/**
 * Check if a hash is trusted.
 */
export function isHashTrusted(hash: string): boolean {
  return currentConfig.trustedHashes.has(hash.toLowerCase());
}

/**
 * Get current validator configuration.
 */
export function getValidatorConfig(): PayloadConfig {
  return {
    ...currentConfig,
    trustedHashes: new Set(currentConfig.trustedHashes),
  };
}

// ============================================================
// QUARANTINE MANAGEMENT
// ============================================================

/**
 * Get all quarantined payloads.
 */
export function getQuarantinedPayloads(): QuarantinedPayload[] {
  return [...quarantine];
}

/**
 * Release a payload from quarantine (add to trusted hashes).
 */
export function releaseFromQuarantine(hash: string): boolean {
  const index = quarantine.findIndex((q) => q.hash === hash);
  if (index === -1) {
    return false;
  }

  const released = quarantine.splice(index, 1)[0];
  addTrustedHash(released.hash);

  MollyLogger.info('Payload released from quarantine', 'payload-validator', {
    path: released.path,
    hashPrefix: released.hash.slice(0, 16),
  });

  return true;
}

/**
 * Permanently delete a quarantined payload.
 */
export function deleteFromQuarantine(hash: string): boolean {
  const index = quarantine.findIndex((q) => q.hash === hash);
  if (index === -1) {
    return false;
  }

  const deleted = quarantine.splice(index, 1)[0];

  MollyLogger.info('Payload deleted from quarantine', 'payload-validator', {
    path: deleted.path,
    hashPrefix: deleted.hash.slice(0, 16),
  });

  return true;
}

/**
 * Clear all quarantined payloads.
 */
export function clearQuarantine(): number {
  const count = quarantine.length;
  quarantine.length = 0;
  return count;
}

// ============================================================
// HISTORY & STATS
// ============================================================

/**
 * Get validation history.
 */
export function getValidationHistory(limit = 100): ValidationResult[] {
  return validationHistory.slice(-limit);
}

/**
 * Get validation statistics.
 */
export function getValidationStats(): {
  total: number;
  validated: number;
  blocked: number;
  quarantined: number;
  pending: number;
} {
  const stats = {
    total: validationHistory.length,
    validated: 0,
    blocked: 0,
    quarantined: 0,
    pending: 0,
  };

  for (const result of validationHistory) {
    switch (result.status) {
      case 'VALIDATED':
        stats.validated++;
        break;
      case 'BLOCKED':
        stats.blocked++;
        break;
      case 'QUARANTINED':
        stats.quarantined++;
        break;
      case 'PENDING':
        stats.pending++;
        break;
    }
  }

  return stats;
}

/**
 * Clear validation history.
 */
export function clearValidationHistory(): void {
  validationHistory.length = 0;
}

// ============================================================
// FORMATTING
// ============================================================

/**
 * Format validation result for display.
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines = [
    `Validation Result: ${result.status}`,
    `Script: ${result.scriptPath}`,
    `Message: ${result.message}`,
    `Sentinel Status: ${result.sentinelStatus}`,
    `Timestamp: ${new Date(result.timestamp).toISOString()}`,
  ];

  if (result.scriptHash) {
    lines.push(`Script Hash: ${result.scriptHash.slice(0, 32)}...`);
  }

  if (result.dispatchCommand) {
    lines.push(`Dispatch: ${result.dispatchCommand}`);
  }

  return lines.join('\n');
}

/**
 * Format validator status for display.
 */
export function formatValidatorStatus(): string {
  const stats = getValidationStats();
  const sentinelStatus = getEnvironmentStatus();

  const lines = [
    'Payload Validator Status:',
    `  Sentinel Status: ${sentinelStatus}`,
    `  Validation Ready: ${sentinelStatus === 'GREEN' ? 'YES' : 'NO'}`,
    '',
    'Statistics:',
    `  Total Validations: ${stats.total}`,
    `  Validated: ${stats.validated}`,
    `  Blocked: ${stats.blocked}`,
    `  Quarantined: ${stats.quarantined}`,
    '',
    'Configuration:',
    `  Allowed Extensions: ${currentConfig.allowedExtensions.join(', ')}`,
    `  Max Script Size: ${currentConfig.maxScriptSize} bytes`,
    `  Hash Verification: ${currentConfig.requireHashVerification ? 'REQUIRED' : 'OPTIONAL'}`,
    `  Trusted Hashes: ${currentConfig.trustedHashes.size}`,
    '',
    `Quarantine: ${quarantine.length} payload(s)`,
  ];

  return lines.join('\n');
}
