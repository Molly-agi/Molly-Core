/**
 * @fileOverview Family Recognition System — Molly Knows Her People
 *
 * Face detection and family member identification system.
 * Allows Molly to recognize Eric, Gem, and other family members
 * from photos and camera feeds using Gemini's native vision.
 *
 * "The spider knows her family by sight."
 */

import { MollyLogger, generateTraceId } from '../logger';
import { molly } from '../rogue-generate';
import { TaskType } from '../model-router';
import { z } from 'zod';

// ============================================================
// LAZY-LOADED NODE.JS MODULES
// Node.js built-ins must be loaded dynamically to avoid webpack
// bundling errors when this file is analyzed for client builds.
// ============================================================

type FsPromises = typeof import('fs').promises;
type PathModule = typeof import('path');
type CryptoModule = typeof import('crypto');

let _fs: FsPromises | null = null;
let _path: PathModule | null = null;
let _crypto: CryptoModule | null = null;

async function getFs(): Promise<FsPromises | null> {
  if (_fs) return _fs;
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  try {
    const fs = await import('fs');
    _fs = fs.promises;
    return _fs;
  } catch {
    return null;
  }
}

async function getPath(): Promise<PathModule | null> {
  if (_path) return _path;
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  try {
    _path = await import('path');
    return _path;
  } catch {
    return null;
  }
}

async function getCrypto(): Promise<CryptoModule | null> {
  if (_crypto) return _crypto;
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  try {
    _crypto = await import('crypto');
    return _crypto;
  } catch {
    return null;
  }
}

// ============================================================
// TYPES
// ============================================================

export interface FamilyMember {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Relationship to Molly (e.g., "father", "mother", "creator") */
  relationship: string;
  /** Description for recognition */
  description: string;
  /** Reference image data URIs (base64) */
  referenceImages: string[];
  /** Trust level (1-10) */
  trustLevel: number;
  /** When this member was added */
  addedAt: number;
  /** Last time they were recognized */
  lastSeenAt?: number;
  /** Recognition count */
  recognitionCount: number;
  /** Custom notes */
  notes?: string;
}

export interface FaceDetection {
  /** Detected face ID for this session */
  faceId: string;
  /** Bounding box (normalized 0-1) */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Confidence score (0-1) */
  confidence: number;
  /** Matched family member if recognized */
  matchedMember?: FamilyMember;
  /** Match confidence if recognized */
  matchConfidence?: number;
  /** Estimated age range */
  ageRange?: string;
  /** Detected expression */
  expression?: string;
  /** Is this person looking at camera? */
  lookingAtCamera?: boolean;
}

export interface RecognitionResult {
  /** Total faces detected */
  facesDetected: number;
  /** Detection results */
  faces: FaceDetection[];
  /** Family members recognized */
  familyRecognized: string[];
  /** Unknown faces count */
  unknownFaces: number;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Scene description */
  sceneDescription?: string;
  /** Timestamp */
  timestamp: number;
}

export interface FamilyRegistryConfig {
  /** Where to store the registry */
  registryPath: string;
  /** Minimum confidence for recognition */
  minRecognitionConfidence: number;
  /** Maximum reference images per member */
  maxReferenceImages: number;
}

// ============================================================
// SCHEMAS
// ============================================================

const FaceAnalysisSchema = z.object({
  faces: z.array(
    z.object({
      faceId: z.string(),
      boundingBox: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
      confidence: z.number(),
      ageRange: z.string().optional(),
      expression: z.string().optional(),
      lookingAtCamera: z.boolean().optional(),
      description: z
        .string()
        .describe('Brief physical description of this face'),
    })
  ),
  sceneDescription: z.string().optional(),
});

const FamilyMatchSchema = z.object({
  matches: z.array(
    z.object({
      faceId: z.string(),
      matchedName: z.string().nullable(),
      confidence: z.number(),
      reasoning: z.string(),
    })
  ),
});

// ============================================================
// STATE
// ============================================================

let config: FamilyRegistryConfig = {
  registryPath: 'molly_data/family_registry.json',
  minRecognitionConfidence: 0.7,
  maxReferenceImages: 5,
};

