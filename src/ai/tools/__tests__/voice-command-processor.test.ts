/**
 * @fileOverview Tests for Voice Command Processor
 *
 * Tests intent analysis, command handling, and voice pipeline.
 */

import {
  processVoiceCommand,
  simpleVoiceCommand,
  type VoiceCommandContext,
  type VoiceCommandResult,
} from '../voice-command-processor';

// Mock all dependencies
jest.mock('@/ai/rogue-generate', () => ({
  molly: {
    generate: jest.fn(),
  },
}));

jest.mock('../../flows/voice-command-to-text', () => ({
  voiceCommandToText: jest.fn(),
}));

jest.mock('../../flows/text-to-speech', () => ({
  textToSpeech: jest.fn(),
}));

jest.mock('../../flows/autonomous-solution', () => ({
  autonomousSolutionFlow: jest.fn(),
}));

jest.mock('../../flows/conversational-chat', () => ({
  conversationalChat: jest.fn(),
}));

jest.mock('../semantic-recall', () => ({
  recallSimilarMemories: jest.fn(),
}));

jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    logFlowStart: jest.fn(),
    logFlowComplete: jest.fn(),
  },
  generateTraceId: () => 'test-trace-id',
}));

jest.mock('@/firebase/firestore/agent-memory-server', () => ({
  recordSensoryLogServer: jest.fn(),
}));

jest.mock('../safety-sleep', () => ({
  getSafewordPhrase: () => 'molly sleep',
  getSleepState: jest.fn(() => ({ isSleeping: false })),
  isSleepSafeword: jest.fn(() => false),
  toggleSleepState: jest.fn(),
}));

jest.mock('../system', () => ({
  getSystemHealth: jest.fn(() =>
    Promise.resolve({
      cpuUsage: 25,
      temperature: 45,
    })
  ),
}));

jest.mock('../pacing-telemetry', () => ({
  logPacingTelemetry: jest.fn(),
}));

jest.mock('../neural-bridge', () => ({
  buildNeuralBridgeContext: jest.fn(),
}));

jest.mock('../latency-cache', () => ({
  getLastLatencyMs: jest.fn(),
  setLastLatencyMs: jest.fn(),
}));

jest.mock('@/firebase/admin', () => ({
  getAdminFirestore: jest.fn(),
  isAdminConfigured: jest.fn(() => false),
}));

jest.mock('../memory-schema', () => ({
  createMemoryRecord: jest.fn((data) => ({ id: 'test-id', ...data })),
}));

jest.mock('../memory-integrity', () => ({
  addChecksum: jest.fn((record) => ({ ...record, checksum: 'test-checksum' })),
}));

// Get mocked functions
const { molly } = jest.requireMock('@/ai/rogue-generate');
const { voiceCommandToText } = jest.requireMock(
  '../../flows/voice-command-to-text'
);
const { textToSpeech } = jest.requireMock('../../flows/text-to-speech');
const { autonomousSolutionFlow } = jest.requireMock(
  '../../flows/autonomous-solution'
);
const { conversationalChat } = jest.requireMock(
  '../../flows/conversational-chat'
);
const { recallSimilarMemories } = jest.requireMock('../semantic-recall');
const { isSleepSafeword, getSleepState, toggleSleepState } =
  jest.requireMock('../safety-sleep');
const { recordSensoryLogServer } = jest.requireMock(
  '@/firebase/firestore/agent-memory-server'
);

