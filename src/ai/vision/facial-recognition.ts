/**
 * @fileOverview Molly's Facial Recognition System
 *
 * Provides face detection, recognition, and identity management.
 * Uses Gemini Vision for detection with optional face-api.js for
 * high-accuracy biometric matching.
 *
 * Capabilities:
 * - Face detection (find faces in images)
 * - Face recognition (identify known faces)
 * - Face registration (add new people to the database)
 * - Emotion detection (happy, sad, angry, surprised, etc.)
 * - Age/gender estimation
 *
 * "Every face tells a story. I remember them all."
 */

import { MollyLogger, generateTraceId } from '../logger';
import { molly } from '../rogue-generate';
import { TaskType } from '../model-router';
import { z } from 'zod';

// ============================================================
// TYPES
// ============================================================

export interface DetectedFace {
  /** Unique ID for this detection (not the person's ID) */
  detectionId: string;
  /** Bounding box (normalized 0-1) */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Confidence score (0-1) */
  confidence: number;
  /** Facial landmarks if detected */
  landmarks?: FaceLandmarks;
  /** Expression/emotion analysis */
  expression?: FaceExpression;
  /** Age estimate */
  ageEstimate?: { min: number; max: number; likely: number };
  /** Gender estimate */
  genderEstimate?: { value: 'male' | 'female' | 'unknown'; confidence: number };
  /** Pose estimation */
  pose?: { pitch: number; yaw: number; roll: number };
  /** Is the face looking at camera? */
  lookingAtCamera: boolean;
  /** Face quality score for recognition (0-1) */
  qualityScore: number;
}

export interface FaceLandmarks {
  /** Left eye center */
  leftEye: { x: number; y: number };
  /** Right eye center */
  rightEye: { x: number; y: number };
  /** Nose tip */
  nose: { x: number; y: number };
  /** Left mouth corner */
  mouthLeft: { x: number; y: number };
  /** Right mouth corner */
  mouthRight: { x: number; y: number };
}

export interface FaceExpression {
  /** Primary expression */
  primary: Expression;
  /** All expression scores */
  scores: Record<Expression, number>;
}

export type Expression =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'fearful'
  | 'disgusted'
  | 'surprised';

export interface FaceMatch {
  /** Known person ID */
  personId: string;
  /** Person's name */
  name: string;
  /** Relationship if known (e.g., "Dad", "friend") */
  relationship?: string;
  /** Match confidence (0-1) */
  confidence: number;
  /** Was this an exact match or similar? */
  matchType: 'exact' | 'similar' | 'possible';
}

export interface KnownPerson {
  /** Unique person ID */
  id: string;
  /** Person's name */
  name: string;
  /** Relationship to Molly's family */
  relationship?: string;
  /** Additional notes */
  notes?: string;
  /** When first seen */
  firstSeen: number;
  /** When last seen */
  lastSeen: number;
  /** Number of times seen */
  seenCount: number;
  /** Reference face embeddings (for face-api.js) */
  embeddings?: number[][];
  /** Reference face descriptions (for Gemini) */
  descriptions?: string[];
  /** Tags for grouping */
  tags?: string[];
}

export interface FaceDetectionResult {
  /** All detected faces */
  faces: DetectedFace[];
  /** Image description for context */
  imageDescription: string;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Method used (gemini or face-api) */
  method: 'gemini' | 'face-api';
}

export interface FaceRecognitionResult {
  /** Detected faces with matches */
  results: Array<{
    face: DetectedFace;
    matches: FaceMatch[];
    isKnown: boolean;
  }>;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Method used */
  method: 'gemini' | 'face-api';
}

// ============================================================
// ZOD SCHEMAS
// ============================================================