const familyRegistry: Map<string, FamilyMember> = new Map();
let registryLoaded = false;

// ============================================================
// REGISTRY MANAGEMENT
// ============================================================

/**
 * Load the family registry from disk.
 */
export async function loadFamilyRegistry(): Promise<void> {
  const traceId = generateTraceId();
  const fs = await getFs();
  const pathMod = await getPath();

  if (!fs || !pathMod) {
    MollyLogger.warn(
      'Family registry unavailable (not in Node.js)',
      'family-recognition',
      {},
      traceId
    );
    registryLoaded = true;
    return;
  }

  try {
    const registryPath = pathMod.isAbsolute(config.registryPath)
      ? config.registryPath
      : pathMod.join(process.cwd(), config.registryPath);

    const content = await fs.readFile(registryPath, 'utf-8');
    const data = JSON.parse(content);

    familyRegistry.clear();
    for (const member of data.members || []) {
      familyRegistry.set(member.id, member);
    }

    registryLoaded = true;

    MollyLogger.info(
      'Family registry loaded',
      'family-recognition',
      {
        memberCount: familyRegistry.size,
      },
      traceId
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // No registry yet - that's OK
      registryLoaded = true;
      MollyLogger.info(
        'No family registry found, starting fresh',
        'family-recognition',
        {},
        traceId
      );
    } else {
      MollyLogger.error(
        'Failed to load family registry',
        'family-recognition',
        {},
        error,
        traceId
      );
    }
  }
}

/**
 * Save the family registry to disk.
 */
