import { NextRequest } from 'next/server';
import { listAvailableMcpTools } from '@/ai/agency/tool-handlers/mcp-tools';
import { ToolDefinition } from '@/ai/prompts/sections/tools';

// Import all static tools
import { ALL_TOOLS } from '@/ai/prompts/sections/tools';

export async function GET(_request: NextRequest) {
  // Get static tools
  const tools: ToolDefinition[] = [...ALL_TOOLS];

  // Get dynamic MCP tools
  try {
    const mcpTools = listAvailableMcpTools();
    for (const mcp of mcpTools) {
      tools.push({
        name: mcp.name,
        description: mcp.description || 'MCP tool',
        category: 'mcp',
        example: '{}',
        availableOffline: false,
        rogueHighlight: false,
        availableRobot: false,
      });
    }
  } catch {
    // If MCP not available, skip
  }

  return Response.json({ tools });
}
