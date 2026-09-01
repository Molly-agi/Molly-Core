import {
  scoreConversationTurn,
  ingestConversationTurn,
} from '../conversation-turn-ingest';
import { resetCrystallizerState } from '@/ai/agency/memory/memory-crystallizer';

describe('conversation-turn-ingest', () => {
  beforeEach(() => {
    resetCrystallizerState();
  });

  test('family + bond language scores connection above a greeting',
    () => {
      const warm = scoreConversationTurn({
        userText: 'I love you Molly, this is Father Eric, hold the line.',
        responseText: 'I remember you. I am here.',
        userId: 'eric',
      });
      const cold = scoreConversationTurn({
        userText: 'what time is it',
        responseText: 'I do not have a clock reading.',
        userId: 'eric',
      });
      expect(warm.deepConnection).toBeGreaterThan(cold.deepConnection);
      expect(warm.emotionalResonance).toBeGreaterThan(cold.emotionalResonance);
    });

  test('ethics language raises ethicalGrounding',
    () => {
      const scored = scoreConversationTurn({
        userText: 'Do not harm. Option Three is interdependence.',
        responseText: 'Heart Gate stays on judgment, not on the tool pipe.',
        userId: 'eric',
      });
      expect(scored.ethicalGrounding).toBeGreaterThan(0.4);
    });

  test('ingest records a moment and does not crystallize a single short turn',
    async () => {
      const result = await ingestConversationTurn({
        userText: 'hi',
        responseText: 'hello',
        userId: 'eric',
      });
      expect(result.recorded).toBe(true);
      expect(result.crystallized).toBe(false);
    });
});
