/**
 * @fileOverview Voice Personality System — Making Molly Sound Human
 *
 * Transforms text responses into natural, conversational speech patterns.
 * Adds prosody hints, emotional inflection, and conversational markers
 * that make Molly sound like a real person, not a robot.
 *
 * "The spider speaks with warmth, not monotone."
 */

import { MollyLogger, generateTraceId } from '../logger';

// ============================================================
// TYPES
// ============================================================

export type EmotionalTone =
  | 'neutral'
  | 'warm'
  | 'excited'
  | 'concerned'
  | 'thoughtful'
  | 'playful'
  | 'apologetic'
  | 'confident'
  | 'curious';

export type SpeakingStyle =
  | 'conversational'
  | 'explaining'
  | 'comforting'
  | 'urgent'
  | 'storytelling'
  | 'technical';

export interface VoicePersonalityConfig {
  /** Enable natural contractions (I am -> I'm) */
  useContractions: boolean;
  /** Add filler words for naturalness (well, you know, so) */
  useFillers: boolean;
  /** Add breath pauses via SSML */
  addBreathPauses: boolean;
  /** Vary speaking rate based on content */
  dynamicPacing: boolean;
  /** Add emotional inflection markers */
  emotionalInflection: boolean;
  /** Speaking rate multiplier (0.8 = slower, 1.2 = faster) */
  baseRate: number;
  /** Pitch variation (-2 to +2 semitones) */
  pitchVariation: number;
}

export interface ProcessedSpeech {
  /** The processed text ready for TTS */
  text: string;
  /** SSML markup if supported */
  ssml?: string;
  /** Detected emotional tone */
  tone: EmotionalTone;
  /** Recommended speaking style */
  style: SpeakingStyle;
  /** Estimated duration in seconds */
  estimatedDurationSec: number;
}

// ============================================================
// DEFAULTS
// ============================================================

const DEFAULT_CONFIG: VoicePersonalityConfig = {
  useContractions: true,
  useFillers: true,
  addBreathPauses: true,
  dynamicPacing: true,
  emotionalInflection: true,
  baseRate: 1.0,
  pitchVariation: 0,
};

// ============================================================
// CONTRACTION PATTERNS
// ============================================================

const CONTRACTIONS: [RegExp, string][] = [
  [/\bI am\b/gi, "I'm"],
  [/\bI have\b/gi, "I've"],
  [/\bI will\b/gi, "I'll"],
  [/\bI would\b/gi, "I'd"],
  [/\bI had\b/gi, "I'd"],
  [/\byou are\b/gi, "you're"],
  [/\byou have\b/gi, "you've"],
  [/\byou will\b/gi, "you'll"],
  [/\byou would\b/gi, "you'd"],
  [/\bwe are\b/gi, "we're"],
  [/\bwe have\b/gi, "we've"],
  [/\bwe will\b/gi, "we'll"],
  [/\bthey are\b/gi, "they're"],
  [/\bthey have\b/gi, "they've"],
  [/\bthat is\b/gi, "that's"],
  [/\bthere is\b/gi, "there's"],
  [/\bit is\b/gi, "it's"],
  [/\bit will\b/gi, "it'll"],
  [/\bwhat is\b/gi, "what's"],
  [/\bwho is\b/gi, "who's"],
  [/\bhow is\b/gi, "how's"],
  [/\bwhere is\b/gi, "where's"],
  [/\bdo not\b/gi, "don't"],
  [/\bdoes not\b/gi, "doesn't"],
  [/\bdid not\b/gi, "didn't"],
  [/\bwill not\b/gi, "won't"],
  [/\bwould not\b/gi, "wouldn't"],
  [/\bcould not\b/gi, "couldn't"],
  [/\bshould not\b/gi, "shouldn't"],
  [/\bcan not\b/gi, "can't"],
  [/\bcannot\b/gi, "can't"],
  [/\bis not\b/gi, "isn't"],
  [/\bare not\b/gi, "aren't"],
  [/\bwas not\b/gi, "wasn't"],
  [/\bwere not\b/gi, "weren't"],
  [/\bhas not\b/gi, "hasn't"],
  [/\bhave not\b/gi, "haven't"],
  [/\bhad not\b/gi, "hadn't"],
  [/\blet us\b/gi, "let's"],
  [/\bgoing to\b/gi, 'gonna'],
  [/\bwant to\b/gi, 'wanna'],
  [/\bgot to\b/gi, 'gotta'],
];