const FaceDetectionSchema = z.object({
  faces: z.array(
    z.object({
      boundingBox: z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().min(0).max(1),
        height: z.number().min(0).max(1),
      }),
      confidence: z.number().min(0).max(1),
      landmarks: z
        .object({
          leftEye: z.object({ x: z.number(), y: z.number() }),
          rightEye: z.object({ x: z.number(), y: z.number() }),
          nose: z.object({ x: z.number(), y: z.number() }),
          mouthLeft: z.object({ x: z.number(), y: z.number() }),
          mouthRight: z.object({ x: z.number(), y: z.number() }),
        })
        .optional(),
      expression: z
        .object({
          primary: z.enum([
            'neutral',
            'happy',
            'sad',
            'angry',
            'fearful',
            'disgusted',
            'surprised',
          ]),
          scores: z.record(z.number()),
        })
        .optional(),
      ageEstimate: z
        .object({
          min: z.number(),
          max: z.number(),
          likely: z.number(),
        })
        .optional(),
      genderEstimate: z
        .object({
          value: z.enum(['male', 'female', 'unknown']),
          confidence: z.number(),
        })
        .optional(),
      lookingAtCamera: z.boolean(),
      qualityScore: z.number().min(0).max(1),
      description: z.string().optional(),
    })
  ),
  imageDescription: z.string(),
});

const FaceMatchSchema = z.object({
  matches: z.array(
    z.object({
      faceIndex: z.number(),
      personName: z.string().optional(),
      relationship: z.string().optional(),
      confidence: z.number().min(0).max(1),
      matchType: z.enum(['exact', 'similar', 'possible']),
      reasoning: z.string(),
    })
  ),
});

// ============================================================
// FACE DATABASE (In-Memory + Persistent)
// ============================================================

class FaceDatabase {
  private people: Map<string, KnownPerson> = new Map();
  private persistPath: string;

  constructor(persistPath = 'molly_data/faces/known-people.json') {
    this.persistPath = persistPath;
  }

