/**
 * @fileOverview Night Vision and Low-Light Enhancement Module
 *
 * Comprehensive night vision capabilities including:
 * - IR camera control and image processing
 * - Low-light image enhancement
 * - Thermal image analysis
 * - Night-time facial recognition
 * - Integration with camera and drone systems
 *
 * "I see in the dark."
 */

import { MollyLogger, generateTraceId } from '../logger';
import { molly } from '../rogue-generate';
import { TaskType } from '../model-router';
import {
  detectFaces,
  recognizeFaces,
  FaceDetectionResult,
  FaceRecognitionResult,
} from '../vision/facial-recognition';
import { CapturedFrame, getCameraControlSystem } from './camera-control';
import { z } from 'zod';

// ============================================================
// TYPES
// ============================================================

export type NightVisionMode =
  | 'ir'
  | 'thermal'
  | 'starlight'
  | 'enhanced'
  | 'hybrid';

export interface NightVisionConfig {
  /** Primary mode */
  mode: NightVisionMode;
  /** IR intensity (0-100) for active IR */
  irIntensity: number;
  /** Enhancement level (0-100) */
  enhancementLevel: number;
  /** Auto-adjust based on ambient light */
  autoAdjust: boolean;
  /** Gamma correction */
  gamma: number;
  /** Contrast boost */
  contrastBoost: number;
  /** Noise reduction strength */
  noiseReduction: number;
  /** Enable color preservation (for starlight) */
  preserveColor: boolean;
  /** Face detection optimized for IR */
  irFaceDetection: boolean;
}

export interface EnhancedFrame extends CapturedFrame {
  /** Original frame (before enhancement) */
  originalData?: string;
  /** Enhancement applied */
  enhancement: NightVisionMode;
  /** Enhancement parameters used */
  enhancementParams: Partial<NightVisionConfig>;
  /** Detected light level (0-100) */
  ambientLightLevel: number;
  /** Quality score after enhancement (0-1) */
  qualityScore: number;
}

export interface LightAnalysis {
  /** Overall light level (0-100) */
  level: number;
  /** Light classification */
  classification:
    | 'daylight'
    | 'twilight'
    | 'low_light'
    | 'very_dark'
    | 'pitch_black';
  /** Recommended night vision mode */
  recommendedMode: NightVisionMode;
  /** Is IR required? */
  requiresIR: boolean;
  /** Estimated visibility distance (meters) */
  visibilityEstimate: number;
}

export interface NightFaceDetectionResult extends FaceDetectionResult {
  /** IR mode used */
  irMode: boolean;
  /** Enhancement applied */
  enhancement: NightVisionMode | null;
  /** Light conditions */
  lightConditions: LightAnalysis;
  /** Adjusted confidence (may be lower in dark) */
  adjustedConfidence: number;
}

// ============================================================
// ZOD SCHEMAS
// ============================================================

const LightAnalysisSchema = z.object({
  level: z.number().min(0).max(100),
  classification: z.enum([
    'daylight',
    'twilight',
    'low_light',
    'very_dark',
    'pitch_black',
  ]),
  isIndoor: z.boolean(),
  lightSources: z.array(z.string()),
  shadows: z.boolean(),
  visibilityEstimate: z.number(),
});

// ============================================================
// IMAGE ENHANCEMENT
// ============================================================

/**
 * Enhance a low-light image using AI-powered processing.
 * Uses Gemini vision to understand the scene and suggest optimal enhancement.
 */
