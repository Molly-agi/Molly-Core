'use server';

import fs from 'fs';
import path from 'path';
import { getAdminFirestoreAsync } from '@/firebase/admin';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import type {
  PersonalityModulation,
  MemoryEngram,
} from '@/ai/memory/neural-engram';
import {
  encryptEngramData,
  decryptEngramData,
} from '@/ai/memory/engram-crypto';

// Local personality file path
const LOCAL_PERSONALITY_FILE = path.join(
  process.cwd(),
  '.molly',
  'personality-state.json'
);

// ============================================================================
// PERSONALITY STATE STORAGE STRUCTURE
// ============================================================================
interface EncryptedPersonalityRecord {
  userId: string;
  encrypted: string;
  iv: string;
  authTag: string;
  timestamp: FirebaseFirestore.Timestamp | Date | string;
  version: number;
  lastModifiedBy: string;
}

// Helper to convert various timestamp formats to Date
function toDate(
  timestamp: FirebaseFirestore.Timestamp | Date | string | undefined
): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'string') return new Date(timestamp);
  if (typeof timestamp === 'object' && 'toDate' in timestamp) {
    return timestamp.toDate();
  }
  return undefined;
}

// ============================================================================
// SERVER ACTIONS FOR PERSONALITY MANAGEMENT
// ============================================================================
/**
 * Get current personality state for user (requires password authentication)
 */
export async function getPersonalityState(
  userId: string,
  password?: string
): Promise<{ personality: PersonalityModulation | null; timestamp?: Date }> {
  const traceId = generateTraceId();
  try {
    MollyLogger.info('Retrieving personality state', 'getPersonalityState', {
      userId,
      traceId,
    });

    const db = await getAdminFirestoreAsync();
    if (!db) {
      MollyLogger.warn(
        'Firebase Admin not configured, personality state unavailable',
        'getPersonalityState',
        { userId }
      );
      return { personality: null };
    }

    const docRef = db
      .collection('users')
      .doc(userId)
      .collection('personalityState')
      .doc('current');
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      MollyLogger.warn(
        'No personality state found for user',
        'getPersonalityState',
        { userId }
      );
      return { personality: null };
    }

    const record = docSnap.data() as EncryptedPersonalityRecord;

    // If password is provided, attempt decryption
    if (password) {
      try {
        const decrypted = decryptEngramData(
          record.encrypted,
          userId,
          password,
          record.iv,
          record.authTag
        );
        const personality = JSON.parse(decrypted) as PersonalityModulation;

        MollyLogger.info(
          'Personality state retrieved and decrypted',
          'getPersonalityState',
          { userId, traceId, version: record.version }
        );

        return {
          personality,
          timestamp: toDate(record.timestamp),
        };
      } catch (error) {
        MollyLogger.error(
          'Decryption failed - invalid password',
          'getPersonalityState',
          { userId },
          error
        );
        throw new Error('Invalid password for personality access');
      }
    }

    // Fallback: return encrypted state (client-side decryption needed)
    return { personality: null };
  } catch (error) {
    MollyLogger.error(
      'Failed to get personality state',
      'getPersonalityState',
      { userId, traceId },
      error
    );
    throw error;
  }
}

/**
 * Set personality state (requires password authentication)
 */
export async function setPersonalityState(
  userId: string,
  personality: PersonalityModulation,
  password: string,
  source: string = 'manual'
): Promise<{ success: boolean; timestamp: Date }> {
  const traceId = generateTraceId();
  try {
    MollyLogger.info('Setting personality state', 'setPersonalityState', {
      userId,
      source,
      traceId,
    });

    const db = await getAdminFirestoreAsync();
    if (!db) {
      throw new Error('Firebase Admin not configured');
    }

    // Encrypt the personality data
    const personalityJson = JSON.stringify(personality);
    const { encrypted, iv, authTag } = encryptEngramData(
      personalityJson,
      userId,
      password
    );

    const docRef = db
      .collection('users')
      .doc(userId)
      .collection('personalityState')
      .doc('current');
    const now = new Date();

    const record: EncryptedPersonalityRecord = {
      userId,
      encrypted,
      iv,
      authTag,
      timestamp: now.toISOString(),
      version: 1,
      lastModifiedBy: source,
    };

    await docRef.set(record);

    // Also save to local file for personality-prompt.ts to read
    try {
      const dir = path.dirname(LOCAL_PERSONALITY_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        LOCAL_PERSONALITY_FILE,
        JSON.stringify(personality, null, 2)
      );
      MollyLogger.info(
        'Personality state also saved to local file',
        'setPersonalityState',
        {
          path: LOCAL_PERSONALITY_FILE,
          traceId,
        }
      );
    } catch (localError) {
      MollyLogger.warn(
        'Failed to save personality to local file (non-fatal)',
        'setPersonalityState',
        {
          error:
            localError instanceof Error ? localError.message : 'Unknown error',
          traceId,
        }
      );
    }

    // Log engram of this personality update
    await logPersonalityEngram(userId, password, {
      id: `personality-update-${Date.now()}`,
      content: `Personality state updated via ${source}`,
      timestamp: now,
      emotionalValence: 0.5,
      arousal: 0.5,
      importance: 0.7,
      accessCount: 1,
      lastAccessed: now,
      consolidationState: 'consolidating' as const,
      contextTags: ['personality-update', source],
      relatedEngrams: [],
      personalityContext: personality,
    });

    MollyLogger.info(
      'Personality state set successfully',
      'setPersonalityState',
      { userId, traceId, version: record.version }
    );

    return {
      success: true,
      timestamp: now,
    };
  } catch (error) {
    MollyLogger.error(
      'Failed to set personality state',
      'setPersonalityState',
      { userId, traceId },
      error
    );
    throw error;
  }
}

