/**
 * MCP Status API
 *
 * Returns the current status of MCP server connections.
 *
 * GET /api/mcp/status
 */

import { getManagerStatus, isManagerInitialized, listMcpTools } from '@/ai/mcp';

export async function GET() {
  const managerStatus = getManagerStatus();
  const tools = listMcpTools();

  const status = {
    timestamp: new Date().toISOString(),
    initialized: isManagerInitialized(),
    servers: {
      total: managerStatus.serverCount,
      connected: managerStatus.connectedCount,
      failed: managerStatus.failedCount,
      list: managerStatus.servers,
    },
    tools: {
      total: tools.length,
      list: tools.map((t) => ({
        name: t.name,
        server: t.server,
        description: t.description,
      })),
    },
  };

  return Response.json(status);
}
