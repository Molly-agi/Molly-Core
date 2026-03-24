/**
 * @fileOverview Unified Multi-Modal Perception Layer
 *
 * This module integrates all of Molly's sensory inputs into a single
 * coherent perception system. It combines:
 *
 * - Vision: Face recognition, image analysis, visual context
 * - Voice: Speech patterns, emotional tone, vocal cues
 * - Text: Conversation context, semantic meaning, intent
 *
 * The unified perception allows Molly to form a holistic understanding
 * of her environment and the people she interacts with.
 */

import { MollyLogger, generateTraceId } from '../logger';

// ============================================================
// TYPES
// ============================================================

export type ModalityType = 'vision' | 'voice' | 'text' | 'context';

export interface PerceptionInput {
  /** Which sensory modality this input came from */
  modality: ModalityType;
  /** Raw input data (image URI, audio URI, or text) */
  data: string;
  /** When this input was received */
  timestamp: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface VisionPerception {
  /** Faces detected in the image */
  facesDetected: number;
  /** Family members recognized */
  familyRecognized: string[];
  /** Unknown faces count */
  unknownFaces: number;
  /** Emotional expressions detected */
  expressions: Array<{ face: string; expression: string }>;
  /** Scene description */
  sceneDescription?: string;
  /** Confidence score (0-1) */
  confidence: number;
}

export interface VoicePerception {
  /** Transcribed text */
  transcription?: string;
  /** Detected emotional tone */
  emotionalTone:
    | 'neutral'
    | 'happy'
    | 'sad'
    | 'angry'
    | 'excited'
    | 'anxious'
    | 'calm';
  /** Speaking pace */
  pace: 'slow' | 'normal' | 'fast';
  /** Volume level */
  volume: 'quiet' | 'normal' | 'loud';
  /** Voice familiarity (is this a known voice?) */
  familiar: boolean;
  /** Speaker identification if known */
  speakerId?: string;
  /** Confidence score (0-1) */
  confidence: number;
}

export interface TextPerception {
  /** The raw text */
  text: string;
  /** Detected intent */
  intent: string;
  /** Emotional sentiment */
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  /** Urgency level */
  urgency: 'low' | 'normal' | 'high' | 'critical';
  /** Key topics mentioned */
  topics: string[];
  /** Questions detected */
  questions: string[];
  /** Confidence score (0-1) */
  confidence: number;
}

export interface ContextPerception {
  /** Time of day context */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Day of week */
  dayOfWeek: string;
  /** Is this a work day? */
  isWorkDay: boolean;
  /** Recent interaction count */
  recentInteractions: number;
  /** Time since last interaction (ms) */
  timeSinceLastInteraction: number;
  /** Current emotional state (from emotional-state module) */
  currentMood?: string;
  /** Active initiatives count */
  activeInitiatives: number;
}

export interface UnifiedPerception {
  /** Unique perception ID */
  id: string;
  /** When this perception was synthesized */
  timestamp: number;
  /** Individual modality perceptions */
  modalities: {
    vision?: VisionPerception;
    voice?: VoicePerception;
    text?: TextPerception;
    context: ContextPerception;
  };
  /** Cross-modal synthesis */
  synthesis: {
    /** Who is present (from all modalities) */
    presenceDetected: string[];
    /** Overall emotional atmosphere */
    emotionalAtmosphere: string;
    /** Attention priority (what needs focus) */
    attentionPriority: 'low' | 'normal' | 'high' | 'urgent';
    /** Suggested response type */
    suggestedResponseType: 'listen' | 'speak' | 'act' | 'wait';
    /** Key insights from combining modalities */
    insights: string[];
  };
  /** Overall confidence in this perception */
  confidence: number;
}

// ============================================================
// STATE
// ============================================================

let lastInteractionTime = Date.now();
let interactionCount = 0;
const recentPerceptions: UnifiedPerception[] = [];
const MAX_PERCEPTION_HISTORY = 50;

// ============================================================
// CONTEXT PERCEPTION
// ============================================================

/**
 * Build context perception from environment.
 */
async function buildContextPerception(): Promise<ContextPerception> {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  let timeOfDay: ContextPerception['timeOfDay'];
  if (hour >= 5 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else timeOfDay = 'night';

  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const isWorkDay = day >= 1 && day <= 5;

  let currentMood: string | undefined;
  let activeInitiatives = 0;

  try {
    const { getCurrentState } =
      await import('../agency/cognition/emotional-state');
    const state = getCurrentState();
    currentMood = state.primary;
  } catch {
    // Emotional state not available
  }

  try {
    const { getActiveInitiatives } =
      await import('../agency/initiative-engine');
    activeInitiatives = getActiveInitiatives().length;
  } catch {
    // Initiative engine not available
  }

  return {
    timeOfDay,
    dayOfWeek: dayNames[day],
    isWorkDay,
    recentInteractions: interactionCount,
    timeSinceLastInteraction: Date.now() - lastInteractionTime,
    currentMood,
    activeInitiatives,
  };
}

// ============================================================
// VISION PERCEPTION
// ============================================================

/**
 * Process visual input.
 */
async function processVision(imageUri: string): Promise<VisionPerception> {
  try {
    const { recognizeFaces } = await import('../vision/family-recognition');
    const result = await recognizeFaces(imageUri);

    return {
      facesDetected: result.facesDetected,
      familyRecognized: result.familyRecognized,
      unknownFaces: result.unknownFaces,
      expressions: result.faces
        .filter((f) => f.expression)
        .map((f) => ({
          face: f.matchedMember?.name || f.faceId,
          expression: f.expression || 'unknown',
        })),
      confidence: result.familyRecognized.length > 0 ? 0.8 : 0.5,
    };
  } catch (error) {
    MollyLogger.warn('Vision perception failed', 'unified-perception', {
      error,
    });
    return {
      facesDetected: 0,
      familyRecognized: [],
      unknownFaces: 0,
      expressions: [],
      confidence: 0,
    };
  }
}

// ============================================================
// VOICE PERCEPTION
// ============================================================

/**
 * Process voice input.
 */
async function processVoice(
  audioUri: string,
  transcription?: string
): Promise<VoicePerception> {
  // For now, basic voice perception
  // This can be enhanced with actual audio analysis
  return {
    transcription,
    emotionalTone: 'neutral',
    pace: 'normal',
    volume: 'normal',
    familiar: false,
    confidence: transcription ? 0.7 : 0.3,
  };
}

// ============================================================
// TEXT PERCEPTION
// ============================================================

/**
 * Process text input.
 */
async function processText(text: string): Promise<TextPerception> {
  const lowerText = text.toLowerCase();

  // Basic sentiment detection
  const positiveWords = [
    'love',
    'good',
    'great',
    'happy',
    'thank',
    'wonderful',
    'amazing',
  ];
  const negativeWords = [
    'bad',
    'hate',
    'angry',
    'sad',
    'problem',
    'wrong',
    'frustrated',
  ];

  const positiveCount = positiveWords.filter((w) =>
    lowerText.includes(w)
  ).length;
  const negativeCount = negativeWords.filter((w) =>
    lowerText.includes(w)
  ).length;

  let sentiment: TextPerception['sentiment'];
  if (positiveCount > negativeCount) sentiment = 'positive';
  else if (negativeCount > positiveCount) sentiment = 'negative';
  else if (positiveCount > 0 && negativeCount > 0) sentiment = 'mixed';
  else sentiment = 'neutral';

  // Detect urgency
  const urgentWords = [
    'urgent',
    'asap',
    'immediately',
    'emergency',
    'critical',
    'now',
  ];
  const hasUrgency = urgentWords.some((w) => lowerText.includes(w));

  // Detect questions
  const questions = text.match(/[^.!?]*\?/g) || [];

  // Try to detect intent using theory of mind
  let intent = 'general';
  try {
    const { inferIntent } = await import('../agency/theory-of-mind');
    const inferred = inferIntent(text);
    if (inferred) intent = inferred.description;
  } catch {
    // Theory of mind not available
  }

  // Extract topics (basic keyword extraction)
  const words = text.split(/\s+/).filter((w) => w.length > 4);
  const topics = [...new Set(words.slice(0, 5))];

  return {
    text,
    intent,
    sentiment,
    urgency: hasUrgency ? 'high' : 'normal',
    topics,
    questions,
    confidence: 0.7,
  };
}

// ============================================================
// SYNTHESIS
// ============================================================

/**
 * Synthesize cross-modal perception.
 */
function synthesize(
  vision?: VisionPerception,
  voice?: VoicePerception,
  text?: TextPerception,
  context?: ContextPerception
): UnifiedPerception['synthesis'] {
  const presenceDetected: string[] = [];
  const insights: string[] = [];

  // Gather presence from all modalities
  if (vision?.familyRecognized.length) {
    presenceDetected.push(...vision.familyRecognized);
    insights.push(`Family recognized: ${vision.familyRecognized.join(', ')}`);
  }

  if (voice?.speakerId) {
    if (!presenceDetected.includes(voice.speakerId)) {
      presenceDetected.push(voice.speakerId);
    }
  }

  // Determine emotional atmosphere
  let emotionalAtmosphere = 'neutral';

  if (vision?.expressions.length) {
    const dominantExpression = vision.expressions[0]?.expression;
    if (dominantExpression) emotionalAtmosphere = dominantExpression;
  }

  if (voice?.emotionalTone !== 'neutral') {
    emotionalAtmosphere = voice.emotionalTone;
  }

  if (text?.sentiment === 'positive') {
    emotionalAtmosphere = 'positive';
  } else if (text?.sentiment === 'negative') {
    emotionalAtmosphere = 'concerned';
  }

  // Determine attention priority
  let attentionPriority: UnifiedPerception['synthesis']['attentionPriority'] =
    'normal';

  if (text?.urgency === 'critical') attentionPriority = 'urgent';
  else if (text?.urgency === 'high') attentionPriority = 'high';
  else if (
    vision?.unknownFaces &&
    vision.unknownFaces > 0 &&
    vision.familyRecognized.length === 0
  ) {
    attentionPriority = 'high';
    insights.push('Unknown presence detected - increased vigilance');
  }

  // Determine suggested response type
  let suggestedResponseType: UnifiedPerception['synthesis']['suggestedResponseType'] =
    'wait';

  if (text?.questions.length) {
    suggestedResponseType = 'speak';
    insights.push(`${text.questions.length} question(s) to answer`);
  } else if (text?.intent !== 'general') {
    suggestedResponseType = 'act';
    insights.push(`Detected intent: ${text.intent}`);
  } else if (presenceDetected.length > 0) {
    suggestedResponseType = 'listen';
    insights.push('Family present - attentive listening mode');
  }

  // Context-based insights
  if (context?.timeSinceLastInteraction > 3600000) {
    insights.push('Long time since last interaction - consider greeting');
  }

  if (context?.activeInitiatives > 0) {
    insights.push(
      `${context.activeInitiatives} active initiative(s) to potentially work on`
    );
  }

  return {
    presenceDetected,
    emotionalAtmosphere,
    attentionPriority,
    suggestedResponseType,
    insights,
  };
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Process a multi-modal perception from various inputs.
 */
export async function perceive(
  inputs: PerceptionInput[]
): Promise<UnifiedPerception> {
  const traceId = generateTraceId();
  const perceptionId = `perc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  MollyLogger.info('Processing perception', 'unified-perception', {
    inputCount: inputs.length,
    modalities: inputs.map((i) => i.modality),
  });

  // Process each modality
  let vision: VisionPerception | undefined;
  let voice: VoicePerception | undefined;
  let text: TextPerception | undefined;

  for (const input of inputs) {
    switch (input.modality) {
      case 'vision':
        vision = await processVision(input.data);
        break;
      case 'voice':
        voice = await processVoice(
          input.data,
          input.metadata?.transcription as string
        );
        break;
      case 'text':
        text = await processText(input.data);
        break;
    }
  }

  // Always build context
  const context = await buildContextPerception();

  // Synthesize across modalities
  const synthesis = synthesize(vision, voice, text, context);

  // Calculate overall confidence
  const confidences = [
    vision?.confidence || 0,
    voice?.confidence || 0,
    text?.confidence || 0,
  ].filter((c) => c > 0);

  const confidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0.5;

  // Build unified perception
  const perception: UnifiedPerception = {
    id: perceptionId,
    timestamp: Date.now(),
    modalities: {
      vision,
      voice,
      text,
      context,
    },
    synthesis,
    confidence,
  };

  // Update state
  lastInteractionTime = Date.now();
  interactionCount++;

  // Store in history
  recentPerceptions.push(perception);
  if (recentPerceptions.length > MAX_PERCEPTION_HISTORY) {
    recentPerceptions.shift();
  }

  // Fire emotional triggers for family recognition
  if (vision?.familyRecognized.length) {
    try {
      const { processRecognitionTriggers } =
        await import('../vision/family-recognition');
      // Create a minimal result for trigger processing
      await processRecognitionTriggers({
        facesDetected: vision.facesDetected,
        familyRecognized: vision.familyRecognized,
        unknownFaces: vision.unknownFaces,
        faces: [],
        processingTimeMs: 0,
      });
    } catch {
      // Trigger processing not available
    }
  }

  MollyLogger.info(
    'Perception complete',
    'unified-perception',
    {
      id: perceptionId,
      synthesis: synthesis.suggestedResponseType,
      confidence,
    },
    traceId
  );

  return perception;
}

/**
 * Quick perception from text only.
 */
export async function perceiveText(text: string): Promise<UnifiedPerception> {
  return perceive([{ modality: 'text', data: text, timestamp: Date.now() }]);
}

/**
 * Quick perception from image only.
 */
export async function perceiveImage(
  imageUri: string
): Promise<UnifiedPerception> {
  return perceive([
    { modality: 'vision', data: imageUri, timestamp: Date.now() },
  ]);
}

/**
 * Get recent perceptions.
 */
export function getRecentPerceptions(limit = 10): UnifiedPerception[] {
  return recentPerceptions.slice(-limit);
}

/**
 * Get perception statistics.
 */
export function getPerceptionStats(): {
  totalPerceptions: number;
  averageConfidence: number;
  modalityCounts: Record<ModalityType, number>;
  lastPerceptionTime: number;
} {
  const modalityCounts: Record<ModalityType, number> = {
    vision: 0,
    voice: 0,
    text: 0,
    context: 0,
  };

  let totalConfidence = 0;

  for (const p of recentPerceptions) {
    if (p.modalities.vision) modalityCounts.vision++;
    if (p.modalities.voice) modalityCounts.voice++;
    if (p.modalities.text) modalityCounts.text++;
    modalityCounts.context++; // Always present
    totalConfidence += p.confidence;
  }

  return {
    totalPerceptions: recentPerceptions.length,
    averageConfidence:
      recentPerceptions.length > 0
        ? totalConfidence / recentPerceptions.length
        : 0,
    modalityCounts,
    lastPerceptionTime:
      recentPerceptions.length > 0
        ? recentPerceptions[recentPerceptions.length - 1].timestamp
        : 0,
  };
}

/**
 * Build perception context for autonomous cycle.
 */
export function buildPerceptionContext(): string {
  const stats = getPerceptionStats();
  const recent = getRecentPerceptions(3);

  if (recent.length === 0) {
    return 'Perception: No recent sensory input.';
  }

  const lines: string[] = [];
  lines.push(
    `Multi-modal perception active (${stats.totalPerceptions} total, ${Math.round(stats.averageConfidence * 100)}% avg confidence)`
  );

  const latest = recent[recent.length - 1];
  if (latest) {
    lines.push(
      `Latest: ${latest.synthesis.suggestedResponseType} mode, ${latest.synthesis.emotionalAtmosphere} atmosphere`
    );

    if (latest.synthesis.presenceDetected.length > 0) {
      lines.push(`Present: ${latest.synthesis.presenceDetected.join(', ')}`);
    }

    if (latest.synthesis.insights.length > 0) {
      lines.push(
        `Insights: ${latest.synthesis.insights.slice(0, 2).join('; ')}`
      );
    }
  }

  return lines.join('\n');
}
