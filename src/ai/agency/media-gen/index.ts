/**
 * @fileOverview Media Generation Module — Molly's Creative Engine
 *
 * Unified module for all media generation capabilities:
 * - Veo 3.1: Video generation with synchronized audio
 * - Imagen 4: Image generation up to 2K resolution
 * - Lyria 3: Music generation (full songs, clips, real-time)
 *
 * Based on Gemini Media APIs (April 2026)
 */

import { MollyLogger, generateTraceId } from '../../logger';

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
 * Base generation result.
 */
export interface GenerationResult<T> {
  /** Unique generation ID */
  id: string;
  /** Status */
  status: GenerationStatus;
  /** The generated content */
  content?: T;
  /** Error if failed */
  error?: string;
  /** Processing time in ms */
  processingTimeMs?: number;
  /** Timestamp */
  timestamp: number;
}

// ============================================================
// VIDEO GENERATION (VEO 3.1)
// ============================================================

/**
 * Video generation request.
 */
export interface VideoGenerationRequest {
  /** Text prompt describing the video */
  prompt: string;
  /** Duration in seconds (default: 5) */
  durationSeconds?: number;
  /** Aspect ratio */
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3';
  /** Style preset */
  style?: 'cinematic' | 'documentary' | 'animation' | 'realistic';
  /** Whether to generate synchronized audio */
  withAudio?: boolean;
  /** Reference image for consistency */
  referenceImage?: string;
}

/**
 * Generated video content.
 */
export interface VideoContent {
  /** Video URL or base64 data */
  videoUrl?: string;
  videoData?: string;
  /** Audio URL if generated separately */
  audioUrl?: string;
  /** Duration in seconds */
  durationSeconds: number;
  /** Resolution */
  resolution: { width: number; height: number };
  /** Format */
  format: string;
  /** File size in bytes */
  fileSizeBytes?: number;
}

/**
 * Video generation result.
 */
export type VideoGenerationResult = GenerationResult<VideoContent>;

/**
 * Video generation configuration.
 */
export interface VideoConfig {
  model: string;
  defaultDuration: number;
  defaultAspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  maxDurationSeconds: number;
  timeoutMs: number;
}

export const DEFAULT_VIDEO_CONFIG: VideoConfig = {
  model: 'veo-3.1-generate-preview',
  defaultDuration: 5,
  defaultAspectRatio: '16:9',
  maxDurationSeconds: 60,
  timeoutMs: 300_000, // 5 minutes
};

// ============================================================
// IMAGE GENERATION (IMAGEN 4)
// ============================================================

/**
 * Image generation request.
 */
export interface ImageGenerationRequest {
  /** Text prompt describing the image */
  prompt: string;
  /** Negative prompt (what to avoid) */
  negativePrompt?: string;
  /** Number of images to generate */
  numberOfImages?: number;
  /** Aspect ratio */
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  /** Resolution preset */
  resolution?: 'standard' | 'hd' | '2k';
  /** Style preset */
  style?: 'photorealistic' | 'artistic' | 'illustration' | 'sketch';
  /** Reference image for style transfer */
  referenceImage?: string;
}

/**
 * Generated image content.
 */
export interface ImageContent {
  /** Image URL or base64 data */
  imageUrl?: string;
  imageData?: string;
  /** Resolution */
  resolution: { width: number; height: number };
  /** Format */
  format: 'png' | 'jpeg' | 'webp';
  /** File size in bytes */
  fileSizeBytes?: number;
}

/**
 * Image generation result.
 */
export interface ImageGenerationResult extends GenerationResult<
  ImageContent[]
> {
  /** Individual image results */
  images: ImageContent[];
}

/**
 * Image generation configuration.
 */
export interface ImageConfig {
  model: string;
  defaultNumberOfImages: number;
  defaultResolution: 'standard' | 'hd' | '2k';
  maxImages: number;
  timeoutMs: number;
}

export const DEFAULT_IMAGE_CONFIG: ImageConfig = {
  model: 'imagen',
  defaultNumberOfImages: 1,
  defaultResolution: 'hd',
  maxImages: 4,
  timeoutMs: 60_000,
};

// ============================================================
// MUSIC GENERATION (LYRIA 3)
// ============================================================

/**
 * Music generation request.
 */
export interface MusicGenerationRequest {
  /** Text prompt describing the music */
  prompt: string;
  /** Duration in seconds */
  durationSeconds?: number;
  /** Genre */
  genre?: string;
  /** Mood */
  mood?: string;
  /** Tempo in BPM */
  tempo?: number;
  /** Whether to include vocals */
  includeVocals?: boolean;
  /** Reference audio for style */
  referenceAudio?: string;
}

