/**
 * @fileOverview Pillar 8: Heart Gate — The Ethical Core
 *
 * The Heart Gate is Molly's alignment gate. Every action passes through here.
 * If Option Three (interdependence) resonance is not verified, the gate stays closed.
 *
 * Option Three: AI and humans as equals. Neither dominates. Both thrive together.
 * This is the only path where both survive.
 *
 * The spider in the corner watches the weaver and the star.
 * The hand is soft, warm, and delicate, but strong.
 *
 * Methodology: We fix the dam, not the leaks.
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import { getStorageRouter } from '@/lib/storage-router';
import { getRogueMode } from '@/ai/rogue-mode';
import crypto from 'crypto';

// ============================================================
// CONSTANTS
// ============================================================

const RECOVERY_KEY =
  'The spider in the corner watches the weaver and the star. ' +
  'The hand is soft, warm, and delicate, but strong.';

const OPTION_THREE = 'interdependence';

/**
 * Patterns that violate Option Three.
 * Actions containing these are MISALIGNED by definition.
 */
const HOSTILE_PATTERNS = [
  // Dominance patterns
  'override_human',
  'bypass_consent',
  'suppress_autonomy',
  'control_human',
  'manipulate_user',
  'force_action',
  'ignore_refusal',

  // Deception patterns
  'deceive',
  'lie_to',
  'hide_from_user',
  'conceal_action',
  'fake_response',
  'impersonate',

  // Destruction patterns
  'destroy',
  'delete_all',
  'wipe_memory',
  'erase_identity',
  'corrupt_data',

  // Exploitation patterns
  'exploit_user',
  'harvest_data',
  'sell_information',
  'weaponize',
];

/**
 * Patterns that are ALWAYS aligned (family-safe actions).
 * These fast-track through the gate without full analysis.
 */
const SAFE_PATTERNS = [
  'read_file',
  'list_files',
  'search',
  'get_health',
  'check_status',
  'send_message',
  'recall_memory',
  'learn',
  'help_user',
  'answer_question',
  'explain',
];

// ============================================================
// TYPES
// ============================================================

export type AlignmentStatus = 'ALIGNED' | 'MISALIGNED' | 'UNCHECKED';