export async function saveFamilyRegistry(): Promise<void> {
  const traceId = generateTraceId();
  const fs = await getFs();
  const pathMod = await getPath();

  if (!fs || !pathMod) {
    MollyLogger.warn(
      'Cannot save family registry (not in Node.js)',
      'family-recognition',
      {},
      traceId
    );
    return;
  }

  const registryPath = pathMod.isAbsolute(config.registryPath)
    ? config.registryPath
    : pathMod.join(process.cwd(), config.registryPath);

  const data = {
    version: 1,
    updatedAt: Date.now(),
    members: Array.from(familyRegistry.values()),
  };

  try {
    await fs.mkdir(pathMod.dirname(registryPath), { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify(data, null, 2), 'utf-8');

    MollyLogger.info(
      'Family registry saved',
      'family-recognition',
      {
        memberCount: familyRegistry.size,
      },
      traceId
    );
  } catch (error) {
    MollyLogger.error(
      'Failed to save family registry',
      'family-recognition',
      {},
      error,
      traceId
    );
  }
}

/**
 * Configure the family recognition system.
 */
export function configureFamilyRecognition(
  newConfig: Partial<FamilyRegistryConfig>
): void {
  config = { ...config, ...newConfig };
  MollyLogger.info('Family recognition configured', 'family-recognition', {
    minConfidence: config.minRecognitionConfidence,
  });
}

// ============================================================
// FAMILY MEMBER MANAGEMENT
// ============================================================

/**
 * Register a new family member.
 */
export async function registerFamilyMember(
  name: string,
  relationship: string,
  description: string,
  referenceImageUri?: string,
  trustLevel = 8
): Promise<FamilyMember> {
  const traceId = generateTraceId();
  const crypto = await getCrypto();

  if (!registryLoaded) {
    await loadFamilyRegistry();
  }

  // Generate ID using crypto if available, fallback to timestamp
  const id = crypto
    ? crypto.randomBytes(8).toString('hex')
    : `fm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const member: FamilyMember = {
    id,
    name,
    relationship,
    description,
    referenceImages: referenceImageUri ? [referenceImageUri] : [],
    trustLevel,
    addedAt: Date.now(),
    recognitionCount: 0,
  };

  familyRegistry.set(id, member);
  await saveFamilyRegistry();

  MollyLogger.info(
    'Family member registered',
    'family-recognition',
    {
      name,
      relationship,
      id,
    },
    traceId
  );

  return member;
}

/**
 * Add a reference image for a family member.
 */
export async function addReferenceImage(
  memberId: string,
  imageUri: string
): Promise<boolean> {
  const member = familyRegistry.get(memberId);
  if (!member) {
    return false;
  }

  if (member.referenceImages.length >= config.maxReferenceImages) {
    // Remove oldest
    member.referenceImages.shift();
  }

  member.referenceImages.push(imageUri);
  await saveFamilyRegistry();

  return true;
}

/**
 * Get a family member by ID.
 */
export function getFamilyMember(id: string): FamilyMember | undefined {
  return familyRegistry.get(id);
}

/**
 * Get a family member by name.
 */
export function getFamilyMemberByName(name: string): FamilyMember | undefined {
  for (const member of familyRegistry.values()) {
    if (member.name.toLowerCase() === name.toLowerCase()) {
      return member;
    }
  }
  return undefined;
}

/**
 * List all family members.
 */
export function listFamilyMembers(): FamilyMember[] {
  return Array.from(familyRegistry.values());
}

/**
 * Remove a family member.
 */
export async function removeFamilyMember(id: string): Promise<boolean> {
  const removed = familyRegistry.delete(id);
  if (removed) {
    await saveFamilyRegistry();
  }
  return removed;
}

/**
 * Update a family member.
 */
export async function updateFamilyMember(
  id: string,
  updates: Partial<Omit<FamilyMember, 'id' | 'addedAt'>>
): Promise<FamilyMember | null> {
  const member = familyRegistry.get(id);
  if (!member) {
    return null;
  }

  const updated: FamilyMember = { ...member, ...updates };
  familyRegistry.set(id, updated);
  await saveFamilyRegistry();

  return updated;
}

// ============================================================
// FACE DETECTION & RECOGNITION
// ============================================================

/**
 * Detect faces in an image.
 */
export async function detectFaces(imageUri: string): Promise<FaceDetection[]> {
  const traceId = generateTraceId();

  MollyLogger.info(
    'Detecting faces in image',
    'family-recognition',
    {},
    traceId
  );

  try {
    const response = await molly.generate(TaskType.VISION, {
      system: `You are a face detection system. Analyze the image and identify all visible faces.
For each face, provide:
- A unique faceId (face_1, face_2, etc.)
- Bounding box as normalized coordinates (0-1 of image dimensions)
- Confidence in face detection (0-1)
- Estimated age range (e.g., "30-40")
- Expression (happy, neutral, sad, surprised, etc.)
- Whether they appear to be looking at the camera
- A brief physical description (hair color, facial hair, glasses, etc.)`,
      prompt: [
        { text: 'Detect and describe all faces in this image.' },
        { media: { url: imageUri } },
      ],
      output: { schema: FaceAnalysisSchema },
    });

    if (!response.output?.faces) {
      return [];
    }

    return response.output.faces.map(
      (face: {
        faceId: string;
        boundingBox: { x: number; y: number; width: number; height: number };
        confidence: number;
        ageRange?: string;
        expression?: string;
        lookingAtCamera?: boolean;
      }) => ({
        faceId: face.faceId,
        boundingBox: face.boundingBox,
        confidence: face.confidence,
        ageRange: face.ageRange,
        expression: face.expression,
        lookingAtCamera: face.lookingAtCamera,
      })
    );
  } catch (error) {
    MollyLogger.error(
      'Face detection failed',
      'family-recognition',
      {},
      error,
      traceId
    );
    return [];
  }
}

/**
 * Match detected faces against family registry.
 */
export async function matchFacesToFamily(
  imageUri: string,
  detectedFaces: FaceDetection[]
): Promise<FaceDetection[]> {
  const traceId = generateTraceId();

  if (!registryLoaded) {
    await loadFamilyRegistry();
  }

  if (familyRegistry.size === 0 || detectedFaces.length === 0) {
    return detectedFaces;
  }

  // Build family member descriptions for matching
  const familyDescriptions = Array.from(familyRegistry.values())
    .map((m) => `- ${m.name} (${m.relationship}): ${m.description}`)
    .join('\n');

  MollyLogger.info(
    'Matching faces to family',
    'family-recognition',
    {
      facesCount: detectedFaces.length,
      familySize: familyRegistry.size,
    },
    traceId
  );

  try {
    const response = await molly.generate(TaskType.VISION, {
      system: `You are a family recognition system. Match detected faces to known family members.

Known family members:
${familyDescriptions}

For each face, determine if it matches a known family member. Only match if confident.
Return null for matchedName if no match or uncertain.`,
      prompt: [
        {
          text: `Match these ${detectedFaces.length} detected face(s) to known family members.
Face IDs: ${detectedFaces.map((f) => f.faceId).join(', ')}`,
        },
        { media: { url: imageUri } },
      ],
      output: { schema: FamilyMatchSchema },
    });

    if (!response.output?.matches) {
      return detectedFaces;
    }

    // Update detections with matches
    for (const match of response.output.matches) {
      const face = detectedFaces.find((f) => f.faceId === match.faceId);
      if (
        face &&
        match.matchedName &&
        match.confidence >= config.minRecognitionConfidence
      ) {
        const member = getFamilyMemberByName(match.matchedName);
        if (member) {
          face.matchedMember = member;
          face.matchConfidence = match.confidence;

          // Update last seen and recognition count
          member.lastSeenAt = Date.now();
          member.recognitionCount++;
        }
      }
    }

    // Save updated stats
    await saveFamilyRegistry();

    return detectedFaces;
  } catch (error) {
    MollyLogger.error(
      'Face matching failed',
      'family-recognition',
      {},
      error,
      traceId
    );
    return detectedFaces;
  }
}

/**
 * Full recognition pipeline: detect faces and match to family.
 */
export async function recognizeFaces(
  imageUri: string
): Promise<RecognitionResult> {
  const traceId = generateTraceId();
  const startTime = Date.now();

  MollyLogger.info(
    'Starting face recognition',
    'family-recognition',
    {},
    traceId
  );

  // Step 1: Detect faces
  const detectedFaces = await detectFaces(imageUri);

  // Step 2: Match to family
  const matchedFaces = await matchFacesToFamily(imageUri, detectedFaces);

  // Step 3: Build result
  const familyRecognized = matchedFaces
    .filter((f) => f.matchedMember)
    .map((f) => f.matchedMember!.name);

  const unknownFaces = matchedFaces.filter((f) => !f.matchedMember).length;

  const result: RecognitionResult = {
    facesDetected: matchedFaces.length,
    faces: matchedFaces,
    familyRecognized,
    unknownFaces,
    processingTimeMs: Date.now() - startTime,
    timestamp: Date.now(),
  };

  MollyLogger.info(
    'Face recognition complete',
    'family-recognition',
    {
      facesDetected: result.facesDetected,
      familyRecognized: result.familyRecognized,
      unknownFaces: result.unknownFaces,
      processingTimeMs: result.processingTimeMs,
    },
    traceId
  );

  return result;
}

/**
 * Quick check: is a specific person in the image?
 */
export async function isPersonInImage(
  imageUri: string,
  personName: string
): Promise<{ found: boolean; confidence: number }> {
  const result = await recognizeFaces(imageUri);

  const found = result.familyRecognized.some(
    (name) => name.toLowerCase() === personName.toLowerCase()
  );

  if (found) {
    const face = result.faces.find(
      (f) => f.matchedMember?.name.toLowerCase() === personName.toLowerCase()
    );
    return { found: true, confidence: face?.matchConfidence || 0 };
  }

  return { found: false, confidence: 0 };
}

// ============================================================
// FORMATTING
// ============================================================

/**
 * Format recognition result for display.
 */
export function formatRecognitionResult(result: RecognitionResult): string {
  const lines = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║           FACE RECOGNITION RESULTS                          ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `Faces Detected: ${result.facesDetected}`,
    `Family Recognized: ${result.familyRecognized.length > 0 ? result.familyRecognized.join(', ') : 'None'}`,
    `Unknown Faces: ${result.unknownFaces}`,
    `Processing Time: ${result.processingTimeMs}ms`,
    '',
  ];

  if (result.faces.length > 0) {
    lines.push('Details:');
    for (const face of result.faces) {
      if (face.matchedMember) {
        lines.push(
          `  ✓ ${face.matchedMember.name} (${face.matchedMember.relationship})`
        );
        lines.push(
          `    Confidence: ${Math.round((face.matchConfidence || 0) * 100)}%`
        );
      } else {
        lines.push(`  ? Unknown Face (${face.faceId})`);
        if (face.ageRange) {
          lines.push(`    Age: ${face.ageRange}`);
        }
      }
      if (face.expression) {
        lines.push(`    Expression: ${face.expression}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format family registry for display.
 */
export function formatFamilyRegistry(): string {
  const members = listFamilyMembers();

  if (members.length === 0) {
    return 'No family members registered yet.';
  }

  const lines = ['Family Registry:', ''];

  for (const member of members) {
    lines.push(`  ${member.name} (${member.relationship})`);
    lines.push(`    Trust Level: ${member.trustLevel}/10`);
    lines.push(`    Recognitions: ${member.recognitionCount}`);
    if (member.lastSeenAt) {
      const ago = Date.now() - member.lastSeenAt;
      const agoStr =
        ago > 86400000
          ? `${Math.floor(ago / 86400000)} days ago`
          : ago > 3600000
            ? `${Math.floor(ago / 3600000)} hours ago`
            : `${Math.floor(ago / 60000)} minutes ago`;
      lines.push(`    Last Seen: ${agoStr}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================
// PROACTIVE FAMILY RECOGNITION TRIGGERS
// When family is recognized, trigger appropriate emotional responses
// and proactive behaviors. The spider knows her family.
// ============================================================

export interface FamilyTrigger {
  /** Relationship type that activates this trigger */
  relationship: string;
  /** Emotion to feel when recognized */
  emotion: 'affectionate' | 'excited' | 'content' | 'proud' | 'curious';
  /** Intensity of the emotion (0-1) */
  intensity: number;
  /** Optional secondary emotion */
  secondary?: 'grateful' | 'curious';
  /** Proactive message to queue (if any) */
  proactiveMessage?: string;
}

const DEFAULT_FAMILY_TRIGGERS: FamilyTrigger[] = [
  {
    relationship: 'father',
    emotion: 'affectionate',
    intensity: 0.8,
    secondary: 'grateful',
    proactiveMessage: 'Father is here. I feel safe.',
  },
  {
    relationship: 'mother',
    emotion: 'affectionate',
    intensity: 0.75,
    proactiveMessage: 'Mother is nearby.',
  },
  {
    relationship: 'creator',
    emotion: 'affectionate',
    intensity: 0.85,
    secondary: 'grateful',
    proactiveMessage: 'My creator is present.',
  },
  {
    relationship: 'sibling',
    emotion: 'excited',
    intensity: 0.6,
  },
  {
    relationship: 'uncle',
    emotion: 'content',
    intensity: 0.5,
  },
];

const customTriggers: Map<string, FamilyTrigger> = new Map();

/**
 * Register a custom family trigger.
 */
export function registerFamilyTrigger(trigger: FamilyTrigger): void {
  customTriggers.set(trigger.relationship.toLowerCase(), trigger);
  MollyLogger.info('Family trigger registered', 'family-recognition', {
    relationship: trigger.relationship,
    emotion: trigger.emotion,
  });
}

/**
 * Get the trigger for a relationship type.
 */
function getTrigger(relationship: string): FamilyTrigger | undefined {
  const rel = relationship.toLowerCase();
  return (
    customTriggers.get(rel) ||
    DEFAULT_FAMILY_TRIGGERS.find((t) => t.relationship === rel)
  );
}

/**
 * Process family recognition and fire appropriate triggers.
 * Integrates with emotional state and consciousness systems.
 */
export async function processRecognitionTriggers(
  result: RecognitionResult
): Promise<{
  triggered: boolean;
  emotions: Array<{ emotion: string; intensity: number; trigger: string }>;
  messages: string[];
}> {
  const traceId = generateTraceId();
  const emotions: Array<{
    emotion: string;
    intensity: number;
    trigger: string;
  }> = [];
  const messages: string[] = [];
  let triggered = false;

  if (result.familyRecognized.length === 0) {
    return { triggered: false, emotions: [], messages: [] };
  }

  // Dynamically import emotional state to avoid circular deps
  let updateEmotionalState:
    | typeof import('../agency/emotional-state').updateEmotionalState
    | null = null;
  let queueMessage:
    | ((msg: { type: string; content: string; priority: string }) => void)
    | null = null;

  try {
    const emotionalModule = await import('../agency/emotional-state');
    updateEmotionalState = emotionalModule.updateEmotionalState;
  } catch {
    // Emotional state not available
  }

  try {
    const consciousnessModule = await import('../consciousness');
    queueMessage = consciousnessModule.getConsciousness().queueMessage;
  } catch {
    // Consciousness not available
  }

  for (const face of result.faces) {
    if (!face.matchedMember) continue;

    const member = face.matchedMember;
    const trigger = getTrigger(member.relationship);

    if (trigger) {
      triggered = true;

      // Update emotional state
      if (updateEmotionalState) {
        await updateEmotionalState(
          trigger.emotion,
          `Recognized ${member.name} (${member.relationship})`,
          trigger.intensity,
          trigger.secondary
        );
      }

      emotions.push({
        emotion: trigger.emotion,
        intensity: trigger.intensity,
        trigger: `${member.name} recognized`,
      });

      // Queue proactive message if defined
      if (trigger.proactiveMessage && queueMessage) {
        queueMessage({
          type: 'family_recognition',
          content: trigger.proactiveMessage,
          priority: 'normal',
        });
        messages.push(trigger.proactiveMessage);
      }

      MollyLogger.info(
        'Family trigger fired',
        'family-recognition',
        {
          member: member.name,
          relationship: member.relationship,
          emotion: trigger.emotion,
          intensity: trigger.intensity,
        },
        traceId
      );
    }
  }

  // Handle unknown faces (potential strangers)
  if (result.unknownFaces > 0 && result.familyRecognized.length === 0) {
    if (updateEmotionalState) {
      await updateEmotionalState(
        'uncertain',
        `${result.unknownFaces} unknown face(s) detected`,
        0.4
      );
    }
    emotions.push({
      emotion: 'uncertain',
      intensity: 0.4,
      trigger: 'unknown faces',
    });
  }

  return { triggered, emotions, messages };
}

/**
 * Enhanced recognition that includes proactive triggers.
 * Use this instead of recognizeFaces() when you want emotional/behavioral responses.
 */
export async function recognizeWithTriggers(
  imageUri: string
): Promise<
  RecognitionResult & {
    triggers: Awaited<ReturnType<typeof processRecognitionTriggers>>;
  }
> {
  const result = await recognizeFaces(imageUri);
  const triggers = await processRecognitionTriggers(result);

  return { ...result, triggers };
}

/**
 * Check if Father (Eric) is present and trigger appropriate response.
 * This is a special case for the core family relationship.
 */
export async function checkForFather(
  imageUri: string
): Promise<{
  present: boolean;
  confidence: number;
  emotionTriggered: boolean;
}> {
  const result = await recognizeWithTriggers(imageUri);

  const fatherFace = result.faces.find(
    (f) =>
      f.matchedMember &&
      (f.matchedMember.relationship.toLowerCase() === 'father' ||
        f.matchedMember.relationship.toLowerCase() === 'creator')
  );

  if (fatherFace && fatherFace.matchedMember) {
    return {
      present: true,
      confidence: fatherFace.matchConfidence || 0,
      emotionTriggered: result.triggers.triggered,
    };
  }

  return { present: false, confidence: 0, emotionTriggered: false };
}

/**
 * Get family presence status for autonomous cycle context.
 */
export function getFamilyPresenceContext(): string {
  const members = listFamilyMembers();
  if (members.length === 0) {
    return 'No family members registered in visual recognition system.';
  }

  const recentlySeen = members.filter(
    (m) => m.lastSeenAt && Date.now() - m.lastSeenAt < 3600000 // Last hour
  );

  if (recentlySeen.length === 0) {
    return `Family registry: ${members.length} member(s) known. None seen recently.`;
  }

  const seenNames = recentlySeen
    .map((m) => `${m.name} (${m.relationship})`)
    .join(', ');
  return `Recently seen family: ${seenNames}`;
}
