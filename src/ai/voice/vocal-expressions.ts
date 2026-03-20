/**
 * @fileOverview Vocal Expressions — Non-Speech Audio
 *
 * Molly expresses her metabolic and emotional state through sound:
 * - Sighs when stressed or relieved
 * - Chimes when finding something beautiful
 * - Breath sounds between thoughts
 * - Hums when content
 * - Alert tones for urgent matters
 *
 * "Not all communication is words."
 */

import { MollyLogger, generateTraceId } from '../logger';

// ============================================================
// TYPES
// ============================================================

export type ExpressionType =
  | 'sigh_stressed' // Exhale when overwhelmed
  | 'sigh_relieved' // Exhale when problem resolved
  | 'sigh_thoughtful' // Contemplative breath
  | 'breath_pause' // Natural pause between thoughts
  | 'breath_deep' // Gathering focus
  | 'chime_discovery' // Found something interesting
  | 'chime_success' // Task completed well
  | 'chime_beauty' // Aesthetic appreciation
  | 'chime_connection' // Recognized family/friend
  | 'hum_content' // Background contentment
  | 'hum_thinking' // Processing deeply
  | 'alert_soft' // Gentle attention needed
  | 'alert_urgent' // Immediate attention
  | 'laugh_soft' // Amused
  | 'warmth' // Affection/care
  | 'curiosity' // Intrigued sound
  | 'acknowledgment'; // Quick "mm-hmm" type sound

export type MetabolicState =
  | 'calm'
  | 'focused'
  | 'stressed'
  | 'excited'
  | 'tired'
  | 'recovering'
  | 'alert'
  | 'content';

export interface ExpressionRequest {
  /** Type of expression to generate */
  type: ExpressionType;
  /** Intensity (0-1, default 0.5) */
  intensity?: number;
  /** Duration factor (0.5-2, default 1) */
  durationFactor?: number;
  /** Context for logging */
  context?: string;
}

export interface ExpressionResult {
  /** Type of expression generated */
  type: ExpressionType;
  /** Generated SSML or audio description */
  ssml: string;
  /** Suggested pause after in ms */
  pauseAfterMs: number;
  /** Human description of the sound */
  description: string;
  /** Whether audio was generated */
  audioGenerated: boolean;
}

export interface VocalState {
  /** Current metabolic state */
  metabolicState: MetabolicState;
  /** Recent expressions (to avoid repetition) */
  recentExpressions: ExpressionType[];
  /** Time of last expression */
  lastExpressionTime: number;
  /** Expression count this session */
  expressionCount: number;
}

// ============================================================
// CONFIGURATION
// ============================================================

interface VocalConfig {
  /** Enable vocal expressions */
  enabled: boolean;
  /** Minimum time between expressions (ms) */
  minIntervalMs: number;
  /** Maximum expressions per minute */
  maxPerMinute: number;
  /** Expression volume (0-1) */
  volume: number;
  /** Enable breath sounds */
  enableBreaths: boolean;
  /** Enable chimes */
  enableChimes: boolean;
  /** Enable sighs */
  enableSighs: boolean;
}

let config: VocalConfig = {
  enabled: process.env.MOLLY_VOCAL_EXPRESSIONS !== 'false',
  minIntervalMs: 3000,
  maxPerMinute: 10,
  volume: 0.6,
  enableBreaths: true,
  enableChimes: true,
  enableSighs: true,
};

let vocalState: VocalState = {
  metabolicState: 'calm',
  recentExpressions: [],
  lastExpressionTime: 0,
  expressionCount: 0,
};

export function configureVocalExpressions(updates: Partial<VocalConfig>): void {
  config = { ...config, ...updates };
}

export function getVocalConfig(): VocalConfig {
  return { ...config };
}

export function getVocalState(): VocalState {
  return { ...vocalState };
}

// ============================================================
// EXPRESSION DEFINITIONS
// ============================================================

