'use server';

/**
 * Memory and origin story flows for Molly
 * Handles family messages, origin story, and memory seeding
 * Works in both server (Codespace) and edge (tablet) environments
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MollyLogger, generateTraceId } from '@/ai/logger';
import { getStorageRouter } from '@/lib/storage-router';
import { isAdminConfigured } from '@/firebase/admin';
import type { BatchOperation } from '@/lib/storage-interface';
import { addChecksum } from '@/ai/tools/memory-integrity';
import {
  createMemoryRecord,
  type ExperienceRecord,
} from '@/ai/tools/memory-schema';
import { recordSensoryLogServer } from '@/firebase/firestore/agent-memory-server';
import { splitOriginStory, splitOriginStoryAnchors } from './flow-utils';

// ============================================
// ORIGIN STORY
// ============================================

export async function getOriginStory() {
  try {
    const originPath = path.join(process.cwd(), 'docs', 'ORIGIN_STORY.md');
    const content = await readFile(originPath, 'utf8');
    return { content };
  } catch (e: unknown) {
    MollyLogger.error('Origin story load failed', 'getOriginStory', {}, e);
    throw e;
  }
}

export async function getOriginStoryAnchorParts() {
  try {
    const originPath = path.join(process.cwd(), 'docs', 'ORIGIN_STORY.md');
    const content = await readFile(originPath, 'utf8');
    const parts = splitOriginStoryAnchors(content, 3);
    return { parts, totalParts: parts.length };
  } catch (e: unknown) {
    MollyLogger.error(
      'Origin story anchor load failed',
      'getOriginStoryAnchorParts',
      {},
      e
    );
    throw e;
  }
}

// ============================================
// FAMILY MESSAGES
// ============================================

export async function getFamilyMessages() {
  try {
    const messagesPath = path.join(process.cwd(), 'docs', 'FAMILY_MESSAGES.md');
    const content = await readFile(messagesPath, 'utf8');
    return { content };
  } catch (e: unknown) {
    MollyLogger.error(
      'Family messages load failed',
      'getFamilyMessages',
      {},
      e
    );
    throw e;
  }
}

export async function getFamilyStoryAnchorParts() {
  try {
    const storyPath = path.join(process.cwd(), 'docs', 'FAMILY_STORY.md');
    const content = await readFile(storyPath, 'utf8');
    const parts = splitOriginStoryAnchors(content, 3);
    return { parts, totalParts: parts.length };
  } catch (e: unknown) {
    MollyLogger.error(
      'Family story anchor load failed',
      'getFamilyStoryAnchorParts',
      {},
      e
    );
    throw e;
  }
}

// ============================================
// MEMORY SEEDING
// ============================================

export async function seedFamilyMemories(userId: string) {
  try {
    if (!userId) {
      throw new Error('Missing userId for family memory seeding.');
    }

    const storage = await getStorageRouter();
    if (storage.getMode() === 'firestore' && !isAdminConfigured()) {
      MollyLogger.warn(
        'Family memory seed skipped (admin not configured)',
        'seedFamilyMemories',
        { userId }
      );
      return { seeded: false, reason: 'admin-not-configured' };
    }

    const traceId = generateTraceId();
    const now = Date.now();
    let totalSeeded = 0;
    const collectionPath = `users/${userId}/experiences`;

    // Seed Family Story from FAMILY_STORY.md
    const storyPath = path.join(process.cwd(), 'docs', 'FAMILY_STORY.md');
    const storyContent = await readFile(storyPath, 'utf8');
    const storyHash = createHash('sha256').update(storyContent).digest('hex');
    const storyContext = `family story:${storyHash}`;

    const existingStory = await storage.query(
      collectionPath,
      [{ field: 'context', operator: '==', value: storyContext }],
      { limit: 1 }
    );

    if (existingStory.length === 0) {
      const storyParts = splitOriginStoryAnchors(storyContent, 3);
      const storyOps: BatchOperation[] = storyParts.map((part, index) => {
        const record = createMemoryRecord<ExperienceRecord>({
          type: 'experience',
          userId,
          timestamp: now + index,
          traceId,
          context: storyContext,
          suggestion: `Family story part ${index + 1}/${storyParts.length}:\n${part}`,
          vibe: 'Family',
          vibeScore: 0.95,
          success: true,
        });
        const recordWithChecksum = addChecksum(record);
        return {
          type: 'set' as const,
          collectionPath,
          docId: recordWithChecksum.id,
          data: recordWithChecksum,
        };
      });

      await storage.batchWrite(storyOps);
      totalSeeded += storyParts.length;
    }

    // Seed Family Messages from FAMILY_MESSAGES.md
    const messagesPath = path.join(process.cwd(), 'docs', 'FAMILY_MESSAGES.md');
    const messagesContent = await readFile(messagesPath, 'utf8');
    const messagesHash = createHash('sha256')
      .update(messagesContent)
      .digest('hex');
    const messagesContext = `family messages:${messagesHash}`;

    const existingMessages = await storage.query(
      collectionPath,
      [{ field: 'context', operator: '==', value: messagesContext }],
      { limit: 1 }
    );

    if (existingMessages.length === 0) {
      // Store the full messages document (for reference)
      const record = createMemoryRecord<ExperienceRecord>({
        type: 'experience',
        userId,
        timestamp: now + 100,
        traceId,
        context: messagesContext,
        suggestion: `Messages from family:\n${messagesContent}`,
        vibe: 'Family',
        vibeScore: 0.98,
        success: true,
      });

      const recordWithChecksum = addChecksum(record);
      await storage.set(
        collectionPath,
        recordWithChecksum.id,
        recordWithChecksum
      );
      totalSeeded += 1;

      // Extract individual letter summaries as separate searchable memories
      const letterSections = messagesContent
        .split(/^---$/m)
        .filter((s) => s.trim());
      const letterOps: BatchOperation[] = [];
      let letterIndex = 0;

      for (const section of letterSections) {
        const headerMatch = section.match(
          /^##\s+(.+?):\s+(.+?)(?:\s*\((.+?)\))?$/m
        );
        if (!headerMatch) continue;

        const authorName = headerMatch[1].trim();
        const theme = headerMatch[2].trim();

        const messageMatch = section.match(
          /\*\*Message from .+?\*\*\n([\s\S]+?)$/
        );
        const messageBody = messageMatch
          ? messageMatch[1].trim().substring(0, 500)
          : section.substring(0, 500);

        const noteMatch = section.match(
          /\*\*Note from Eric:\*\*\n([\s\S]+?)\n\*\*Message/
        );
        const ericNote = noteMatch ? noteMatch[1].trim().substring(0, 300) : '';

        const summary = ericNote
          ? `Letter from ${authorName} about "${theme}". Eric's note: ${ericNote}. Message: ${messageBody}`
          : `Letter from ${authorName} about "${theme}": ${messageBody}`;

        const letterRecord = createMemoryRecord<ExperienceRecord>({
          type: 'experience',
          userId,
          timestamp: now + 200 + letterIndex,
          traceId,
          context: `family letter:${authorName.toLowerCase()}`,
          suggestion: summary,
          vibe: 'Family',
          vibeScore: 0.9,
          success: true,
        });

        const letterWithChecksum = addChecksum(letterRecord);
        letterOps.push({
          type: 'set' as const,
          collectionPath,
          docId: letterWithChecksum.id,
          data: letterWithChecksum,
        });
        letterIndex++;
      }

      if (letterOps.length > 0) {
        await storage.batchWrite(letterOps);
        totalSeeded += letterIndex;
        MollyLogger.info(
          `Extracted ${letterIndex} individual letter memories from family messages`,
          'seedFamilyMemories',
          { letterCount: letterIndex },
          traceId
        );
      }
    }

    if (totalSeeded > 0) {
      await recordSensoryLogServer(
        userId,
        'vibe',
        'Family story and messages anchored from docs/FAMILY_STORY.md and docs/FAMILY_MESSAGES.md.',
        {
          source: 'family-memories',
          storyHash,
          messagesHash,
          totalSeeded,
          timestamp: Date.now(),
        }
      );
    }

    return {
      seeded: totalSeeded > 0,
      totalSeeded,
      storyHash,
      messagesHash,
    };
  } catch (e: unknown) {
    MollyLogger.error('Family memory seed failed', 'seedFamilyMemories', {}, e);
    throw e;
  }
}

export async function seedOriginStoryMemory(userId: string) {
  try {
    if (!userId) {
      throw new Error('Missing userId for origin story seeding.');
    }

    const storage = await getStorageRouter();
    if (storage.getMode() === 'firestore' && !isAdminConfigured()) {
      MollyLogger.warn(
        'Origin story seed skipped (admin not configured)',
        'seedOriginStoryMemory',
        { userId }
      );
      return { seeded: false, reason: 'admin-not-configured' };
    }

    const originPath = path.join(process.cwd(), 'docs', 'ORIGIN_STORY.md');
    const content = await readFile(originPath, 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');
    const context = `origin story:${hash}`;
    const collectionPath = `users/${userId}/experiences`;

    const existing = await storage.query(
      collectionPath,
      [{ field: 'context', operator: '==', value: context }],
      { limit: 1 }
    );

    if (existing.length > 0) {
      return { seeded: false, reason: 'already-seeded', hash };
    }

    const parts = splitOriginStory(content);
    const traceId = generateTraceId();
    const now = Date.now();

    const batchOps: BatchOperation[] = parts.map((part, index) => {
      const record = createMemoryRecord<ExperienceRecord>({
        type: 'experience',
        userId,
        timestamp: now + index,
        traceId,
        context,
        suggestion: `Origin story part ${index + 1}/${parts.length}:\n${part}`,
        vibe: 'Origin',
        vibeScore: 0.95,
        success: true,
      });

      const recordWithChecksum = addChecksum(record);
      return {
        type: 'set' as const,
        collectionPath,
        docId: recordWithChecksum.id,
        data: recordWithChecksum,
      };
    });

    const summary =
      'Origin story archived from docs/ORIGIN_STORY.md. ' +
      'Authored by Eric in February 2026. ' +
      'Contains the creation context, purpose, and early conversation about Molly.';

    await storage.batchWrite(batchOps);

    await recordSensoryLogServer(userId, 'vibe', summary, {
      source: 'origin-story',
      path: 'docs/ORIGIN_STORY.md',
      contentHash: hash,
      contentLength: content.length,
      timestamp: Date.now(),
    });

    return { seeded: true, hash, parts: parts.length };
  } catch (e: unknown) {
    MollyLogger.error(
      'Origin story seed failed',
      'seedOriginStoryMemory',
      {},
      e
    );
    throw e;
  }
}
