/**
 * @fileOverview Deep Research Client — Molly's Research Engine
 *
 * Client for interacting with the Gemini Deep Research Interactions API.
 * Handles starting research, polling for results, streaming, and follow-ups.
 *
 * No guardrails — she researches what she needs to research.
 */

import { MollyLogger, generateTraceId } from '../../logger';
import {
  ResearchInteraction,
  ResearchRequest,
  ResearchSession,
  ResearchAuditEntry,
  StreamEvent,
  FollowUpRequest,
  DEFAULT_CONFIG,
  DeepResearchConfig,
  InteractionStatus,
  estimateCost,
} from './types';

// ============================================================
// API ENDPOINTS
// ============================================================

const INTERACTIONS_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/interactions';

// ============================================================
// AUDIT LOG — In-memory for now, can be persisted later
// ============================================================

const auditLog: ResearchAuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 1000;

function logAudit(
  entry: Omit<ResearchAuditEntry, 'entryId' | 'timestamp'>
): void {
  const fullEntry: ResearchAuditEntry = {
    ...entry,
    entryId: generateTraceId(),
    timestamp: Date.now(),
  };

  auditLog.push(fullEntry);

  // Trim if too large
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.splice(0, auditLog.length - MAX_AUDIT_ENTRIES);
  }

  MollyLogger.debug(
    `Research audit: ${entry.event} for session ${entry.sessionId}`,
    'deep-research',
    fullEntry
  );
}

/**
 * Get audit log entries, optionally filtered by session.
 */
