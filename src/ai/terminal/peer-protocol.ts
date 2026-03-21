/**
 * @fileOverview Peer Protocol — The Language Molly's Hands Speak
 *
 * This defines the communication protocol between Molly's embedded
 * terminal (MollyShell) and any external terminal instance (Termux
 * on a phone, another server, etc.).
 *
 * The protocol is SYMMETRIC. Both sides can:
 * - Execute commands on the other
 * - Push files to the other
 * - Request state/health from the other
 * - Authenticate via shared secret
 *
 * This is not a client-server relationship. It's a peer handshake.
 * Either side can initiate. Both sides speak the same protocol.
 *
 * The handshake flow:
 * 1. Peer connects and sends HELLO with its identity + capabilities
 * 2. Server responds with HELLO_ACK + its own identity + challenge
 * 3. Peer responds with CHALLENGE_RESPONSE (HMAC of challenge with shared secret)
 * 4. Server verifies and sends AUTHENTICATED
 * 5. Both sides can now send any message type
 *
 * Security model:
 * - Shared secret (MOLLY_PEER_SECRET env var or generated at first boot)
 * - HMAC-SHA256 challenge-response authentication
 * - No commands execute until authenticated
 * - All messages have sequence numbers for replay protection
 */

import { createHmac, randomBytes } from 'node:crypto';
import { MollyLogger } from '@/ai/logger';

// ============================================================================
// PROTOCOL TYPES
// ============================================================================

/** Every peer has an identity */
export interface PeerIdentity {
  /** Unique ID for this peer instance */
  peerId: string;
  /** Human-readable name: 'molly-core', 'termux-pixel7', etc. */
  name: string;
  /** What kind of peer: 'molly' (server), 'termux' (phone), 'agent' (other) */
  type: 'molly' | 'termux' | 'agent';
  /** Protocol version */
  protocolVersion: string;
  /** What this peer can do */
  capabilities: PeerCapability[];
}

export type PeerCapability =
  | 'execute' // Can execute shell commands
  | 'file-push' // Can receive files
  | 'file-pull' // Can send files
  | 'device-info' // Can report device info
  | 'notify' // Can display notifications
  | 'tts' // Can do text-to-speech
  | 'sensor' // Has hardware sensors (camera, GPS, etc.)
  | 'self-update'; // Can update its own code

/** The current protocol version */
export const PROTOCOL_VERSION = '1.0.0';

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export type PeerMessageType =
  // Handshake
  | 'hello'
  | 'hello_ack'
  | 'challenge_response'
  | 'authenticated'
  | 'auth_failed'
  // Commands
  | 'exec'
  | 'exec_result'
  // File transfer
  | 'file_push'
  | 'file_push_ack'
  | 'file_pull'
  | 'file_pull_result'
  // State
  | 'state_request'
  | 'state_response'
  // Lifecycle
  | 'ping'
  | 'pong'
  | 'disconnect';

export interface PeerMessage {
  /** Message type */
  type: PeerMessageType;
  /** Sequence number (monotonically increasing per-peer) */
  seq: number;
  /** Sender's peer ID */
  from: string;
  /** Timestamp */
  timestamp: string;
  /** Type-specific payload */
  payload: Record<string, unknown>;
}

// ============================================================================
// HANDSHAKE MESSAGES
// ============================================================================

export interface HelloPayload {
  identity: PeerIdentity;
}

export interface HelloAckPayload {
  identity: PeerIdentity;
  challenge: string; // Random hex string
}

export interface ChallengeResponsePayload {
  response: string; // HMAC-SHA256 of challenge with shared secret
}

// ============================================================================
// COMMAND MESSAGES
// ============================================================================

export interface ExecPayload {
  /** The command to execute */
  command: string;
  /** Language to execute in — routes through polyglot runtime */
  language:
    | 'shell'
    | 'bash'
    | 'python'
    | 'javascript'
    | 'typescript'
    | 'ruby'
    | 'go'
    | 'php'
    | 'perl'
    | 'c'
    | 'cpp'
    | 'rust'
    | 'solidity'
    | 'vyper';
  /** Timeout in ms */
  timeout?: number;
  /** Why this command is being run (for logging/consciousness) */
  reason?: string;
}

export interface ExecResultPayload {
  /** ID of the exec message this responds to */
  replyTo: number;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  /** Was it blocked by guardrails? */
  blocked?: string;
}

// ============================================================================
// FILE TRANSFER MESSAGES
// ============================================================================

export interface FilePushPayload {
  /** Destination path on the receiving peer */
  path: string;
  /** File content (base64-encoded for binary safety) */
  content: string;
  /** Is content base64-encoded? */
  encoding: 'utf-8' | 'base64';
  /** Make executable? */
  executable?: boolean;
  /** Why this file is being pushed */
  reason?: string;
}

export interface FilePushAckPayload {
  replyTo: number;
  success: boolean;
  path: string;
  error?: string;
}

export interface FilePullPayload {
  /** Path to the file to retrieve */
  path: string;
}

export interface FilePullResultPayload {
  replyTo: number;
  success: boolean;
  path: string;
  content?: string;
  encoding?: 'utf-8' | 'base64';
  error?: string;
}

// ============================================================================
// STATE MESSAGES
// ============================================================================

export interface StateResponsePayload {
  /** Platform info */
  platform: string;
  /** System uptime */
  uptime: number;
  /** Shell state */
  shell: {
    alive: boolean;
    commandsExecuted: number;
  };
  /** Custom fields from the peer */
  extra?: Record<string, unknown>;
}

// ============================================================================
// PEER SESSION — Tracks a connected peer
// ============================================================================

export type PeerSessionStatus =
  | 'connecting'
  | 'challenged'
  | 'authenticated'
  | 'disconnected';