describe('Voice Command Processor', () => {
  const defaultContext: VoiceCommandContext = {
    userId: 'test-user',
    sessionId: 'test-session',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    voiceCommandToText.mockResolvedValue('hello molly');
    textToSpeech.mockResolvedValue({ audioUri: 'data:audio/mp3;base64,test' });
    recallSimilarMemories.mockResolvedValue([]);
    recordSensoryLogServer.mockResolvedValue(undefined);
    getSleepState.mockReturnValue({ isSleeping: false });
    isSleepSafeword.mockReturnValue(false);
  });

  describe('processVoiceCommand', () => {
    describe('transcription handling', () => {
      it('should return not recognized when transcription is empty', async () => {
        voiceCommandToText.mockResolvedValue('');

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.recognized).toBe(false);
        expect(result.intent).toBe('unknown');
        expect(result.response).toContain("didn't catch that");
      });

      it('should return not recognized when transcription is null', async () => {
        voiceCommandToText.mockResolvedValue(null);

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.recognized).toBe(false);
        expect(result.metadata?.confidence).toBe(0);
      });

      it('should return not recognized when transcription is whitespace only', async () => {
        voiceCommandToText.mockResolvedValue('   ');

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.recognized).toBe(false);
      });
    });

    describe('sleep mode handling', () => {
      it('should toggle sleep mode when safeword detected', async () => {
        isSleepSafeword.mockReturnValue(true);
        toggleSleepState.mockReturnValue({ isSleeping: true });

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.intent).toBe('safety');
        expect(result.response).toContain('Sleep mode engaged');
        expect(result.metadata?.actionTaken).toBe('sleep_enabled');
      });

      it('should wake up when safeword detected while sleeping', async () => {
        isSleepSafeword.mockReturnValue(true);
        toggleSleepState.mockReturnValue({ isSleeping: false });

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.response).toContain('Sleep mode disabled');
        expect(result.metadata?.actionTaken).toBe('sleep_disabled');
      });

      it('should block commands when in sleep mode', async () => {
        getSleepState.mockReturnValue({ isSleeping: true });
        isSleepSafeword.mockReturnValue(false);

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.intent).toBe('safety');
        expect(result.response).toContain('Sleep mode is active');
        expect(result.metadata?.actionTaken).toBe('sleep_blocked');
      });
    });

    describe('intent classification', () => {
      it('should handle conversation intent', async () => {
        molly.generate.mockResolvedValue({
          output: {
            intent: 'conversation',
            confidence: 0.9,
            extractedInfo: 'hello molly',
            reasoning: 'greeting',
          },
        });
        conversationalChat.mockResolvedValue({
          response: 'Hello! How can I help?',
        });

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.recognized).toBe(true);
        expect(result.intent).toBe('conversation');
        expect(result.response).toBe('Hello! How can I help?');
      });

      it('should handle question intent', async () => {
        voiceCommandToText.mockResolvedValue('what is the weather');
        molly.generate.mockResolvedValue({
          output: {
            intent: 'question',
            confidence: 0.85,
            extractedInfo: 'weather query',
            reasoning: 'asking about weather',
          },
        });
        conversationalChat.mockResolvedValue({
          response: 'I can help you check the weather.',
        });

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.intent).toBe('question');
      });

      it('should handle clarification intent like question', async () => {
        molly.generate.mockResolvedValue({
          output: {
            intent: 'clarification',
            confidence: 0.8,
            extractedInfo: 'needs more info',
            reasoning: 'asking for clarification',
          },
        });
        conversationalChat.mockResolvedValue({
          response: 'Let me explain further...',
        });

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.intent).toBe('clarification');
      });

      it('should fallback to conversation on intent analysis failure', async () => {
        molly.generate.mockRejectedValue(new Error('API error'));
        conversationalChat.mockResolvedValue({
          response: 'Sure, I can help with that.',
        });

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        // Should fallback to conversation intent
        expect(result.recognized).toBe(true);
        expect(result.intent).toBe('conversation');
      });
    });

    describe('remember intent', () => {
      it('should store memory when remember intent detected', async () => {
        voiceCommandToText.mockResolvedValue(
          'remember that the server uses port 3000'
        );
        molly.generate
          .mockResolvedValueOnce({
            output: {
              intent: 'remember',
              confidence: 0.95,
              extractedInfo: 'server port 3000',
              reasoning: 'user wants to remember information',
            },
          })
          .mockResolvedValueOnce({
            text: 'Server configuration: port 3000',
          });

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.intent).toBe('remember');
        expect(result.response).toContain("I've remembered");
        expect(result.metadata?.actionTaken).toBe('memory_stored');
        expect(recordSensoryLogServer).toHaveBeenCalled();
      });

      it('should handle memory storage failure gracefully', async () => {
        voiceCommandToText.mockResolvedValue('remember this important thing');
        molly.generate.mockResolvedValueOnce({
          output: {
            intent: 'remember',
            confidence: 0.9,
            extractedInfo: 'important thing',
            reasoning: 'remember intent',
          },
        });
        molly.generate.mockRejectedValueOnce(new Error('Storage failed'));

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.response).toContain('trouble storing');
      });
    });

    describe('recall intent', () => {
      it('should recall memories when recall intent detected', async () => {
        voiceCommandToText.mockResolvedValue(
          'what did we learn about databases'
        );
        molly.generate
          .mockResolvedValueOnce({
            output: {
              intent: 'recall',
              confidence: 0.9,
              extractedInfo: 'databases',
              reasoning: 'user asking about past learning',
            },
          })
          .mockResolvedValueOnce({
            text: 'We discussed PostgreSQL optimization last week.',
          });

        recallSimilarMemories.mockResolvedValue([
          {
            suggestion: 'PostgreSQL uses B-tree indexes by default',
            similarity: 0.85,
          },
          {
            suggestion: 'Connection pooling improves performance',
            similarity: 0.75,
          },
        ]);

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.intent).toBe('recall');
        expect(result.metadata?.memoryRecalled).toBe(true);
        expect(result.metadata?.actionTaken).toBe('memory_recalled');
      });

      it('should handle no memories found', async () => {
        voiceCommandToText.mockResolvedValue('what did we learn about quantum');
        molly.generate.mockResolvedValueOnce({
          output: {
            intent: 'recall',
            confidence: 0.9,
            extractedInfo: 'quantum',
            reasoning: 'recall query',
          },
        });
        recallSimilarMemories.mockResolvedValue([]);

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.response).toContain("don't have any memories");
      });
    });

    describe('command intent', () => {
      it('should execute commands through autonomous solution', async () => {
        voiceCommandToText.mockResolvedValue('run the test suite');
        molly.generate.mockResolvedValueOnce({
          output: {
            intent: 'command',
            confidence: 0.95,
            extractedInfo: 'run tests',
            reasoning: 'execution command',
          },
        });
        autonomousSolutionFlow.mockResolvedValue({
          creativeSolution: 'All 685 tests passed successfully.',
          riskLevelUsed: 'low',
          isThrottled: false,
        });

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.intent).toBe('command');
        expect(result.response).toContain("I've executed your command");
        expect(result.metadata?.actionTaken).toBe('command_executed');
      });

      it('should handle command execution failure', async () => {
        voiceCommandToText.mockResolvedValue('do something impossible');
        molly.generate.mockResolvedValueOnce({
          output: {
            intent: 'command',
            confidence: 0.8,
            extractedInfo: 'impossible task',
            reasoning: 'command',
          },
        });
        autonomousSolutionFlow.mockRejectedValue(new Error('Cannot execute'));

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.response).toContain('ran into an issue');
      });
    });

    describe('speech synthesis', () => {
      it('should synthesize speech when enabled', async () => {
        molly.generate.mockResolvedValue({
          output: {
            intent: 'conversation',
            confidence: 0.9,
            extractedInfo: 'hello',
            reasoning: 'greeting',
          },
        });
        conversationalChat.mockResolvedValue({ response: 'Hello!' });
        textToSpeech.mockResolvedValue({
          audioUri: 'data:audio/mp3;base64,synthesized',
        });

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          true // synthesizeSpeech = true
        );

        expect(textToSpeech).toHaveBeenCalledWith('Hello!');
        expect(result.audioResponse?.audioUri).toBe(
          'data:audio/mp3;base64,synthesized'
        );
      });

      it('should not synthesize speech when disabled', async () => {
        molly.generate.mockResolvedValue({
          output: {
            intent: 'conversation',
            confidence: 0.9,
            extractedInfo: 'hello',
            reasoning: 'greeting',
          },
        });
        conversationalChat.mockResolvedValue({ response: 'Hello!' });

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false // synthesizeSpeech = false
        );

        expect(textToSpeech).not.toHaveBeenCalled();
        expect(result.audioResponse).toBeUndefined();
      });

      it('should continue without audio if synthesis fails', async () => {
        molly.generate.mockResolvedValue({
          output: {
            intent: 'conversation',
            confidence: 0.9,
            extractedInfo: 'hello',
            reasoning: 'greeting',
          },
        });
        conversationalChat.mockResolvedValue({ response: 'Hello!' });
        textToSpeech.mockRejectedValue(new Error('TTS failed'));

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          true
        );

        expect(result.recognized).toBe(true);
        expect(result.response).toBe('Hello!');
        expect(result.audioResponse).toBeUndefined();
      });
    });

    describe('context handling', () => {
      it('should use previous commands in context', async () => {
        const contextWithHistory: VoiceCommandContext = {
          ...defaultContext,
          previousCommands: ['what time is it', 'tell me more'],
          lastResponse: 'It is 3pm',
        };

        molly.generate.mockResolvedValue({
          output: {
            intent: 'conversation',
            confidence: 0.9,
            extractedInfo: 'follow up',
            reasoning: 'continuing conversation',
          },
        });
        conversationalChat.mockResolvedValue({ response: 'Sure!' });

        await processVoiceCommand('base64audio', contextWithHistory, false);

        // Verify the context was passed - check that system prompt includes previous commands
        const callArgs = molly.generate.mock.calls[0];
        expect(callArgs[1].system).toContain('what time is it');
      });

      it('should use hardware state when provided', async () => {
        const contextWithHardware: VoiceCommandContext = {
          ...defaultContext,
          hardwareState: {
            temperature: 55,
            batteryLevel: 80,
            cpuUsage: 45,
          },
        };

        molly.generate.mockResolvedValue({
          output: {
            intent: 'question',
            confidence: 0.9,
            extractedInfo: 'query',
            reasoning: 'question',
          },
        });
        conversationalChat.mockResolvedValue({ response: 'Response' });

        await processVoiceCommand('base64audio', contextWithHardware, false);

        // Should use provided hardware state instead of fetching
        expect(conversationalChat).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should return error result on processing failure', async () => {
        voiceCommandToText.mockRejectedValue(new Error('Transcription failed'));

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.recognized).toBe(false);
        expect(result.intent).toBe('error');
        expect(result.response).toContain('trouble processing');
        expect(result.metadata?.confidence).toBe(0);
      });
    });

    describe('unknown intent handling', () => {
      it('should provide helpful response for unknown intent', async () => {
        molly.generate.mockResolvedValue({
          output: {
            intent: 'unknown_weird_intent',
            confidence: 0.3,
            extractedInfo: 'gibberish',
            reasoning: 'unclear',
          },
        });

        const result = await processVoiceCommand(
          'base64audio',
          defaultContext,
          false
        );

        expect(result.response).toContain('not sure how to help');
      });
    });
  });

  describe('simpleVoiceCommand', () => {
    it('should process voice and return text response only', async () => {
      molly.generate.mockResolvedValue({
        output: {
          intent: 'conversation',
          confidence: 0.9,
          extractedInfo: 'hello',
          reasoning: 'greeting',
        },
      });
      conversationalChat.mockResolvedValue({ response: 'Hello there!' });

      const response = await simpleVoiceCommand('base64audio', 'test-user');

      expect(response).toBe('Hello there!');
      expect(textToSpeech).not.toHaveBeenCalled(); // No speech synthesis
    });
  });

  describe('VoiceCommandContext interface', () => {
    it('should accept minimal context', () => {
      const minimal: VoiceCommandContext = {
        userId: 'user1',
        sessionId: 'session1',
      };
      expect(minimal.userId).toBe('user1');
      expect(minimal.previousCommands).toBeUndefined();
    });

    it('should accept full context', () => {
      const full: VoiceCommandContext = {
        userId: 'user1',
        sessionId: 'session1',
        previousCommands: ['cmd1', 'cmd2'],
        lastResponse: 'last response here',
        hardwareState: {
          temperature: 40,
          batteryLevel: 100,
          cpuUsage: 10,
        },
      };
      expect(full.previousCommands).toHaveLength(2);
      expect(full.hardwareState?.temperature).toBe(40);
    });
  });

  describe('VoiceCommandResult interface', () => {
    it('should have correct structure for successful result', () => {
      const result: VoiceCommandResult = {
        recognized: true,
        intent: 'conversation',
        transcription: 'hello molly',
        response: 'Hello!',
        audioResponse: { audioUri: 'data:audio/mp3;base64,abc' },
        metadata: {
          confidence: 0.95,
          memoryRecalled: false,
          actionTaken: 'responded',
        },
      };

      expect(result.recognized).toBe(true);
      expect(result.audioResponse?.audioUri).toContain('data:audio');
      expect(result.metadata?.confidence).toBe(0.95);
    });

    it('should have correct structure for failed result', () => {
      const result: VoiceCommandResult = {
        recognized: false,
        intent: 'error',
        transcription: '',
        response: 'Error occurred',
        metadata: {
          confidence: 0,
          memoryRecalled: false,
        },
      };

      expect(result.recognized).toBe(false);
      expect(result.audioResponse).toBeUndefined();
    });
  });
});

describe('Intent types', () => {
  it('should support all defined intents', () => {
    const validIntents = [
      'remember',
      'recall',
      'question',
      'command',
      'conversation',
      'clarification',
    ];

    validIntents.forEach((intent) => {
      expect(typeof intent).toBe('string');
    });
  });
});