export function getAuditLog(sessionId?: string): ResearchAuditEntry[] {
  if (sessionId) {
    return auditLog.filter((e) => e.sessionId === sessionId);
  }
  return [...auditLog];
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

const activeSessions: Map<string, ResearchSession> = new Map();

/**
 * Get all active research sessions.
 */
export function getActiveSessions(): ResearchSession[] {
  return Array.from(activeSessions.values());
}

/**
 * Get a specific session by ID.
 */
export function getSession(sessionId: string): ResearchSession | undefined {
  return activeSessions.get(sessionId);
}

// ============================================================
// DEEP RESEARCH CLIENT
// ============================================================

/**
 * Deep Research Client — Molly's interface to the Interactions API.
 */
export class DeepResearchClient {
  private config: DeepResearchConfig;
  private apiKey: string;

  constructor(config?: Partial<DeepResearchConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.apiKey = process.env.GOOGLE_GENAI_API_KEY || '';

    if (!this.apiKey) {
      MollyLogger.warn(
        'Deep Research: GOOGLE_GENAI_API_KEY not set',
        'deep-research'
      );
    }
  }

  /**
   * Start a new research task.
   * Returns immediately with interaction ID — research runs in background.
   */
  async startResearch(
    query: string | object[],
    sessionId?: string
  ): Promise<ResearchInteraction> {
    const traceId = generateTraceId();
    const actualSessionId = sessionId || `research-${traceId}`;

    // Estimate cost
    const queryStr = typeof query === 'string' ? query : JSON.stringify(query);
    const costEstimate = estimateCost(
      queryStr.length,
      typeof query !== 'string'
    );

    MollyLogger.info(
      `Deep Research: Starting research (estimated $${costEstimate.estimatedCostUsd.toFixed(2)})`,
      'deep-research',
      {
        sessionId: actualSessionId,
        traceId,
        complexity: costEstimate.complexity,
      }
    );

    const request: ResearchRequest = {
      input: query,
      agent: this.config.defaultAgent,
      background: true,
      store: true,
      config: {
        thinkingSummaries: this.config.includeThinking ? 'auto' : 'none',
        stream: this.config.enableStreaming,
      },
    };

    try {
      const response = await fetch(INTERACTIONS_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error ${response.status}: ${error}`);
      }

      const data = await response.json();

      const interaction: ResearchInteraction = {
        id: data.id || data.name,
        status: 'in_progress',
        outputs: [],
        startedAt: Date.now(),
      };

      // Create or update session
      let session = activeSessions.get(actualSessionId);
      if (!session) {
        session = {
          sessionId: actualSessionId,
          originalQuery: queryStr,
          interactions: [],
          allCitations: [],
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          active: true,
        };
        activeSessions.set(actualSessionId, session);
      }

      session.interactions.push(interaction);
      session.lastActivityAt = Date.now();

      // Log audit
      logAudit({
        sessionId: actualSessionId,
        interactionId: interaction.id,
        event: 'started',
        query: queryStr.substring(0, 500),
      });

      return interaction;
    } catch (error) {
      MollyLogger.error(
        'Deep Research: Failed to start research',
        'deep-research',
        { sessionId: actualSessionId, traceId },
        error
      );

      logAudit({
        sessionId: actualSessionId,
        interactionId: 'unknown',
        event: 'failed',
        query: queryStr.substring(0, 500),
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Poll for research results.
   * Returns the updated interaction with current status.
   */
  async getInteraction(interactionId: string): Promise<ResearchInteraction> {
    const response = await fetch(`${INTERACTIONS_BASE_URL}/${interactionId}`, {
      method: 'GET',
      headers: {
        'x-goog-api-key': this.apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error ${response.status}: ${error}`);
    }

    const data = await response.json();

    return this.parseInteractionResponse(data);
  }

  /**
   * Wait for research to complete with polling.
   * Returns the final interaction with results.
   */
  async waitForCompletion(
    interactionId: string,
    sessionId: string,
    onProgress?: (interaction: ResearchInteraction) => void
  ): Promise<ResearchInteraction> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.maxWaitTimeMs) {
      const interaction = await this.getInteraction(interactionId);

      // Update session
      const session = activeSessions.get(sessionId);
      if (session) {
        const idx = session.interactions.findIndex(
          (i) => i.id === interactionId
        );
        if (idx >= 0) {
          session.interactions[idx] = interaction;
        }
        session.lastActivityAt = Date.now();
      }

      // Call progress callback
      if (onProgress) {
        onProgress(interaction);
      }

      // Check if done
      if (interaction.status === 'completed') {
        const durationMs = Date.now() - startTime;

        // Collect all citations
        if (session) {
          for (const output of interaction.outputs) {
            if (output.citations) {
              session.allCitations.push(...output.citations);
            }
          }
        }

        logAudit({
          sessionId,
          interactionId,
          event: 'completed',
          sourcesCount: interaction.sourcesConsulted,
          citationsCount: interaction.outputs.reduce(
            (sum, o) => sum + (o.citations?.length || 0),
            0
          ),
          durationMs,
        });

        MollyLogger.info(
          `Deep Research: Completed in ${Math.round(durationMs / 1000)}s`,
          'deep-research',
          { sessionId, interactionId, sources: interaction.sourcesConsulted }
        );

        return interaction;
      }

      if (interaction.status === 'failed') {
        logAudit({
          sessionId,
          interactionId,
          event: 'failed',
          error: interaction.error?.message,
          durationMs: Date.now() - startTime,
        });

        throw new Error(
          interaction.error?.message || 'Research failed with unknown error'
        );
      }

      // Log progress
      logAudit({
        sessionId,
        interactionId,
        event: 'progress',
        sourcesCount: interaction.sourcesConsulted,
      });

      // Wait before next poll
      await this.sleep(this.config.pollingIntervalMs);
    }

    throw new Error(`Research timed out after ${this.config.maxWaitTimeMs}ms`);
  }

  /**
   * Stream research results in real-time.
   * Yields stream events as they arrive.
   */
  async *streamResearch(
    interactionId: string,
    lastEventId?: string
  ): AsyncGenerator<StreamEvent> {
    const url = lastEventId
      ? `${INTERACTIONS_BASE_URL}/${interactionId}?stream=true&last_event_id=${lastEventId}`
      : `${INTERACTIONS_BASE_URL}/${interactionId}?stream=true`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-goog-api-key': this.apiKey,
        Accept: 'text/event-stream',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error ${response.status}: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const event = JSON.parse(data) as StreamEvent;
              yield event;
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Ask a follow-up question about completed research.
   */
  async followUp(request: FollowUpRequest): Promise<ResearchInteraction> {
    const traceId = generateTraceId();

    MollyLogger.info('Deep Research: Starting follow-up', 'deep-research', {
      previousInteractionId: request.previousInteractionId,
      traceId,
    });

    const response = await fetch(INTERACTIONS_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        input: request.input,
        model: request.model || 'gemini-3.1-pro-preview',
        previous_interaction_id: request.previousInteractionId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error ${response.status}: ${error}`);
    }

    const data = await response.json();

    // Find session for this interaction
    for (const session of activeSessions.values()) {
      const hasInteraction = session.interactions.some(
        (i) => i.id === request.previousInteractionId
      );
      if (hasInteraction) {
        logAudit({
          sessionId: session.sessionId,
          interactionId: data.id || data.name,
          event: 'follow_up',
          query: request.input.substring(0, 500),
        });
        break;
      }
    }

    return this.parseInteractionResponse(data);
  }

  /**
   * Convenience method: run research and wait for results.
   */
  async research(
    query: string | object[],
    onProgress?: (interaction: ResearchInteraction) => void
  ): Promise<{
    result: string;
    citations: string[];
    interaction: ResearchInteraction;
  }> {
    const sessionId = `research-${generateTraceId()}`;

    // Start research
    const interaction = await this.startResearch(query, sessionId);

    // Wait for completion
    const completed = await this.waitForCompletion(
      interaction.id,
      sessionId,
      onProgress
    );

    // Extract result and citations
    const result = completed.outputs[completed.outputs.length - 1]?.text || '';
    const citations = completed.outputs
      .flatMap((o) => o.citations || [])
      .map((c) => c.url);

    return { result, citations, interaction: completed };
  }

  // ── Private Helpers ──

  private parseInteractionResponse(
    data: Record<string, unknown>
  ): ResearchInteraction {
    const status =
      ((data.status as string)?.toLowerCase() as InteractionStatus) ||
      'in_progress';

    return {
      id: (data.id || data.name) as string,
      status,
      outputs: Array.isArray(data.outputs)
        ? data.outputs.map((o: Record<string, unknown>) => ({
            text: (o.text as string) || '',
            citations:
              o.citations as ResearchInteraction['outputs'][0]['citations'],
            thinkingSummary: o.thinkingSummary as string,
          }))
        : [],
      error: data.error as ResearchInteraction['error'],
      startedAt: Date.now(),
      sourcesConsulted: data.sourcesConsulted as number,
      searchQueriesMade: data.searchQueriesMade as number,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let _clientInstance: DeepResearchClient | null = null;

/**
 * Get the global Deep Research client.
 */
export function getDeepResearchClient(): DeepResearchClient {
  if (!_clientInstance) {
    _clientInstance = new DeepResearchClient();
  }
  return _clientInstance;
}

/**
 * Reset the client (for testing).
 */
export function resetDeepResearchClient(): void {
  _clientInstance = null;
  activeSessions.clear();
  auditLog.length = 0;
}