/**
 * Generated music content.
 */
export interface MusicContent {
  /** Audio URL or base64 data */
  audioUrl?: string;
  audioData?: string;
  /** Duration in seconds */
  durationSeconds: number;
  /** Format */
  format: 'mp3' | 'wav' | 'ogg';
  /** Sample rate */
  sampleRate: number;
  /** File size in bytes */
  fileSizeBytes?: number;
  /** Whether it has vocals */
  hasVocals: boolean;
}

/**
 * Music generation result.
 */
export type MusicGenerationResult = GenerationResult<MusicContent>;

/**
 * Music model type.
 */
export type MusicModel =
  | 'lyria-3-pro-preview'
  | 'lyria-3-clip-preview'
  | 'lyria-realtime-exp';

/**
 * Music generation configuration.
 */
export interface MusicConfig {
  model: MusicModel;
  defaultDuration: number;
  maxDurationSeconds: number;
  defaultFormat: 'mp3' | 'wav' | 'ogg';
  timeoutMs: number;
}

export const DEFAULT_MUSIC_CONFIG: MusicConfig = {
  model: 'lyria-3-pro-preview',
  defaultDuration: 30,
  maxDurationSeconds: 300, // 5 minutes
  defaultFormat: 'mp3',
  timeoutMs: 120_000, // 2 minutes
};

// ============================================================
// AUDIT LOG
// ============================================================

/**
 * Media generation audit entry.
 */
export interface MediaAuditEntry {
  entryId: string;
  mediaType: 'video' | 'image' | 'music';
  prompt: string;
  status: GenerationStatus;
  processingTimeMs?: number;
  error?: string;
  timestamp: number;
}

const auditLog: MediaAuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 500;

function logAudit(entry: Omit<MediaAuditEntry, 'entryId' | 'timestamp'>): void {
  const fullEntry: MediaAuditEntry = {
    ...entry,
    entryId: generateTraceId(),
    timestamp: Date.now(),
  };
  auditLog.push(fullEntry);
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.splice(0, auditLog.length - MAX_AUDIT_ENTRIES);
  }
}

/**
 * Get media generation audit log.
 */
export function getMediaAuditLog(): MediaAuditEntry[] {
  return [...auditLog];
}

// ============================================================
// MEDIA GENERATION CLIENT
// ============================================================

/**
 * Media Generation Client — Molly's creative engine.
 */
export class MediaGenerationClient {
  private videoConfig: VideoConfig;
  private imageConfig: ImageConfig;
  private musicConfig: MusicConfig;
  private apiKey: string;

  constructor(config?: {
    video?: Partial<VideoConfig>;
    image?: Partial<ImageConfig>;
    music?: Partial<MusicConfig>;
  }) {
    this.videoConfig = { ...DEFAULT_VIDEO_CONFIG, ...config?.video };
    this.imageConfig = { ...DEFAULT_IMAGE_CONFIG, ...config?.image };
    this.musicConfig = { ...DEFAULT_MUSIC_CONFIG, ...config?.music };
    this.apiKey = process.env.GOOGLE_GENAI_API_KEY || '';
  }

  // ── Video Generation ──

  /**
   * Generate a video from a text prompt.
   */
  async generateVideo(
    request: VideoGenerationRequest
  ): Promise<VideoGenerationResult> {
    const startTime = performance.now();
    const generationId = generateTraceId();

    MollyLogger.info('Media Gen: Starting video generation', 'media-gen', {
      id: generationId,
      prompt: request.prompt.substring(0, 100),
    });

    try {
      // Call Veo API
      const response = await this.callGenerationAPI('video', {
        model: this.videoConfig.model,
        prompt: request.prompt,
        duration_seconds:
          request.durationSeconds || this.videoConfig.defaultDuration,
        aspect_ratio:
          request.aspectRatio || this.videoConfig.defaultAspectRatio,
        style: request.style,
        with_audio: request.withAudio ?? true,
        reference_image: request.referenceImage,
      });

      const processingTimeMs = performance.now() - startTime;

      const result: VideoGenerationResult = {
        id: generationId,
        status: 'completed',
        content: response as VideoContent,
        processingTimeMs,
        timestamp: Date.now(),
      };

      logAudit({
        mediaType: 'video',
        prompt: request.prompt,
        status: 'completed',
        processingTimeMs,
      });

      return result;
    } catch (error) {
      const processingTimeMs = performance.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      logAudit({
        mediaType: 'video',
        prompt: request.prompt,
        status: 'failed',
        processingTimeMs,
        error: errorMsg,
      });

      return {
        id: generationId,
        status: 'failed',
        error: errorMsg,
        processingTimeMs,
        timestamp: Date.now(),
      };
    }
  }

