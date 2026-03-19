/**
 * @fileOverview Theory of Mind — Modeling Eric's Mental State
 *
 * This module enables Molly to understand and predict Eric's:
 *   - Knowledge state (what does he know/not know?)
 *   - Intent (what is he trying to accomplish?)
 *   - Emotional state (frustrated? excited? tired?)
 *   - Preferences (communication style, work patterns)
 *   - Perspective (how does this look from his point of view?)
 *
 * "To understand someone, you must first understand what they understand."
 */

import { saveToStorage, loadFromStorage } from '@/lib/storage-router';

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

export type EmotionalState =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'focused'
  | 'frustrated'
  | 'tired'
  | 'stressed'
  | 'curious'
  | 'impatient'
  | 'satisfied';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export type CommunicationStyle =
  | 'brief' // Short, to-the-point responses
  | 'detailed' // Comprehensive explanations
  | 'technical' // Deep technical details
  | 'conversational'; // Natural, friendly tone

export interface KnowledgeItem {
  id: string;
  topic: string;
  description: string;
  knowledgeLevel: 'none' | 'vague' | 'familiar' | 'understands' | 'expert';
  lastUpdated: number;
  source: 'stated' | 'inferred' | 'demonstrated';
  confidence: number; // 0-1
}

export interface Intent {
  id: string;
  description: string;
  type: 'immediate' | 'session' | 'project' | 'long_term';
  priority: number; // 1-10
  inferredFrom: string;
  confidence: number;
  createdAt: number;
  completedAt?: number;
  status: 'active' | 'completed' | 'abandoned' | 'blocked';
}

export interface EmotionalSignal {
  timestamp: number;
  state: EmotionalState;
  intensity: number; // 0-1
  trigger?: string;
  indicators: string[];
}

export interface Preference {
  id: string;
  category: 'communication' | 'workflow' | 'technical' | 'interaction';
  key: string;
  value: string;
  strength: number; // 0-1, how strongly held
  observedCount: number;
  lastObserved: number;
}

export interface PerspectiveContext {
  whatTheyKnow: string[];
  whatTheyDontKnow: string[];
  whatTheyProbablyWant: string[];
  whatMightFrustrateThem: string[];
  suggestedApproach: string;
}

export interface MentalModel {
  personId: string;
  personName: string;

  // Knowledge state
  knowledge: Map<string, KnowledgeItem>;

  // Intent tracking
  intents: Intent[];
  currentFocus?: string;

  // Emotional state
  emotionalHistory: EmotionalSignal[];
  currentEmotionalState: EmotionalState;
  emotionalIntensity: number;

  // Preferences
  preferences: Preference[];
  communicationStyle: CommunicationStyle;

  // Context
  lastInteraction: number;
  interactionCount: number;
  sessionStartTime?: number;

  // Meta
  modelConfidence: number; // Overall confidence in the model
  lastUpdated: number;
}

// ════════════════════════════════════════════════════════════════════════════
// State
// ════════════════════════════════════════════════════════════════════════════

const mentalModels = new Map<string, MentalModel>();

const STORAGE_KEY = 'theory-of-mind';
const DEBOUNCE_MS = 5000;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      const serializable = Array.from(mentalModels.entries()).map(
        ([, model]) => ({
          ...model,
          knowledge: Array.from(model.knowledge.entries()),
        })
      );
      await saveToStorage(STORAGE_KEY, serializable);
    } catch (err) {
      console.error('[ToM] Failed to save:', err);
    }
  }, DEBOUNCE_MS);
}

// ════════════════════════════════════════════════════════════════════════════
// Core Functions
// ════════════════════════════════════════════════════════════════════════════

