/**
 * @fileOverview Live Voice Client — Molly's Real-Time Voice
 *
 * WebSocket client for Gemini Live API — real-time voice dialogue.
 * Handles connection management, audio streaming, and event handling.
 */

import { MollyLogger, generateTraceId } from '../../logger';
import {
  LiveSession,
  LiveSessionConfig,
  LiveAuditEntry,
  LiveEventType,
  LiveEventCallback,
  AudioChunk,
  ServerContentMessage,
  ToolCallMessage,
  DEFAULT_CONFIG,
  LiveVoiceConfig,
} from './types';

// ============================================================
// AUDIT LOG
// ============================================================

const auditLog: LiveAuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 200;

function logAudit(entry: Omit<LiveAuditEntry, 'entryId' | 'timestamp'>): void {
  auditLog.push({
    ...entry,
    entryId: generateTraceId(),
    timestamp: Date.now(),
  });
  if (auditLog.length > MAX_AUDIT_ENTRIES)
    auditLog.splice(0, auditLog.length - MAX_AUDIT_ENTRIES);
}

export function getLiveAuditLog(): LiveAuditEntry[] {
  return [...auditLog];
}

// ============================================================
// LIVE VOICE CLIENT
// ============================================================

/**
 * Live Voice Client — WebSocket connection to Gemini Live API.
 */
export class LiveVoiceClient {
  private config: LiveVoiceConfig;
  private apiKey: string;
  private ws: WebSocket | null = null;
  private session: LiveSession | null = null;
  private eventCallbacks: LiveEventCallback[] = [];
  private reconnectAttempts = 0;

  constructor(config?: Partial<LiveVoiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.apiKey = process.env.GOOGLE_GENAI_API_KEY || '';
  }

  /**
   * Start a new live session.
   */
  async startSession(
    sessionConfig?: Partial<LiveSessionConfig>
  ): Promise<LiveSession> {
    const traceId = generateTraceId();
    const sessionId = `live-${traceId}`;

    const config: LiveSessionConfig = {
      model: this.config.defaultModel,
      enableVAD: true,
      enableBargeIn: true,
      enableTranscription: true,
      ...sessionConfig,
    };

    this.session = {
      sessionId,
      status: 'connecting',
      startedAt: Date.now(),
      config,
      turnCount: 0,
      audioSentMs: 0,
      audioReceivedMs: 0,
    };

    MollyLogger.info(
      `Live Voice: Starting session ${sessionId}`,
      'live-voice',
      { traceId }
    );

    logAudit({ sessionId, event: 'session_start' });

    try {
      await this.connect();
      await this.sendSetup(config);

      this.session.status = 'active';
      this.emit('connected', { sessionId });

      return this.session;
    } catch {
      const errorMsg = 'Unknown error';
      this.session.status = 'error';
      this.session.error = errorMsg;

      logAudit({ sessionId, event: 'error', error: errorMsg });

      throw new Error(errorMsg);
    }
  }

