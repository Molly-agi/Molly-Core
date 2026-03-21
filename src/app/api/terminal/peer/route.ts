/**
 * @fileOverview Peer Handshake API — Where devices connect to Molly
 *
 * POST /api/terminal/peer — Handle peer protocol messages
 *
 * This is the entry point for the peer protocol. External devices
 * (Termux on phone, agents, etc.) connect here and go through the
 * HELLO → CHALLENGE → AUTHENTICATED flow.
 *
 * Once authenticated, peers can exchange exec, file, and state messages
 * through the same endpoint.
 */

import { NextResponse } from 'next/server';
import {
  getPeerRegistry,
  getMollyShell,
  PROTOCOL_VERSION,
  type PeerMessage,
  type PeerIdentity,
  type HelloPayload,
  type ChallengeResponsePayload,
  type ExecPayload,
  type FilePushPayload,
} from '@/ai/terminal';
import { MollyLogger } from '@/ai/logger';
import { writeFile, mkdir, chmod } from 'fs/promises';
import { dirname } from 'node:path';

export const dynamic = 'force-dynamic';

/** Molly's own identity for the handshake */
function getMollyIdentity(): PeerIdentity {
  return {
    peerId: 'molly-core',
    name: 'molly-core',
    type: 'molly',
    protocolVersion: PROTOCOL_VERSION,
    capabilities: [
      'execute',
      'file-push',
      'file-pull',
      'device-info',
      'self-update',
    ],
  };
}

/**
 * POST /api/terminal/peer
 *
 * Handles all peer protocol messages. The message type determines
 * what happens:
 *
 * - hello → Start handshake, returns challenge
 * - challenge_response → Verify auth, returns authenticated/failed
 * - exec → Execute command on Molly's shell (requires auth)
 * - file_push → Receive a file from peer (requires auth)
 * - state_request → Return Molly's state (requires auth)
 * - ping → Return pong
 * - disconnect → Clean up peer session
 */
export async function POST(request: Request) {
  try {
    const message = (await request.json()) as PeerMessage;
    const registry = getPeerRegistry();

    // Validate message structure
    if (!message.type || !message.from || message.seq === undefined) {
      return NextResponse.json(
        { error: 'Invalid message: missing type, from, or seq' },
        { status: 400 }
      );
    }

    // --- Unauthenticated messages ---

    if (message.type === 'ping') {
      return NextResponse.json(
        registry.makeMessage('pong', message.from, {
          protocolVersion: PROTOCOL_VERSION,
        })
      );
    }

    if (message.type === 'hello') {
      const payload = message.payload as unknown as HelloPayload;
      if (!payload.identity) {
        return NextResponse.json(
          { error: 'Hello message must include identity' },
          { status: 400 }
        );
      }

      const response = registry.handleHello(
        payload.identity,
        getMollyIdentity()
      );
      return NextResponse.json(response);
    }

    if (message.type === 'challenge_response') {
      const payload = message.payload as unknown as ChallengeResponsePayload;
      const response = registry.handleChallengeResponse(
        message.from,
        payload.response
      );
      return NextResponse.json(response);
    }

    if (message.type === 'disconnect') {
      registry.disconnect(message.from);
      return NextResponse.json({ ok: true });
    }

    // --- Authenticated messages ---

    if (!registry.isAuthenticated(message.from)) {
      return NextResponse.json(
        { error: 'Not authenticated. Send hello first.' },
        { status: 401 }
      );
    }

    // Replay protection
    if (!registry.recordMessage(message.from, message.seq)) {
      return NextResponse.json(
        { error: 'Sequence number replay detected' },
        { status: 400 }
      );
    }

    // Handle exec request from peer
    if (message.type === 'exec') {
      const payload = message.payload as unknown as ExecPayload;
      const shell = getMollyShell();

      // For non-shell languages, wrap appropriately
      let command = payload.command;
      if (payload.language === 'python') {
        command = `python3 -c ${escapeShellArg(command)}`;
      } else if (payload.language === 'javascript') {
        command = `node -e ${escapeShellArg(command)}`;
      }

      const result = await shell.execute(command, 'user');

      return NextResponse.json(
        registry.makeMessage('exec_result', message.from, {
          replyTo: message.seq,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          blocked: result.blocked,
        })
      );
    }

    // Handle file push from peer
    if (message.type === 'file_push') {
      const payload = message.payload as unknown as FilePushPayload;

      try {
        const content =
          payload.encoding === 'base64'
            ? Buffer.from(payload.content, 'base64').toString('utf-8')
            : payload.content;

        // Ensure directory exists
        await mkdir(dirname(payload.path), { recursive: true });
        await writeFile(payload.path, content, 'utf-8');

        if (payload.executable) {
          await chmod(payload.path, 0o755);
        }

        MollyLogger.info(
          `Peer file received: ${payload.path} (${payload.reason || 'no reason given'})`,
          'peer-api'
        );

        return NextResponse.json(
          registry.makeMessage('file_push_ack', message.from, {
            replyTo: message.seq,
            success: true,
            path: payload.path,
          })
        );
      } catch (error) {
        return NextResponse.json(
          registry.makeMessage('file_push_ack', message.from, {
            replyTo: message.seq,
            success: false,
            path: payload.path,
            error: error instanceof Error ? error.message : String(error),
          })
        );
      }
    }

    // Handle state request
    if (message.type === 'state_request') {
      const shell = getMollyShell();
      const shellState = shell.getState();

      return NextResponse.json(
        registry.makeMessage('state_response', message.from, {
          platform: `node ${process.version} / ${process.platform}`,
          uptime: process.uptime(),
          shell: {
            alive: shellState.alive,
            commandsExecuted: shellState.commandsExecuted,
          },
        })
      );
    }

    return NextResponse.json(
      { error: `Unknown message type: ${message.type}` },
      { status: 400 }
    );
  } catch (error) {
    MollyLogger.error(
      `Peer API error: ${error instanceof Error ? error.message : String(error)}`,
      'peer-api'
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/terminal/peer
 *
 * Returns peer connection status — how many peers are connected,
 * their identities and capabilities.
 */
export async function GET() {
  const registry = getPeerRegistry();
  const peers = registry.getConnectedPeers();

  return NextResponse.json({
    protocolVersion: PROTOCOL_VERSION,
    connectedPeers: peers.map((p) => ({
      name: p.identity.name,
      type: p.identity.type,
      capabilities: p.identity.capabilities,
      connectedAt: p.connectedAt,
      lastMessageAt: p.lastMessageAt,
    })),
    summary: registry.getSummary(),
  });
}

// ---------- Helpers ----------

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