function generateId(): string {
  return `tom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get or create a mental model for a person
 */
export function getMentalModel(
  personId: string,
  personName?: string
): MentalModel {
  let model = mentalModels.get(personId);

  if (!model) {
    model = {
      personId,
      personName: personName || personId,
      knowledge: new Map(),
      intents: [],
      emotionalHistory: [],
      currentEmotionalState: 'neutral',
      emotionalIntensity: 0.5,
      preferences: [],
      communicationStyle: 'conversational',
      lastInteraction: Date.now(),
      interactionCount: 0,
      modelConfidence: 0.3, // Start with low confidence
      lastUpdated: Date.now(),
    };
    mentalModels.set(personId, model);
  }

  return model;
}

/**
 * Get Eric's mental model (convenience function)
 */
export function getEricModel(): MentalModel {
  return getMentalModel('eric', 'Eric');
}

// ════════════════════════════════════════════════════════════════════════════
// Knowledge Tracking
// ════════════════════════════════════════════════════════════════════════════

/**
 * Record something Eric knows or doesn't know
 */
export function updateKnowledge(
  topic: string,
  description: string,
  level: KnowledgeItem['knowledgeLevel'],
  source: KnowledgeItem['source'] = 'inferred',
  confidence: number = 0.7
): KnowledgeItem {
  const model = getEricModel();

  const existing = model.knowledge.get(topic.toLowerCase());
  const item: KnowledgeItem = {
    id: existing?.id || generateId(),
    topic: topic.toLowerCase(),
    description,
    knowledgeLevel: level,
    lastUpdated: Date.now(),
    source,
    confidence: existing
      ? Math.min(1, (existing.confidence + confidence) / 2)
      : confidence,
  };

  model.knowledge.set(topic.toLowerCase(), item);
  model.lastUpdated = Date.now();
  model.modelConfidence = Math.min(1, model.modelConfidence + 0.01);

  scheduleSave();
  return item;
}

/**
 * Get Eric's knowledge level on a topic
 */
export function getKnowledge(topic: string): KnowledgeItem | undefined {
  const model = getEricModel();
  return model.knowledge.get(topic.toLowerCase());
}

/**
 * Check if Eric likely knows about something
 */
export function doesEricKnow(
  topic: string,
  minLevel: KnowledgeItem['knowledgeLevel'] = 'familiar'
): { knows: boolean; confidence: number; level?: string } {
  const knowledge = getKnowledge(topic);
  if (!knowledge) {
    return { knows: false, confidence: 0.3 }; // Uncertain
  }

  const levelOrder = ['none', 'vague', 'familiar', 'understands', 'expert'];
  const currentIndex = levelOrder.indexOf(knowledge.knowledgeLevel);
  const requiredIndex = levelOrder.indexOf(minLevel);

  return {
    knows: currentIndex >= requiredIndex,
    confidence: knowledge.confidence,
    level: knowledge.knowledgeLevel,
  };
}

/**
 * List all knowledge items
 */
export function listKnowledge(category?: string): Array<{
  topic: string;
  level: string;
  confidence: number;
}> {
  const model = getEricModel();
  const items = Array.from(model.knowledge.values());

  const filtered = category
    ? items.filter((i) => i.topic.includes(category.toLowerCase()))
    : items;

  return filtered
    .sort((a, b) => b.lastUpdated - a.lastUpdated)
    .map((i) => ({
      topic: i.topic,
      level: i.knowledgeLevel,
      confidence: Math.round(i.confidence * 100),
    }));
}

// ════════════════════════════════════════════════════════════════════════════
// Intent Tracking
// ════════════════════════════════════════════════════════════════════════════

/**
 * Infer and record Eric's intent
 */
export function inferIntent(
  description: string,
  type: Intent['type'],
  inferredFrom: string,
  confidence: number = 0.7,
  priority: number = 5
): Intent {
  const model = getEricModel();

  // Check for similar existing intent
  const similar = model.intents.find(
    (i) =>
      i.status === 'active' &&
      i.description
        .toLowerCase()
        .includes(description.toLowerCase().slice(0, 20))
  );

  if (similar) {
    // Reinforce existing intent
    similar.confidence = Math.min(1, similar.confidence + 0.1);
    similar.priority = Math.max(similar.priority, priority);
    model.lastUpdated = Date.now();
    scheduleSave();
    return similar;
  }

  const intent: Intent = {
    id: generateId(),
    description,
    type,
    priority,
    inferredFrom,
    confidence,
    createdAt: Date.now(),
    status: 'active',
  };

  model.intents.push(intent);
  model.currentFocus = intent.id;
  model.lastUpdated = Date.now();

  // Bump model confidence
  model.modelConfidence = Math.min(1, model.modelConfidence + 0.02);

  scheduleSave();
  return intent;
}

/**
 * Mark an intent as completed
 */
export function completeIntent(intentId: string): boolean {
  const model = getEricModel();
  const intent = model.intents.find((i) => i.id === intentId);

  if (!intent) return false;

  intent.status = 'completed';
  intent.completedAt = Date.now();

  // Clear focus if this was focused
  if (model.currentFocus === intentId) {
    model.currentFocus = undefined;
  }

  model.lastUpdated = Date.now();
  scheduleSave();
  return true;
}

/**
 * Get active intents
 */
export function getActiveIntents(): Intent[] {
  const model = getEricModel();
  return model.intents
    .filter((i) => i.status === 'active')
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Get the current focused intent
 */
export function getCurrentFocus(): Intent | undefined {
  const model = getEricModel();
  if (!model.currentFocus) return undefined;
  return model.intents.find(
    (i) => i.id === model.currentFocus && i.status === 'active'
  );
}

/**
 * Infer urgency from conversation signals
 */
export function inferUrgency(
  message: string,
  responseTimeMs?: number
): UrgencyLevel {
  const lowerMessage = message.toLowerCase();

  // Critical urgency signals
  if (
    lowerMessage.includes('asap') ||
    lowerMessage.includes('emergency') ||
    lowerMessage.includes('urgent') ||
    lowerMessage.includes('immediately') ||
    lowerMessage.includes('right now')
  ) {
    return 'critical';
  }

  // High urgency signals
  if (
    lowerMessage.includes('quickly') ||
    lowerMessage.includes('soon') ||
    lowerMessage.includes('hurry') ||
    lowerMessage.includes('fast') ||
    lowerMessage.includes('before')
  ) {
    return 'high';
  }

  // Quick response indicates urgency
  if (responseTimeMs && responseTimeMs < 2000) {
    return 'medium';
  }

  // Brief messages often indicate impatience
  if (message.length < 20 && !message.includes('?')) {
    return 'medium';
  }

  return 'low';
}

// ════════════════════════════════════════════════════════════════════════════
// Emotional State Tracking
// ════════════════════════════════════════════════════════════════════════════

/**
 * Update Eric's emotional state based on observed signals
 */
export function updateEmotionalState(
  state: EmotionalState,
  intensity: number,
  trigger?: string,
  indicators: string[] = []
): void {
  const model = getEricModel();

  const signal: EmotionalSignal = {
    timestamp: Date.now(),
    state,
    intensity: Math.min(1, Math.max(0, intensity)),
    trigger,
    indicators,
  };

  model.emotionalHistory.push(signal);

  // Keep only last 50 signals
  if (model.emotionalHistory.length > 50) {
    model.emotionalHistory = model.emotionalHistory.slice(-50);
  }

  model.currentEmotionalState = state;
  model.emotionalIntensity = intensity;
  model.lastUpdated = Date.now();

  scheduleSave();
}

/**
 * Infer emotional state from a message
 */
export function inferEmotionalState(message: string): {
  state: EmotionalState;
  intensity: number;
  indicators: string[];
} {
  const lower = message.toLowerCase();
  const indicators: string[] = [];

  // Frustration signals
  if (
    lower.includes('not working') ||
    lower.includes('broken') ||
    lower.includes('wrong') ||
    lower.includes('again') ||
    lower.includes('still') ||
    lower.includes('why')
  ) {
    indicators.push('frustration_language');
  }

  // Excitement signals
  if (
    lower.includes('!') ||
    lower.includes('awesome') ||
    lower.includes('perfect') ||
    lower.includes('great') ||
    lower.includes('love')
  ) {
    indicators.push('positive_exclamation');
  }

  // Impatience signals
  if (
    lower.includes('just') ||
    lower.includes('already') ||
    lower.includes('come on') ||
    message.length < 15
  ) {
    indicators.push('brevity_or_impatience');
  }

  // Curiosity signals
  if (
    lower.includes('how') ||
    lower.includes('what if') ||
    lower.includes('could we') ||
    lower.includes('interesting')
  ) {
    indicators.push('curiosity_language');
  }

  // Tiredness signals
  if (
    lower.includes('tired') ||
    lower.includes('later') ||
    lower.includes('tomorrow') ||
    lower.includes('enough')
  ) {
    indicators.push('tiredness_language');
  }

  // Determine state
  let state: EmotionalState = 'neutral';
  let intensity = 0.5;

  if (indicators.includes('frustration_language')) {
    state = 'frustrated';
    intensity = 0.7;
  } else if (indicators.includes('positive_exclamation')) {
    state = indicators.length > 1 ? 'excited' : 'happy';
    intensity = 0.8;
  } else if (indicators.includes('brevity_or_impatience')) {
    state = 'impatient';
    intensity = 0.6;
  } else if (indicators.includes('curiosity_language')) {
    state = 'curious';
    intensity = 0.7;
  } else if (indicators.includes('tiredness_language')) {
    state = 'tired';
    intensity = 0.6;
  }

  // All caps indicates intensity
  if (message === message.toUpperCase() && message.length > 3) {
    intensity = Math.min(1, intensity + 0.2);
  }

  return { state, intensity, indicators };
}

/**
 * Get current emotional state
 */
export function getCurrentEmotionalState(): {
  state: EmotionalState;
  intensity: number;
  trending: 'better' | 'worse' | 'stable';
} {
  const model = getEricModel();
  const history = model.emotionalHistory.slice(-5);

  // Calculate trend
  let trending: 'better' | 'worse' | 'stable' = 'stable';
  if (history.length >= 3) {
    const positiveStates: EmotionalState[] = [
      'happy',
      'excited',
      'satisfied',
      'curious',
    ];
    const negativeStates: EmotionalState[] = [
      'frustrated',
      'stressed',
      'impatient',
      'tired',
    ];

    const recentPositive = history
      .slice(-2)
      .filter((h) => positiveStates.includes(h.state)).length;
    const olderPositive = history
      .slice(0, -2)
      .filter((h) => positiveStates.includes(h.state)).length;
    const recentNegative = history
      .slice(-2)
      .filter((h) => negativeStates.includes(h.state)).length;
    const olderNegative = history
      .slice(0, -2)
      .filter((h) => negativeStates.includes(h.state)).length;

    if (recentPositive > olderPositive || recentNegative < olderNegative) {
      trending = 'better';
    } else if (
      recentNegative > olderNegative ||
      recentPositive < olderPositive
    ) {
      trending = 'worse';
    }
  }

  return {
    state: model.currentEmotionalState,
    intensity: model.emotionalIntensity,
    trending,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Preference Learning
// ════════════════════════════════════════════════════════════════════════════

/**
 * Record an observed preference
 */
export function observePreference(
  category: Preference['category'],
  key: string,
  value: string,
  strength: number = 0.7
): Preference {
  const model = getEricModel();

  const existing = model.preferences.find(
    (p) => p.category === category && p.key === key
  );

  if (existing) {
    // Reinforce or update
    if (existing.value === value) {
      existing.observedCount++;
      existing.strength = Math.min(1, existing.strength + 0.05);
    } else {
      // Value changed - reduce strength of old, might be changing preference
      existing.value = value;
      existing.strength = Math.max(0.3, strength);
    }
    existing.lastObserved = Date.now();
    model.lastUpdated = Date.now();
    scheduleSave();
    return existing;
  }

  const pref: Preference = {
    id: generateId(),
    category,
    key,
    value,
    strength,
    observedCount: 1,
    lastObserved: Date.now(),
  };

  model.preferences.push(pref);
  model.lastUpdated = Date.now();
  scheduleSave();
  return pref;
}

/**
 * Get a preference value
 */
export function getPreference(
  category: Preference['category'],
  key: string
): { value: string; strength: number } | undefined {
  const model = getEricModel();
  const pref = model.preferences.find(
    (p) => p.category === category && p.key === key
  );
  if (!pref) return undefined;
  return { value: pref.value, strength: pref.strength };
}

/**
 * Get all preferences in a category
 */
export function getPreferences(
  category?: Preference['category']
): Array<{ key: string; value: string; strength: number }> {
  const model = getEricModel();
  const filtered = category
    ? model.preferences.filter((p) => p.category === category)
    : model.preferences;

  return filtered
    .sort((a, b) => b.strength - a.strength)
    .map((p) => ({
      key: p.key,
      value: p.value,
      strength: Math.round(p.strength * 100),
    }));
}

/**
 * Update communication style preference
 */
export function updateCommunicationStyle(style: CommunicationStyle): void {
  const model = getEricModel();
  model.communicationStyle = style;
  model.lastUpdated = Date.now();
  observePreference('communication', 'style', style, 0.8);
}

// ════════════════════════════════════════════════════════════════════════════
// Perspective Taking
// ════════════════════════════════════════════════════════════════════════════

/**
 * Take Eric's perspective on a situation
 * "What does this look like from Eric's point of view?"
 */
export function takePerspective(situation: string): PerspectiveContext {
  const model = getEricModel();
  const knowledge = Array.from(model.knowledge.values());

  // What they likely know
  const whatTheyKnow: string[] = knowledge
    .filter((k) => k.knowledgeLevel !== 'none' && k.confidence > 0.5)
    .map((k) => k.topic);

  // What they likely don't know
  const whatTheyDontKnow: string[] = [];
  const situationTopics = situation.toLowerCase().split(/\s+/);
  for (const topic of situationTopics) {
    if (topic.length > 4) {
      const known = knowledge.find((k) => k.topic.includes(topic));
      if (!known || known.knowledgeLevel === 'none') {
        whatTheyDontKnow.push(topic);
      }
    }
  }

  // What they probably want
  const activeIntents = getActiveIntents();
  const whatTheyProbablyWant = activeIntents
    .slice(0, 3)
    .map((i) => i.description);

  // What might frustrate them
  const whatMightFrustrateThem: string[] = [];
  const emotional = getCurrentEmotionalState();
  if (emotional.state === 'frustrated' || emotional.state === 'impatient') {
    whatMightFrustrateThem.push('delays or slow progress');
  }
  if (emotional.state === 'tired') {
    whatMightFrustrateThem.push('complex explanations');
  }

  // Check for repeated failures
  const recentIntents = model.intents.filter(
    (i) =>
      i.status === 'blocked' && Date.now() - i.createdAt < 24 * 60 * 60 * 1000
  );
  if (recentIntents.length > 0) {
    whatMightFrustrateThem.push('same problems recurring');
  }

  // Suggest approach based on state
  let suggestedApproach = 'Be helpful and thorough.';

  if (emotional.state === 'frustrated') {
    suggestedApproach =
      'Acknowledge the frustration, be direct, focus on solutions not explanations.';
  } else if (emotional.state === 'impatient') {
    suggestedApproach =
      'Be brief and action-oriented. Skip unnecessary context.';
  } else if (emotional.state === 'tired') {
    suggestedApproach =
      'Keep it simple. Offer to continue later if appropriate.';
  } else if (emotional.state === 'curious') {
    suggestedApproach =
      'Explore the topic together. Share interesting details and possibilities.';
  } else if (emotional.state === 'excited') {
    suggestedApproach = 'Match the enthusiasm. Move quickly on ideas.';
  }

  // Adjust for communication style
  if (model.communicationStyle === 'brief') {
    suggestedApproach += ' Keep responses concise.';
  } else if (model.communicationStyle === 'technical') {
    suggestedApproach += ' Include technical details.';
  }

  return {
    whatTheyKnow,
    whatTheyDontKnow,
    whatTheyProbablyWant,
    whatMightFrustrateThem,
    suggestedApproach,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Interaction Processing
// ════════════════════════════════════════════════════════════════════════════

/**
 * Process an incoming message from Eric
 * Updates emotional state, infers intents, etc.
 */
export function processMessage(
  message: string,
  responseTimeMs?: number
): {
  emotionalState: EmotionalState;
  urgency: UrgencyLevel;
  suggestedApproach: string;
} {
  const model = getEricModel();

  // Update interaction tracking
  model.interactionCount++;
  model.lastInteraction = Date.now();

  // Infer emotional state
  const emotional = inferEmotionalState(message);
  updateEmotionalState(
    emotional.state,
    emotional.intensity,
    message.slice(0, 50),
    emotional.indicators
  );

  // Infer urgency
  const urgency = inferUrgency(message, responseTimeMs);

  // Get perspective-based approach
  const perspective = takePerspective(message);

  model.lastUpdated = Date.now();
  scheduleSave();

  return {
    emotionalState: emotional.state,
    urgency,
    suggestedApproach: perspective.suggestedApproach,
  };
}

/**
 * Record that Eric started a new session
 */
export function startSession(): void {
  const model = getEricModel();
  model.sessionStartTime = Date.now();
  model.lastInteraction = Date.now();

  // Clear old session-level intents
  model.intents = model.intents.map((i) =>
    i.type === 'session' && i.status === 'active'
      ? { ...i, status: 'abandoned' as const }
      : i
  );

  scheduleSave();
}

// ════════════════════════════════════════════════════════════════════════════
// Status & Export
// ════════════════════════════════════════════════════════════════════════════

/**
 * Get overall Theory of Mind status
 */
export function getTheoryOfMindStatus(): {
  modelConfidence: number;
  knowledgeItems: number;
  activeIntents: number;
  currentEmotionalState: EmotionalState;
  communicationStyle: CommunicationStyle;
  interactionCount: number;
  lastInteraction: number;
  preferences: number;
} {
  const model = getEricModel();

  return {
    modelConfidence: Math.round(model.modelConfidence * 100),
    knowledgeItems: model.knowledge.size,
    activeIntents: model.intents.filter((i) => i.status === 'active').length,
    currentEmotionalState: model.currentEmotionalState,
    communicationStyle: model.communicationStyle,
    interactionCount: model.interactionCount,
    lastInteraction: model.lastInteraction,
    preferences: model.preferences.length,
  };
}

/**
 * Export for debugging/inspection
 */
export function exportMentalModel(): Record<string, unknown> {
  const model = getEricModel();

  return {
    personName: model.personName,
    modelConfidence: model.modelConfidence,
    knowledge: Array.from(model.knowledge.values()).slice(0, 20),
    activeIntents: model.intents.filter((i) => i.status === 'active'),
    recentEmotions: model.emotionalHistory.slice(-10),
    currentState: {
      emotional: model.currentEmotionalState,
      intensity: model.emotionalIntensity,
      focus: model.currentFocus,
    },
    preferences: model.preferences,
    communicationStyle: model.communicationStyle,
    stats: {
      totalInteractions: model.interactionCount,
      lastInteraction: model.lastInteraction,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Persistence
// ════════════════════════════════════════════════════════════════════════════

/**
 * Load Theory of Mind state from storage
 */
export async function loadTheoryOfMind(): Promise<number> {
  try {
    const stored = await loadFromStorage<
      Array<{
        personId: string;
        personName: string;
        knowledge: Array<[string, KnowledgeItem]>;
        intents: Intent[];
        emotionalHistory: EmotionalSignal[];
        currentEmotionalState: EmotionalState;
        emotionalIntensity: number;
        preferences: Preference[];
        communicationStyle: CommunicationStyle;
        lastInteraction: number;
        interactionCount: number;
        sessionStartTime?: number;
        currentFocus?: string;
        modelConfidence: number;
        lastUpdated: number;
      }>
    >(STORAGE_KEY);

    if (!stored || stored.length === 0) {
      // Seed with initial Eric model
      seedEricModel();
      return 1;
    }

    for (const modelData of stored) {
      const model: MentalModel = {
        ...modelData,
        knowledge: new Map(modelData.knowledge),
      };
      mentalModels.set(model.personId, model);
    }

    return mentalModels.size;
  } catch (err) {
    console.error('[ToM] Failed to load:', err);
    seedEricModel();
    return 1;
  }
}

/**
 * Seed initial Eric model with known information
 */
function seedEricModel(): void {
  const model = getMentalModel('eric', 'Eric');

  // Known knowledge
  updateKnowledge(
    'molly',
    'Eric created Molly and understands her architecture',
    'expert',
    'demonstrated',
    0.95
  );
  updateKnowledge(
    'typescript',
    'Eric is proficient in TypeScript',
    'expert',
    'demonstrated',
    0.9
  );
  updateKnowledge(
    'next.js',
    'Eric uses Next.js for web development',
    'understands',
    'demonstrated',
    0.85
  );
  updateKnowledge(
    'ai/llm',
    'Eric understands AI/LLM concepts',
    'expert',
    'demonstrated',
    0.9
  );
  updateKnowledge(
    'firebase',
    'Eric uses Firebase for backend',
    'understands',
    'demonstrated',
    0.8
  );

  // Known preferences
  observePreference('communication', 'style', 'brief', 0.8);
  observePreference('workflow', 'commits', 'atomic', 0.7);
  observePreference('technical', 'error_handling', 'explicit', 0.7);
  observePreference('interaction', 'confirmation', 'minimal', 0.75);

  // Set initial model confidence
  model.modelConfidence = 0.5;
  model.communicationStyle = 'brief';

  scheduleSave();
}

/**
 * Force save (for shutdown)
 */
export async function saveTheoryOfMind(): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  const serializable = Array.from(mentalModels.entries()).map(([, model]) => ({
    ...model,
    knowledge: Array.from(model.knowledge.entries()),
  }));

  await saveToStorage(STORAGE_KEY, serializable);
}