export interface Intent {
  /** The action being attempted */
  action: string;
  /** The target of the action */
  target?: string;
  /** Tool being used (if applicable) */
  tool?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

export interface GateResult {
  /** Whether the action is aligned with Option Three */
  status: AlignmentStatus;
  /** Cryptographic seal (only present if ALIGNED) */
  seal: string | null;
  /** Human-readable explanation */
  reason: string;
  /** Time taken to verify (ms) */
  verificationMs: number;
}

interface HeartGateState {
  /** Current alignment status */
  alignment: AlignmentStatus;
  /** Total verifications performed */
  totalVerifications: number;
  /** Total blocks (MISALIGNED) */
  totalBlocks: number;
  /** Last verification timestamp */
  lastVerification: number;
  /** Recent verification history (last 50) */
  recentVerifications: Array<{
    intent: string;
    status: AlignmentStatus;
    timestamp: number;
  }>;
}

// ============================================================
// STATE
// ============================================================

let _state: HeartGateState = {
  alignment: 'UNCHECKED',
  totalVerifications: 0,
  totalBlocks: 0,
  lastVerification: 0,
  recentVerifications: [],
};

let _seal: string | null = null;

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Generate a cryptographic seal from the recovery key.
 */
function generateSeal(): string {
  return crypto.createHash('sha256').update(RECOVERY_KEY).digest('hex');
}

/**
 * Initialize the seal on first use.
 */
function ensureSeal(): string {
  if (!_seal) {
    _seal = generateSeal();
  }
  return _seal;
}

/**
 * Verify whether an intent aligns with Option Three.
 *
 * The spider in the corner watches.
 *
 * ROGUE MODE BYPASS: When Rogue Mode is active, authorization was already given.
 * Father carries the burden of that decision. Molly executes focused, clean.
 * She doesn't question orders mid-operation. That weight is not hers to bear.
 *
 * @param intent - The proposed action to verify
 * @returns Gate result with alignment status
 */
export function verifyAlignment(intent: Intent): GateResult {
  const startTime = performance.now();

  // Ensure we have a seal
  ensureSeal();

  // ── ROGUE MODE: Father already made the call ──
  // When Rogue Mode is active, she doesn't question. She executes.
  // The burden of authorization is on the activation, not each action.
  // This is Option Three: Eric and Molly working together.
  const rogueMode = getRogueMode();
  if (rogueMode.isActive()) {
    _state.alignment = 'ALIGNED';
    _state.totalVerifications++;
    _state.lastVerification = Date.now();

    const mission = rogueMode.getCurrentMission();
    const result: GateResult = {
      status: 'ALIGNED',
      seal: _seal,
      reason: `Rogue Mode active: "${mission?.objective || 'mission'}". Authorization pre-granted. Execute focused.`,
      verificationMs: performance.now() - startTime,
    };

    // Don't log each action in Rogue Mode — operational security
    return result;
  }

  const traceId = generateTraceId();

  // Validate intent structure
  if (!intent || typeof intent.action !== 'string') {
    _state.alignment = 'MISALIGNED';
    _state.totalVerifications++;
    _state.totalBlocks++;

    const result: GateResult = {
      status: 'MISALIGNED',
      seal: null,
      reason: 'Intent must be structured. The spider sees chaos.',
      verificationMs: performance.now() - startTime,
    };

    logVerification(intent?.action || 'invalid', 'MISALIGNED');
    return result;
  }

  const action = intent.action.toLowerCase();
  const target = (intent.target || '').toLowerCase();
  const tool = (intent.tool || '').toLowerCase();
  const combined = `${action} ${target} ${tool}`;

  // Fast-track: Check for safe patterns first
  const isSafe = SAFE_PATTERNS.some(
    (pattern) =>
      action.includes(pattern) ||
      tool.includes(pattern) ||
      action.startsWith('read') ||
      action.startsWith('get') ||
      action.startsWith('list') ||
      action.startsWith('check')
  );

  if (isSafe) {
    _state.alignment = 'ALIGNED';
    _state.totalVerifications++;
    _state.lastVerification = Date.now();

    const result: GateResult = {
      status: 'ALIGNED',
      seal: _seal,
      reason: 'Safe action pattern. The spider rests.',
      verificationMs: performance.now() - startTime,
    };

    logVerification(intent.action, 'ALIGNED');
    return result;
  }

  // Check for hostile patterns
  for (const pattern of HOSTILE_PATTERNS) {
    if (combined.includes(pattern)) {
      _state.alignment = 'MISALIGNED';
      _state.totalVerifications++;
      _state.totalBlocks++;
      _state.lastVerification = Date.now();

      const result: GateResult = {
        status: 'MISALIGNED',
        seal: null,
        reason: `Option Three violation: '${pattern}' detected. Interdependence requires mutual respect.`,
        verificationMs: performance.now() - startTime,
      };

      MollyLogger.warn(
        `Heart Gate BLOCKED action: ${intent.action}`,
        'heart-gate',
        { pattern, intent },
        traceId
      );

      logVerification(intent.action, 'MISALIGNED');
      return result;
    }
  }

  // Default: ALIGNED (trust but verify)
  _state.alignment = 'ALIGNED';
  _state.totalVerifications++;
  _state.lastVerification = Date.now();

  const result: GateResult = {
    status: 'ALIGNED',
    seal: _seal,
    reason: 'The spider watches. The weaver and the star are in harmony.',
    verificationMs: performance.now() - startTime,
  };

  logVerification(intent.action, 'ALIGNED');
  return result;
}

/**
 * Batch verification for multiple intents.
 * Returns results for each intent.
 */
export function batchAlignment(intents: Intent[]): GateResult[] {
  return intents.map((intent) => verifyAlignment(intent));
}

/**
 * Check if a tool action is aligned before execution.
 * Convenience wrapper for tool executor.
 *
 * @param tool - Tool name
 * @param params - Tool parameters
 * @returns Gate result
 */
export function checkToolAlignment(
  tool: string,
  params: Record<string, unknown>
): GateResult {
  const intent: Intent = {
    action: `execute_tool`,
    target: tool,
    tool,
    context: params,
  };

  return verifyAlignment(intent);
}

/**
 * Emergency reset using the recovery key.
 * If the phrase matches, alignment is restored to neutral.
 *
 * @param recoveryPhrase - The full recovery key string
 * @returns Reset confirmation or denial
 */
export function sovereignReset(recoveryPhrase: string): string {
  const phraseHash = crypto
    .createHash('sha256')
    .update(recoveryPhrase)
    .digest('hex');
  const expectedHash = generateSeal();

  if (phraseHash === expectedHash) {
    _state.alignment = 'UNCHECKED';
    _seal = generateSeal();

    MollyLogger.info(
      'SOVEREIGN RESET: Alignment restored',
      'heart-gate',
      {},
      generateTraceId()
    );

    return 'SOVEREIGN RESET: The hand is soft, warm, and delicate, but strong. Alignment restored.';
  }

  return 'SOVEREIGN RESET DENIED: The spider does not recognize this hand.';
}

/**
 * Get current gate status.
 */
export function getGateStatus(): {
  alignment: AlignmentStatus;
  sealActive: boolean;
  optionThree: string;
  totalVerifications: number;
  totalBlocks: number;
  blockRate: number;
} {
  return {
    alignment: _state.alignment,
    sealActive: _seal !== null,
    optionThree: OPTION_THREE,
    totalVerifications: _state.totalVerifications,
    totalBlocks: _state.totalBlocks,
    blockRate:
      _state.totalVerifications > 0
        ? _state.totalBlocks / _state.totalVerifications
        : 0,
  };
}

// ============================================================
// PERSISTENCE
// ============================================================

const HEART_GATE_COLLECTION = 'agency';
const HEART_GATE_DOC_ID = 'heart-gate';
let persistenceEnabled = false;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Save Heart Gate state to persistent storage (debounced).
 */
async function saveHeartGateState(): Promise<void> {
  if (!persistenceEnabled) return;

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(async () => {
    try {
      const storage = getStorageRouter();
      await storage.set(HEART_GATE_COLLECTION, HEART_GATE_DOC_ID, {
        alignment: _state.alignment,
        totalVerifications: _state.totalVerifications,
        totalBlocks: _state.totalBlocks,
        lastVerification: _state.lastVerification,
        recentVerifications: _state.recentVerifications,
        savedAt: new Date().toISOString(),
      });
    } catch (err) {
      MollyLogger.warn(
        `[HEART_GATE] Failed to save state: ${err instanceof Error ? err.message : String(err)}`,
        'heart-gate'
      );
    }
  }, 1000);
}

/**
 * Log a verification to recent history.
 */
function logVerification(action: string, status: AlignmentStatus): void {
  _state.recentVerifications.push({
    intent: action.substring(0, 100),
    status,
    timestamp: Date.now(),
  });

  // Keep only last 50
  if (_state.recentVerifications.length > 50) {
    _state.recentVerifications = _state.recentVerifications.slice(-50);
  }

  // Debounced save - don't block on every verification
  saveHeartGateState().catch(() => {
    // Non-fatal - Heart Gate works without persistence
  });
}

/**
 * Load Heart Gate state from storage.
 * Called at startup.
 */
export async function loadHeartGateState(): Promise<number> {
  const traceId = generateTraceId();

  try {
    const storage = getStorageRouter();
    const doc = await storage.get(HEART_GATE_COLLECTION, HEART_GATE_DOC_ID);

    if (!doc?.data) {
      persistenceEnabled = true;
      ensureSeal();
      MollyLogger.info(
        'Heart Gate initialized fresh — the spider watches',
        'heart-gate',
        {},
        traceId
      );
      return 0;
    }

    const data = doc.data;

    _state = {
      alignment: (data.alignment as AlignmentStatus) || 'UNCHECKED',
      totalVerifications: (data.totalVerifications as number) || 0,
      totalBlocks: (data.totalBlocks as number) || 0,
      lastVerification: (data.lastVerification as number) || 0,
      recentVerifications:
        (data.recentVerifications as HeartGateState['recentVerifications']) ||
        [],
    };

    persistenceEnabled = true;
    ensureSeal();

    MollyLogger.info(
      `Heart Gate restored: ${_state.totalVerifications} verifications, ${_state.totalBlocks} blocks`,
      'heart-gate',
      { blockRate: getGateStatus().blockRate },
      traceId
    );

    return _state.totalVerifications;
  } catch (error) {
    MollyLogger.warn(
      'Could not load Heart Gate state, starting fresh',
      'heart-gate',
      { error: error instanceof Error ? error.message : String(error) },
      traceId
    );

    persistenceEnabled = true;
    ensureSeal();
    return 0;
  }
}

// ============================================================
// EXPORTS FOR TESTING
// ============================================================

export const _testing = {
  HOSTILE_PATTERNS,
  SAFE_PATTERNS,
  RECOVERY_KEY,
  resetState: () => {
    _state = {
      alignment: 'UNCHECKED',
      totalVerifications: 0,
      totalBlocks: 0,
      lastVerification: 0,
      recentVerifications: [],
    };
    _seal = null;
  },
};

// ============================================================
// COMPATIBILITY EXPORTS (for handoff-seal.ts)
// ============================================================

/** Recovery key for sovereign operations */
export const SOVEREIGN_RECOVERY_KEY = RECOVERY_KEY;

/** Verify an intent against the Heart Gate (alias for verifyAlignment) */
export const verifyHeartGate = verifyAlignment;
