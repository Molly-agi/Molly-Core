/**
 * @fileOverview Deep Research Types — Molly's Research Mind
 *
 * Type definitions for Molly's ability to conduct multi-step agentic research
 * across hundreds of sources, synthesize findings, and provide citations.
 *
 * Based on Gemini Deep Research API (April 2026)
 * Uses Interactions API — not generate_content
 */

// ============================================================
// INTERACTION STATUS — Research lifecycle
// ============================================================

/**
 * Status of a research interaction.
 */
export type InteractionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed';

/**
 * Stream event types for real-time updates.
 */
export type StreamEventType =
  | 'interaction.start'
  | 'content.delta'
  | 'thinking.delta'
  | 'interaction.complete'
  | 'error';

// ============================================================
// INPUT — What Molly researches
// ============================================================

/**
 * Text input for research.
 */
export interface TextInput {
  type: 'text';
  text: string;
}

/**
 * Image input for research (can analyze images as part of research).
 */
export interface ImageInput {
  type: 'image';
  uri?: string;
  data?: string; // base64
  mimeType?: string;
}

/**
 * PDF input for research.
 */
export interface PDFInput {
  type: 'pdf';
  uri?: string;
  data?: string; // base64
}

/**
 * Audio input for research.
 */
export interface AudioInput {
  type: 'audio';
  uri?: string;
  data?: string; // base64
  mimeType?: string;
}

/**
 * Video input for research.
 */
export interface VideoInput {
  type: 'video';
  uri?: string;
  data?: string; // base64
  mimeType?: string;
}

/**
 * Union of all input types.
 */
export type ResearchInput =
  | string
  | TextInput
  | ImageInput
  | PDFInput
  | AudioInput
  | VideoInput;

/**
 * Multimodal input array.
 */
export type MultimodalInput = ResearchInput[];

// ============================================================
// TOOLS — Built-in and optional research tools
// ============================================================

/**
 * Built-in tools (auto-enabled).
 */
export type BuiltInTool = 'google_search' | 'url_context';

/**
 * File search tool configuration.
 */
export interface FileSearchTool {
  type: 'file_search';
  fileSearchStoreNames: string[];
}

/**
 * Research tool configuration.
 */
export type ResearchTool = FileSearchTool;

// ============================================================
// CITATIONS — Source tracking
// ============================================================

/**
 * A single citation from the research.
 */
export interface Citation {
  /** Source URL */
  url: string;
  /** Source title */
  title?: string;
  /** Relevant snippet from source */
  snippet?: string;
  /** When the source was accessed */
  accessedAt?: number;
  /** Confidence score (0-1) */
  confidence?: number;
}

/**
 * Citation reference in the output text.
 */
export interface CitationReference {
  /** Index in citations array */
  citationIndex: number;
  /** Start character position in text */
  startIndex: number;
  /** End character position in text */
  endIndex: number;
}

// ============================================================
// OUTPUT — Research results
// ============================================================

/**
 * A single output chunk from the research.
 */
export interface ResearchOutput {
  /** Output text content */
  text: string;
  /** Citations used in this output */
  citations?: Citation[];
  /** Citation references within the text */
  citationReferences?: CitationReference[];
  /** Thinking/reasoning summary (if enabled) */
  thinkingSummary?: string;
}

/**
 * Error details if research fails.
 */
export interface ResearchError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

// ============================================================
// INTERACTION — The research session
// ============================================================

/**
 * Research interaction configuration.
 */
export interface ResearchConfig {
  /** Include thinking summaries in response */
  thinkingSummaries?: 'auto' | 'none';
  /** Custom tools to enable */
  tools?: ResearchTool[];
  /** Stream results as they arrive */
  stream?: boolean;
}

/**
 * Request to start a research interaction.
 */
export interface ResearchRequest {
  /** Research query (text or multimodal) */
  input: string | MultimodalInput;
  /** Agent ID (defaults to deep-research-pro-preview-12-2025) */
  agent?: string;
  /** Must be true for deep research */
  background: true;
  /** Store results (required for background=true) */
  store?: true;
  /** Configuration */
  config?: ResearchConfig;
}

/**
 * A research interaction (session).
 */
export interface ResearchInteraction {
  /** Unique interaction ID */
  id: string;
  /** Current status */
  status: InteractionStatus;
  /** Research outputs (final result in outputs[-1]) */
  outputs: ResearchOutput[];
  /** Error if status is 'failed' */
  error?: ResearchError;
  /** When research started */
  startedAt: number;
  /** When research completed/failed */
  endedAt?: number;
  /** Estimated progress (0-100) */
  progress?: number;
  /** Number of sources consulted */
  sourcesConsulted?: number;
  /** Number of search queries made */
  searchQueriesMade?: number;
}

