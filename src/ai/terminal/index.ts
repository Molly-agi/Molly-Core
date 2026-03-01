/**
 * @fileOverview Terminal Module Exports
 *
 * Molly's hands — her ability to interact with the operating system
 * and communicate with external devices as peers.
 *
 * Two components:
 * - MollyShell: Her local persistent Linux terminal
 * - PeerProtocol: The symmetric protocol for device-to-device communication
 */

export {
  MollyShell,
  getMollyShell,
  isShellAlive,
  type ShellCommand,
  type ShellResult,
  type ShellState,
  type ShellEvent,
  type ShellEventType,
} from './molly-shell';

export {
  PeerRegistry,
  getPeerRegistry,
  PROTOCOL_VERSION,
  type PeerIdentity,
  type PeerCapability,
  type PeerMessage,
  type PeerMessageType,
  type PeerSession,
  type PeerSessionStatus,
  type HelloPayload,
  type HelloAckPayload,
  type ChallengeResponsePayload,
  type ExecPayload,
  type ExecResultPayload,
  type FilePushPayload,
  type FilePushAckPayload,
  type FilePullPayload,
  type FilePullResultPayload,
  type StateResponsePayload,
} from './peer-protocol';
