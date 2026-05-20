/**
 * @fileOverview Media Generation Client — Molly's Creative Engine
 *
 * Client for Veo 3.1 (video), Imagen 4 (image), and Lyria 3 (music).
 */

import { MollyLogger, generateTraceId } from '../../logger';
import {
  VideoGenerationRequest,
  VideoGenerationResult,
  ImageGenerationRequest,
  ImageGenerationResult,
  MusicGenerationRequest,
  MusicGenerationResult,
  MediaAuditEntry,
  DEFAULT_CONFIG,
  MediaGenerationConfig,
} from './types';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Audit log
const auditLog: MediaAuditEntry[] = [];
const MAX_AUDIT = 200;

function logAudit(entry: Omit<MediaAuditEntry, 'entryId' | 'timestamp'>): void {
  auditLog.push({
    ...entry,
    entryId: generateTraceId(),
    timestamp: Date.now(),
  });
  if (auditLog.length > MAX_AUDIT)
    auditLog.splice(0, auditLog.length - MAX_AUDIT);
}

export function getMediaAuditLog(): MediaAuditEntry[] {
  return [...auditLog];
}

/**
 * Media Generation Client.
 */
export class MediaGenerationClient {
  private config: MediaGenerationConfig;
  private apiKey: string;

  constructor(config?: Partial<MediaGenerationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.apiKey = process.env.GOOGLE_GENAI_API_KEY || '';
  }

