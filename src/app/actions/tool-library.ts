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
import { isAdminConfigured } from '@/firebase/admin';
import { ensureApiKey } from './utils';
import { MollyLogger } from '@/ai/logger';

function cleanFirestoreError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('has not been used in project')
  ) {
    return 'Cloud Firestore API is not enabled. Enable it in Google Cloud Console, then reload.';
  }
  return msg;
}

/**
 * Save a newly discovered tool to Molly's database
 */
export async function addToolToDatabase(
  userId: string,
  tool: Omit<FoundTool, 'id' | 'savedAt' | 'accessCount' | 'lastAccessedAt'>
) {
  try {
    if (!isAdminConfigured()) {
      return {
        success: false,
        error: 'Firebase admin is not configured in this environment.',
      };
    }
    ensureApiKey();
    const toolId = await saveFoundTool(userId, tool);
    MollyLogger.info('Tool added to database', 'addToolToDatabase', {
      toolId,
      toolName: tool.name,
    });
    return { success: true, toolId };
  } catch (e) {
    MollyLogger.error('Failed to add tool', 'addToolToDatabase', {}, e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to add tool',
    };
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
    if (!isAdminConfigured()) {
      return {
        success: false,
        error: 'Firebase admin is not configured in this environment.',
        tools: [],
      };
    }
    const tools = await searchSavedTools(userId, searchTerm, category);
    return { success: true, tools };
  } catch (e) {
    MollyLogger.error('Tool search failed', 'searchTools', {}, e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Tool search failed',
      tools: [],
    };
  }
}

/**
 * Get tools by category
 */
export async function getToolsBycat(userId: string, category: string) {
  try {
    if (!isAdminConfigured()) {
      return {
        success: false,
        error: 'Firebase admin is not configured in this environment.',
        tools: [],
      };
    }
    const tools = await getToolsByCategory(userId, category);
    return { success: true, tools };
  } catch (e) {
    MollyLogger.error(
      'Failed to get tools by category',
      'getToolsBycat',
      {},
      e
    );
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to get tools by category',
      tools: [],
    };
  }
}

/**
 * Get Molly's recent tools
 */
export async function getRecentFoundTools(userId: string, count?: number) {
  try {
    if (!isAdminConfigured()) {
      return {
        success: false,
        error: 'Firebase admin is not configured in this environment.',
        tools: [],
      };
    }
    const tools = await getRecentTools(userId, count);
    return { success: true, tools };
  } catch (e) {
    MollyLogger.error(
      'Failed to get recent tools',
      'getRecentFoundTools',
      {},
      e
    );
    return {
      success: false,
      error: cleanFirestoreError(e),
      tools: [],
    };
  }
}

/**
 * Get comprehensive statistics about Molly's tool collection
 */
export async function getToolLibraryStats(userId: string) {
  try {
    if (!isAdminConfigured()) {
      return {
        success: false,
        error: 'Firebase admin is not configured in this environment.',
        stats: null,
      };
    }
    const stats = await getToolStats(userId);
    return { success: true, stats };
  } catch (e) {
    MollyLogger.error('Failed to get tool stats', 'getToolLibraryStats', {}, e);
    return {
      success: false,
      error: cleanFirestoreError(e),
      stats: null,
    };
  }
}

/**
 * Use a tool and record the access
 */
export async function accessTool(userId: string, toolId: string) {
  try {
    if (!isAdminConfigured()) {
      return {
        success: false,
        error: 'Firebase admin is not configured in this environment.',
      };
    }
    await recordToolAccess(userId, toolId);
    MollyLogger.info('Tool accessed', 'accessTool', { toolId });
    return { success: true };
  } catch (e) {
    MollyLogger.error('Failed to record tool access', 'accessTool', {}, e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to record tool access',
    };
  }
}

/**
 * Remove a tool from the database
 */
export async function deleteToolFromDatabase(userId: string, toolId: string) {
  try {
    if (!isAdminConfigured()) {
      return {
        success: false,
        error: 'Firebase admin is not configured in this environment.',
      };
    }
    await removeTool(userId, toolId);
    MollyLogger.info('Tool removed', 'deleteToolFromDatabase', { toolId });
    return { success: true };
  } catch (e) {
    MollyLogger.error('Failed to delete tool', 'deleteToolFromDatabase', {}, e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to delete tool',
    };
  }
}