export async function enhanceLowLightImage(
  imageUri: string,
  config: Partial<NightVisionConfig> = {}
): Promise<EnhancedFrame> {
  const _traceId = generateTraceId();
  const _startTime = Date.now();

  const fullConfig: NightVisionConfig = {
    mode: 'enhanced',
    irIntensity: 80,
    enhancementLevel: 70,
    autoAdjust: true,
    gamma: 1.5,
    contrastBoost: 30,
    noiseReduction: 50,
    preserveColor: false,
    irFaceDetection: true,
    ...config,
  };

  MollyLogger.info(
    'Enhancing low-light image',
    'night-vision',
    { mode: fullConfig.mode },
    traceId
  );

  try {
    // First, analyze the light conditions
    const lightAnalysis = await analyzeLightConditions(imageUri);

    // Determine optimal enhancement based on conditions
    if (fullConfig.autoAdjust) {
      adjustConfigForConditions(fullConfig, lightAnalysis);
    }

    // Apply enhancement (this would use image processing in production)
    const enhancedData = await applyEnhancement(imageUri, fullConfig);

    // Calculate quality score
    const qualityScore = calculateEnhancementQuality(lightAnalysis, fullConfig);

    const result: EnhancedFrame = {
      cameraId: 'enhancement_output',
      timestamp: Date.now(),
      data: enhancedData,
      mimeType: 'image/jpeg',
      resolution: { width: 0, height: 0 },
      irMode: fullConfig.mode === 'ir' || lightAnalysis.requiresIR,
      originalData: imageUri.startsWith('data:') ? imageUri : undefined,
      enhancement: fullConfig.mode,
      enhancementParams: fullConfig,
      ambientLightLevel: lightAnalysis.level,
      qualityScore,
    };

    MollyLogger.info(
      `Image enhanced: ${lightAnalysis.classification} → quality ${(qualityScore * 100).toFixed(0)}%`,
      'night-vision',
      {},
      traceId
    );

    return result;
  } catch (error) {
    MollyLogger.error(
      'Image enhancement failed',
      'night-vision',
      {},
      error,
      traceId
    );

    // Return original with no enhancement
    return {
      cameraId: 'enhancement_failed',
      timestamp: Date.now(),
      data: imageUri,
      mimeType: 'image/jpeg',
      resolution: { width: 0, height: 0 },
      irMode: false,
      enhancement: 'enhanced',
      enhancementParams: fullConfig,
      ambientLightLevel: 50,
      qualityScore: 0.5,
    };
  }
}

/**
 * Analyze light conditions in an image.
 */
export async function analyzeLightConditions(
  imageUri: string
): Promise<LightAnalysis> {
  const _traceId = generateTraceId();

  try {
    const _response = await molly.generate(TaskType.VISION, {
      system: `Analyze the lighting conditions in this image. Determine:
1. Overall light level (0-100, where 0 is pitch black and 100 is bright daylight)
2. Classification (daylight, twilight, low_light, very_dark, pitch_black)
3. Whether the scene is indoor or outdoor
4. Visible light sources (streetlights, moon, IR illumination, etc.)
5. Presence of strong shadows
6. Estimated visibility distance in meters

Consider:
- Very dark images may appear mostly black
- IR images have a distinctive grayscale/green appearance
- Thermal images show heat signatures`,
      prompt: 'Analyze the lighting conditions in this image.',
      images: [imageUri],
      output: { schema: LightAnalysisSchema },
    });

    if (!response.output) {
      throw new Error('No analysis output');
    }

    const result = response.output;

    // Determine recommended mode
    let recommendedMode: NightVisionMode = 'enhanced';
    let requiresIR = false;

    if (result.level < 10) {
      recommendedMode = 'ir';
      requiresIR = true;
    } else if (result.level < 30) {
      recommendedMode = 'starlight';
      requiresIR = result.level < 20;
    } else if (result.level < 50) {
      recommendedMode = 'enhanced';
    }

    return {
      level: result.level,
      classification: result.classification,
      recommendedMode,
      requiresIR,
      visibilityEstimate: result.visibilityEstimate,
    };
  } catch (error) {
    MollyLogger.warn(
      'Light analysis failed, using defaults',
      'night-vision',
      { error },
      traceId
    );

    return {
      level: 30,
      classification: 'low_light',
      recommendedMode: 'enhanced',
      requiresIR: false,
      visibilityEstimate: 10,
    };
  }
}

/**
 * Adjust enhancement config based on light conditions.
 */
function adjustConfigForConditions(
  _config: NightVisionConfig,
  light: LightAnalysis
): void {
  switch (light.classification) {
    case 'pitch_black':
      config.mode = 'ir';
      config.irIntensity = 100;
      config.enhancementLevel = 100;
      config.gamma = 2.5;
      config.contrastBoost = 50;
      config.noiseReduction = 80;
      break;

    case 'very_dark':
      config.mode = light.requiresIR ? 'ir' : 'starlight';
      config.irIntensity = 80;
      config.enhancementLevel = 90;
      config.gamma = 2.0;
      config.contrastBoost = 40;
      config.noiseReduction = 70;
      break;

    case 'low_light':
      config.mode = 'starlight';
      config.enhancementLevel = 70;
      config.gamma = 1.5;
      config.contrastBoost = 30;
      config.noiseReduction = 50;
      config.preserveColor = true;
      break;

    case 'twilight':
      config.mode = 'enhanced';
      config.enhancementLevel = 40;
      config.gamma = 1.2;
      config.contrastBoost = 20;
      config.noiseReduction = 30;
      config.preserveColor = true;
      break;

    case 'daylight':
      // No enhancement needed
      config.enhancementLevel = 0;
      config.gamma = 1.0;
      config.contrastBoost = 0;
      break;
  }
}

