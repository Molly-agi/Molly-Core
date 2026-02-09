/**
 * @fileOverview Memory Integrity & Vibe Utilities
 *
 * Provides CRC32 checksum calculation for data integrity
 * and vibe scoring for contextual awareness.
 */

/**
 * Calculate CRC32 checksum of a string
 * Used to detect corrupted memory records
 */
export function calculateCRC32(data: string): string {
  // CRC32 polynomial
  const poly = 0xedb88320;
  let crc = 0 ^ -1;

  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ ((crc ^ data.charCodeAt(i)) << 24);
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? poly : 0);
    }
  }

  return ((crc ^ -1) >>> 0).toString(16).padStart(8, '0');
}

/**
 * Verify CRC32 checksum
 */
export function verifyCRC32(data: string, checksum: string): boolean {
  return calculateCRC32(data) === checksum;
}

/**
 * Add CRC32 to a memory record object
 */
export function addChecksum<T extends Record<string, any>>(
  record: T
): T & { crc32: string } {
  // Create a copy without existing CRC
  const { crc32: _, ...recordWithoutCrc } = record;
  const dataStr = JSON.stringify(recordWithoutCrc);
  const checksum = calculateCRC32(dataStr);

  return {
    ...record,
    crc32: checksum,
  };
}

/**
 * Verify record integrity by checking its CRC32
 */
export function verifyRecordIntegrity<T extends Record<string, any>>(
  record: T
): boolean {
  if (!record.crc32) {
    return false; // No checksum to verify
  }

  const crc = record.crc32;
  const { crc32: _, ...recordWithoutCrc } = record;
  const dataStr = JSON.stringify(recordWithoutCrc);
  const calculated = calculateCRC32(dataStr);

  return calculated === crc;
}

/**
 * Vibe scoring function
 * Converts contextual information into a 0-1 score
 * 0 = negative/problematic, 1 = positive/excellent
 */
export interface VibeContext {
  flowName?: string;
  success?: boolean;
  errorOccurred?: boolean;
  temperatureCritical?: boolean;
  timeToComplete?: number; // ms
  userSatisfaction?: number; // 0-1
  contextKeywords?: string[];
}

/**
 * Calculate a vibe score based on context
 */
export function scoreVibe(context: VibeContext): number {
  let score = 0.5; // Neutral baseline

  // Success/failure is primary signal
  if (context.success === true) score += 0.25;
  if (context.success === false) score -= 0.25;
  if (context.errorOccurred === true) score -= 0.15;

  // System health matters
  if (context.temperatureCritical === true) score -= 0.1;
  if (context.temperatureCritical === false) score += 0.05;

  // Speed is a positive signal
  if (context.timeToComplete && context.timeToComplete < 1000) {
    score += 0.1;
  } else if (context.timeToComplete && context.timeToComplete > 10000) {
    score -= 0.05;
  }

  // Direct user satisfaction
  if (context.userSatisfaction !== undefined) {
    score = context.userSatisfaction;
  }

  // Clamp to 0-1
  return Math.max(0, Math.min(1, score));
}

/**
 * Convert vibe score to human-readable sentiment
 */
export function vibeScoreToString(score: number): string {
  if (score >= 0.8) return 'Excellent';
  if (score >= 0.6) return 'Good';
  if (score >= 0.4) return 'Neutral';
  if (score >= 0.2) return 'Concerning';
  return 'Critical';
}

/**
 * Exponential decay function for time-weighted importance
 * Recent memories score higher than old ones
 * halfLife: time in ms until score drops to 50%
 */
export function timeWeightedScore(
  timestamp: number,
  currentTime: number,
  baseScore: number,
  halfLifeMs: number = 7 * 24 * 60 * 60 * 1000 // 1 week default
): number {
  const ageMs = currentTime - timestamp;
  const decay = Math.pow(0.5, ageMs / halfLifeMs);
  return baseScore * decay;
}

/**
 * Combine vibe score with time decay for semantic priority
 */
export function semanticPriority(
  vibeScore: number,
  timestamp: number,
  currentTime: number,
  halfLifeMs?: number
): number {
  const timeWeighted = timeWeightedScore(
    timestamp,
    currentTime,
    vibeScore,
    halfLifeMs
  );
  return timeWeighted;
}
