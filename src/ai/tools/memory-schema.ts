/**
 * @fileOverview Memory Record Schema & Validation
 *
 * Defines Zod schemas for all memory record types.
 * Ensures data integrity and type safety for memory operations.
 * Prevents corrupted data from infiltrating decision logic.
 */

import { z } from 'zod';

/**
 * Core memory record base schema
 * All memory records inherit from this
 */
export const MemoryRecordBaseSchema = z.object({
  id: z.string().describe('Unique record ID'),
  timestamp: z.number().describe('Unix timestamp of record creation'),
  userId: z.string().describe('User ID associated with this memory'),
  traceId: z.string().describe('Trace ID for debugging and audit trails'),
});

/**
 * Experience/lesson record schema
 * Stores learned patterns and recovered failures
 */
export const ExperienceRecordSchema = MemoryRecordBaseSchema.extend({
  type: z.literal('experience'),
  context: z
    .string()
    .describe(
      'The task or vibe where this was learned (e.g., "thermal throttling")'
    ),
  suggestion: z.string().describe('The lesson or improvement suggestion'),
  code: z.string().optional().describe('Associated code snippet'),
  vibe: z
    .string()
    .optional()
    .describe(
      'Emotional/contextual vibe (e.g., "Stable", "Stressed", "Learning")'
    ),
  vibeScore: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Quantified vibe (0=negative, 1=positive)'),
  success: z.boolean().default(true),
  crc32: z.string().optional().describe('CRC32 checksum for integrity'),
});

/**
 * AI response record schema
 * Stores generated responses, thoughts, and decisions
 */
export const AIResponseRecordSchema = MemoryRecordBaseSchema.extend({
  type: z.literal('aiResponse'),
  flowName: z.string().describe('Which flow generated this'),
  prompt: z.string().describe('The input prompt'),
  response: z.string().describe('The generated response'),
  modelUsed: z.string().describe('Which model (gemini-2.5-pro, etc.)'),
  tokensUsed: z
    .number()
    .optional()
    .describe('Tokens consumed in this response'),
  vibe: z
    .string()
    .optional()
    .describe('Emotional/contextual vibe of the response'),
  vibeScore: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Quantified vibe quality'),
  embeddingVector: z
    .array(z.number())
    .optional()
    .describe('Vector embedding for semantic search (Phase 7)'),
  success: z.boolean().default(true),
  crc32: z.string().optional().describe('CRC32 checksum for integrity'),
});

/**
 * Code modification record schema
 * Tracks code changes and their outcomes
 */
export const CodeModificationRecordSchema = MemoryRecordBaseSchema.extend({
  type: z.literal('codeModification'),
  originalCode: z.string().describe('Code before modification'),
  modifiedCode: z.string().describe('Code after modification'),
  modificationSuggestion: z.string().describe('Why the change was made'),
  outcome: z
    .enum(['Success', 'Failure', 'Pending'])
    .describe('Did the change work?'),
  errorMessage: z.string().optional().describe('Error if outcome is Failure'),
  vibe: z.string().optional(),
  vibeScore: z.number().min(0).max(1).optional(),
  crc32: z.string().optional().describe('CRC32 checksum for integrity'),
});

/**
 * Hardware state record schema
 * Logs system health snapshots
 */
export const HardwareStateRecordSchema = MemoryRecordBaseSchema.extend({
  type: z.literal('hardwareState'),
  temperature: z.number().describe('CPU temperature in Celsius'),
  batteryLevel: z.number().min(0).max(100).describe('Battery percentage'),
  throttlingStatus: z
    .enum(['Normal', 'Throttled', 'Critical'])
    .describe('Thermal throttling state'),
  cpuUsage: z.number().min(0).max(100).describe('CPU usage percentage'),
  memoryUsage: z.number().min(0).max(100).describe('RAM usage percentage'),
  powerMode: z
    .enum(['Performance', 'Balanced', 'Efficiency'])
    .describe('Power mode'),
  vibe: z.string().optional().describe('Subjective hardware state assessment'),
  crc32: z.string().optional().describe('CRC32 checksum for integrity'),
});

/**
 * Unified memory record type
 * Can be any of the specific record types
 */
export const MemoryRecordSchema = z.union([
  ExperienceRecordSchema,
  AIResponseRecordSchema,
  CodeModificationRecordSchema,
  HardwareStateRecordSchema,
]);

export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
export type ExperienceRecord = z.infer<typeof ExperienceRecordSchema>;
export type AIResponseRecord = z.infer<typeof AIResponseRecordSchema>;
export type CodeModificationRecord = z.infer<
  typeof CodeModificationRecordSchema
>;
export type HardwareStateRecord = z.infer<typeof HardwareStateRecordSchema>;

/**
 * Validate a memory record
 * Throws if record doesn't match schema
 */
export function validateMemoryRecord(
  record: unknown,
  type?: string
): MemoryRecord {
  void type;
  try {
    const validated = MemoryRecordSchema.parse(record);
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid memory record: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`
      );
    }
    throw error;
  }
}

/**
 * Create a memory record with validation
 */
export function createMemoryRecord<T extends MemoryRecord>(
  record: Omit<T, 'id'>
): T {
  const withId = {
    ...record,
    id: `${record.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  } as T;

  return validateMemoryRecord(withId) as T;
}
