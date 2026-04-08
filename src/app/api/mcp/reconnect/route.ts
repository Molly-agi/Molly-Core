/**
 * MCP Reconnect API
 *
 * Triggers reconnection for a specific MCP server or all servers.
 *
 * POST /api/mcp/reconnect
 * Body: { server?: string }
 *
 * If server is provided, reconnects that specific server.
 * If server is omitted, reconnects all failed servers.
 */

import { NextRequest } from 'next/server';
import {
  reconnectServer,
  connectAllServers,
  getManagerStatus,
  isManagerInitialized,
  getManagedServerNames,
} from '@/ai/mcp';

export async function POST(request: NextRequest) {
  if (!isManagerInitialized()) {
    return Response.json(
      { error: 'MCP manager not initialized' },
      { status: 503 }
    );
  }

  let body: { server?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is okay - means reconnect all
  }

  const { server } = body;

  if (server) {
    // Reconnect specific server
    const managedServers = getManagedServerNames();
    if (!managedServers.includes(server)) {
      return Response.json(
        { error: `Unknown server: ${server}` },
        { status: 404 }
      );
    }

    const connection = await reconnectServer(server);

    return Response.json({
      success: connection?.type === 'connected',
      server,
      status: connection?.type ?? 'unknown',
      error: connection?.type === 'failed' ? connection.error : undefined,
    });
  }

  // Reconnect all servers
  await connectAllServers();
  const status = getManagerStatus();

  return Response.json({
    success: true,
    reconnected: status.connectedCount,
    failed: status.failedCount,
    servers: status.servers,
  });
}