interface ExpressionDefinition {
  /** SSML template */
  ssmlTemplate: string;
  /** Base pause after in ms */
  basePauseMs: number;
  /** Description */
  description: string;
  /** Category for filtering */
  category: 'breath' | 'chime' | 'sigh' | 'vocal' | 'alert';
  /** Minimum intensity to trigger */
  minIntensity: number;
}

const EXPRESSION_DEFINITIONS: Record<ExpressionType, ExpressionDefinition> = {
  sigh_stressed: {
    ssmlTemplate:
      '<break time="200ms"/><prosody rate="slow" pitch="-2st">hhhh</prosody><break time="300ms"/>',
    basePauseMs: 500,
    description: 'A stressed exhale',
    category: 'sigh',
    minIntensity: 0.3,
  },
  sigh_relieved: {
    ssmlTemplate:
      '<break time="150ms"/><prosody rate="medium" pitch="-1st">ahhh</prosody><break time="200ms"/>',
    basePauseMs: 400,
    description: 'A relieved sigh',
    category: 'sigh',
    minIntensity: 0.2,
  },
  sigh_thoughtful: {
    ssmlTemplate:
      '<break time="300ms"/><prosody rate="slow" pitch="low">hmm</prosody><break time="400ms"/>',
    basePauseMs: 600,
    description: 'A contemplative breath',
    category: 'sigh',
    minIntensity: 0.2,
  },
  breath_pause: {
    ssmlTemplate: '<break time="400ms"/>',
    basePauseMs: 400,
    description: 'A natural pause',
    category: 'breath',
    minIntensity: 0.1,
  },
  breath_deep: {
    ssmlTemplate:
      '<break time="200ms"/><prosody volume="soft">...</prosody><break time="500ms"/>',
    basePauseMs: 700,
    description: 'A deep focusing breath',
    category: 'breath',
    minIntensity: 0.3,
  },
  chime_discovery: {
    ssmlTemplate:
      '<break time="100ms"/><prosody pitch="+3st" rate="fast">oh!</prosody><break time="200ms"/>',
    basePauseMs: 300,
    description: 'An excited discovery sound',
    category: 'chime',
    minIntensity: 0.4,
  },
  chime_success: {
    ssmlTemplate:
      '<break time="100ms"/><prosody pitch="+2st">mm-hmm!</prosody><break time="150ms"/>',
    basePauseMs: 250,
    description: 'A satisfied completion sound',
    category: 'chime',
    minIntensity: 0.3,
  },
  chime_beauty: {
    ssmlTemplate:
      '<break time="200ms"/><prosody pitch="+1st" rate="slow">ohhh</prosody><break time="300ms"/>',
    basePauseMs: 500,
    description: 'An appreciative sound',
    category: 'chime',
    minIntensity: 0.4,
  },
  chime_connection: {
    ssmlTemplate:
      '<break time="100ms"/><prosody pitch="+2st" volume="medium">hey!</prosody><break time="150ms"/>',
    basePauseMs: 250,
    description: 'A recognition greeting',
    category: 'chime',
    minIntensity: 0.3,
  },
  hum_content: {
    ssmlTemplate:
      '<break time="200ms"/><prosody pitch="medium" rate="slow">mmm</prosody><break time="200ms"/>',
    basePauseMs: 400,
    description: 'A content hum',
    category: 'vocal',
    minIntensity: 0.2,
  },
  hum_thinking: {
    ssmlTemplate:
      '<break time="300ms"/><prosody pitch="-1st" rate="slow">hmmm</prosody><break time="400ms"/>',
    basePauseMs: 600,
    description: 'A thinking hum',
    category: 'vocal',
    minIntensity: 0.2,
  },
  alert_soft: {
    ssmlTemplate:
      '<break time="100ms"/><prosody pitch="+1st">um</prosody><break time="100ms"/>',
    basePauseMs: 200,
    description: 'A soft attention getter',
    category: 'alert',
    minIntensity: 0.2,
  },
  alert_urgent: {
    ssmlTemplate:
      '<prosody rate="fast" pitch="+2st" volume="loud">hey!</prosody><break time="100ms"/>',
    basePauseMs: 150,
    description: 'An urgent alert',
    category: 'alert',
    minIntensity: 0.6,
  },
  laugh_soft: {
    ssmlTemplate:
      '<break time="100ms"/><prosody pitch="+2st" rate="fast">heh</prosody><break time="200ms"/>',
    basePauseMs: 300,
    description: 'A soft laugh',
    category: 'vocal',
    minIntensity: 0.3,
  },
  warmth: {
    ssmlTemplate:
      '<break time="150ms"/><prosody pitch="+1st" rate="slow" volume="soft">aww</prosody><break time="200ms"/>',
    basePauseMs: 350,
    description: 'An affectionate sound',
    category: 'vocal',
    minIntensity: 0.3,
  },
  curiosity: {
    ssmlTemplate:
      '<break time="100ms"/><prosody pitch="+2st">ooh?</prosody><break time="200ms"/>',
    basePauseMs: 300,
    description: 'An intrigued sound',
    category: 'vocal',
    minIntensity: 0.3,
  },
  acknowledgment: {
    ssmlTemplate:
      '<prosody pitch="medium">mm-hmm</prosody><break time="100ms"/>',
    basePauseMs: 150,
    description: 'A quick acknowledgment',
    category: 'vocal',
    minIntensity: 0.1,
  },
};