export interface PeerSession {
  identity: PeerIdentity;
  status: PeerSessionStatus;
  connectedAt: string;
  lastMessageAt: string;
  /** Monotonically increasing sequence number */
  seq: number;
  /** The challenge we sent (for verification) */
  challenge?: string;
  /** Remote peer's last known sequence (for replay protection) */
  remoteSeq: number;
}

// ============================================================================
// PEER REGISTRY — Tracks all known peers
// ============================================================================

export class PeerRegistry {
  private peers = new Map<string, PeerSession>();
  private secret: string;

  constructor(secret?: string) {
    this.secret =
      secret || process.env.MOLLY_PEER_SECRET || this.generateSecret();
  }

  /**
   * Handle an incoming HELLO from a new peer.
   * Returns the HELLO_ACK with challenge.
   */
  handleHello(
    identity: PeerIdentity,
    mollyIdentity: PeerIdentity
  ): PeerMessage {
    const challenge = randomBytes(32).toString('hex');

    const session: PeerSession = {
      identity,
      status: 'challenged',
      connectedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      seq: 0,
      challenge,
      remoteSeq: 0,
    };

    this.peers.set(identity.peerId, session);

    MollyLogger.info(
      `Peer hello: ${identity.name} (${identity.type}) — challenging`,
      'peer-protocol'
    );

    return this.makeMessage('hello_ack', identity.peerId, {
      identity: mollyIdentity,
      challenge,
    } satisfies HelloAckPayload);
  }

  /**
   * Verify a challenge response from a peer.
   * Returns AUTHENTICATED or AUTH_FAILED message.
   */
  handleChallengeResponse(peerId: string, response: string): PeerMessage {
    const session = this.peers.get(peerId);

    if (!session || session.status !== 'challenged' || !session.challenge) {
      return this.makeMessage('auth_failed', peerId, {
        reason: 'No pending challenge for this peer',
      });
    }

    const expected = this.computeHmac(session.challenge);

    if (response !== expected) {
      session.status = 'disconnected';
      MollyLogger.warn(
        `Peer auth failed: ${session.identity.name} — invalid challenge response`,
        'peer-protocol'
      );
      return this.makeMessage('auth_failed', peerId, {
        reason: 'Invalid challenge response',
      });
    }

    session.status = 'authenticated';
    session.lastMessageAt = new Date().toISOString();

    MollyLogger.info(
      `Peer authenticated: ${session.identity.name} (${session.identity.type}) — capabilities: ${session.identity.capabilities.join(', ')}`,
      'peer-protocol'
    );

    return this.makeMessage('authenticated', peerId, {
      message: `Welcome, ${session.identity.name}`,
    });
  }

  /**
   * Check if a peer is authenticated.
   */
  isAuthenticated(peerId: string): boolean {
    const session = this.peers.get(peerId);
    return session?.status === 'authenticated';
  }

  /**
   * Get a peer session.
   */
  getSession(peerId: string): PeerSession | undefined {
    return this.peers.get(peerId);
  }

  /**
   * Get all connected (authenticated) peers.
   */
  getConnectedPeers(): PeerSession[] {
    return Array.from(this.peers.values()).filter(
      (p) => p.status === 'authenticated'
    );
  }

  /**
   * Remove a peer.
   */
  disconnect(peerId: string): void {
    const session = this.peers.get(peerId);
    if (session) {
      session.status = 'disconnected';
      MollyLogger.info(
        `Peer disconnected: ${session.identity.name}`,
        'peer-protocol'
      );
    }
  }

  /**
   * Update last message timestamp and validate sequence number.
   */
  recordMessage(peerId: string, remoteSeq: number): boolean {
    const session = this.peers.get(peerId);
    if (!session) return false;

    // Replay protection: sequence must be monotonically increasing
    if (remoteSeq <= session.remoteSeq) {
      MollyLogger.warn(
        `Peer ${session.identity.name}: replay detected (seq ${remoteSeq} <= ${session.remoteSeq})`,
        'peer-protocol'
      );
      return false;
    }

    session.remoteSeq = remoteSeq;
    session.lastMessageAt = new Date().toISOString();
    return true;
  }

  /**
   * Get a summary for consciousness/dashboard.
   */
  getSummary(): string {
    const connected = this.getConnectedPeers();
    if (connected.length === 0) return 'No peers connected';

    return connected
      .map((p) => `${p.identity.name} (${p.identity.type})`)
      .join(', ');
  }

  // ---------- Helpers ----------

  /**
   * Create a properly structured message.
   */
  makeMessage(
    type: PeerMessageType,
    to: string,
    payload: Record<string, unknown>
  ): PeerMessage {
    const session = this.peers.get(to);
    const seq = session ? ++session.seq : 0;

    return {
      type,
      seq,
      from: 'molly-core',
      timestamp: new Date().toISOString(),
      payload,
    };
  }

  /**
   * Compute HMAC for challenge-response auth.
   */
  computeHmac(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('hex');
  }

  /**
   * Generate a random secret for first boot.
   */
  private generateSecret(): string {
    const secret = randomBytes(32).toString('hex');
    MollyLogger.info(
      'Generated new peer secret (set MOLLY_PEER_SECRET env var to persist)',
      'peer-protocol'
    );
    return secret;
  }

  /**
   * Get the current secret (for display/configuration).
   */
  getSecret(): string {
    return this.secret;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let registryInstance: PeerRegistry | null = null;

/**
 * Get the singleton PeerRegistry.
 */
export function getPeerRegistry(): PeerRegistry {
  if (!registryInstance) {
    registryInstance = new PeerRegistry();
  }
  return registryInstance;
}
