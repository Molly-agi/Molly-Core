/**
 * @fileOverview Live Voice Types — Molly's Real-Time Voice
 *
 * Type definitions for Gemini Live API — real-time voice dialogue
 * with sub-second latency via WebSocket streaming.
 *
 * Based on Gemini Live API (April 2026)
 */

// ============================================================
// AUDIO FORMAT
// ============================================================

/**
 * Audio encoding format.
 */
export type AudioEncoding = 'PCM_16' | 'MULAW';

/**
 * Audio format specification.
 */
export interface AudioFormat {
  /** Encoding type */
  encoding: AudioEncoding;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of channels (1 = mono, 2 = stereo) */
  channels: 1 | 2;
}

/**
 * Default input audio format (to API).
 */
export const INPUT_AUDIO_FORMAT: AudioFormat = {
  encoding: 'PCM_16',
  sampleRate: 16000, // 16kHz
  channels: 1,
};

/**
 * Default output audio format (from API).
 */
export const OUTPUT_AUDIO_FORMAT: AudioFormat = {
  encoding: 'PCM_16',
  sampleRate: 24000, // 24kHz
  channels: 1,
};

// ============================================================
// SESSION — WebSocket connection state
// ============================================================

/**
 * Session status.
 */
export type SessionStatus =
  | 'connecting'
  | 'connected'
  | 'active'
  | 'paused'
  | 'disconnected'
  | 'error';

/**
 * Live session configuration.
 */
export interface LiveSessionConfig {
  /** Model ID */
  model: string;
  /** System instructions */
  systemInstruction?: string;
  /** Output audio format */
  outputAudioFormat?: AudioFormat;
  /** Enable voice activity detection */
  enableVAD?: boolean;
  /** Enable barge-in (interruption) */
  enableBargeIn?: boolean;
  /** Enable audio transcription */
  enableTranscription?: boolean;
  /** Tools to enable */
  tools?: LiveTool[];
  /** Voice persona (if available) */
  voice?: string;
}

/**
 * A live dialogue session.
 */
export interface LiveSession {
  /** Session ID */
  sessionId: string;
  /** Current status */
  status: SessionStatus;
  /** When session started */
  startedAt: number;
  /** When session ended */
  endedAt?: number;
  /** Configuration used */
  config: LiveSessionConfig;
  /** Turn count */
  turnCount: number;
  /** Total audio duration sent (ms) */
  audioSentMs: number;
  /** Total audio duration received (ms) */
  audioReceivedMs: number;
  /** Error if any */
  error?: string;
}

// ============================================================
// MESSAGES — WebSocket protocol
// ============================================================

/**
 * Client message types.
 */
export type ClientMessageType =
  | 'setup'
  | 'realtimeInput'
  | 'clientContent'
  | 'toolResponse';

/**
 * Server message types.
 */
export type ServerMessageType =
  | 'setupComplete'
  | 'serverContent'
  | 'toolCall'
  | 'interrupted'
  | 'turnComplete'
  | 'error';

/**
 * Audio data chunk.
 */
export interface AudioChunk {
  /** Audio data as base64 */
  data: string;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Client setup message.
 */
export interface SetupMessage {
  type: 'setup';
  config: LiveSessionConfig;
}

/**
 * Real-time audio input message.
 */
export interface RealtimeInputMessage {
  type: 'realtimeInput';
  audio: AudioChunk;
}

/**
 * Text input message.
 */
export interface ClientContentMessage {
  type: 'clientContent';
  text?: string;
  turnComplete?: boolean;
}

/**
 * Server content response.
 */
export interface ServerContentMessage {
  type: 'serverContent';
  audio?: AudioChunk;
  text?: string;
  transcript?: string;
  turnComplete?: boolean;
}

/**
 * Tool call request.
 */
export interface ToolCallMessage {
  type: 'toolCall';
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Tool response from client.
 */
export interface ToolResponseMessage {
  type: 'toolResponse';
  id: string;
  response: unknown;
}

/**
 * Interruption notification.
 */
export interface InterruptedMessage {
  type: 'interrupted';
  reason: 'barge_in' | 'timeout' | 'explicit';
}

/**
 * Error message.
 */
export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

// ============================================================
// TOOLS — Live API function calling
// ============================================================

/**
 * A tool available during live session.
 */
export interface LiveTool {
  /** Tool name */
  name: string;
  /** Description */
  description: string;
  /** JSON schema for parameters */
  parameters?: Record<string, unknown>;
}

// ============================================================
// EVENTS — For client integration
// ============================================================

/**
 * Events emitted by the live session.
 */
export type LiveEventType =
  | 'connected'
  | 'audio_received'
  | 'text_received'
  | 'transcript'
  | 'tool_call'
  | 'turn_complete'
  | 'interrupted'
  | 'error'
  | 'disconnected';

/**
 * Event callback signature.
 */
export type LiveEventCallback = (event: LiveEventType, data: unknown) => void;

// ============================================================
// CONFIG
// ============================================================

/**
 * Live Voice module configuration.
 */
export interface LiveVoiceConfig {
  /** Default model */
  defaultModel: string;
  /** WebSocket endpoint */
  wsEndpoint: string;
  /** Connection timeout in ms */
  connectionTimeoutMs: number;
  /** Auto-reconnect on disconnect */
  autoReconnect: boolean;
  /** Max reconnect attempts */
  maxReconnectAttempts: number;
}

export const DEFAULT_CONFIG: LiveVoiceConfig = {
  defaultModel: 'gemini-3.1-flash-live-preview',
  wsEndpoint:
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
  connectionTimeoutMs: 10000,
  autoReconnect: true,
  maxReconnectAttempts: 3,
};

// ============================================================
// AUDIT
// ============================================================

/**
 * Audit log entry.
 */
export interface LiveAuditEntry {
  entryId: string;
  sessionId: string;
  event: LiveEventType | 'session_start' | 'session_end';
  durationMs?: number;
  turnsCount?: number;
  error?: string;
  timestamp: number;
}