/**
 * Apply image enhancement (placeholder - would use actual image processing).
 */
async function applyEnhancement(
  imageUri: string,
  _config: NightVisionConfig
): Promise<string> {
  // In production, this would use:
  // - Canvas API for browser
  // - Sharp/Jimp for Node.js
  // - OpenCV for advanced processing
  //
  // Enhancement operations:
  // 1. Gamma correction
  // 2. Histogram equalization
  // 3. Contrast enhancement
  // 4. Noise reduction (bilateral filter)
  // 5. Edge enhancement
  // 6. Color/grayscale conversion

  // For now, return the original (enhancement would be applied here)
  return imageUri;
}

/**
 * Calculate quality score for enhanced image.
 */
function calculateEnhancementQuality(
  light: LightAnalysis,
  _config: NightVisionConfig
): number {
  let score = 0.5;

  // Better light = higher base quality
  score += light.level / 200;

  // Appropriate mode selection improves quality
  if (light.requiresIR && config.mode === 'ir') {
    score += 0.2;
  } else if (!light.requiresIR && config.mode === 'starlight') {
    score += 0.2;
  }

  // Strong enhancement in very dark conditions is good
  if (light.level < 20 && config.enhancementLevel > 80) {
    score += 0.1;
  }

  return Math.min(Math.max(score, 0), 1);
}

// ============================================================
// NIGHT VISION FACIAL RECOGNITION
// ============================================================

/**
 * Detect faces in night vision / low-light images.
 * Automatically enhances image if needed before detection.
 */
export async function detectFacesNightVision(
  imageUri: string,
  irMode: boolean = false
): Promise<NightFaceDetectionResult> {
  const _traceId = generateTraceId();
  const _startTime = Date.now();

  MollyLogger.info(
    'Night vision face detection',
    'night-vision',
    { irMode },
    traceId
  );

  // Analyze light conditions
  const lightConditions = await analyzeLightConditions(imageUri);

  let enhancedUri = imageUri;
  let enhancement: NightVisionMode | null = null;

  // Enhance if needed
  if (lightConditions.level < 50) {
    const enhanced = await enhanceLowLightImage(imageUri, {
      mode: irMode ? 'ir' : lightConditions.recommendedMode,
      irFaceDetection: true,
    });
    enhancedUri = enhanced.data;
    enhancement = enhanced.enhancement;
  }

  // Detect faces on enhanced image
  const detection = await detectFaces(enhancedUri);

  // Adjust confidence based on light conditions
  const adjustedConfidence = calculateNightConfidence(
    detection,
    lightConditions
  );

  const result: NightFaceDetectionResult = {
    ...detection,
    irMode,
    enhancement,
    lightConditions,
    adjustedConfidence,
    processingTimeMs: Date.now() - startTime,
  };

  MollyLogger.info(
    `Night face detection: ${detection.faces.length} faces, ` +
      `${lightConditions.classification} conditions, ` +
      `confidence ${(adjustedConfidence * 100).toFixed(0)}%`,
    'night-vision',
    {},
    traceId
  );

  return result;
}

/**
 * Recognize faces in night vision images.
 */
export async function recognizeFacesNightVision(
  imageUri: string,
  irMode: boolean = false
): Promise<FaceRecognitionResult & { lightConditions: LightAnalysis }> {
  const _traceId = generateTraceId();

  // Analyze and enhance
  const lightConditions = await analyzeLightConditions(imageUri);

  let enhancedUri = imageUri;

  if (lightConditions.level < 50) {
    const enhanced = await enhanceLowLightImage(imageUri, {
      mode: irMode ? 'ir' : lightConditions.recommendedMode,
      irFaceDetection: true,
    });
    enhancedUri = enhanced.data;
  }

  // Run recognition
  const recognition = await recognizeFaces(enhancedUri);

  return {
    ...recognition,
    lightConditions,
  };
}

/**
 * Calculate adjusted confidence for night conditions.
 */
function calculateNightConfidence(
  detection: FaceDetectionResult,
  light: LightAnalysis
): number {
  if (detection.faces.length === 0) return 0;

  // Average face confidence
  const avgConfidence =
    detection.faces.reduce((sum, f) => sum + f.confidence, 0) /
    detection.faces.length;

  // Penalty for dark conditions
  let lightPenalty = 0;
  switch (light.classification) {
    case 'twilight':
      lightPenalty = 0.05;
      break;
    case 'low_light':
      lightPenalty = 0.15;
      break;
    case 'very_dark':
      lightPenalty = 0.25;
      break;
    case 'pitch_black':
      lightPenalty = 0.35;
      break;
  }

  // Bonus if IR is available
  const irBonus = light.requiresIR ? 0.1 : 0;

  return Math.max(0, Math.min(1, avgConfidence - lightPenalty + irBonus));
}