  /**
   * Send audio data to the session.
   */
  sendAudio(audioData: Buffer | string, durationMs: number): void {
    if (!this.ws || !this.session || this.session.status !== 'active') {
      throw new Error('No active session');
    }

    const chunk: AudioChunk = {
      data: Buffer.isBuffer(audioData)
        ? audioData.toString('base64')
        : audioData,
      durationMs,
    };

    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ mimeType: 'audio/pcm', data: chunk.data }],
        },
      })
    );

    this.session.audioSentMs += durationMs;
  }

  /**
   * Send text input to the session.
   */
  sendText(text: string, turnComplete = true): void {
    if (!this.ws || !this.session || this.session.status !== 'active') {
      throw new Error('No active session');
    }

    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete,
        },
      })
    );
  }

  /**
   * Send tool response.
   */
  sendToolResponse(toolCallId: string, response: unknown): void {
    if (!this.ws || !this.session || this.session.status !== 'active') {
      throw new Error('No active session');
    }

    this.ws.send(
      JSON.stringify({
        toolResponse: { functionResponses: [{ id: toolCallId, response }] },
      })
    );
  }

  /**
   * End the current session.
   */
  endSession(): void {
    if (this.session) {
      this.session.status = 'disconnected';
      this.session.endedAt = Date.now();

      logAudit({
        sessionId: this.session.sessionId,
        event: 'session_end',
        durationMs: this.session.endedAt - this.session.startedAt,
        turnsCount: this.session.turnCount,
      });

      MollyLogger.info(
        `Live Voice: Session ended, ${this.session.turnCount} turns`,
        'live-voice',
        { sessionId: this.session.sessionId }
      );
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.emit('disconnected', { sessionId: this.session?.sessionId });
    this.session = null;
  }

  /**
   * Get current session.
   */
  getSession(): LiveSession | null {
    return this.session;
  }

  /**
   * Register event callback.
   */
  on(callback: LiveEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Remove event callback.
   */
  off(callback: LiveEventCallback): void {
    this.eventCallbacks = this.eventCallbacks.filter((cb) => cb !== callback);
  }

  // ── Private Methods ──

  private async connect(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const url = `${this.config.wsEndpoint}?key=${this.apiKey}`;

      // Use native WebSocket in browser, dynamic import in Node.js
      let WebSocketImpl: typeof WebSocket;
      if (typeof WebSocket !== 'undefined') {
        WebSocketImpl = WebSocket;
      } else {
        // @ts-expect-error: Dynamic import of 'ws' for Node.js compatibility; not available in browser types
        const wsModule = await import('ws');
        WebSocketImpl = wsModule.default || wsModule;
      }
      this.ws = new WebSocketImpl(url);

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.config.connectionTimeoutMs);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onerror = (error: Event) => {
        clearTimeout(timeout);
        reject(error);
      };

      this.ws.onclose = () => {
        if (this.session?.status === 'active' && this.config.autoReconnect) {
          this.attemptReconnect();
        }
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };
    });
  }

  private async sendSetup(config: LiveSessionConfig): Promise<void> {
    if (!this.ws) throw new Error('Not connected');

    this.ws.send(
      JSON.stringify({
        setup: {
          model: `models/${config.model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: config.voice || 'Puck' },
              },
            },
          },
          systemInstruction: config.systemInstruction
            ? { parts: [{ text: config.systemInstruction }] }
            : undefined,
          tools: config.tools?.map((t) => ({ functionDeclarations: [t] })),
        },
      })
    );
  }

  private handleMessage(data: string | Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      if (message.setupComplete) {
        MollyLogger.debug('Live Voice: Setup complete', 'live-voice');
        return;
      }

      if (message.serverContent) {
        const content = message.serverContent as ServerContentMessage;

        if (content.audio) {
          this.session!.audioReceivedMs += content.audio.durationMs || 0;
          this.emit('audio_received', content.audio);
        }

        if (content.text) {
          this.emit('text_received', { text: content.text });
        }

        if (content.transcript) {
          this.emit('transcript', { transcript: content.transcript });
        }

        if (content.turnComplete) {
          this.session!.turnCount++;
          this.emit('turn_complete', { turnCount: this.session!.turnCount });
        }
      }

      if (message.toolCall) {
        const toolCall = message.toolCall as ToolCallMessage;
        this.emit('tool_call', toolCall);
      }

      if (message.interrupted) {
        this.emit('interrupted', message.interrupted);
      }

      if (message.error) {
        this.emit('error', message.error);
      }
    } catch (error) {
      MollyLogger.error(
        'Live Voice: Failed to parse message',
        'live-voice',
        {},
        error
      );
    }
  }

  private emit(event: LiveEventType, data: unknown): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event, data);
      } catch (error) {
        MollyLogger.error(
          'Live Voice: Event callback error',
          'live-voice',
          { event },
          error
        );
      }
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      MollyLogger.warn(
        'Live Voice: Max reconnect attempts reached',
        'live-voice'
      );
      this.emit('disconnected', { reason: 'max_reconnects' });
      return;
    }

    this.reconnectAttempts++;
    MollyLogger.info(
      `Live Voice: Reconnecting (attempt ${this.reconnectAttempts})`,
      'live-voice'
    );

    try {
      await this.connect();
      if (this.session) {
        await this.sendSetup(this.session.config);
        this.emit('connected', { reconnected: true });
      }
    } catch {
      setTimeout(() => this.attemptReconnect(), 1000 * this.reconnectAttempts);
    }
  }
}

// ============================================================
// SINGLETON
// ============================================================

let _clientInstance: LiveVoiceClient | null = null;

export function getLiveVoiceClient(): LiveVoiceClient {
  if (!_clientInstance) _clientInstance = new LiveVoiceClient();
  return _clientInstance;
}

export function resetLiveVoiceClient(): void {
  if (_clientInstance) _clientInstance.endSession();
  _clientInstance = null;
  auditLog.length = 0;
}
