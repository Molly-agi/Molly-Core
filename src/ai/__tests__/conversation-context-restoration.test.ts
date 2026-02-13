/**
 * @fileOverview Tests for Context Restoration in Conversational Chat
 * 
 * This test suite validates that conversation history is properly
 * stored and restored across chat interactions.
 */

import { conversationalChat } from '../flows/conversational-chat';

// Mock the Firebase and logger modules
jest.mock('@/firebase', () => ({
  initializeFirebase: jest.fn(() => ({
    firestore: {},
  })),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: jest.fn(() => Promise.resolve({ id: 'mock-doc-id' })),
  query: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn(() =>
    Promise.resolve({
      docs: [
        {
          id: 'msg1',
          data: () => ({
            role: 'user',
            content: 'What is JavaScript?',
            timestamp: '2026-02-13T09:00:00Z',
            metadata: { flowName: 'conversationalChat', tokens: 5 },
          }),
        },
        {
          id: 'msg2',
          data: () => ({
            role: 'assistant',
            content: 'JavaScript is a programming language.',
            timestamp: '2026-02-13T09:00:10Z',
            metadata: { flowName: 'conversationalChat', tokens: 8 },
          }),
        },
      ],
    })
  ),
}));

jest.mock('../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    logFlowStart: jest.fn(),
    logFlowComplete: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-id'),
}));

jest.mock('@/ai/genkit', () => ({
  ai: {
    generate: jest.fn(() =>
      Promise.resolve({
        text: 'This is a mock response from Molly',
      })
    ),
    defineFlow: jest.fn((config, handler) => handler),
  },
  MODEL_FLASH: 'mock-model',
}));

jest.mock('../error-handler', () => ({
  withGenerateErrorHandling: jest.fn((fn) => fn()),
}));

describe('Conversation Context Restoration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should accept userId and conversationId parameters', async () => {
    const input = {
      text: 'Tell me more about JavaScript',
      history: [],
      userId: 'test-user-123',
      conversationId: 'conv-456',
    };

    const result = await conversationalChat(input);

    expect(result).toHaveProperty('response');
    expect(result.response).toBeTruthy();
  });

  it('should work with manual history when no userId provided', async () => {
    const input = {
      text: 'What is TypeScript?',
      history: [
        { role: 'user' as const, content: 'Hello' },
        { role: 'bot' as const, content: 'Hi there!' },
      ],
    };

    const result = await conversationalChat(input);

    expect(result).toHaveProperty('response');
    expect(result.response).toBeTruthy();
  });

  it('should restore context from Firestore when userId and conversationId provided', async () => {
    const { MollyLogger } = require('../logger');

    const input = {
      text: 'Continue our discussion',
      userId: 'test-user-123',
      conversationId: 'conv-456',
    };

    const result = await conversationalChat(input);

    // Check that context restoration was logged
    expect(MollyLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Restoring conversation context'),
      'conversationalChat',
      expect.any(Object),
      expect.any(String)
    );

    expect(result).toHaveProperty('response');
  });

  it('should handle empty conversation history gracefully', async () => {
    const input = {
      text: 'First message',
      history: [],
    };

    const result = await conversationalChat(input);

    expect(result).toHaveProperty('response');
    expect(result.response).toBeTruthy();
  });

  it('should return error message on failure', async () => {
    const { ai } = require('@/ai/genkit');
    
    // Mock a failure
    ai.generate.mockRejectedValueOnce(new Error('API Error'));

    const input = {
      text: 'This will fail',
      history: [],
    };

    const result = await conversationalChat(input);

    expect(result).toHaveProperty('error');
    expect(result.response).toContain('encountered an issue');
  });
});