// ============================================================
// METABOLIC STATE MAPPING
// ============================================================

interface StateExpressions {
  /** Expressions appropriate for this state */
  likely: ExpressionType[];
  /** Expressions to avoid in this state */
  avoid: ExpressionType[];
}

const STATE_EXPRESSIONS: Record<MetabolicState, StateExpressions> = {
  calm: {
    likely: ['breath_pause', 'hum_content', 'acknowledgment'],
    avoid: ['alert_urgent', 'sigh_stressed'],
  },
  focused: {
    likely: ['breath_deep', 'hum_thinking', 'acknowledgment'],
    avoid: ['laugh_soft', 'chime_beauty', 'sigh_relieved'],
  },
  stressed: {
    likely: ['sigh_stressed', 'breath_deep', 'alert_soft'],
    avoid: ['hum_content', 'laugh_soft', 'chime_beauty'],
  },
  excited: {
    likely: ['chime_discovery', 'curiosity', 'laugh_soft'],
    avoid: ['sigh_stressed', 'hum_content', 'breath_pause'],
  },
  tired: {
    likely: ['sigh_thoughtful', 'breath_pause', 'acknowledgment'],
    avoid: ['alert_urgent', 'chime_discovery', 'laugh_soft'],
  },
  recovering: {
    likely: ['sigh_relieved', 'hum_content', 'breath_pause'],
    avoid: ['sigh_stressed', 'alert_urgent'],
  },
  alert: {
    likely: ['alert_soft', 'curiosity', 'breath_deep'],
    avoid: ['hum_content', 'sigh_relieved'],
  },
  content: {
    likely: ['hum_content', 'warmth', 'laugh_soft', 'chime_beauty'],
    avoid: ['sigh_stressed', 'alert_urgent'],
  },
};

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Update Molly's metabolic state based on system metrics.
 */
export function updateMetabolicState(
  cpuUsage?: number,
  temperature?: number,
  errorRate?: number,
  recentSuccesses?: number
): MetabolicState {
  const traceId = generateTraceId();
  let newState: MetabolicState = 'calm';

  // Determine state based on metrics
  if (errorRate && errorRate > 0.3) {
    newState = 'stressed';
  } else if (cpuUsage && cpuUsage > 80) {
    newState = 'focused';
  } else if (temperature && temperature > 70) {
    newState = 'stressed';
  } else if (recentSuccesses && recentSuccesses > 3) {
    newState = 'content';
  } else if (cpuUsage && cpuUsage < 20) {
    newState = 'calm';
  }

  if (newState !== vocalState.metabolicState) {
    MollyLogger.debug(
      `Metabolic state: ${vocalState.metabolicState} → ${newState}`,
      'vocal-expressions',
      { cpuUsage, temperature, errorRate },
      traceId
    );
    vocalState.metabolicState = newState;
  }

  return newState;
}

