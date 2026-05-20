/**
 * @fileOverview Vision Tool Handlers
 *
 * Extracted from tool-executor.ts for cleaner modular organization.
 * Handles image analysis, video frame extraction, document scanning.
 */

import {
  compareImages,
  parseScreenshot,
  detectScreenErrors,
  scanDocument,
  extractText,
  extractFormFields,
  describeImage,
  imageContains,
  extractVideoFrames,
  detectMotion,
  detectSceneChanges,
  extractKeyFrames,
  summarizeVideo,
  formatComparisonResult,
  formatScreenshotAnalysis,
  formatDocumentScan,
  formatVideoFrameExtraction,
} from '../../vision/vision-tools';
import type { ToolResult, ToolHandlerMap } from './types';

async function handleVisionTools(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const action = params.action as string;

  switch (action) {
    case 'compare': {
      const image1 = params.image1 as string;
      const image2 = params.image2 as string;
      const context = params.context as string | undefined;

      if (!image1 || !image2) {
        return {
          success: false,
          output: 'Two images required (image1, image2)',
        };
      }

      const result = await compareImages(image1, image2, context);
      return { success: true, output: formatComparisonResult(result) };
    }

    case 'parseScreenshot': {
      const imageUri = params.imageUri as string;
      const context = params.context as string | undefined;

      if (!imageUri) {
        return { success: false, output: 'No imageUri provided' };
      }

      const result = await parseScreenshot(imageUri, context);
      return { success: true, output: formatScreenshotAnalysis(result) };
    }

    case 'detectErrors': {
      const imageUri = params.imageUri as string;

      if (!imageUri) {
        return { success: false, output: 'No imageUri provided' };
      }

      const errors = await detectScreenErrors(imageUri);
      if (errors.length === 0) {
        return {
          success: true,
          output: 'No errors detected in screenshot.',
        };
      }

      const formatted = errors
        .map(
          (e) =>
            `[${e.type.toUpperCase()}] ${e.message}${e.suggestedFix ? ` — Fix: ${e.suggestedFix}` : ''}`
        )
        .join('\n');
      return { success: true, output: `Errors detected:\n${formatted}` };
    }

    case 'scanDocument': {
      const imageUri = params.imageUri as string;
      const docType = params.documentType as string | undefined;

      if (!imageUri) {
        return { success: false, output: 'No imageUri provided' };
      }

      const result = await scanDocument(
        imageUri,
        docType as Parameters<typeof scanDocument>[1]
      );
      return { success: true, output: formatDocumentScan(result) };
    }

    case 'extractText': {
      const imageUri = params.imageUri as string;

      if (!imageUri) {
        return { success: false, output: 'No imageUri provided' };
      }

      const text = await extractText(imageUri);
      return {
        success: true,
        output: text || 'No text extracted from image.',
      };
    }

    case 'extractFormFields': {
      const imageUri = params.imageUri as string;

      if (!imageUri) {
        return { success: false, output: 'No imageUri provided' };
      }

      const fields = await extractFormFields(imageUri);
      if (fields.length === 0) {
        return { success: true, output: 'No form fields extracted.' };
      }

      const formatted = fields
        .map((f) => `${f.name}: ${f.value} [${f.type}]`)
        .join('\n');
      return { success: true, output: `Form Fields:\n${formatted}` };
    }

    case 'describe': {
      const imageUri = params.imageUri as string;

      if (!imageUri) {
        return { success: false, output: 'No imageUri provided' };
      }

      const description = await describeImage(imageUri);
      return { success: true, output: description };
    }

    case 'contains': {
      const imageUri = params.imageUri as string;
      const query = params.query as string;

      if (!imageUri || !query) {
        return { success: false, output: 'Missing imageUri or query' };
      }

      const result = await imageContains(imageUri, query);
      return {
        success: true,
        output: result.found
          ? `Yes, "${query}" found (${Math.round(result.confidence * 100)}% confidence): ${result.details}`
          : `No, "${query}" not found: ${result.details}`,
      };
    }

    case 'extractVideoFrames': {
      const frameUris = params.frameUris as string[];
      const durationSec = params.durationSec as number | undefined;
      const motionTypes = params.motionTypes as string[] | undefined;
      const context = params.context as string | undefined;

      if (!frameUris || frameUris.length === 0) {
        return {
          success: false,
          output: 'No frameUris provided (array of frame image URIs)',
        };
      }

      const result = await extractVideoFrames(frameUris, {
        durationSec,
        motionTypes: motionTypes as Parameters<
          typeof extractVideoFrames
        >[1]['motionTypes'],
        context,
      });
      return { success: true, output: formatVideoFrameExtraction(result) };
    }

    case 'detectMotion': {
      const frameUris = params.frameUris as string[];
      const durationSec = params.durationSec as number | undefined;

      if (!frameUris || frameUris.length === 0) {
        return { success: false, output: 'No frameUris provided' };
      }

      const events = await detectMotion(frameUris, durationSec);
      if (events.length === 0) {
        return { success: true, output: 'No motion events detected.' };
      }

      const formatted = events
        .map(
          (e) =>
            `[${e.startSec.toFixed(1)}s - ${e.endSec.toFixed(1)}s] ${e.type.toUpperCase()}: ${e.description}`
        )
        .join('\n');
      return { success: true, output: `Motion Events:\n${formatted}` };
    }

    case 'detectSceneChanges': {
      const frameUris = params.frameUris as string[];
      const durationSec = params.durationSec as number | undefined;

      if (!frameUris || frameUris.length === 0) {
        return { success: false, output: 'No frameUris provided' };
      }

      const changes = await detectSceneChanges(frameUris, durationSec);
      if (changes.length === 0) {
        return { success: true, output: 'No scene changes detected.' };
      }

      const timestamps = changes.map((t) => `${t.toFixed(1)}s`).join(', ');
      return {
        success: true,
        output: `Scene changes at: ${timestamps}`,
      };
    }

    case 'extractKeyFrames': {
      const frameUris = params.frameUris as string[];
      const durationSec = params.durationSec as number | undefined;
      const maxFrames = (params.maxFrames as number) ?? 5;

      if (!frameUris || frameUris.length === 0) {
        return { success: false, output: 'No frameUris provided' };
      }

      const keyFrames = await extractKeyFrames(
        frameUris,
        durationSec,
        maxFrames
      );
      if (keyFrames.length === 0) {
        return { success: true, output: 'No key frames identified.' };
      }

      const formatted = keyFrames
        .map(
          (kf, i) =>
            `${i + 1}. [${kf.timestampSec.toFixed(1)}s] ${kf.reason}\n   ${kf.description}`
        )
        .join('\n');
      return { success: true, output: `Key Frames:\n${formatted}` };
    }

    case 'summarizeVideo': {
      const frameUris = params.frameUris as string[];
      const durationSec = params.durationSec as number | undefined;

      if (!frameUris || frameUris.length === 0) {
        return { success: false, output: 'No frameUris provided' };
      }

      const summary = await summarizeVideo(frameUris, durationSec);
      return { success: true, output: `Video Summary:\n${summary}` };
    }

    default:
      return {
        success: false,
        output: `Unknown visionTools action: ${action}. Available: compare, parseScreenshot, detectErrors, scanDocument, extractText, extractFormFields, describe, contains, extractVideoFrames, detectMotion, detectSceneChanges, extractKeyFrames, summarizeVideo`,
      };
  }
}

export const visionToolHandlers: ToolHandlerMap = {
  visionTools: handleVisionTools,
};
