/**
 * @fileOverview Tests for Engram Persistence
 *
 * Tests persistence functionality including:
 * - Batch persistence
 * - Error handling
 * - Firebase admin checks
 */

// Mock logger
jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  generateTraceId: jest.fn().mockReturnValue('test-trace-id'),
}));

// Mock storage router with inline mock to avoid hoisting issues
jest.mock('@/lib/storage-router', () => ({
  getStorageRouter: jest.fn().mockResolvedValue({
    getMode: jest.fn().mockReturnValue('local'),
    batchWrite: jest.fn().mockResolvedValue(undefined),
  }),
}));

// Mock firebase admin
jest.mock('@/firebase/admin', () => ({
  isAdminConfigured: jest.fn().mockReturnValue(true),
}));

// Mock engram crypto
jest.mock('../engram-crypto', () => ({
  encryptEngramData: jest.fn().mockReturnValue({
    encrypted: 'encrypted-data',
    iv: 'test-iv',
    authTag: 'test-auth-tag',
  }),
}));

import { persistEngramBatch } from '../engram-persistence';
import { getStorageRouter } from '@/lib/storage-router';
import { isAdminConfigured } from '@/firebase/admin';
import { encryptEngramData } from '../engram-crypto';
import type { MemoryEngram } from '../neural-engram';

describe('Engram Persistence', () => {
  const userId = 'test-user';
  const password = 'test-password';
  let mockBatchWrite: jest.Mock;

  const createMockEngram = (id: string): MemoryEngram => ({
    id,
    content: `Memory content for ${id}`,
    timestamp: new Date(),
    emotionalValence: 0.5,
    arousal: 0.5,
    importance: 0.7,
    accessCount: 1,
    lastAccessed: new Date(),
    consolidationState: 'consolidated',
    contextTags: ['test'],
    relatedEngrams: [],
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a fresh mock for batchWrite
    mockBatchWrite = jest.fn().mockResolvedValue(undefined);

    (getStorageRouter as jest.Mock).mockResolvedValue({
      getMode: jest.fn().mockReturnValue('local'),
      batchWrite: mockBatchWrite,
    });
    (isAdminConfigured as jest.Mock).mockReturnValue(true);
  });

  describe('Batch Persistence', () => {
    it('returns early for empty batch', async () => {
      const result = await persistEngramBatch(userId, password, []);

      expect(result.saved).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockBatchWrite).not.toHaveBeenCalled();
    });

    it('persists single engram', async () => {
      const engrams = [createMockEngram('engram-1')];

      const result = await persistEngramBatch(userId, password, engrams);

      expect(result.saved).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockBatchWrite).toHaveBeenCalledTimes(1);
    });

    it('persists multiple engrams', async () => {
      const engrams = [
        createMockEngram('engram-1'),
        createMockEngram('engram-2'),
        createMockEngram('engram-3'),
      ];

      const result = await persistEngramBatch(userId, password, engrams);

      expect(result.saved).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('encrypts engram data', async () => {
      const engrams = [createMockEngram('engram-1')];

      await persistEngramBatch(userId, password, engrams);

      expect(encryptEngramData).toHaveBeenCalled();
    });

    it('passes source option', async () => {
      const engrams = [createMockEngram('engram-1')];

      await persistEngramBatch(userId, password, engrams, {
        source: 'heartbeat',
      });

      expect(mockBatchWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({ source: 'heartbeat' }),
          }),
        ])
      );
    });

    it('uses default source when not specified', async () => {
      const engrams = [createMockEngram('engram-1')];

      await persistEngramBatch(userId, password, engrams);

      expect(mockBatchWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({ source: 'consolidation' }),
          }),
        ])
      );
    });
  });

  describe('Firebase Mode', () => {
    it('fails when Firestore mode but admin not configured', async () => {
      (getStorageRouter as jest.Mock).mockResolvedValue({
        getMode: jest.fn().mockReturnValue('firestore'),
        batchWrite: mockBatchWrite,
      });
      (isAdminConfigured as jest.Mock).mockReturnValue(false);

      const engrams = [createMockEngram('engram-1')];
      const result = await persistEngramBatch(userId, password, engrams);

      expect(result.saved).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain('Firebase admin not configured');
    });

    it('succeeds when Firestore mode and admin configured', async () => {
      (getStorageRouter as jest.Mock).mockResolvedValue({
        getMode: jest.fn().mockReturnValue('firestore'),
        batchWrite: mockBatchWrite,
      });
      (isAdminConfigured as jest.Mock).mockReturnValue(true);

      const engrams = [createMockEngram('engram-1')];
      const result = await persistEngramBatch(userId, password, engrams);

      expect(result.saved).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('handles encryption errors', async () => {
      (encryptEngramData as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Encryption failed');
      });

      const engrams = [createMockEngram('engram-1')];
      const result = await persistEngramBatch(userId, password, engrams);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Encryption failed');
    });

    it('handles batch write errors', async () => {
      mockBatchWrite.mockRejectedValueOnce(new Error('Write failed'));

      const engrams = [createMockEngram('engram-1')];
      const result = await persistEngramBatch(userId, password, engrams);

      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('Write failed'))).toBe(true);
    });

    it('continues processing after partial failure', async () => {
      // First encryption succeeds, second fails, third succeeds
      (encryptEngramData as jest.Mock)
        .mockReturnValueOnce({
          encrypted: 'data1',
          iv: 'iv1',
          authTag: 'tag1',
        })
        .mockImplementationOnce(() => {
          throw new Error('Encryption failed');
        })
        .mockReturnValueOnce({
          encrypted: 'data3',
          iv: 'iv3',
          authTag: 'tag3',
        });

      const engrams = [
        createMockEngram('engram-1'),
        createMockEngram('engram-2'),
        createMockEngram('engram-3'),
      ];

      const result = await persistEngramBatch(userId, password, engrams);

      // 2 should succeed, 1 should fail
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('engram-2');
    });
  });

  describe('Batching', () => {
    it('splits large batches', async () => {
      // Create more than MAX_BATCH_SIZE (450) engrams
      const engrams: MemoryEngram[] = [];
      for (let i = 0; i < 500; i++) {
        engrams.push(createMockEngram(`engram-${i}`));
      }

      const result = await persistEngramBatch(userId, password, engrams);

      // Should have called batchWrite multiple times
      expect(mockBatchWrite).toHaveBeenCalledTimes(2);
      expect(result.saved).toBe(500);
    });
  });

  describe('Data Format', () => {
    it('includes required fields in persisted data', async () => {
      const engram = createMockEngram('engram-1');
      engram.content =
        'A very long content that should be truncated for preview purposes when stored in the database';

      await persistEngramBatch(userId, password, [engram]);

      expect(mockBatchWrite).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'set',
          collectionPath: `users/${userId}/engrams`,
          docId: 'engram-1',
          data: expect.objectContaining({
            encrypted: expect.any(String),
            iv: expect.any(String),
            authTag: expect.any(String),
            timestamp: expect.any(String),
            contentPreview: expect.any(String),
            importance: engram.importance,
            emotionalValence: engram.emotionalValence,
            consolidationState: 'consolidated',
          }),
        }),
      ]);
    });

    it('truncates content preview to 100 chars', async () => {
      const engram = createMockEngram('engram-1');
      engram.content = 'x'.repeat(200);

      await persistEngramBatch(userId, password, [engram]);

      const call = mockBatchWrite.mock.calls[0][0];
      expect(call[0].data.contentPreview.length).toBeLessThanOrEqual(100);
    });
  });
});
