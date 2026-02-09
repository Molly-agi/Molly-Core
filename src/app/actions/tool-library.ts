'use server';

import {
  saveFoundTool,
  searchSavedTools,
  getToolsByCategory,
  getRecentTools,
  recordToolAccess,
  removeTool,
  getToolStats,
  type FoundTool,
} from '@/firebase/firestore/tool-database';
import { ensureApiKey } from './utils';
import { MollyLogger } from '@/ai/logger';

/**
 * Save a newly discovered tool to Molly's database
 */
export async function addToolToDatabase(
  userId: string,
  tool: Omit<FoundTool, 'id' | 'savedAt' | 'accessCount' | 'lastAccessedAt'>
) {
  try {
    ensureApiKey();
    const toolId = await saveFoundTool(userId, tool);
    MollyLogger.info('Tool added to database', 'addToolToDatabase', {
      toolId,
      toolName: tool.name,
    });
    return { success: true, toolId };
  } catch (e) {
    MollyLogger.error('Failed to add tool', 'addToolToDatabase', {}, e);
    throw e;
  }
}

/**
 * Search Molly's personal tool database
 */
export async function searchTools(
  userId: string,
  searchTerm: string,
  category?: string
) {
  try {
    const tools = await searchSavedTools(userId, searchTerm, category);
    return { success: true, tools };
  } catch (e) {
    MollyLogger.error('Tool search failed', 'searchTools', {}, e);
    throw e;
  }
}

/**
 * Get tools by category
 */
export async function getToolsBycat(userId: string, category: string) {
  try {
    const tools = await getToolsByCategory(userId, category);
    return { success: true, tools };
  } catch (e) {
    MollyLogger.error(
      'Failed to get tools by category',
      'getToolsBycat',
      {},
      e
    );
    throw e;
  }
}

/**
 * Get Molly's recent tools
 */
export async function getRecentFoundTools(userId: string, count?: number) {
  try {
    const tools = await getRecentTools(userId, count);
    return { success: true, tools };
  } catch (e) {
    MollyLogger.error(
      'Failed to get recent tools',
      'getRecentFoundTools',
      {},
      e
    );
    throw e;
  }
}

/**
 * Get comprehensive statistics about Molly's tool collection
 */
export async function getToolLibraryStats(userId: string) {
  try {
    const stats = await getToolStats(userId);
    return { success: true, stats };
  } catch (e) {
    MollyLogger.error('Failed to get tool stats', 'getToolLibraryStats', {}, e);
    throw e;
  }
}

/**
 * Use a tool and record the access
 */
export async function accessTool(userId: string, toolId: string) {
  try {
    await recordToolAccess(userId, toolId);
    MollyLogger.info('Tool accessed', 'accessTool', { toolId });
    return { success: true };
  } catch (e) {
    MollyLogger.error('Failed to record tool access', 'accessTool', {}, e);
    throw e;
  }
}

/**
 * Remove a tool from the database
 */
export async function deleteToolFromDatabase(userId: string, toolId: string) {
  try {
    await removeTool(userId, toolId);
    MollyLogger.info('Tool removed', 'deleteToolFromDatabase', { toolId });
    return { success: true };
  } catch (e) {
    MollyLogger.error('Failed to delete tool', 'deleteToolFromDatabase', {}, e);
    throw e;
  }
}
