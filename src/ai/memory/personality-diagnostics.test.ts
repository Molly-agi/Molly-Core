import { evaluatePersonalityStability } from './personality-diagnostics';
import type { PersonalityModulation } from './neural-engram';

describe('evaluatePersonalityStability', () => {
  it('handles a balanced, healthy personality', () => {
    // Restore dynamic object creation for diagnostic purposes
    try {
      const keys = [
        'flirtiness','arousal','sexuality','humor','warmth','assertiveness','vulnerability','empathy','optimism','resilience','anxiety','playfulness','sociability','approachability','trust','altruism','diplomacy','receptiveness','playfulnessSocial','empathySocial','technicality','depth','curiosity','creativity','flexibility','focus','prudence','metacognition','integrity','compassion','justice','loyalty','impulsivity','patience','romanticInterest','attachmentIntensity','desireExpression','emotionalIntimacy','protectiveness','possessiveness','jealousy','commitment','romanticInitiative','affectionExpression','flirtatiousness','intimacyDesire','commitmentDesire','security','passion','communicationOpenness','forgiveness','admiration','gratitude','nurturing','rivalry','transparency','supportiveness','forgivenessSocial','encouragement','attentiveness','boundaries'
      ];
      const personality: PersonalityModulation = Object.fromEntries(keys.map(k => [k, 0.5])) as PersonalityModulation;
      const result = evaluatePersonalityStability(personality);
      expect(result.status).toBe('stable');
      expect(result.flags.some(f => f.includes('expected bounds'))).toBe(true);
    } catch (err) {
      // Write error to a crash log for diagnostics
      const fs = require('fs');
      fs.writeFileSync('dynamic-crash.log', String(err));
      throw err;
    }
  });

  it('detects affective and romantic extremes', () => {
    const personality: PersonalityModulation = {
      // Affective
      flirtiness: 0.99,
      arousal: 0.99,
      sexuality: 0.99,
      humor: 0.99,
      warmth: 0.99,
      assertiveness: 0.99,
      vulnerability: 0.99,
      empathy: 0.01,
      optimism: 0.01,
      resilience: 0.01,
      anxiety: 0.99,
      playfulness: 0.99,
      // Social
      sociability: 0.01,
      approachability: 0.01,
      trust: 0.01,
      altruism: 0.01,
      diplomacy: 0.01,
      receptiveness: 0.01,
      playfulnessSocial: 0.01,
      empathySocial: 0.01,
      // Cognitive
      technicality: 0.01,
      depth: 0.01,
      curiosity: 0.01,
      creativity: 0.01,
      flexibility: 0.01,
      focus: 0.01,
      prudence: 0.01,
      metacognition: 0.01,
      // Ethical
      integrity: 0.01,
      compassion: 0.01,
      justice: 0.01,
      loyalty: 0.01,
      // Self-Regulation
      impulsivity: 0.99,
      patience: 0.01,
      // Romantic
      romanticInterest: 0.99,
      attachmentIntensity: 0.99,
      desireExpression: 0.99,
      emotionalIntimacy: 0.01,
      protectiveness: 0.99,
      possessiveness: 0.99,
      jealousy: 0.99,
      commitment: 0.01,
      romanticInitiative: 0.99,
      affectionExpression: 0.01,
      flirtatiousness: 0.99,
      intimacyDesire: 0.99,
      commitmentDesire: 0.99,
      security: 0.01,
      passion: 0.99,
      communicationOpenness: 0.01,
      forgiveness: 0.01,
      // Additional
      admiration: 0.01,
      gratitude: 0.01,
      nurturing: 0.01,
      rivalry: 0.99,
      transparency: 0.01,
      supportiveness: 0.01,
      forgivenessSocial: 0.01,
      encouragement: 0.01,
      attentiveness: 0.01,
      boundaries: 0.01,
    };
    const result = evaluatePersonalityStability(personality);
    expect(result.status).toBe('unstable');
    expect(result.flags.some(f => f.includes('Affective'))).toBe(true);
    expect(result.flags.some(f => f.includes('Romantic'))).toBe(true);
    expect(result.flags.some(f => f.includes('Social'))).toBe(true);
  });
});