  /**
   * Generate video with Veo 3.1.
   */
  async generateVideo(
    request: VideoGenerationRequest
  ): Promise<VideoGenerationResult> {
    const traceId = generateTraceId();
    const generationId = `video-${traceId}`;
    const startTime = Date.now();

    MollyLogger.info(
      'Media Generation: Starting video generation',
      'media-gen',
      { prompt: request.prompt.substring(0, 50) }
    );
    logAudit({
      mediaType: 'video',
      prompt: request.prompt.substring(0, 100),
      status: 'processing',
    });

    try {
      const response = await fetch(
        `${API_BASE}/${this.config.videoModel}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: request.prompt }] }],
            generationConfig: {
              aspectRatio: request.aspectRatio || '16:9',
              duration: request.duration || '10s',
              numberOfVideos: request.count || 1,
            },
          }),
        }
      );

      if (!response.ok)
        throw new Error(
          `API error ${response.status}: ${await response.text()}`
        );

      const data = await response.json();
      const processingTimeMs = Date.now() - startTime;

      const videos = (data.candidates || []).map(
        (c: { content: { parts: { inlineData: { data: string } }[] } }) => ({
          data: c.content?.parts?.[0]?.inlineData?.data || '',
          mimeType: 'video/mp4' as const,
          durationSeconds: parseInt(request.duration || '10s'),
          width: request.aspectRatio === '9:16' ? 720 : 1280,
          height: request.aspectRatio === '9:16' ? 1280 : 720,
          hasAudio: request.includeAudio ?? true,
        })
      );

      logAudit({
        mediaType: 'video',
        prompt: request.prompt.substring(0, 100),
        status: 'completed',
        processingTimeMs,
      });

      return {
        success: true,
        generationId,
        status: 'completed',
        videos,
        processingTimeMs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logAudit({
        mediaType: 'video',
        prompt: request.prompt.substring(0, 100),
        status: 'failed',
        error: errorMsg,
      });
      MollyLogger.error(
        'Media Generation: Video failed',
        'media-gen',
        { traceId },
        error
      );
      return {
        success: false,
        generationId,
        status: 'failed',
        videos: [],
        error: errorMsg,
      };
    }
  }

  /**
   * Generate image with Imagen 4.
   */
  async generateImage(
    request: ImageGenerationRequest
  ): Promise<ImageGenerationResult> {
    const traceId = generateTraceId();
    const generationId = `image-${traceId}`;
    const startTime = Date.now();

    MollyLogger.info(
      'Media Generation: Starting image generation',
      'media-gen',
      { prompt: request.prompt.substring(0, 50) }
    );
    logAudit({
      mediaType: 'image',
      prompt: request.prompt.substring(0, 100),
      status: 'processing',
    });

    try {
      const response = await fetch(
        `${API_BASE}/${this.config.imageModel}:generateImages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            prompt: request.prompt,
            negativePrompt: request.negativePrompt,
            numberOfImages: request.count || 1,
            aspectRatio: request.aspectRatio || '1:1',
            seed: request.seed,
          }),
        }
      );

      if (!response.ok)
        throw new Error(
          `API error ${response.status}: ${await response.text()}`
        );

      const data = await response.json();
      const processingTimeMs = Date.now() - startTime;

      const images = (data.generatedImages || data.images || []).map(
        (img: { bytesBase64Encoded: string }) => ({
          data: img.bytesBase64Encoded || '',
          mimeType: 'image/png' as const,
          width: parseInt(request.resolution || '1024'),
          height: parseInt(request.resolution || '1024'),
        })
      );

      logAudit({
        mediaType: 'image',
        prompt: request.prompt.substring(0, 100),
        status: 'completed',
        processingTimeMs,
      });

      return {
        success: true,
        generationId,
        status: 'completed',
        images,
        processingTimeMs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logAudit({
        mediaType: 'image',
        prompt: request.prompt.substring(0, 100),
        status: 'failed',
        error: errorMsg,
      });
      MollyLogger.error(
        'Media Generation: Image failed',
        'media-gen',
        { traceId },
        error
      );
      return {
        success: false,
        generationId,
        status: 'failed',
        images: [],
        error: errorMsg,
      };
    }
  }

  /**
   * Generate music with Lyria 3.
   */
  async generateMusic(
    request: MusicGenerationRequest
  ): Promise<MusicGenerationResult> {
    const traceId = generateTraceId();
    const generationId = `music-${traceId}`;
    const startTime = Date.now();

    MollyLogger.info(
      'Media Generation: Starting music generation',
      'media-gen',
      { prompt: request.prompt.substring(0, 50) }
    );
    logAudit({
      mediaType: 'music',
      prompt: request.prompt.substring(0, 100),
      status: 'processing',
    });

    try {
      const response = await fetch(
        `${API_BASE}/${this.config.musicModel}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: request.prompt }] }],
            generationConfig: {
              duration: request.duration || '30s',
              genre: request.genre,
              tempo: request.tempo,
              key: request.key,
            },
          }),
        }
      );

      if (!response.ok)
        throw new Error(
          `API error ${response.status}: ${await response.text()}`
        );

      const data = await response.json();
      const processingTimeMs = Date.now() - startTime;

      const tracks = (data.candidates || []).map(
        (c: { content: { parts: { inlineData: { data: string } }[] } }) => ({
          data: c.content?.parts?.[0]?.inlineData?.data || '',
          mimeType: 'audio/mp3' as const,
          durationSeconds: parseInt(request.duration || '30s'),
          sampleRate: 44100,
        })
      );

      logAudit({
        mediaType: 'music',
        prompt: request.prompt.substring(0, 100),
        status: 'completed',
        processingTimeMs,
      });

      return {
        success: true,
        generationId,
        status: 'completed',
        tracks,
        processingTimeMs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logAudit({
        mediaType: 'music',
        prompt: request.prompt.substring(0, 100),
        status: 'failed',
        error: errorMsg,
      });
      MollyLogger.error(
        'Media Generation: Music failed',
        'media-gen',
        { traceId },
        error
      );
      return {
        success: false,
        generationId,
        status: 'failed',
        tracks: [],
        error: errorMsg,
      };
    }
  }
}

// Singleton
let _client: MediaGenerationClient | null = null;

export function getMediaGenerationClient(): MediaGenerationClient {
  if (!_client) _client = new MediaGenerationClient();
  return _client;
}

export function resetMediaGenerationClient(): void {
  _client = null;
  auditLog.length = 0;
}