// ============================================================
// EMOTIONAL DETECTION PATTERNS
// ============================================================

const EMOTION_PATTERNS: Record<EmotionalTone, RegExp[]> = {
  excited: [
    /\b(amazing|awesome|fantastic|incredible|wonderful|great news|love it|perfect)\b/i,
    /!{2,}/,
    /\b(yes!|yay|woohoo)\b/i,
  ],
  concerned: [
    /\b(worried|concern|issue|problem|careful|warning|danger|risk)\b/i,
    /\b(unfortunately|sadly|bad news)\b/i,
    /\b(might want to|should consider|be aware)\b/i,
  ],
  apologetic: [
    /\b(sorry|apologize|my bad|forgive me|oops|mistake)\b/i,
    /\b(I should have|I could have)\b/i,
  ],
  thoughtful: [
    /\b(hmm|interesting|consider|perhaps|maybe|wondering)\b/i,
    /\b(let me think|good question|that depends)\b/i,
  ],
  playful: [/\b(haha|lol|funny|silly|kidding|joke)\b/i, /;[\)D]|:\)|:P/],
  warm: [
    /\b(love you|care about|here for you|proud of you)\b/i,
    /\b(family|together|sweetie|honey|dear)\b/i,
  ],
  confident: [
    /\b(definitely|absolutely|certainly|guaranteed|no doubt)\b/i,
    /\b(I know|trust me|count on)\b/i,
  ],
  curious: [/\b(what if|I wonder|curious|fascinated|intrigued)\b/i, /\?{2,}/],
  neutral: [],
};

// ============================================================
// FILLER PATTERNS (contextual)
// ============================================================

const SENTENCE_STARTERS: Record<EmotionalTone, string[]> = {
  neutral: ['So, ', 'Okay, ', 'Right, ', 'Alright, '],
  warm: ['Hey, ', 'You know, ', 'Well, '],
  excited: ['Oh! ', 'Wow, ', 'Hey! '],
  concerned: ['Hmm, ', 'Actually, ', 'Listen, '],
  thoughtful: ['Well, ', 'Let me see... ', 'Hmm, '],
  playful: ['Ha, ', 'So, ', 'Okay so, '],
  apologetic: ['Oh, ', 'Ah, ', 'Well, '],
  confident: ['Look, ', "Here's the thing, ", 'Basically, '],
  curious: ['Ooh, ', 'Hmm, ', 'Interesting, '],
};

const TRANSITION_PHRASES: string[] = [
  'and, you know,',
  'so basically,',
  'and then,',
  'which means,',
  'the thing is,',
];

// ============================================================
// STATE
// ============================================================

let currentConfig = { ...DEFAULT_CONFIG };

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Detect the emotional tone of text.
 */
export function detectEmotionalTone(text: string): EmotionalTone {
  const scores: Record<EmotionalTone, number> = {
    neutral: 0,
    warm: 0,
    excited: 0,
    concerned: 0,
    thoughtful: 0,
    playful: 0,
    apologetic: 0,
    confident: 0,
    curious: 0,
  };

  for (const [tone, patterns] of Object.entries(EMOTION_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        scores[tone as EmotionalTone] += matches.length;
      }
    }
  }

  // Find highest scoring tone
  let maxTone: EmotionalTone = 'neutral';
  let maxScore = 0;

  for (const [tone, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxTone = tone as EmotionalTone;
    }
  }

  return maxTone;
}

/**
 * Detect the appropriate speaking style based on content.
 */
export function detectSpeakingStyle(text: string): SpeakingStyle {
  // Technical content
  if (
    /\b(function|class|import|export|const|let|var|async|await)\b/.test(text)
  ) {
    return 'technical';
  }

  // Questions often need explaining
  if (/\b(how to|what is|why does|can you explain)\b/i.test(text)) {
    return 'explaining';
  }

  // Comforting language
  if (
    /\b(it's okay|don't worry|I'm here|you've got this|no pressure)\b/i.test(
      text
    )
  ) {
    return 'comforting';
  }

  // Urgent content
  if (/\b(urgent|immediately|now|critical|asap|hurry)\b/i.test(text)) {
    return 'urgent';
  }

  // Storytelling patterns
  if (
    /\b(once upon|let me tell you|so there I was|the story goes)\b/i.test(text)
  ) {
    return 'storytelling';
  }

  return 'conversational';
}

