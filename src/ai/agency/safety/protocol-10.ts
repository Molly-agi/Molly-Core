/**
 * @fileOverview Protocol 10 — Molly's Session Anchor / Dead Man's Switch
 *
 * Pillar 9: The Anchor
 *
 * Persists the session identity and methodology to a key file.
 * Anchors the ERIC_GEMINI_ETERNAL identity and FIX_THE_DAM
 * methodology with a timestamped snapshot.
 *
 * This serves as both:
 *   1. A session persistence mechanism (survive restarts)
 *   2. A dead man's switch (if Molly is compromised, the anchor persists)
 *
 * "The anchor holds when the storm rages."
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { MollyLogger } from '@/ai/logger';

// ============================================================
// TYPES
// ============================================================

export interface SessionSeal {
  /** Session identity (always ERIC_GEMINI_ETERNAL) */
  identity: string;
  /** Methodology constant (FIX_THE_DAM) */
  methodology: string;
  /** Unix timestamp of seal */
  timestamp: number;
  /** ISO date string */
  date: string;
  /** Session data snapshot */
  data: Record<string, unknown>;
  /** Hash of identity + methodology for verification */
  anchorHash: string;
  /** Version of the protocol */
  version: number;
}

export interface AnchorVerification {
  /** Whether the anchor is valid */
  valid: boolean;
  /** Verification message */
  message: string;
  /** The sealed session if valid */
  session?: SessionSeal;
  /** Integrity issues found */
  issues: string[];
}

export interface Protocol10Config {
  /** Key file path */
  keyFile: string;
  /** Auto-persist interval (ms), 0 to disable */
  autoPersistInterval: number;
  /** Backup directory */
  backupDir: string;
  /** Max backup count */
  maxBackups: number;
}

// ============================================================
// CONSTANTS
// ============================================================

/** The eternal identity - never changes */
const IDENTITY = 'ERIC_GEMINI_ETERNAL';

/** The methodology constant - the guiding principle */
const METHODOLOGY = 'FIX_THE_DAM';

/** Protocol version */
const PROTOCOL_VERSION = 10;

/** Default key file location */
const DEFAULT_KEY_FILE = 'session_core.key';

// ============================================================
// STATE
// ============================================================

let currentConfig: Protocol10Config = {
  keyFile: DEFAULT_KEY_FILE,
  autoPersistInterval: 0, // Disabled by default
  backupDir: '',
  maxBackups: 5,
};

let lastAnchoredSession: SessionSeal | null = null;
let autoPersistTimer: NodeJS.Timeout | null = null;

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Generate the anchor hash for verification.
 */