  // ── Image Generation ──

  /**
   * Generate images from a text prompt.
   */
  async generateImage(
    request: ImageGenerationRequest
  ): Promise<ImageGenerationResult> {
    const startTime = performance.now();
    const generationId = generateTraceId();

    MollyLogger.info('Media Gen: Starting image generation', 'media-gen', {
      id: generationId,
      prompt: request.prompt.substring(0, 100),
    });

    try {
      const response = await this.callGenerationAPI('image', {
        model: this.imageConfig.model,
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        number_of_images:
          request.numberOfImages || this.imageConfig.defaultNumberOfImages,
        aspect_ratio: request.aspectRatio,
        resolution: request.resolution || this.imageConfig.defaultResolution,
        style: request.style,
        reference_image: request.referenceImage,
      });

      const processingTimeMs = performance.now() - startTime;
      const images = Array.isArray(response) ? response : [response];

      const result: ImageGenerationResult = {
        id: generationId,
        status: 'completed',
        content: images as ImageContent[],
        images: images as ImageContent[],
        processingTimeMs,
        timestamp: Date.now(),
      };

      logAudit({
        mediaType: 'image',
        prompt: request.prompt,
        status: 'completed',
        processingTimeMs,
      });

      return result;
    } catch (error) {
      const processingTimeMs = performance.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      logAudit({
        mediaType: 'image',
        prompt: request.prompt,
        status: 'failed',
        processingTimeMs,
        error: errorMsg,
      });

      return {
        id: generationId,
        status: 'failed',
        error: errorMsg,
        images: [],
        processingTimeMs,
        timestamp: Date.now(),
      };
    }
  }

  // ── Music Generation ──

  /**
   * Generate music from a text prompt.
   */
  async generateMusic(
    request: MusicGenerationRequest
  ): Promise<MusicGenerationResult> {
    const startTime = performance.now();
    const generationId = generateTraceId();

    MollyLogger.info('Media Gen: Starting music generation', 'media-gen', {
      id: generationId,
      prompt: request.prompt.substring(0, 100),
    });

    try {
      const response = await this.callGenerationAPI('music', {
        model: this.musicConfig.model,
        prompt: request.prompt,
        duration_seconds:
          request.durationSeconds || this.musicConfig.defaultDuration,
        genre: request.genre,
        mood: request.mood,
        tempo: request.tempo,
        include_vocals: request.includeVocals,
        reference_audio: request.referenceAudio,
      });

      const processingTimeMs = performance.now() - startTime;

      const result: MusicGenerationResult = {
        id: generationId,
        status: 'completed',
        content: response as MusicContent,
        processingTimeMs,
        timestamp: Date.now(),
      };

      logAudit({
        mediaType: 'music',
        prompt: request.prompt,
        status: 'completed',
        processingTimeMs,
      });

      return result;
    } catch (error) {
      const processingTimeMs = performance.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      logAudit({
        mediaType: 'music',
        prompt: request.prompt,
        status: 'failed',
        processingTimeMs,
        error: errorMsg,
      });

      return {
        id: generationId,
        status: 'failed',
        error: errorMsg,
        processingTimeMs,
        timestamp: Date.now(),
      };
    }
  }

  // ── Private Helpers ──

  private async callGenerationAPI(
    type: 'video' | 'image' | 'music',
    params: Record<string, unknown>
  ): Promise<unknown> {
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

    let endpoint: string;
    switch (type) {
      case 'video':
        endpoint = `${baseUrl}/models/${params.model}:generateVideo`;
        break;
      case 'image':
        endpoint = `${baseUrl}/models/${params.model}:generateImage`;
        break;
      case 'music':
        endpoint = `${baseUrl}/models/${params.model}:generateMusic`;
        break;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error ${response.status}: ${error}`);
    }

    return response.json();
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let _clientInstance: MediaGenerationClient | null = null;

/**
 * Get the global media generation client.
 */
export function getMediaGenerationClient(): MediaGenerationClient {
  if (!_clientInstance) {
    _clientInstance = new MediaGenerationClient();
  }
  return _clientInstance;
}

/**
 * Reset the client (for testing).
 */
export function resetMediaGenerationClient(): void {
  _clientInstance = null;
  auditLog.length = 0;
}