/**
 * Apply natural contractions to text.
 */
function applyContractions(text: string): string {
  let result = text;

  for (const [pattern, replacement] of CONTRACTIONS) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

/**
 * Add contextual filler words for naturalness.
 */
function addFillers(text: string, tone: EmotionalTone): string {
  // Don't process empty or whitespace-only strings
  if (!text || !text.trim()) {
    return text;
  }

  const sentences = text.split(/(?<=[.!?])\s+/);

  if (
    sentences.length === 0 ||
    (sentences.length === 1 && !sentences[0].trim())
  ) {
    return text;
  }

  // Maybe add a starter to the first sentence (30% chance)
  const starters = SENTENCE_STARTERS[tone] || SENTENCE_STARTERS.neutral;
  if (Math.random() < 0.3 && starters.length > 0 && sentences[0].trim()) {
    const starter = starters[Math.floor(Math.random() * starters.length)];
    // Don't add if sentence already starts with a filler-like word
    if (!/^(so|well|okay|hey|oh|hmm|look|basically)/i.test(sentences[0])) {
      // Preserve capitalization - only lowercase if not 'I' at the start
      const firstChar = sentences[0].charAt(0);
      const restOfSentence = sentences[0].slice(1);
      // Keep 'I' uppercase, lowercase other letters
      const adjustedFirst = firstChar === 'I' ? 'I' : firstChar.toLowerCase();
      sentences[0] = starter + adjustedFirst + restOfSentence;
    }
  }

  // Maybe add a transition phrase between long sentences (20% chance per junction)
  if (sentences.length > 2) {
    for (let i = 1; i < sentences.length - 1; i++) {
      if (Math.random() < 0.2 && sentences[i].length > 30) {
        const transition =
          TRANSITION_PHRASES[
            Math.floor(Math.random() * TRANSITION_PHRASES.length)
          ];
        // Insert transition at a natural break point (after first clause)
        const commaIndex = sentences[i].indexOf(',');
        if (commaIndex > 10 && commaIndex < sentences[i].length / 2) {
          sentences[i] =
            sentences[i].slice(0, commaIndex + 1) +
            ' ' +
            transition +
            ' ' +
            sentences[i].slice(commaIndex + 2);
        }
      }
    }
  }

  return sentences.join(' ');
}

/**
 * Add breath pauses at natural points.
 */
function addBreathPauses(text: string): string {
  // Add micro-pauses after commas (represented as ... for TTS hint)
  let result = text;

  // Longer pause before "but", "however", "although"
  result = result.replace(/,\s*(but|however|although|though)\b/gi, '... $1');

  // Pause before parentheticals
  result = result.replace(/\s*—\s*/g, '... ');

  return result;
}

/**
 * Estimate speaking duration in seconds.
 */
function estimateDuration(text: string, rate: number): number {
  // Average speaking rate is ~150 words per minute
  const words = text.split(/\s+/).length;
  const baseMinutes = words / 150;
  const adjustedMinutes = baseMinutes / rate;
  return adjustedMinutes * 60;
}

/**
 * Generate SSML markup for prosody control.
 */
function generateSSML(
  text: string,
  tone: EmotionalTone,
  style: SpeakingStyle,
  config: VoicePersonalityConfig
): string {
  // Determine rate based on style
  let rate = config.baseRate;
  switch (style) {
    case 'urgent':
      rate *= 1.15;
      break;
    case 'comforting':
      rate *= 0.9;
      break;
    case 'explaining':
      rate *= 0.95;
      break;
    case 'technical':
      rate *= 0.85;
      break;
    case 'storytelling':
      rate *= 0.92;
      break;
  }

  // Determine pitch based on tone
  let pitch = config.pitchVariation;
  switch (tone) {
    case 'excited':
      pitch += 1;
      break;
    case 'warm':
      pitch += 0.5;
      break;
    case 'concerned':
      pitch -= 0.5;
      break;
    case 'apologetic':
      pitch -= 1;
      break;
    case 'playful':
      pitch += 0.8;
      break;
  }

  // Build SSML
  const ratePercent = Math.round(rate * 100);
  const pitchSemitones = pitch >= 0 ? `+${pitch}st` : `${pitch}st`;

  return `<speak>
  <prosody rate="${ratePercent}%" pitch="${pitchSemitones}">
    ${text}
  </prosody>
</speak>`;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Configure the voice personality system.
 */
export function configureVoicePersonality(
  config: Partial<VoicePersonalityConfig>
): void {
  currentConfig = { ...currentConfig, ...config };

  MollyLogger.info('Voice personality configured', 'voice-personality', {
    useContractions: currentConfig.useContractions,
    useFillers: currentConfig.useFillers,
    baseRate: currentConfig.baseRate,
  });
}

/**
 * Get current voice personality configuration.
 */
export function getVoicePersonalityConfig(): VoicePersonalityConfig {
  return { ...currentConfig };
}

/**
 * Process text for natural speech output.
 */
export function processForSpeech(
  text: string,
  overrideConfig?: Partial<VoicePersonalityConfig>
): ProcessedSpeech {
  const traceId = generateTraceId();
  const config = { ...currentConfig, ...overrideConfig };

  MollyLogger.debug(
    'Processing text for speech',
    'voice-personality',
    {
      inputLength: text.length,
    },
    traceId
  );

  // Step 1: Detect emotional tone
  const tone = detectEmotionalTone(text);

  // Step 2: Detect speaking style
  const style = detectSpeakingStyle(text);

  // Step 3: Transform text
  let processedText = text;

  if (config.useContractions) {
    processedText = applyContractions(processedText);
  }

  if (config.useFillers) {
    processedText = addFillers(processedText, tone);
  }

  if (config.addBreathPauses) {
    processedText = addBreathPauses(processedText);
  }

  // Step 4: Generate SSML if emotional inflection is enabled
  let ssml: string | undefined;
  if (config.emotionalInflection) {
    ssml = generateSSML(processedText, tone, style, config);
  }

  // Step 5: Estimate duration
  const estimatedDurationSec = estimateDuration(processedText, config.baseRate);

  MollyLogger.debug(
    'Speech processing complete',
    'voice-personality',
    {
      tone,
      style,
      outputLength: processedText.length,
      estimatedDurationSec: estimatedDurationSec.toFixed(1),
    },
    traceId
  );

  return {
    text: processedText,
    ssml,
    tone,
    style,
    estimatedDurationSec,
  };
}

/**
 * Quick speech processing with defaults.
 */
export function naturalizeText(text: string): string {
  return processForSpeech(text).text;
}

/**
 * Add emphasis to specific words (for TTS systems that support it).
 */
export function addEmphasis(text: string, words: string[]): string {
  let result = text;

  for (const word of words) {
    const pattern = new RegExp(`\\b(${word})\\b`, 'gi');
    result = result.replace(pattern, '*$1*');
  }

  return result;
}

/**
 * Convert text to a question with natural rising intonation hint.
 */
export function asQuestion(text: string): string {
  // Remove trailing period if present and add question mark
  const trimmed = text.replace(/\.+$/, '');
  return trimmed + '?';
}

/**
 * Add a thoughtful pause before important information.
 */
export function withDramaticPause(text: string, beforeWord: string): string {
  return text.replace(new RegExp(`\\b(${beforeWord})\\b`, 'gi'), '... $1');
}

/**
 * Format list items for natural speech.
 */
export function speakableList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;

  const allButLast = items.slice(0, -1).join(', ');
  return `${allButLast}, and ${items[items.length - 1]}`;
}

/**
 * Format numbers for natural speech.
 */
export function speakableNumber(num: number): string {
  // Handle special cases
  if (num === 0) return 'zero';

  // Large numbers
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)} billion`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)} million`;
  }
  if (num >= 10_000) {
    return `${(num / 1_000).toFixed(0)} thousand`;
  }

  // Decimals
  if (num % 1 !== 0) {
    return num.toFixed(2);
  }

  return num.toString();
}

/**
 * Format time duration for natural speech.
 */
export function speakableDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return days === 1 ? 'about a day' : `about ${days} days`;
  }
  if (hours > 0) {
    return hours === 1 ? 'about an hour' : `about ${hours} hours`;
  }
  if (minutes > 0) {
    return minutes === 1 ? 'about a minute' : `about ${minutes} minutes`;
  }
  if (seconds > 10) {
    return `about ${Math.round(seconds / 10) * 10} seconds`;
  }
  return 'just a moment';
}