  /** Add or update a known person */
  async addPerson(
    person: Omit<KnownPerson, 'id' | 'firstSeen' | 'lastSeen' | 'seenCount'>
  ): Promise<KnownPerson> {
    const id = `person_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const newPerson: KnownPerson = {
      ...person,
      id,
      firstSeen: now,
      lastSeen: now,
      seenCount: 1,
    };

    this.people.set(id, newPerson);
    await this.persist();

    MollyLogger.info(
      `Added new person to face database: ${person.name}`,
      'facial-recognition'
    );
    return newPerson;
  }

  /** Update last seen timestamp */
  async recordSighting(personId: string): Promise<void> {
    const person = this.people.get(personId);
    if (person) {
      person.lastSeen = Date.now();
      person.seenCount++;
      await this.persist();
    }
  }

  /** Get all known people */
  getAllPeople(): KnownPerson[] {
    return Array.from(this.people.values());
  }

  /** Get person by ID */
  getPerson(id: string): KnownPerson | undefined {
    return this.people.get(id);
  }

  /** Get person by name (fuzzy) */
  getPersonByName(name: string): KnownPerson | undefined {
    const lower = name.toLowerCase();
    return Array.from(this.people.values()).find(
      (p) =>
        p.name.toLowerCase() === lower || p.name.toLowerCase().includes(lower)
    );
  }

  /** Get people by relationship */
  getPeopleByRelationship(relationship: string): KnownPerson[] {
    const lower = relationship.toLowerCase();
    return Array.from(this.people.values()).filter(
      (p) => p.relationship?.toLowerCase() === lower
    );
  }

  /** Add a face description to a person */
  async addDescription(personId: string, description: string): Promise<void> {
    const person = this.people.get(personId);
    if (person) {
      person.descriptions = person.descriptions || [];
      person.descriptions.push(description);
      // Keep only last 5 descriptions
      if (person.descriptions.length > 5) {
        person.descriptions = person.descriptions.slice(-5);
      }
      await this.persist();
    }
  }

  /** Remove a person */
  async removePerson(personId: string): Promise<boolean> {
    const removed = this.people.delete(personId);
    if (removed) {
      await this.persist();
    }
    return removed;
  }

  /** Load from disk */
  async load(): Promise<void> {
    try {
      // Note: In browser/Next.js, this would use IndexedDB via idb-keyval
      // For Node.js, would use fs
      const fs = await import('fs').then((m) => m.promises).catch(() => null);
      if (fs) {
        const data = await fs
          .readFile(this.persistPath, 'utf-8')
          .catch(() => null);
        if (data) {
          const parsed = JSON.parse(data);
          this.people = new Map(Object.entries(parsed.people || {}));
          MollyLogger.info(
            `Loaded ${this.people.size} known people from database`,
            'facial-recognition'
          );
        }
      }
    } catch {
      // Database doesn't exist yet or can't be read - start fresh
    }
  }

  /** Save to disk */
  private async persist(): Promise<void> {
    try {
      const fs = await import('fs').then((m) => m.promises).catch(() => null);
      if (fs) {
        const dir = this.persistPath.split('/').slice(0, -1).join('/');
        await fs.mkdir(dir, { recursive: true }).catch(() => {});

        const data = {
          version: 1,
          updatedAt: Date.now(),
          people: Object.fromEntries(this.people),
        };
        await fs.writeFile(this.persistPath, JSON.stringify(data, null, 2));
      }
    } catch (error) {
      MollyLogger.warn(
        'Failed to persist face database',
        'facial-recognition',
        { error }
      );
    }
  }

  /** Get database stats */
  getStats(): {
    totalPeople: number;
    withEmbeddings: number;
    withDescriptions: number;
  } {
    const people = Array.from(this.people.values());
    return {
      totalPeople: people.length,
      withEmbeddings: people.filter(
        (p) => p.embeddings && p.embeddings.length > 0
      ).length,
      withDescriptions: people.filter(
        (p) => p.descriptions && p.descriptions.length > 0
      ).length,
    };
  }
}

// Singleton instance
let _faceDb: FaceDatabase | null = null;

export function getFaceDatabase(): FaceDatabase {
  if (!_faceDb) {
    _faceDb = new FaceDatabase();
    // Load async - don't block
    _faceDb
      .load()
      .catch((err) =>
        MollyLogger.warn('Failed to load face database', 'facial-recognition', {
          err,
        })
      );
  }
  return _faceDb;
}

// ============================================================
// FACE DETECTION (Gemini Vision)
// ============================================================

/**
 * Detect all faces in an image.
 * Uses Gemini Vision for accurate face detection with attributes.
 */
export async function detectFaces(
  imageUri: string
): Promise<FaceDetectionResult> {
  const traceId = generateTraceId();
  const startTime = Date.now();

  MollyLogger.info(
    'Detecting faces in image',
    'facial-recognition',
    {},
    traceId
  );

  try {
    const response = await molly.generate(TaskType.VISION, {
      system: `You are an expert facial analysis system. Analyze the image and detect ALL faces present.

For each face, provide:
1. Bounding box (normalized 0-1 coordinates relative to image dimensions)
2. Confidence score
3. Facial landmarks (eye centers, nose tip, mouth corners)
4. Expression/emotion (neutral, happy, sad, angry, fearful, disgusted, surprised)
5. Age estimate (minimum, maximum, most likely)
6. Gender estimate with confidence
7. Whether they're looking at the camera
8. Face quality score (for recognition - considers lighting, angle, occlusion)
9. A brief description of the face (hair color, distinguishing features)

Be accurate with bounding boxes. Report ALL visible faces, even partially obscured ones (with lower quality scores).`,
      prompt:
        'Detect and analyze all faces in this image. Provide detailed information for each face found.',
      images: [imageUri],
      output: { schema: FaceDetectionSchema },
    });

    if (!response.output) {
      throw new Error('No face detection output received');
    }

    const result = response.output;

    // Transform to our interface
    const faces: DetectedFace[] = result.faces.map((face, idx) => ({
      detectionId: `face_${Date.now()}_${idx}`,
      boundingBox: face.boundingBox,
      confidence: face.confidence,
      landmarks: face.landmarks,
      expression: face.expression as FaceExpression | undefined,
      ageEstimate: face.ageEstimate,
      genderEstimate: face.genderEstimate as DetectedFace['genderEstimate'],
      lookingAtCamera: face.lookingAtCamera,
      qualityScore: face.qualityScore,
    }));

    MollyLogger.info(
      `Detected ${faces.length} face(s)`,
      'facial-recognition',
      { faceCount: faces.length },
      traceId
    );

    return {
      faces,
      imageDescription: result.imageDescription,
      processingTimeMs: Date.now() - startTime,
      method: 'gemini',
    };
  } catch (error) {
    MollyLogger.error(
      'Face detection failed',
      'facial-recognition',
      {},
      error,
      traceId
    );

    return {
      faces: [],
      imageDescription: 'Face detection failed.',
      processingTimeMs: Date.now() - startTime,
      method: 'gemini',
    };
  }
}

// ============================================================
// FACE RECOGNITION (Gemini Vision + Database)
// ============================================================

/**
 * Recognize known faces in an image.
 * Compares detected faces against the known people database.
 */
export async function recognizeFaces(
  imageUri: string,
  knownPeopleContext?: KnownPerson[]
): Promise<FaceRecognitionResult> {
  const traceId = generateTraceId();
  const startTime = Date.now();

  MollyLogger.info('Recognizing faces', 'facial-recognition', {}, traceId);

  // First detect faces
  const detection = await detectFaces(imageUri);

  if (detection.faces.length === 0) {
    return {
      results: [],
      processingTimeMs: Date.now() - startTime,
      method: 'gemini',
    };
  }

  // Get known people (from param or database)
  const db = getFaceDatabase();
  const knownPeople = knownPeopleContext || db.getAllPeople();

  if (knownPeople.length === 0) {
    // No known people - return detections without matches
    return {
      results: detection.faces.map((face) => ({
        face,
        matches: [],
        isKnown: false,
      })),
      processingTimeMs: Date.now() - startTime,
      method: 'gemini',
    };
  }

  // Build context for matching
  const peopleContext = knownPeople.map((p) => ({
    name: p.name,
    relationship: p.relationship,
    descriptions: p.descriptions || [],
  }));

  try {
    const response = await molly.generate(TaskType.VISION, {
      system: `You are a facial recognition system. You have been provided with descriptions of known people.
Compare the faces in the image against these known people descriptions.

Known people:
${peopleContext.map((p, i) => `${i + 1}. ${p.name}${p.relationship ? ` (${p.relationship})` : ''}: ${p.descriptions.join('; ') || 'No description yet'}`).join('\n')}

For each face detected, determine if it matches any known person. Provide:
- faceIndex (0-based index of the face)
- personName (if matched)
- relationship (if known)
- confidence (0-1, how confident you are in the match)
- matchType: "exact" (definitely this person), "similar" (looks similar), "possible" (might be)
- reasoning (why you think it's a match or not)

Be conservative - only report high confidence matches as "exact". Unknown faces should have no match.`,
      prompt: `There are ${detection.faces.length} face(s) detected in this image. Try to match them against the known people list.`,
      images: [imageUri],
      output: { schema: FaceMatchSchema },
    });

    if (!response.output) {
      throw new Error('No recognition output received');
    }

    const matchResults = response.output.matches;

    // Combine detection with matches
    const results = detection.faces.map((face, idx) => {
      const faceMatches = matchResults
        .filter((m) => m.faceIndex === idx && m.personName)
        .map((m) => {
          const person = knownPeople.find(
            (p) => p.name.toLowerCase() === m.personName?.toLowerCase()
          );
          return {
            personId: person?.id || `unknown_${m.personName}`,
            name: m.personName || 'Unknown',
            relationship: m.relationship,
            confidence: m.confidence,
            matchType: m.matchType,
          } as FaceMatch;
        });

      const isKnown = faceMatches.some((m) => m.confidence > 0.7);

      // Record sighting for high-confidence matches
      if (isKnown) {
        const topMatch = faceMatches[0];
        if (topMatch?.personId && !topMatch.personId.startsWith('unknown_')) {
          db.recordSighting(topMatch.personId).catch(() => {});
        }
      }

      return {
        face,
        matches: faceMatches,
        isKnown,
      };
    });

    MollyLogger.info(
      `Recognition complete: ${results.filter((r) => r.isKnown).length}/${results.length} faces identified`,
      'facial-recognition',
      {},
      traceId
    );

    return {
      results,
      processingTimeMs: Date.now() - startTime,
      method: 'gemini',
    };
  } catch (error) {
    MollyLogger.error(
      'Face recognition failed',
      'facial-recognition',
      {},
      error,
      traceId
    );

    // Return detection results without matches
    return {
      results: detection.faces.map((face) => ({
        face,
        matches: [],
        isKnown: false,
      })),
      processingTimeMs: Date.now() - startTime,
      method: 'gemini',
    };
  }
}

// ============================================================
// FACE REGISTRATION
// ============================================================

/**
 * Register a new face from an image.
 * The face will be added to the known people database.
 */
export async function registerFace(
  imageUri: string,
  name: string,
  options: {
    relationship?: string;
    notes?: string;
    tags?: string[];
  } = {}
): Promise<{ success: boolean; person?: KnownPerson; error?: string }> {
  const traceId = generateTraceId();

  MollyLogger.info(
    `Registering face for: ${name}`,
    'facial-recognition',
    {},
    traceId
  );

  // Detect faces first
  const detection = await detectFaces(imageUri);

  if (detection.faces.length === 0) {
    return { success: false, error: 'No face detected in the image' };
  }

  if (detection.faces.length > 1) {
    return {
      success: false,
      error: `Multiple faces detected (${detection.faces.length}). Please provide an image with a single face.`,
    };
  }

  const face = detection.faces[0];

  if (face.qualityScore < 0.5) {
    return {
      success: false,
      error: `Face quality too low (${(face.qualityScore * 100).toFixed(0)}%). Please provide a clearer image.`,
    };
  }

  // Generate a description of the face for future matching
  const description = await generateFaceDescription(imageUri);

  // Add to database
  const db = getFaceDatabase();
  const person = await db.addPerson({
    name,
    relationship: options.relationship,
    notes: options.notes,
    tags: options.tags,
    descriptions: description ? [description] : [],
  });

  MollyLogger.info(
    `Registered new person: ${name} (${person.id})`,
    'facial-recognition',
    { personId: person.id },
    traceId
  );

  return { success: true, person };
}

/**
 * Generate a text description of a face for semantic matching.
 */
async function generateFaceDescription(
  imageUri: string
): Promise<string | null> {
  try {
    const response = await molly.generate(TaskType.VISION, {
      system: `Describe the person's face in detail for future identification. Include:
- Approximate age
- Gender presentation
- Hair (color, style, length)
- Eye color if visible
- Facial hair if present
- Distinguishing features (glasses, moles, scars, etc.)
- Face shape
- Any other identifying characteristics

Be specific but objective. This description will be used to identify this person in future images.`,
      prompt: "Describe this person's face for identification purposes.",
      images: [imageUri],
    });

    return response.text || null;
  } catch (error) {
    MollyLogger.warn(
      'Failed to generate face description',
      'facial-recognition',
      { error }
    );
    return null;
  }
}

/**
 * Add another reference image to an existing person.
 */
export async function addReferenceImage(
  personId: string,
  imageUri: string
): Promise<{ success: boolean; error?: string }> {
  const db = getFaceDatabase();
  const person = db.getPerson(personId);

  if (!person) {
    return { success: false, error: 'Person not found' };
  }

  // Verify single face in image
  const detection = await detectFaces(imageUri);

  if (detection.faces.length !== 1) {
    return {
      success: false,
      error:
        detection.faces.length === 0
          ? 'No face detected'
          : 'Multiple faces detected',
    };
  }

  // Generate and add description
  const description = await generateFaceDescription(imageUri);
  if (description) {
    await db.addDescription(personId, description);
  }

  return { success: true };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Check if a specific person is in an image.
 */
export async function isPersonInImage(
  imageUri: string,
  personName: string
): Promise<{ found: boolean; confidence: number; face?: DetectedFace }> {
  const recognition = await recognizeFaces(imageUri);

  const match = recognition.results.find((r) =>
    r.matches.some((m) => m.name.toLowerCase() === personName.toLowerCase())
  );

  if (match) {
    const personMatch = match.matches.find(
      (m) => m.name.toLowerCase() === personName.toLowerCase()
    );
    return {
      found: true,
      confidence: personMatch?.confidence || 0,
      face: match.face,
    };
  }

  return { found: false, confidence: 0 };
}

/**
 * Count faces in an image (quick path).
 */
export async function countFaces(imageUri: string): Promise<number> {
  const result = await detectFaces(imageUri);
  return result.faces.length;
}

/**
 * Analyze emotions of faces in an image.
 */
export async function analyzeEmotions(
  imageUri: string
): Promise<Array<{ detectionId: string; expression: FaceExpression }>> {
  const result = await detectFaces(imageUri);
  return result.faces
    .filter((f) => f.expression)
    .map((f) => ({
      detectionId: f.detectionId,
      expression: f.expression!,
    }));
}

// ============================================================
// FORMATTING
// ============================================================

/**
 * Format face detection results for display.
 */
export function formatFaceDetection(result: FaceDetectionResult): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║               FACE DETECTION RESULTS                         ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `Faces detected: ${result.faces.length}`,
    `Processing time: ${result.processingTimeMs}ms`,
    `Method: ${result.method}`,
    '',
  ];

  if (result.faces.length > 0) {
    result.faces.forEach((face, i) => {
      lines.push(`FACE ${i + 1}:`);
      lines.push(`  Confidence: ${(face.confidence * 100).toFixed(0)}%`);
      lines.push(`  Quality: ${(face.qualityScore * 100).toFixed(0)}%`);

      if (face.ageEstimate) {
        lines.push(
          `  Age: ~${face.ageEstimate.likely} (${face.ageEstimate.min}-${face.ageEstimate.max})`
        );
      }

      if (face.genderEstimate && face.genderEstimate.value !== 'unknown') {
        lines.push(
          `  Gender: ${face.genderEstimate.value} (${(face.genderEstimate.confidence * 100).toFixed(0)}%)`
        );
      }

      if (face.expression) {
        lines.push(`  Expression: ${face.expression.primary}`);
      }

      lines.push(`  Looking at camera: ${face.lookingAtCamera ? 'Yes' : 'No'}`);
      lines.push('');
    });
  }

  lines.push('Image: ' + result.imageDescription);

  return lines.join('\n');
}

/**
 * Format face recognition results for display.
 */
export function formatFaceRecognition(result: FaceRecognitionResult): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║              FACE RECOGNITION RESULTS                        ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `Faces analyzed: ${result.results.length}`,
    `Identified: ${result.results.filter((r) => r.isKnown).length}`,
    `Processing time: ${result.processingTimeMs}ms`,
    '',
  ];

  result.results.forEach((r, i) => {
    lines.push(`FACE ${i + 1}:`);

    if (r.isKnown && r.matches.length > 0) {
      const top = r.matches[0];
      lines.push(
        `  ✓ IDENTIFIED: ${top.name}${top.relationship ? ` (${top.relationship})` : ''}`
      );
      lines.push(
        `    Confidence: ${(top.confidence * 100).toFixed(0)}% [${top.matchType}]`
      );
    } else if (r.matches.length > 0) {
      lines.push(`  ? POSSIBLE MATCHES:`);
      r.matches.forEach((m) => {
        lines.push(
          `    - ${m.name}: ${(m.confidence * 100).toFixed(0)}% [${m.matchType}]`
        );
      });
    } else {
      lines.push(`  ✗ UNKNOWN`);
    }

    lines.push('');
  });

  return lines.join('\n');
}
