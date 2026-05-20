/**
 * @fileOverview Media Generation Types — Molly's Creative Output
 *
 * Type definitions for Veo 3.1 (video), Imagen 4 (image), and Lyria 3 (music).
 * Molly can generate video, images, and music.
 *
 * Based on Google Generative Media APIs (April 2026)
 */

// ============================================================
// COMMON TYPES
// ============================================================

/**
 * Generation status.
 */
export type GenerationStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

/**
 * Media type.
 */
export type MediaType = 'video' | 'image' | 'music';

/**
 * Base generation request.
 */
export interface BaseGenerationRequest {
  /** Text prompt describing what to generate */
  prompt: string;
  /** Negative prompt (what to avoid) */
  negativePrompt?: string;
}

/**
 * Base generation result.
 */
export interface BaseGenerationResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Generation ID */
  generationId: string;
  /** Status */
  status: GenerationStatus;
  /** Error if failed */
  error?: string;
  /** Processing time in ms */
  processingTimeMs?: number;
}

// ============================================================
// VEO 3.1 — Video Generation
// ============================================================

/**
 * Video aspect ratio.
 */
export type VideoAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

/**
 * Video duration.
 */
export type VideoDuration = '5s' | '10s' | '15s' | '30s' | '60s';

/**
 * Video generation request.
 */
export interface VideoGenerationRequest extends BaseGenerationRequest {
  /** Aspect ratio */
  aspectRatio?: VideoAspectRatio;
  /** Duration */
  duration?: VideoDuration;
  /** Reference image for style */
  referenceImage?: string;
  /** Whether to include synchronized audio */
  includeAudio?: boolean;
  /** Number of videos to generate */
  count?: number;
}

/**
 * Generated video.
 */
export interface GeneratedVideo {
  /** Video data as base64 or URL */
  data: string;
  /** MIME type */
  mimeType: 'video/mp4';
  /** Duration in seconds */
  durationSeconds: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Whether audio is included */
  hasAudio: boolean;
}

/**
 * Video generation result.
 */
export interface VideoGenerationResult extends BaseGenerationResult {
  /** Generated videos */
  videos: GeneratedVideo[];
}

// ============================================================
// IMAGEN 4 — Image Generation
// ============================================================

/**
 * Image aspect ratio.
 */
export type ImageAspectRatio =
  | '1:1'
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '3:2'
  | '2:3';

/**
 * Image resolution.
 */
export type ImageResolution = '512' | '1024' | '2048';

/**
 * Image generation request.
 */
export interface ImageGenerationRequest extends BaseGenerationRequest {
  /** Aspect ratio */
  aspectRatio?: ImageAspectRatio;
  /** Resolution (max dimension) */
  resolution?: ImageResolution;
  /** Style preset */
  style?: string;
  /** Number of images to generate */
  count?: number;
  /** Seed for reproducibility */
  seed?: number;
}

/**
 * Generated image.
 */
export interface GeneratedImage {
  /** Image data as base64 or URL */
  data: string;
  /** MIME type */
  mimeType: 'image/png' | 'image/jpeg';
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/**
 * Image generation result.
 */
export interface ImageGenerationResult extends BaseGenerationResult {
  /** Generated images */
  images: GeneratedImage[];
}

// ============================================================
// LYRIA 3 — Music Generation
// ============================================================

/**
 * Music duration.
 */
export type MusicDuration = '15s' | '30s' | '60s' | '120s' | '180s' | '300s';

/**
 * Music genre hint.
 */
export type MusicGenre =
  | 'electronic'
  | 'rock'
  | 'pop'
  | 'classical'
  | 'jazz'
  | 'ambient'
  | 'hip_hop'
  | 'folk'
  | 'cinematic';

/**
 * Music generation request.
 */
export interface MusicGenerationRequest extends BaseGenerationRequest {
  /** Target duration */
  duration?: MusicDuration;
  /** Genre hint */
  genre?: MusicGenre;
  /** Tempo in BPM */
  tempo?: number;
  /** Key signature */
  key?: string;
  /** Reference audio for style */
  referenceAudio?: string;
  /** Whether this is a clip/loop */
  isClip?: boolean;
}

/**
 * Generated music.
 */
export interface GeneratedMusic {
  /** Audio data as base64 or URL */
  data: string;
  /** MIME type */
  mimeType: 'audio/mp3' | 'audio/wav';
  /** Duration in seconds */
  durationSeconds: number;
  /** Sample rate */
  sampleRate: number;
}

/**
 * Music generation result.
 */
export interface MusicGenerationResult extends BaseGenerationResult {
  /** Generated music tracks */
  tracks: GeneratedMusic[];
}

// ============================================================
// CONFIG
// ============================================================

/**
 * Media generation configuration.
 */
export interface MediaGenerationConfig {
  /** Video model */
  videoModel: string;
  /** Image model */
  imageModel: string;
  /** Music model */
  musicModel: string;
  /** Default timeout in ms */
  timeoutMs: number;
  /** Polling interval for async generation */
  pollingIntervalMs: number;
}

export const DEFAULT_CONFIG: MediaGenerationConfig = {
  videoModel: 'veo-3.1-generate-preview',
  imageModel: 'imagen',
  musicModel: 'lyria-3-pro-preview',
  timeoutMs: 300000, // 5 minutes
  pollingIntervalMs: 5000,
};

// ============================================================
// AUDIT
// ============================================================

/**
 * Audit log entry.
 */
export interface MediaAuditEntry {
  entryId: string;
  mediaType: MediaType;
  prompt: string;
  status: GenerationStatus;
  processingTimeMs?: number;
  error?: string;
  timestamp: number;
}