/**
 * Stream event from research.
 */
export interface StreamEvent {
  /** Event type */
  type: StreamEventType;
  /** Event ID for reconnection */
  eventId: string;
  /** Interaction ID */
  interactionId: string;
  /** Delta content (for content.delta) */
  delta?: string;
  /** Thinking delta (for thinking.delta) */
  thinkingDelta?: string;
  /** Full interaction (for interaction.complete) */
  interaction?: ResearchInteraction;
  /** Error (for error event) */
  error?: ResearchError;
  /** Timestamp */
  timestamp: number;
}

// ============================================================
// FOLLOW-UP — Continuing research conversations
// ============================================================

/**
 * Request for follow-up on completed research.
 */
export interface FollowUpRequest {
  /** Follow-up question */
  input: string;
  /** ID of completed research interaction */
  previousInteractionId: string;
  /** Model for follow-up (defaults to gemini-3.1-pro-preview) */
  model?: string;
}

// ============================================================
// SESSION — Full research session with history
// ============================================================

/**
 * A complete research session (may include multiple interactions).
 */
export interface ResearchSession {
  /** Unique session ID */
  sessionId: string;
  /** Original research query */
  originalQuery: string;
  /** All interactions in this session */
  interactions: ResearchInteraction[];
  /** All citations across all interactions */
  allCitations: Citation[];
  /** Session creation time */
  createdAt: number;
  /** Last activity time */
  lastActivityAt: number;
  /** Whether session is active */
  active: boolean;
}

// ============================================================
// AUDIT LOG — Observability
// ============================================================

/**
 * Audit log entry for research activity.
 */
export interface ResearchAuditEntry {
  /** Unique entry ID */
  entryId: string;
  /** Session ID */
  sessionId: string;
  /** Interaction ID */
  interactionId: string;
  /** Event type */
  event: 'started' | 'progress' | 'completed' | 'failed' | 'follow_up';
  /** Query/input */
  query?: string;
  /** Number of sources */
  sourcesCount?: number;
  /** Number of citations */
  citationsCount?: number;
  /** Duration in ms */
  durationMs?: number;
  /** Error message if failed */
  error?: string;
  /** Timestamp */
  timestamp: number;
}

// ============================================================
// CONFIG — Runtime configuration
// ============================================================

/**
 * Deep Research configuration.
 */
export interface DeepResearchConfig {
  /** Default agent ID */
  defaultAgent: string;
  /** Polling interval in ms */
  pollingIntervalMs: number;
  /** Max wait time in ms (default 60 minutes) */
  maxWaitTimeMs: number;
  /** Enable streaming by default */
  enableStreaming: boolean;
  /** Include thinking summaries by default */
  includeThinking: boolean;
}

/**
 * Default configuration.
 */
export const DEFAULT_CONFIG: DeepResearchConfig = {
  defaultAgent: 'deep-research-pro-preview-12-2025',
  pollingIntervalMs: 10_000, // 10 seconds
  maxWaitTimeMs: 60 * 60 * 1000, // 60 minutes
  enableStreaming: true,
  includeThinking: true,
};

// ============================================================
// COST ESTIMATION — Token and cost tracking
// ============================================================

/**
 * Estimated cost for a research task.
 */
export interface ResearchCostEstimate {
  /** Estimated search queries */
  searchQueries: number;
  /** Estimated input tokens */
  inputTokens: number;
  /** Estimated output tokens */
  outputTokens: number;
  /** Estimated cache hit rate (0-1) */
  cacheHitRate: number;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Complexity tier */
  complexity: 'standard' | 'complex';
}

/**
 * Estimate cost based on query complexity.
 * Standard: ~$2-3, Complex: ~$3-5
 */
export function estimateCost(
  queryLength: number,
  hasMultimodal: boolean
): ResearchCostEstimate {
  const isComplex = queryLength > 500 || hasMultimodal;

  if (isComplex) {
    return {
      searchQueries: 160,
      inputTokens: 900_000,
      outputTokens: 80_000,
      cacheHitRate: 0.6,
      estimatedCostUsd: 4.0,
      complexity: 'complex',
    };
  }

  return {
    searchQueries: 80,
    inputTokens: 250_000,
    outputTokens: 60_000,
    cacheHitRate: 0.6,
    estimatedCostUsd: 2.5,
    complexity: 'standard',
  };
}
