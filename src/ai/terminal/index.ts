/**
 * @fileOverview Terminal Module Exports
 *
 * Molly's hands — her ability to interact with the operating system
 * and communicate with external devices as peers.
 *
 * Three components:
 * - MollyShell: Her local persistent bash terminal
 * - PeerProtocol: The symmetric protocol for device-to-device communication
 * - PolyglotRuntime: Her language brain — execute code in any language
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

export {
  PolyglotRuntime,
  getPolyglotRuntime,
  detectLanguage,
  type SupportedLanguage,
  type RuntimeMode,
  type RuntimeResult,
  type RuntimeState,
  type PolyglotEvent,
  type PolyglotEventType,
} from './polyglot-runtime';
