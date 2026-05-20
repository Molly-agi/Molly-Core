/**
 * MCP Toggle API
 *
 * Enables or disables an MCP server.
 *
 * POST /api/mcp/toggle
 * Body: { server: string, enabled: boolean }
 */

import { NextRequest } from 'next/server';
import {
  enableServer,
  disableServer,
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

  let body: { server?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { server, enabled } = body;

  if (!server || typeof enabled !== 'boolean') {
    return Response.json(
      { error: 'Missing required fields: server (string), enabled (boolean)' },
      { status: 400 }
    );
  }

  const managedServers = getManagedServerNames();
  if (!managedServers.includes(server)) {
    return Response.json(
      { error: `Unknown server: ${server}` },
      { status: 404 }
    );
  }

  if (enabled) {
    enableServer(server);
  } else {
    await disableServer(server);
  }

  const status = getManagerStatus();
  const serverStatus = status.servers.find((s) => s.name === server);

  return Response.json({
    success: true,
    server,
    enabled,
    status: serverStatus?.status ?? 'unknown',
  });
}