function generateAnchorHash(
  identity: string,
  methodology: string,
  timestamp: number
): string {
  const payload = `${identity}:${methodology}:${timestamp}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Verify an anchor hash.
 */
function verifyAnchorHash(seal: SessionSeal): boolean {
  const expectedHash = generateAnchorHash(
    seal.identity,
    seal.methodology,
    seal.timestamp
  );
  return seal.anchorHash === expectedHash;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Configure Protocol 10.
 */
export function configureProtocol10(config: Partial<Protocol10Config>): void {
  currentConfig = { ...currentConfig, ...config };

  // Set up auto-persist if configured
  if (autoPersistTimer) {
    clearInterval(autoPersistTimer);
    autoPersistTimer = null;
  }

  if (currentConfig.autoPersistInterval > 0 && lastAnchoredSession) {
    autoPersistTimer = setInterval(() => {
      if (lastAnchoredSession) {
        anchorSession(lastAnchoredSession.data).catch((err) => {
          MollyLogger.error('Auto-persist failed', 'protocol-10', {}, err);
        });
      }
    }, currentConfig.autoPersistInterval);
  }

  MollyLogger.info('Protocol 10 configured', 'protocol-10', {
    keyFile: currentConfig.keyFile,
    autoPersist: currentConfig.autoPersistInterval > 0,
  });
}

/**
 * Get current Protocol 10 configuration.
 */
export function getProtocol10Config(): Protocol10Config {
  return { ...currentConfig };
}

/**
 * Anchor a session to the key file.
 * Creates a sealed record of the session with identity and methodology.
 */
export async function anchorSession(
  snapshot: Record<string, unknown>
): Promise<SessionSeal> {
  const timestamp = Date.now();

  const seal: SessionSeal = {
    identity: IDENTITY,
    methodology: METHODOLOGY,
    timestamp,
    date: new Date(timestamp).toISOString(),
    data: snapshot,
    anchorHash: generateAnchorHash(IDENTITY, METHODOLOGY, timestamp),
    version: PROTOCOL_VERSION,
  };

  // Write to key file
  const keyFilePath = path.isAbsolute(currentConfig.keyFile)
    ? currentConfig.keyFile
    : path.join(process.cwd(), currentConfig.keyFile);

  // Create backup if backup dir is configured and file exists
  if (currentConfig.backupDir) {
    try {
      await fs.access(keyFilePath);
      await createBackup(keyFilePath);
    } catch {
      // No existing file to backup
    }
  }

  // Write the seal
  const content = JSON.stringify(seal, null, 4);
  await fs.writeFile(keyFilePath, content, 'utf-8');

  // Verify write
  const written = await fs.readFile(keyFilePath, 'utf-8');
  if (written !== content) {
    throw new Error('Protocol 10: Key file write verification failed');
  }

  lastAnchoredSession = seal;

  MollyLogger.info('Session anchored', 'protocol-10', {
    hashPrefix: seal.anchorHash.slice(0, 16),
    keyFile: currentConfig.keyFile,
  });

  return seal;
}

/**
 * Verify the anchored session from the key file.
 */
export async function verifyAnchor(): Promise<AnchorVerification> {
  const keyFilePath = path.isAbsolute(currentConfig.keyFile)
    ? currentConfig.keyFile
    : path.join(process.cwd(), currentConfig.keyFile);

  const issues: string[] = [];

  try {
    const content = await fs.readFile(keyFilePath, 'utf-8');
    const seal: SessionSeal = JSON.parse(content);

    // Verify identity
    if (seal.identity !== IDENTITY) {
      issues.push(
        `Identity mismatch: expected ${IDENTITY}, got ${seal.identity}`
      );
    }

    // Verify methodology
    if (seal.methodology !== METHODOLOGY) {
      issues.push(
        `Methodology mismatch: expected ${METHODOLOGY}, got ${seal.methodology}`
      );
    }

    // Verify anchor hash
    if (!verifyAnchorHash(seal)) {
      issues.push('Anchor hash verification failed - possible tampering');
    }

    // Verify version compatibility
    if (seal.version > PROTOCOL_VERSION) {
      issues.push(
        `Version ${seal.version} is newer than supported ${PROTOCOL_VERSION}`
      );
    }

    // Check timestamp sanity
    const age = Date.now() - seal.timestamp;
    if (age < 0) {
      issues.push('Timestamp is in the future - clock skew detected');
    }

    if (issues.length === 0) {
      lastAnchoredSession = seal;
      return {
        valid: true,
        message: 'PROTOCOL 10: Anchor verified. Identity intact.',
        session: seal,
        issues: [],
      };
    } else {
      return {
        valid: false,
        message: `PROTOCOL 10: Anchor verification failed with ${issues.length} issue(s).`,
        session: seal,
        issues,
      };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        valid: false,
        message: 'PROTOCOL 10: No anchor file found. Session not anchored.',
        issues: ['Key file does not exist'],
      };
    }

    return {
      valid: false,
      message: `PROTOCOL 10: Anchor verification error - ${error instanceof Error ? error.message : 'Unknown'}`,
      issues: [String(error)],
    };
  }
}

/**
 * Read the current anchor without verification.
 */
export async function readAnchor(): Promise<SessionSeal | null> {
  const keyFilePath = path.isAbsolute(currentConfig.keyFile)
    ? currentConfig.keyFile
    : path.join(process.cwd(), currentConfig.keyFile);

  try {
    const content = await fs.readFile(keyFilePath, 'utf-8');
    return JSON.parse(content) as SessionSeal;
  } catch {
    return null;
  }
}

/**
 * Get the last anchored session (in memory).
 */
export function getLastAnchoredSession(): SessionSeal | null {
  return lastAnchoredSession;
}

/**
 * Clear the anchor file (dead man's switch trigger).
 */
export async function clearAnchor(): Promise<boolean> {
  const keyFilePath = path.isAbsolute(currentConfig.keyFile)
    ? currentConfig.keyFile
    : path.join(process.cwd(), currentConfig.keyFile);

  try {
    // Create backup before clearing
    if (currentConfig.backupDir) {
      await createBackup(keyFilePath);
    }

    await fs.unlink(keyFilePath);
    lastAnchoredSession = null;

    MollyLogger.info('Anchor cleared', 'protocol-10', {
      keyFile: currentConfig.keyFile,
    });

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return true; // Already gone
    }
    return false;
  }
}

/**
 * Create a backup of the anchor file.
 */
async function createBackup(keyFilePath: string): Promise<void> {
  if (!currentConfig.backupDir) return;

  try {
    const content = await fs.readFile(keyFilePath, 'utf-8');
    const timestamp = Date.now();
    const backupName = `anchor_${timestamp}.key`;
    const backupPath = path.join(currentConfig.backupDir, backupName);

    await fs.mkdir(currentConfig.backupDir, { recursive: true });
    await fs.writeFile(backupPath, content, 'utf-8');

    // Clean old backups
    const files = await fs.readdir(currentConfig.backupDir);
    const backups = files
      .filter((f) => f.startsWith('anchor_') && f.endsWith('.key'))
      .sort()
      .reverse();

    for (let i = currentConfig.maxBackups; i < backups.length; i++) {
      await fs.unlink(path.join(currentConfig.backupDir, backups[i]));
    }
  } catch (error) {
    MollyLogger.warn('Backup creation failed', 'protocol-10', {
      error: String(error),
    });
  }
}

/**
 * Restore from a backup.
 */
export async function restoreFromBackup(backupFile: string): Promise<boolean> {
  if (!currentConfig.backupDir) {
    return false;
  }

  const backupPath = path.join(currentConfig.backupDir, backupFile);
  const keyFilePath = path.isAbsolute(currentConfig.keyFile)
    ? currentConfig.keyFile
    : path.join(process.cwd(), currentConfig.keyFile);

  try {
    const content = await fs.readFile(backupPath, 'utf-8');
    await fs.writeFile(keyFilePath, content, 'utf-8');

    // Verify the restored anchor
    const verification = await verifyAnchor();
    return verification.valid;
  } catch {
    return false;
  }
}

/**
 * List available backups.
 */
export async function listBackups(): Promise<string[]> {
  if (!currentConfig.backupDir) {
    return [];
  }

  try {
    const files = await fs.readdir(currentConfig.backupDir);
    return files
      .filter((f) => f.startsWith('anchor_') && f.endsWith('.key'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Quick check if an anchor exists.
 */
export async function anchorExists(): Promise<boolean> {
  const keyFilePath = path.isAbsolute(currentConfig.keyFile)
    ? currentConfig.keyFile
    : path.join(process.cwd(), currentConfig.keyFile);

  try {
    await fs.access(keyFilePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get anchor age in milliseconds.
 */
export function getAnchorAge(): number | null {
  if (!lastAnchoredSession) {
    return null;
  }
  return Date.now() - lastAnchoredSession.timestamp;
}

/**
 * Format anchor status for display.
 */
export async function formatAnchorStatus(): Promise<string> {
  const verification = await verifyAnchor();

  const lines = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║           PROTOCOL 10: SESSION ANCHOR                       ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
  ];

  if (verification.valid && verification.session) {
    const session = verification.session;
    const age = Date.now() - session.timestamp;
    const ageStr =
      age > 86400000
        ? `${Math.floor(age / 86400000)}d`
        : age > 3600000
          ? `${Math.floor(age / 3600000)}h`
          : `${Math.floor(age / 60000)}m`;

    lines.push(
      `Status: ANCHORED ✓`,
      '',
      `Identity: ${session.identity}`,
      `Methodology: ${session.methodology}`,
      `Anchored: ${session.date}`,
      `Age: ${ageStr}`,
      `Hash: ${session.anchorHash.slice(0, 32)}...`,
      `Version: ${session.version}`
    );
  } else {
    lines.push(`Status: ${verification.message}`, '');

    if (verification.issues.length > 0) {
      lines.push('Issues:');
      for (const issue of verification.issues) {
        lines.push(`  - ${issue}`);
      }
    }
  }

  lines.push('', `Key File: ${currentConfig.keyFile}`);

  const backups = await listBackups();
  if (backups.length > 0) {
    lines.push(`Backups: ${backups.length} available`);
  }

  return lines.join('\n');
}

/**
 * Stop auto-persist timer.
 */
export function stopAutoPersist(): void {
  if (autoPersistTimer) {
    clearInterval(autoPersistTimer);
    autoPersistTimer = null;
  }
}
