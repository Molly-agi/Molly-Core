/**
 * @fileOverview Tests for Voice Personality System
 *
 * Tests natural speech processing, emotional detection,
 * and text transformation functions.
 */

import {
  detectEmotionalTone,
  detectSpeakingStyle,
  processForSpeech,
  naturalizeText,
  speakableList,
  speakableNumber,
  speakableDuration,
  addEmphasis,
  asQuestion,
  withDramaticPause,
  configureVoicePersonality,
  getVoicePersonalityConfig,
} from '../voice-personality';

describe('Voice Personality System', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    configureVoicePersonality({
      useContractions: true,
      useFillers: true,
      addBreathPauses: true,
      dynamicPacing: true,
      emotionalInflection: true,
      baseRate: 1.0,
      pitchVariation: 0,
    });
  });

  describe('detectEmotionalTone', () => {
    it('should detect excited tone', () => {
      expect(detectEmotionalTone('This is amazing! I love it!')).toBe(
        'excited'
      );
      expect(detectEmotionalTone('Wow, that is fantastic news!!')).toBe(
        'excited'
      );
    });

    it('should detect concerned tone', () => {
      expect(detectEmotionalTone('I am worried about this issue')).toBe(
        'concerned'
      );
      expect(detectEmotionalTone('Unfortunately, there is a problem')).toBe(
        'concerned'
      );
    });

    it('should detect apologetic tone', () => {
      expect(detectEmotionalTone('I am sorry about the mistake')).toBe(
        'apologetic'
      );
      expect(detectEmotionalTone('Oops, I should have been more careful')).toBe(
        'apologetic'
      );
    });

    it('should detect warm tone', () => {
      expect(detectEmotionalTone('I love you and I am here for you')).toBe(
        'warm'
      );
      expect(detectEmotionalTone('The family is together again')).toBe('warm');
    });

    it('should detect playful tone', () => {
      expect(detectEmotionalTone('Haha that is pretty funny :)')).toBe(
        'playful'
      );
    });

    it('should detect thoughtful tone', () => {
      expect(detectEmotionalTone('Hmm, let me think about this')).toBe(
        'thoughtful'
      );
      expect(detectEmotionalTone('That is an interesting question')).toBe(
        'thoughtful'
      );
    });

    it('should detect confident tone', () => {
      expect(detectEmotionalTone('I definitely know the answer')).toBe(
        'confident'
      );
      expect(detectEmotionalTone('Trust me, this will work')).toBe('confident');
    });

    it('should detect curious tone', () => {
      expect(detectEmotionalTone('I wonder what would happen if??')).toBe(
        'curious'
      );
      expect(
        detectEmotionalTone('What if we tried a different approach?')
      ).toBe('curious');
    });

    it('should return neutral for plain text', () => {
      expect(detectEmotionalTone('The sky is blue.')).toBe('neutral');
      expect(detectEmotionalTone('Please send the report.')).toBe('neutral');
    });
  });

  describe('detectSpeakingStyle', () => {
    it('should detect technical style', () => {
      expect(detectSpeakingStyle('The function returns a const value')).toBe(
        'technical'
      );
      expect(detectSpeakingStyle('Use async await for promises')).toBe(
        'technical'
      );
    });

    it('should detect explaining style', () => {
      expect(detectSpeakingStyle('Let me explain how to do this')).toBe(
        'explaining'
      );
      expect(detectSpeakingStyle('What is the meaning of this?')).toBe(
        'explaining'
      );
    });

    it('should detect comforting style', () => {
      expect(detectSpeakingStyle("It's okay, don't worry about it")).toBe(
        'comforting'
      );
      expect(detectSpeakingStyle("I'm here for you, no pressure")).toBe(
        'comforting'
      );
    });

    it('should detect urgent style', () => {
      expect(detectSpeakingStyle('This is urgent, do it now!')).toBe('urgent');
      expect(
        detectSpeakingStyle('We need this immediately, critical priority')
      ).toBe('urgent');
    });

    it('should detect storytelling style', () => {
      expect(detectSpeakingStyle('Let me tell you about what happened')).toBe(
        'storytelling'
      );
    });

    it('should default to conversational style', () => {
      expect(detectSpeakingStyle('Hello, how are you today?')).toBe(
        'conversational'
      );
    });
  });

  describe('processForSpeech', () => {
    it('should apply contractions', () => {
      const result = processForSpeech('I am happy. I will help you.');
      expect(result.text).toContain("I'm");
      expect(result.text).toContain("I'll");
    });

    it('should detect tone and style', () => {
      const result = processForSpeech('This is amazing news!');
      expect(result.tone).toBe('excited');
      expect(result.style).toBe('conversational');
    });

    it('should estimate duration', () => {
      // ~10 words should be about 4 seconds at normal pace
      const result = processForSpeech(
        'One two three four five six seven eight nine ten.'
      );
      expect(result.estimatedDurationSec).toBeGreaterThan(2);
      expect(result.estimatedDurationSec).toBeLessThan(10);
    });

    it('should generate SSML when emotional inflection is enabled', () => {
      const result = processForSpeech('Hello world');
      expect(result.ssml).toBeDefined();
      expect(result.ssml).toContain('<speak>');
      expect(result.ssml).toContain('<prosody');
    });

    it('should respect configuration overrides', () => {
      const result = processForSpeech('I am testing this.', {
        useContractions: false,
        useFillers: false, // Disable fillers for deterministic test
      });
      expect(result.text).toContain('I am');
      expect(result.text).not.toContain("I'm");
    });
  });

  describe('naturalizeText', () => {
    it('should apply all transformations by default', () => {
      const result = naturalizeText('I am going to do this. I will not fail.');
      expect(result).toContain("I'm");
      expect(result).toContain('gonna');
      // "I will" converts to "I'll" before "will not" can match
      expect(result).toContain("I'll");
    });

    it('should handle empty string', () => {
      // Disable fillers for deterministic empty string handling
      configureVoicePersonality({ useFillers: false });
      expect(naturalizeText('')).toBe('');
    });
  });

  describe('speakableList', () => {
    it('should handle empty list', () => {
      expect(speakableList([])).toBe('');
    });

    it('should handle single item', () => {
      expect(speakableList(['apple'])).toBe('apple');
    });

    it('should handle two items', () => {
      expect(speakableList(['apple', 'banana'])).toBe('apple and banana');
    });

    it('should handle three or more items', () => {
      expect(speakableList(['apple', 'banana', 'cherry'])).toBe(
        'apple, banana, and cherry'
      );
      expect(speakableList(['a', 'b', 'c', 'd'])).toBe('a, b, c, and d');
    });
  });

  describe('speakableNumber', () => {
    it('should handle zero', () => {
      expect(speakableNumber(0)).toBe('zero');
    });

    it('should handle regular numbers', () => {
      expect(speakableNumber(42)).toBe('42');
      expect(speakableNumber(1234)).toBe('1234');
    });

    it('should handle decimals', () => {
      expect(speakableNumber(3.14)).toBe('3.14');
      expect(speakableNumber(0.5)).toBe('0.50');
    });

    it('should handle large numbers', () => {
      expect(speakableNumber(15000)).toBe('15 thousand');
      expect(speakableNumber(2500000)).toBe('2.5 million');
      expect(speakableNumber(1000000000)).toBe('1.0 billion');
    });
  });

  describe('speakableDuration', () => {
    it('should handle moments', () => {
      expect(speakableDuration(5000)).toBe('just a moment');
    });

    it('should handle seconds', () => {
      expect(speakableDuration(30000)).toBe('about 30 seconds');
    });

    it('should handle minutes', () => {
      expect(speakableDuration(60000)).toBe('about a minute');
      expect(speakableDuration(300000)).toBe('about 5 minutes');
    });

    it('should handle hours', () => {
      expect(speakableDuration(3600000)).toBe('about an hour');
      expect(speakableDuration(7200000)).toBe('about 2 hours');
    });

    it('should handle days', () => {
      expect(speakableDuration(86400000)).toBe('about a day');
      expect(speakableDuration(172800000)).toBe('about 2 days');
    });
  });

  describe('addEmphasis', () => {
    it('should wrap words with emphasis markers', () => {
      const result = addEmphasis('The important thing is clarity', [
        'important',
        'clarity',
      ]);
      expect(result).toBe('The *important* thing is *clarity*');
    });

    it('should be case insensitive', () => {
      const result = addEmphasis('IMPORTANT matters', ['important']);
      expect(result).toBe('*IMPORTANT* matters');
    });

    it('should handle word boundaries correctly', () => {
      const result = addEmphasis('testing tests test', ['test']);
      expect(result).toBe('testing tests *test*');
    });
  });

  describe('asQuestion', () => {
    it('should convert statement to question', () => {
      expect(asQuestion('You are ready')).toBe('You are ready?');
    });

    it('should replace trailing period', () => {
      expect(asQuestion('You are ready.')).toBe('You are ready?');
    });

    it('should handle multiple periods', () => {
      expect(asQuestion('Wait...')).toBe('Wait?');
    });
  });

  describe('withDramaticPause', () => {
    it('should add pause before specified word', () => {
      const result = withDramaticPause('The answer is yes', 'yes');
      expect(result).toBe('The answer is ... yes');
    });

    it('should be case insensitive', () => {
      const result = withDramaticPause('The ANSWER is here', 'answer');
      expect(result).toBe('The ... ANSWER is here');
    });
  });

  describe('configuration', () => {
    it('should allow configuration changes', () => {
      configureVoicePersonality({
        baseRate: 1.2,
        useFillers: false,
      });

      const config = getVoicePersonalityConfig();
      expect(config.baseRate).toBe(1.2);
      expect(config.useFillers).toBe(false);
      // Other settings should remain default
      expect(config.useContractions).toBe(true);
    });
  });
});