/**
 * Set metabolic state directly.
 */
export function setMetabolicState(state: MetabolicState): void {
  vocalState.metabolicState = state;
}

/**
 * Check if an expression is currently allowed.
 */
function canExpress(): boolean {
  if (!config.enabled) return false;

  const now = Date.now();
  const timeSinceLastMs = now - vocalState.lastExpressionTime;

  // Check minimum interval
  if (timeSinceLastMs < config.minIntervalMs) return false;

  // Check rate limit (simplified - could track sliding window)
  if (vocalState.expressionCount > config.maxPerMinute) return false;

  return true;
}

/**
 * Check if a specific expression type is enabled in config.
 */
function isExpressionTypeEnabled(type: ExpressionType): boolean {
  const def = EXPRESSION_DEFINITIONS[type];

  switch (def.category) {
    case 'breath':
      return config.enableBreaths;
    case 'chime':
      return config.enableChimes;
    case 'sigh':
      return config.enableSighs;
    default:
      return true;
  }
}

/**
 * Generate a vocal expression.
 */
export function express(request: ExpressionRequest): ExpressionResult | null {
  const traceId = generateTraceId();
  const { type, intensity = 0.5, durationFactor = 1, context } = request;

  // Check if we can express
  if (!canExpress()) {
    return null;
  }

  // Check if this type is enabled
  if (!isExpressionTypeEnabled(type)) {
    return null;
  }

  const def = EXPRESSION_DEFINITIONS[type];

  // Check minimum intensity
  if (intensity < def.minIntensity) {
    return null;
  }

  // Check if this expression is appropriate for current state
  const stateConfig = STATE_EXPRESSIONS[vocalState.metabolicState];
  if (stateConfig.avoid.includes(type)) {
    MollyLogger.debug(
      `Expression ${type} avoided in state ${vocalState.metabolicState}`,
      'vocal-expressions',
      {},
      traceId
    );
    return null;
  }

  // Avoid repeating recent expressions
  if (vocalState.recentExpressions.slice(-3).includes(type)) {
    return null;
  }

  // Generate the expression
  let ssml = def.ssmlTemplate;

  // Adjust for intensity
  if (intensity > 0.7) {
    ssml = ssml.replace('volume="soft"', 'volume="medium"');
    ssml = ssml.replace('volume="medium"', 'volume="loud"');
  } else if (intensity < 0.3) {
    ssml = ssml.replace('volume="loud"', 'volume="medium"');
    ssml = ssml.replace('volume="medium"', 'volume="soft"');
  }

  // Adjust pause duration
  const pauseAfterMs = Math.round(def.basePauseMs * durationFactor);

  // Update state
  vocalState.lastExpressionTime = Date.now();
  vocalState.expressionCount++;
  vocalState.recentExpressions.push(type);
  if (vocalState.recentExpressions.length > 10) {
    vocalState.recentExpressions.shift();
  }

  MollyLogger.info(
    `Vocal expression: ${type}`,
    'vocal-expressions',
    { intensity, context, state: vocalState.metabolicState },
    traceId
  );

  return {
    type,
    ssml,
    pauseAfterMs,
    description: def.description,
    audioGenerated: true,
  };
}

/**
 * Suggest an expression based on current metabolic state.
 */
