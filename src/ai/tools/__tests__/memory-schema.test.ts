/**
 * @fileOverview Tests for Memory Record Schema & Validation
 *
 * Tests memory schema operations including:
 * - Schema validation for all record types
 * - Record creation with auto-generated IDs
 * - Error handling for invalid records
 * - Type inference
 */

import {
  MemoryRecordBaseSchema,
  ExperienceRecordSchema,
  AIResponseRecordSchema,
  CodeModificationRecordSchema,
  HardwareStateRecordSchema,
  MemoryRecordSchema,
  validateMemoryRecord,
  createMemoryRecord,
  type ExperienceRecord,
  type AIResponseRecord,
  type CodeModificationRecord,
  type HardwareStateRecord,
} from '../memory-schema';

describe('Memory Schema', () => {
  describe('MemoryRecordBaseSchema', () => {
    it('validates valid base record', () => {
      const record = {
        id: 'test-123',
        timestamp: Date.now(),
        userId: 'user-456',
        traceId: 'trace-789',
      };

      const result = MemoryRecordBaseSchema.parse(record);
      expect(result).toEqual(record);
    });

    it('rejects missing id', () => {
      const record = {
        timestamp: Date.now(),
        userId: 'user-456',
        traceId: 'trace-789',
      };

      expect(() => MemoryRecordBaseSchema.parse(record)).toThrow();
    });

    it('rejects missing timestamp', () => {
      const record = {
        id: 'test-123',
        userId: 'user-456',
        traceId: 'trace-789',
      };

      expect(() => MemoryRecordBaseSchema.parse(record)).toThrow();
    });

    it('rejects non-numeric timestamp', () => {
      const record = {
        id: 'test-123',
        timestamp: '2024-01-01',
        userId: 'user-456',
        traceId: 'trace-789',
      };

      expect(() => MemoryRecordBaseSchema.parse(record)).toThrow();
    });
  });

  describe('ExperienceRecordSchema', () => {
    const validExperience = {
      id: 'exp-123',
      timestamp: Date.now(),
      userId: 'user-456',
      traceId: 'trace-789',
      type: 'experience' as const,
      context: 'thermal throttling recovery',
      suggestion: 'Use adaptive cooldown periods',
    };

    it('validates valid experience record', () => {
      const result = ExperienceRecordSchema.parse(validExperience);
      expect(result.type).toBe('experience');
      expect(result.context).toBe('thermal throttling recovery');
    });

    it('accepts optional fields', () => {
      const withOptionals = {
        ...validExperience,
        code: 'await cooldown(5000)',
        vibe: 'Recovery',
        vibeScore: 0.7,
        success: true,
        crc32: 'abc12345',
      };

      const result = ExperienceRecordSchema.parse(withOptionals);
      expect(result.code).toBe('await cooldown(5000)');
      expect(result.vibeScore).toBe(0.7);
    });

    it('validates vibeScore range (0-1)', () => {
      expect(() =>
        ExperienceRecordSchema.parse({ ...validExperience, vibeScore: 1.5 })
      ).toThrow();

      expect(() =>
        ExperienceRecordSchema.parse({ ...validExperience, vibeScore: -0.1 })
      ).toThrow();
    });

    it('defaults success to true', () => {
      const result = ExperienceRecordSchema.parse(validExperience);
      expect(result.success).toBe(true);
    });
  });

  describe('AIResponseRecordSchema', () => {
    const validAIResponse = {
      id: 'ai-123',
      timestamp: Date.now(),
      userId: 'user-456',
      traceId: 'trace-789',
      type: 'aiResponse' as const,
      flowName: 'healthCheck',
      prompt: 'Hello Molly',
      response: 'Hello! How can I help you today?',
      modelUsed: 'gemini-2.5-pro',
    };

    it('validates valid AI response record', () => {
      const result = AIResponseRecordSchema.parse(validAIResponse);
      expect(result.type).toBe('aiResponse');
      expect(result.flowName).toBe('healthCheck');
    });

    it('accepts optional embedding vector', () => {
      const withEmbedding = {
        ...validAIResponse,
        embeddingVector: [0.1, 0.2, 0.3, 0.4, 0.5],
      };

      const result = AIResponseRecordSchema.parse(withEmbedding);
      expect(result.embeddingVector).toHaveLength(5);
    });

    it('accepts optional tokens count', () => {
      const withTokens = {
        ...validAIResponse,
        tokensUsed: 150,
      };

      const result = AIResponseRecordSchema.parse(withTokens);
      expect(result.tokensUsed).toBe(150);
    });
  });

  describe('CodeModificationRecordSchema', () => {
    const validCodeMod = {
      id: 'code-123',
      timestamp: Date.now(),
      userId: 'user-456',
      traceId: 'trace-789',
      type: 'codeModification' as const,
      originalCode: 'const x = 1',
      modifiedCode: 'const x = 2',
      modificationSuggestion: 'Updated value for new requirements',
      outcome: 'Success' as const,
    };

    it('validates valid code modification record', () => {
      const result = CodeModificationRecordSchema.parse(validCodeMod);
      expect(result.type).toBe('codeModification');
      expect(result.outcome).toBe('Success');
    });

    it('accepts all outcome values', () => {
      const outcomes = ['Success', 'Failure', 'Pending'] as const;

      for (const outcome of outcomes) {
        const record = { ...validCodeMod, outcome };
        const result = CodeModificationRecordSchema.parse(record);
        expect(result.outcome).toBe(outcome);
      }
    });

    it('accepts optional error message', () => {
      const withError = {
        ...validCodeMod,
        outcome: 'Failure' as const,
        errorMessage: 'Syntax error on line 5',
      };

      const result = CodeModificationRecordSchema.parse(withError);
      expect(result.errorMessage).toBe('Syntax error on line 5');
    });

    it('rejects invalid outcome', () => {
      const invalid = { ...validCodeMod, outcome: 'Unknown' };
      expect(() => CodeModificationRecordSchema.parse(invalid)).toThrow();
    });
  });

  describe('HardwareStateRecordSchema', () => {
    const validHardwareState = {
      id: 'hw-123',
      timestamp: Date.now(),
      userId: 'user-456',
      traceId: 'trace-789',
      type: 'hardwareState' as const,
      temperature: 45.5,
      batteryLevel: 85,
      throttlingStatus: 'Normal' as const,
      cpuUsage: 30,
      memoryUsage: 55,
      powerMode: 'Balanced' as const,
    };

    it('validates valid hardware state record', () => {
      const result = HardwareStateRecordSchema.parse(validHardwareState);
      expect(result.type).toBe('hardwareState');
      expect(result.temperature).toBe(45.5);
    });

    it('validates battery level range (0-100)', () => {
      expect(() =>
        HardwareStateRecordSchema.parse({
          ...validHardwareState,
          batteryLevel: 101,
        })
      ).toThrow();

      expect(() =>
        HardwareStateRecordSchema.parse({
          ...validHardwareState,
          batteryLevel: -1,
        })
      ).toThrow();
    });

    it('validates CPU usage range (0-100)', () => {
      expect(() =>
        HardwareStateRecordSchema.parse({
          ...validHardwareState,
          cpuUsage: 150,
        })
      ).toThrow();
    });

    it('validates memory usage range (0-100)', () => {
      expect(() =>
        HardwareStateRecordSchema.parse({
          ...validHardwareState,
          memoryUsage: -5,
        })
      ).toThrow();
    });

    it('accepts all throttling statuses', () => {
      const statuses = ['Normal', 'Throttled', 'Critical'] as const;

      for (const status of statuses) {
        const record = { ...validHardwareState, throttlingStatus: status };
        const result = HardwareStateRecordSchema.parse(record);
        expect(result.throttlingStatus).toBe(status);
      }
    });

    it('accepts all power modes', () => {
      const modes = ['Performance', 'Balanced', 'Efficiency'] as const;

      for (const mode of modes) {
        const record = { ...validHardwareState, powerMode: mode };
        const result = HardwareStateRecordSchema.parse(record);
        expect(result.powerMode).toBe(mode);
      }
    });
  });

  describe('MemoryRecordSchema (Union)', () => {
    it('accepts experience records', () => {
      const record = {
        id: 'exp-1',
        timestamp: Date.now(),
        userId: 'user',
        traceId: 'trace',
        type: 'experience' as const,
        context: 'test',
        suggestion: 'test suggestion',
      };

      const result = MemoryRecordSchema.parse(record);
      expect(result.type).toBe('experience');
    });

    it('accepts AI response records', () => {
      const record = {
        id: 'ai-1',
        timestamp: Date.now(),
        userId: 'user',
        traceId: 'trace',
        type: 'aiResponse' as const,
        flowName: 'test',
        prompt: 'test',
        response: 'test',
        modelUsed: 'gemini',
      };

      const result = MemoryRecordSchema.parse(record);
      expect(result.type).toBe('aiResponse');
    });

    it('accepts code modification records', () => {
      const record = {
        id: 'code-1',
        timestamp: Date.now(),
        userId: 'user',
        traceId: 'trace',
        type: 'codeModification' as const,
        originalCode: 'a',
        modifiedCode: 'b',
        modificationSuggestion: 'change',
        outcome: 'Success' as const,
      };

      const result = MemoryRecordSchema.parse(record);
      expect(result.type).toBe('codeModification');
    });

    it('accepts hardware state records', () => {
      const record = {
        id: 'hw-1',
        timestamp: Date.now(),
        userId: 'user',
        traceId: 'trace',
        type: 'hardwareState' as const,
        temperature: 40,
        batteryLevel: 80,
        throttlingStatus: 'Normal' as const,
        cpuUsage: 20,
        memoryUsage: 50,
        powerMode: 'Balanced' as const,
      };

      const result = MemoryRecordSchema.parse(record);
      expect(result.type).toBe('hardwareState');
    });

    it('rejects unknown type', () => {
      const record = {
        id: 'unknown-1',
        timestamp: Date.now(),
        userId: 'user',
        traceId: 'trace',
        type: 'unknownType',
      };

      expect(() => MemoryRecordSchema.parse(record)).toThrow();
    });
  });

  describe('validateMemoryRecord', () => {
    it('validates and returns valid record', () => {
      const record = {
        id: 'exp-1',
        timestamp: Date.now(),
        userId: 'user',
        traceId: 'trace',
        type: 'experience' as const,
        context: 'test',
        suggestion: 'suggestion',
      };

      const result = validateMemoryRecord(record);
      expect(result).toEqual(expect.objectContaining({ type: 'experience' }));
    });

    it('throws for invalid record', () => {
      const invalid = {
        id: 'exp-1',
        // Missing timestamp
        userId: 'user',
        traceId: 'trace',
        type: 'experience',
        context: 'test',
        suggestion: 'suggestion',
      };

      expect(() => validateMemoryRecord(invalid)).toThrow();
    });

    it('throws for wrong type values', () => {
      const invalid = {
        id: 'exp-1',
        timestamp: 'not-a-number',
        userId: 'user',
        traceId: 'trace',
        type: 'experience',
        context: 'test',
        suggestion: 'suggestion',
      };

      expect(() => validateMemoryRecord(invalid)).toThrow();
    });

    it('re-throws non-Zod errors', () => {
      // This is harder to test since Zod handles most cases
      // But we verify the function doesn't swallow errors
      expect(() => validateMemoryRecord(null)).toThrow();
    });
  });

  describe('createMemoryRecord', () => {
    it('creates experience record with auto-generated ID', () => {
      const input: Omit<ExperienceRecord, 'id'> = {
        timestamp: Date.now(),
        userId: 'user-123',
        traceId: 'trace-456',
        type: 'experience',
        context: 'test context',
        suggestion: 'test suggestion',
        success: true,
      };

      const result = createMemoryRecord<ExperienceRecord>(input);

      expect(result.id).toMatch(/^experience_\d+_[a-z0-9]+$/);
      expect(result.context).toBe('test context');
    });

    it('creates AI response record with proper ID format', () => {
      const input: Omit<AIResponseRecord, 'id'> = {
        timestamp: Date.now(),
        userId: 'user-123',
        traceId: 'trace-456',
        type: 'aiResponse',
        flowName: 'healthCheck',
        prompt: 'test',
        response: 'response',
        modelUsed: 'gemini',
        success: true,
      };

      const result = createMemoryRecord<AIResponseRecord>(input);

      expect(result.id).toMatch(/^aiResponse_\d+_[a-z0-9]+$/);
    });

    it('creates code modification record', () => {
      const input: Omit<CodeModificationRecord, 'id'> = {
        timestamp: Date.now(),
        userId: 'user-123',
        traceId: 'trace-456',
        type: 'codeModification',
        originalCode: 'const a = 1',
        modifiedCode: 'const a = 2',
        modificationSuggestion: 'Updated value',
        outcome: 'Success',
      };

      const result = createMemoryRecord<CodeModificationRecord>(input);

      expect(result.id).toMatch(/^codeModification_\d+_[a-z0-9]+$/);
    });

    it('creates hardware state record', () => {
      const input: Omit<HardwareStateRecord, 'id'> = {
        timestamp: Date.now(),
        userId: 'user-123',
        traceId: 'trace-456',
        type: 'hardwareState',
        temperature: 42,
        batteryLevel: 75,
        throttlingStatus: 'Normal',
        cpuUsage: 25,
        memoryUsage: 45,
        powerMode: 'Balanced',
      };

      const result = createMemoryRecord<HardwareStateRecord>(input);

      expect(result.id).toMatch(/^hardwareState_\d+_[a-z0-9]+$/);
    });

    it('generates unique IDs', () => {
      const input: Omit<ExperienceRecord, 'id'> = {
        timestamp: Date.now(),
        userId: 'user',
        traceId: 'trace',
        type: 'experience',
        context: 'test',
        suggestion: 'test',
        success: true,
      };

      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const record = createMemoryRecord<ExperienceRecord>(input);
        ids.add(record.id);
      }

      expect(ids.size).toBe(100);
    });

    it('validates record before returning', () => {
      const invalid = {
        timestamp: Date.now(),
        userId: 'user',
        traceId: 'trace',
        type: 'experience' as const,
        // Missing required 'context' and 'suggestion'
      };

      expect(() =>
        createMemoryRecord(invalid as Omit<ExperienceRecord, 'id'>)
      ).toThrow();
    });
  });

  describe('Type Safety', () => {
    it('infers correct types from schema', () => {
      // This is primarily a compile-time check
      // If types are wrong, TypeScript would catch it
      const experience: ExperienceRecord = {
        id: 'exp-1',
        timestamp: Date.now(),
        userId: 'user',
        traceId: 'trace',
        type: 'experience',
        context: 'test',
        suggestion: 'test',
        success: true,
      };

      expect(experience.type).toBe('experience');
    });
  });
});