// ============================================================
// IR CAMERA CONTROL
// ============================================================

/**
 * Enable IR mode on a camera and capture enhanced frame.
 */
export async function captureWithIR(
  cameraId: string
): Promise<EnhancedFrame | null> {
  const _traceId = generateTraceId();
  const cameraSystem = getCameraControlSystem();

  try {
    // Enable IR
    await cameraSystem.enableNightVision(cameraId);

    // Wait for IR to activate
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Capture frame
    const frame = await cameraSystem.captureFrame(cameraId);
    if (!frame) return null;

    // Enhance the IR capture
    const enhanced = await enhanceLowLightImage(
      `data:image/jpeg;base64,${frame.data}`,
      {
        mode: 'ir',
        irIntensity: 100,
      }
    );

    return {
      ...enhanced,
      cameraId,
      irMode: true,
    };
  } catch (error) {
    MollyLogger.error(
      'IR capture failed',
      'night-vision',
      { cameraId },
      error,
      traceId
    );
    return null;
  }
}

/**
 * Continuous night vision monitoring with face detection.
 */
export async function* monitorWithNightVision(
  cameraId: string,
  intervalMs: number = 1000
): AsyncGenerator<NightFaceDetectionResult> {
  const cameraSystem = getCameraControlSystem();

  while (true) {
    try {
      // Capture frame
      const frame = await cameraSystem.captureFrame(cameraId);
      if (!frame) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }

      // Detect faces with night vision processing
      const result = await detectFacesNightVision(
        `data:image/jpeg;base64,${frame.data}`,
        frame.irMode
      );

      yield result;
    } catch (error) {
      MollyLogger.warn('Night vision monitoring error', 'night-vision', {
        error,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// ============================================================
// THERMAL PROCESSING
// ============================================================

/**
 * Analyze thermal image for heat signatures.
 */
export async function analyzeThermalImage(imageUri: string): Promise<{
  hotspots: Array<{
    x: number;
    y: number;
    temperature: 'cold' | 'warm' | 'hot' | 'very_hot';
    description: string;
  }>;
  humanSignatures: number;
  vehicleSignatures: number;
  animalSignatures: number;
  ambientTemperature: string;
}> {
  const _traceId = generateTraceId();

  try {
    const _response = await molly.generate(TaskType.VISION, {
      system: `Analyze this thermal/heat image. Identify:
1. All heat signatures (hotspots) with their approximate positions (normalized 0-1)
2. Temperature classification for each (cold, warm, hot, very_hot)
3. What each hotspot likely represents
4. Count of likely human heat signatures
5. Count of likely vehicle signatures (engines, exhaust)
6. Count of likely animal signatures
7. Overall ambient temperature indication`,
      prompt: 'Analyze this thermal image for heat signatures.',
      images: [imageUri],
    });

    // Parse response (simplified - would use structured output)
    return {
      hotspots: [],
      humanSignatures: 0,
      vehicleSignatures: 0,
      animalSignatures: 0,
      ambientTemperature: 'normal',
    };
  } catch (error) {
    MollyLogger.error(
      'Thermal analysis failed',
      'night-vision',
      {},
      error,
      traceId
    );
    return {
      hotspots: [],
      humanSignatures: 0,
      vehicleSignatures: 0,
      animalSignatures: 0,
      ambientTemperature: 'unknown',
    };
  }
}

// ============================================================
// EXPORTS & SINGLETON
// ============================================================

export const defaultNightVisionConfig: NightVisionConfig = {
  mode: 'enhanced',
  irIntensity: 80,
  enhancementLevel: 70,
  autoAdjust: true,
  gamma: 1.5,
  contrastBoost: 30,
  noiseReduction: 50,
  preserveColor: false,
  irFaceDetection: true,
};

/**
 * Night Vision System - combines all night vision capabilities.
 */
export const NightVisionSystem = {
  enhanceImage: enhanceLowLightImage,
  analyzeLight: analyzeLightConditions,
  detectFaces: detectFacesNightVision,
  recognizeFaces: recognizeFacesNightVision,
  captureIR: captureWithIR,
  monitorNightVision: monitorWithNightVision,
  analyzeThermal: analyzeThermalImage,
  defaultConfig: defaultNightVisionConfig,
};