/**
 * Apply delta (partial modifications) to personality
 */
export async function applyPersonalityDelta(
  userId: string,
  delta: Partial<PersonalityModulation>,
  password: string,
  source: string = 'delta-update'
): Promise<{ success: boolean; personality: PersonalityModulation }> {
  const traceId = generateTraceId();
  try {
    MollyLogger.info('Applying personality delta', 'applyPersonalityDelta', {
      userId,
      source,
      traceId,
      deltaKeys: Object.keys(delta),
    });

    // Get current personality
    const current = await getPersonalityState(userId, password);
    if (!current.personality) {
      throw new Error('No existing personality state to modify');
    }

    // Apply delta
    const updated = { ...current.personality, ...delta };

    // Save updated state
    await setPersonalityState(userId, updated, password, source);

    MollyLogger.info(
      'Personality delta applied successfully',
      'applyPersonalityDelta',
      { userId, traceId }
    );

    return {
      success: true,
      personality: updated,
    };
  } catch (error) {
    MollyLogger.error(
      'Failed to apply personality delta',
      'applyPersonalityDelta',
      { userId, traceId },
      error
    );
    throw error;
  }
}

/**
 * Add manual engram (memory event) with personality context
 */
export async function addManualEngram(
  userId: string,
  engram: Partial<MemoryEngram>,
  password: string,
  includePersonality: boolean = true
): Promise<{ success: boolean; engramId: string }> {
  const traceId = generateTraceId();
  try {
    MollyLogger.info('Adding manual engram', 'addManualEngram', {
      userId,
      traceId,
      contentLength: engram.content?.length,
    });

    const db = await getAdminFirestoreAsync();
    if (!db) {
      throw new Error('Firebase Admin not configured');
    }

    // Get current personality context if requested
    let personalityContext: PersonalityModulation | undefined;
    if (includePersonality) {
      const state = await getPersonalityState(userId, password);
      personalityContext = state.personality || undefined;
    }

    // Create full engram
    const engramId = `engram-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date();

    const fullEngram: MemoryEngram = {
      id: engramId,
      content: engram.content || '',
      timestamp: now,
      emotionalValence: engram.emotionalValence ?? 0.5,
      arousal: engram.arousal ?? 0.5,
      importance: engram.importance ?? 0.5,
      accessCount: 0,
      lastAccessed: now,
      consolidationState: engram.consolidationState ?? 'working',
      contextTags: engram.contextTags ?? [],
      relatedEngrams: engram.relatedEngrams ?? [],
      personalityContext,
    };

    // Encrypt the entire engram
    const engramJson = JSON.stringify(fullEngram);
    const { encrypted, iv, authTag } = encryptEngramData(
      engramJson,
      userId,
      password
    );

    // Store in Firestore
    const docRef = db
      .collection('users')
      .doc(userId)
      .collection('engrams')
      .doc(engramId);

    await docRef.set({
      encrypted,
      iv,
      authTag,
      timestamp: now.toISOString(),
      contentPreview: engram.content?.substring(0, 100) || '',
      importance: fullEngram.importance,
      emotionalValence: fullEngram.emotionalValence,
      consolidationState: fullEngram.consolidationState,
    });

    MollyLogger.info('Engram added successfully', 'addManualEngram', {
      userId,
      engramId,
      traceId,
    });

    return {
      success: true,
      engramId,
    };
  } catch (error) {
    MollyLogger.error(
      'Failed to add manual engram',
      'addManualEngram',
      { userId, traceId },
      error
    );
    throw error;
  }
}

/**
 * Internal helper to log personality changes as engrams
 */
async function logPersonalityEngram(
  userId: string,
  password: string,
  engram: MemoryEngram
): Promise<void> {
  try {
    const db = await getAdminFirestoreAsync();
    if (!db) return;

    const engramId = `personality-log-${Date.now()}`;

    const engramJson = JSON.stringify(engram);
    const { encrypted, iv, authTag } = encryptEngramData(
      engramJson,
      userId,
      password
    );

    const docRef = db
      .collection('users')
      .doc(userId)
      .collection('personalityLogs')
      .doc(engramId);

    await docRef.set({
      encrypted,
      iv,
      authTag,
      timestamp: engram.timestamp.toISOString(),
      contentPreview: engram.content.substring(0, 100),
      importance: engram.importance,
    });

    MollyLogger.debug('Personality engram logged', 'logPersonalityEngram', {
      userId,
      engramId,
    });
  } catch (error) {
    MollyLogger.warn(
      'Failed to log personality engram',
      'logPersonalityEngram',
      { userId },
      error
    );
  }
}