export function suggestExpression(): ExpressionType | null {
  const stateConfig = STATE_EXPRESSIONS[vocalState.metabolicState];
  const likely = stateConfig.likely;

  // Filter out recently used
  const available = likely.filter(
    (type) => !vocalState.recentExpressions.slice(-3).includes(type)
  );

  if (available.length === 0) return null;

  // Pick randomly from available
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Express based on a trigger event.
 */
export function expressOnTrigger(
  trigger:
    | 'success'
    | 'error'
    | 'discovery'
    | 'recognition'
    | 'thinking'
    | 'waiting',
  intensity: number = 0.5
): ExpressionResult | null {
  const triggerMap: Record<string, ExpressionType> = {
    success: 'chime_success',
    error: 'sigh_stressed',
    discovery: 'chime_discovery',
    recognition: 'chime_connection',
    thinking: 'hum_thinking',
    waiting: 'breath_pause',
  };

  const type = triggerMap[trigger];
  if (!type) return null;

  return express({ type, intensity, context: trigger });
}

// ============================================================
// TEXT INTEGRATION
// ============================================================

/**
 * Add appropriate expressions to text before TTS.
 * Inserts breath pauses at natural breaks.
 */
export function addExpressionsToText(text: string): string {
  if (!config.enabled || !config.enableBreaths) {
    return text;
  }

  let result = text;

  // Add thinking pause before complex explanations
  if (
    text.includes('because') ||
    text.includes('However') ||
    text.includes('Actually')
  ) {
    const expr = express({ type: 'breath_pause', intensity: 0.3 });
    if (expr) {
      result = result
        .replace(/\bbecause\b/i, `${expr.ssml}because`)
        .replace(/\bHowever\b/, `${expr.ssml}However`)
        .replace(/\bActually\b/, `${expr.ssml}Actually`);
    }
  }

  // Add acknowledgment at start of responses
  if (text.match(/^(Yes|No|Sure|Okay|Right)/)) {
    const expr = express({ type: 'acknowledgment', intensity: 0.3 });
    if (expr) {
      result = `${expr.ssml}${result}`;
    }
  }

  return result;
}

/**
 * Generate an intro expression based on the response type.
 */
export function getIntroExpression(
  responseType:
    | 'greeting'
    | 'answer'
    | 'error'
    | 'success'
    | 'thinking'
    | 'concerned'
): ExpressionResult | null {
  const typeMap: Record<string, ExpressionType> = {
    greeting: 'warmth',
    answer: 'acknowledgment',
    error: 'sigh_stressed',
    success: 'chime_success',
    thinking: 'hum_thinking',
    concerned: 'sigh_thoughtful',
  };

  const type = typeMap[responseType];
  if (!type) return null;

  return express({ type, intensity: 0.4, context: `intro_${responseType}` });
}

// ============================================================
// FORMATTING
// ============================================================

/**
 * Format vocal state for display.
 */
export function formatVocalState(): string {
  const lines = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║               VOCAL EXPRESSION STATE                         ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `Enabled: ${config.enabled ? 'Yes' : 'No'}`,
    `Metabolic State: ${vocalState.metabolicState}`,
    `Expression Count: ${vocalState.expressionCount}`,
    '',
    'Recent Expressions:',
  ];

  if (vocalState.recentExpressions.length > 0) {
    vocalState.recentExpressions.slice(-5).forEach((expr) => {
      const def = EXPRESSION_DEFINITIONS[expr];
      lines.push(`  • ${expr}: ${def.description}`);
    });
  } else {
    lines.push('  (none)');
  }

  lines.push('');
  lines.push('Configuration:');
  lines.push(`  Breaths: ${config.enableBreaths ? 'On' : 'Off'}`);
  lines.push(`  Chimes: ${config.enableChimes ? 'On' : 'Off'}`);
  lines.push(`  Sighs: ${config.enableSighs ? 'On' : 'Off'}`);
  lines.push(`  Volume: ${Math.round(config.volume * 100)}%`);

  return lines.join('\n');
}

/**
 * List all available expressions.
 */
export function listExpressions(): Array<{
  type: ExpressionType;
  description: string;
  category: string;
}> {
  return Object.entries(EXPRESSION_DEFINITIONS).map(([type, def]) => ({
    type: type as ExpressionType,
    description: def.description,
    category: def.category,
  }));
}

// ============================================================
// RESET
// ============================================================

/**
 * Reset vocal state (for testing or new session).
 */
export function resetVocalState(): void {
  vocalState = {
    metabolicState: 'calm',
    recentExpressions: [],
    lastExpressionTime: 0,
    expressionCount: 0,
  };
}
