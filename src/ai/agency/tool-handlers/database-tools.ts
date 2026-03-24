/**
 * Database tools - Tool library management
 * Works in both server (Codespace) and edge (tablet) environments
 */

import {
  searchSavedTools,
  getRecentTools,
  saveFoundTool,
  removeTool,
  getToolStats,
} from '@/firebase/firestore/tool-database';
import { isAdminConfigured } from '@/firebase/admin';
import type { ToolHandler } from './index';

export const browseToolDatabase: ToolHandler = async (params) => {
  if (!isAdminConfigured()) {
    return {
      success: false,
      output: 'Firebase admin is not configured — tool database unavailable.',
    };
  }
  const userId = (params.userId as string) || 'default';
  const searchTerm = (params.searchTerm as string) || '';
  const category = params.category as string | undefined;
  try {
    const tools =
      searchTerm || category
        ? await searchSavedTools(userId, searchTerm, category)
        : await getRecentTools(userId, 20);
    if (tools.length === 0) {
      return {
        success: true,
        output: searchTerm
          ? `No tools found matching "${searchTerm}".`
          : 'Your tool database is empty. Use researchAndDiscover or addTool to populate it.',
      };
    }
    const formatted = tools
      .map(
        (t, i) =>
          `${i + 1}. ${t.name} [${t.category}] — ${t.description}${t.sourceUrl ? ` (${t.sourceUrl})` : ''}${t.tags?.length ? ` Tags: ${t.tags.join(', ')}` : ''}`
      )
      .join('\n');
    return {
      success: true,
      output: `Found ${tools.length} tool(s):\n${formatted}`,
      data: { tools },
    };
  } catch (err) {
    return {
      success: false,
      output: `Tool database error: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
};

export const addTool: ToolHandler = async (params) => {
  if (!isAdminConfigured()) {
    return {
      success: false,
      output: 'Firebase admin is not configured — tool database unavailable.',
    };
  }
  const userId = (params.userId as string) || 'default';
  const name = params.name as string;
  const description = params.description as string;
  if (!name || !description) {
    return {
      success: false,
      output: 'Missing required fields: name, description',
    };
  }
  try {
    const toolId = await saveFoundTool(userId, {
      userId,
      name,
      description,
      sourceUrl: (params.sourceUrl as string) || undefined,
      sourceType:
        (params.sourceType as 'github' | 'npm' | 'documentation' | 'other') ||
        'other',
      category: (params.category as string) || 'general',
      tags: (params.tags as string[]) || [],
      authorOrMaintainer: (params.author as string) || undefined,
      languagesSupported: (params.languages as string[]) || undefined,
      useCase: (params.useCase as string) || description,
    });
    return {
      success: true,
      output: `Tool "${name}" saved to database with ID: ${toolId}`,
    };
  } catch (err) {
    return {
      success: false,
      output: `Failed to save tool: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
};

export const removeToolHandler: ToolHandler = async (params) => {
  if (!isAdminConfigured()) {
    return {
      success: false,
      output: 'Firebase admin is not configured — tool database unavailable.',
    };
  }
  const userId = (params.userId as string) || 'default';
  const toolId = params.toolId as string;
  if (!toolId) {
    return { success: false, output: 'Missing required field: toolId' };
  }
  try {
    await removeTool(userId, toolId);
    return {
      success: true,
      output: `Tool ${toolId} removed from database.`,
    };
  } catch (err) {
    return {
      success: false,
      output: `Failed to remove tool: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
};

export const toolStats: ToolHandler = async (params) => {
  if (!isAdminConfigured()) {
    return {
      success: false,
      output: 'Firebase admin is not configured — tool database unavailable.',
    };
  }
  const userId = (params.userId as string) || 'default';
  try {
    const stats = await getToolStats(userId);
    return {
      success: true,
      output: `Tool Database Stats:\n  Total tools: ${stats.totalTools}\n  Categories: ${
        Object.entries(stats.categoryCounts)
          .map(([k, v]) => `${k} (${v})`)
          .join(', ') || 'none'
      }`,
      data: stats,
    };
  } catch (err) {
    return {
      success: false,
      output: `Failed to get stats: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
};

export const databaseToolHandlers: Record<string, ToolHandler> = {
  browseToolDatabase,
  addTool,
  removeTool: removeToolHandler,
  toolStats,
};
