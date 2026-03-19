/**
 * @fileOverview Vision Tools — Advanced Image Analysis
 *
 * Extended vision capabilities for Molly:
 * - Multi-image comparison (spot differences, track changes)
 * - Screenshot parsing (extract UI elements, text, structure)
 * - Document scanning (OCR, form extraction, structure)
 * - Video frame extraction (key moments, motion detection)
 *
 * "The spider sees all."
 */

import { MollyLogger, generateTraceId } from '../logger';
import { molly } from '../rogue-generate';
import { TaskType } from '../model-router';
import { z } from 'zod';

// ============================================================
// TYPES
// ============================================================

export interface ImageComparisonResult {
  /** Overall similarity score (0-1) */
  similarity: number;
  /** Key differences found */
  differences: Difference[];
  /** Shared elements */
  commonElements: string[];
  /** Category of comparison */
  comparisonType:
    | 'before_after'
    | 'spot_difference'
    | 'version_compare'
    | 'scene_change';
  /** Natural language summary */
  summary: string;
  /** Processing time in ms */
  processingTimeMs: number;
}

export interface Difference {
  /** Type of difference */
  type: 'added' | 'removed' | 'changed' | 'moved';
  /** Description of what changed */
  description: string;
  /** Approximate location in image 1 */
  location1?: { x: number; y: number };
  /** Approximate location in image 2 */
  location2?: { x: number; y: number };
  /** Significance (0-1) */
  significance: number;
}

export interface ScreenshotAnalysis {
  /** Type of application/screen */
  screenType:
    | 'desktop'
    | 'mobile'
    | 'web'
    | 'terminal'
    | 'code_editor'
    | 'other';
  /** Operating system if detectable */
  os?: 'windows' | 'macos' | 'linux' | 'ios' | 'android';
  /** Application name if identifiable */
  application?: string;
  /** All visible text (OCR) */
  extractedText: string[];
  /** UI elements detected */
  uiElements: UIElement[];
  /** Errors or warnings visible */
  errorsDetected: ErrorInfo[];
  /** Suggested actions based on context */
  suggestedActions: string[];
  /** Natural language description */
  description: string;
  /** Processing time in ms */
  processingTimeMs: number;
}

export interface UIElement {
  /** Element type */
  type:
    | 'button'
    | 'input'
    | 'menu'
    | 'dialog'
    | 'notification'
    | 'tab'
    | 'link'
    | 'icon'
    | 'text'
    | 'image'
    | 'other';
  /** Label or text content */
  label?: string;
  /** Approximate position (normalized 0-1) */
  position: { x: number; y: number };
  /** State if applicable */
  state?: 'enabled' | 'disabled' | 'selected' | 'hover' | 'error';
  /** Confidence */
  confidence: number;
}

export interface ErrorInfo {
  /** Type of error */
  type: 'error' | 'warning' | 'info' | 'exception';
  /** Error message text */
  message: string;
  /** Possible cause if identifiable */
  possibleCause?: string;
  /** Suggested fix if known */
  suggestedFix?: string;
}

export interface DocumentScan {
  /** Document type */
  documentType:
    | 'form'
    | 'letter'
    | 'invoice'
    | 'receipt'
    | 'contract'
    | 'id'
    | 'handwritten'
    | 'printed'
    | 'mixed'
    | 'other';
  /** Full OCR text */
  fullText: string;
  /** Structured fields extracted */
  fields: DocumentField[];
  /** Tables found */
  tables: TableData[];
  /** Signatures detected */
  signatures: number;
  /** Stamps/seals detected */
  stamps: number;
  /** Language detected */
  language: string;
  /** Confidence in extraction */
  confidence: number;
  /** Summary of document */
  summary: string;
  /** Processing time in ms */
  processingTimeMs: number;
}

export interface DocumentField {
  /** Field name/label */
  name: string;
  /** Extracted value */
  value: string;
  /** Field type */
  type:
    | 'text'
    | 'date'
    | 'number'
    | 'currency'
    | 'checkbox'
    | 'signature'
    | 'address'
    | 'phone'
    | 'email';
  /** Confidence in extraction */
  confidence: number;
}

export interface TableData {
  /** Table headers */
  headers: string[];
  /** Table rows */
  rows: string[][];
  /** Approximate position */
  position: { x: number; y: number };
}

export interface VideoFrameExtraction {
  /** Key frames extracted */
  keyFrames: KeyFrame[];
  /** Motion events detected */
  motionEvents: MotionEvent[];
  /** Scene changes detected */
  sceneChanges: number[];
  /** Transcript if audio present */
  transcript?: string;
  /** Duration in seconds */
  durationSec: number;
  /** Summary of video content */
  summary: string;
}

export interface KeyFrame {
  /** Timestamp in seconds */
  timestampSec: number;
  /** Frame data URI */
  frameUri: string;
  /** Why this frame was selected */
  reason: string;
  /** Description of frame content */
  description: string;
}

export interface MotionEvent {
  /** Start timestamp */
  startSec: number;
  /** End timestamp */
  endSec: number;
  /** Type of motion */
  type: 'person' | 'vehicle' | 'object' | 'camera' | 'unknown';
  /** Description */
  description: string;
}

// ============================================================
// ZOD SCHEMAS
// ============================================================

const ComparisonSchema = z.object({
  similarity: z.number().min(0).max(1),
  differences: z.array(
    z.object({
      type: z.enum(['added', 'removed', 'changed', 'moved']),
      description: z.string(),
      significance: z.number().min(0).max(1),
    })
  ),
  commonElements: z.array(z.string()),
  comparisonType: z.enum([
    'before_after',
    'spot_difference',
    'version_compare',
    'scene_change',
  ]),
  summary: z.string(),
});

const ScreenshotSchema = z.object({
  screenType: z.enum([
    'desktop',
    'mobile',
    'web',
    'terminal',
    'code_editor',
    'other',
  ]),
  os: z.enum(['windows', 'macos', 'linux', 'ios', 'android']).optional(),
  application: z.string().optional(),
  extractedText: z.array(z.string()),
  uiElements: z.array(
    z.object({
      type: z.enum([
        'button',
        'input',
        'menu',
        'dialog',
        'notification',
        'tab',
        'link',
        'icon',
        'text',
        'image',
        'other',
      ]),
      label: z.string().optional(),
      position: z.object({ x: z.number(), y: z.number() }),
      state: z
        .enum(['enabled', 'disabled', 'selected', 'hover', 'error'])
        .optional(),
      confidence: z.number(),
    })
  ),
  errorsDetected: z.array(
    z.object({
      type: z.enum(['error', 'warning', 'info', 'exception']),
      message: z.string(),
      possibleCause: z.string().optional(),
      suggestedFix: z.string().optional(),
    })
  ),
  suggestedActions: z.array(z.string()),
  description: z.string(),
});

const DocumentSchema = z.object({
  documentType: z.enum([
    'form',
    'letter',
    'invoice',
    'receipt',
    'contract',
    'id',
    'handwritten',
    'printed',
    'mixed',
    'other',
  ]),
  fullText: z.string(),
  fields: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      type: z.enum([
        'text',
        'date',
        'number',
        'currency',
        'checkbox',
        'signature',
        'address',
        'phone',
        'email',
      ]),
      confidence: z.number(),
    })
  ),
  tables: z.array(
    z.object({
      headers: z.array(z.string()),
      rows: z.array(z.array(z.string())),
      position: z.object({ x: z.number(), y: z.number() }),
    })
  ),
  signatures: z.number(),
  stamps: z.number(),
  language: z.string(),
  confidence: z.number(),
  summary: z.string(),
});

// ============================================================
// CONFIGURATION
// ============================================================

interface VisionToolsConfig {
  maxImageSizeMB: number;
  defaultConfidenceThreshold: number;
  enableOCR: boolean;
}

let config: VisionToolsConfig = {
  maxImageSizeMB: 20,
  defaultConfidenceThreshold: 0.7,
  enableOCR: true,
};

export function configureVisionTools(
  updates: Partial<VisionToolsConfig>
): void {
  config = { ...config, ...updates };
}

// ============================================================
// MULTI-IMAGE COMPARISON
// ============================================================

/**
 * Compare two images and identify differences.
 * Useful for before/after comparisons, spotting UI changes, etc.
 */
export async function compareImages(
  image1Uri: string,
  image2Uri: string,
  context?: string
): Promise<ImageComparisonResult> {
  const traceId = generateTraceId();
  const startTime = Date.now();

  MollyLogger.info(
    'Comparing two images',
    'vision-tools',
    { context },
    traceId
  );

  try {
    const response = await molly.generate(TaskType.VISION, {
      system: `You are an expert image analyst. Compare these two images and identify:
1. Overall similarity (0-1 where 1 is identical)
2. Specific differences (what was added, removed, changed, or moved)
3. Common elements between both images
4. The type of comparison this represents

Be precise about locations and changes. Focus on meaningful differences, not minor artifacts.`,
      prompt: context
        ? `Compare these images with this context: ${context}\n\nAnalyze the differences between Image 1 and Image 2.`
        : 'Compare these two images and identify all differences between them.',
      images: [image1Uri, image2Uri],
      output: { schema: ComparisonSchema },
    });

    if (!response.output) {
      throw new Error('No comparison output received');
    }

    const result = response.output;

    MollyLogger.info(
      'Image comparison complete',
      'vision-tools',
      {
        similarity: result.similarity,
        differenceCount: result.differences.length,
      },
      traceId
    );

    return {
      ...result,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    MollyLogger.error(
      'Image comparison failed',
      'vision-tools',
      {},
      error,
      traceId
    );

    return {
      similarity: 0,
      differences: [],
      commonElements: [],
      comparisonType: 'spot_difference',
      summary: 'Failed to compare images.',
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// ============================================================
// SCREENSHOT PARSING
// ============================================================

/**
 * Parse a screenshot to extract UI elements, text, and context.
 * Identifies errors, suggests actions, understands application state.
 */
export async function parseScreenshot(
  imageUri: string,
  context?: string
): Promise<ScreenshotAnalysis> {
  const traceId = generateTraceId();
  const startTime = Date.now();

  MollyLogger.info('Parsing screenshot', 'vision-tools', { context }, traceId);

  try {
    const response = await molly.generate(TaskType.VISION, {
      system: `You are an expert UI/UX analyst with deep knowledge of operating systems and applications.

Analyze this screenshot and extract:
1. Screen type (desktop, mobile, web, terminal, code editor)
2. Operating system if identifiable
3. Application name if recognizable
4. All visible text (OCR everything important)
5. UI elements (buttons, inputs, dialogs, menus, notifications)
6. Any errors, warnings, or exception messages visible
7. Suggested actions based on what you see

Be thorough with text extraction. Identify UI elements by their apparent function.
For errors, try to identify the cause and suggest fixes if possible.`,
      prompt: context
        ? `Analyze this screenshot with context: ${context}`
        : 'Analyze this screenshot and extract all relevant information.',
      images: [imageUri],
      output: { schema: ScreenshotSchema },
    });

    if (!response.output) {
      throw new Error('No screenshot analysis output received');
    }

    const result = response.output;

    MollyLogger.info(
      'Screenshot parsed',
      'vision-tools',
      {
        screenType: result.screenType,
        textCount: result.extractedText.length,
        elementCount: result.uiElements.length,
        errorCount: result.errorsDetected.length,
      },
      traceId
    );

    return {
      ...result,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    MollyLogger.error(
      'Screenshot parsing failed',
      'vision-tools',
      {},
      error,
      traceId
    );

    return {
      screenType: 'other',
      extractedText: [],
      uiElements: [],
      errorsDetected: [],
      suggestedActions: [],
      description: 'Failed to parse screenshot.',
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Quick check for errors in a screenshot.
 * Optimized path for debugging workflows.
 */
export async function detectScreenErrors(
  imageUri: string
): Promise<ErrorInfo[]> {
  const traceId = generateTraceId();

  try {
    const result = await parseScreenshot(
      imageUri,
      'Focus on finding errors, warnings, and exceptions.'
    );
    return result.errorsDetected;
  } catch (error) {
    MollyLogger.error(
      'Error detection failed',
      'vision-tools',
      {},
      error,
      traceId
    );
    return [];
  }
}

// ============================================================
// DOCUMENT SCANNING
// ============================================================

/**
 * Scan a document image and extract structured information.
 * Handles forms, invoices, receipts, contracts, IDs, etc.
 */
export async function scanDocument(
  imageUri: string,
  expectedType?: DocumentScan['documentType']
): Promise<DocumentScan> {
  const traceId = generateTraceId();
  const startTime = Date.now();

  MollyLogger.info(
    'Scanning document',
    'vision-tools',
    { expectedType },
    traceId
  );

  try {
    const typeHint = expectedType
      ? `This appears to be a ${expectedType}.`
      : '';

    const response = await molly.generate(TaskType.VISION, {
      system: `You are an expert document analyst and OCR specialist.

Analyze this document image and extract:
1. Document type (form, letter, invoice, receipt, contract, ID, handwritten, printed, mixed)
2. Full text transcription (OCR everything visible)
3. Structured fields (name-value pairs like "Name: John Smith")
4. Tables with their headers and data
5. Count of signatures and stamps/seals
6. Primary language
7. Confidence in your extraction

For fields, identify the type:
- text: General text
- date: Dates in any format
- number: Numeric values
- currency: Money amounts
- checkbox: Yes/no or checked/unchecked
- signature: Signature fields
- address: Physical addresses
- phone: Phone numbers
- email: Email addresses

Be thorough with OCR. Preserve formatting where meaningful.`,
      prompt: `${typeHint}Scan this document and extract all information.`,
      images: [imageUri],
      output: { schema: DocumentSchema },
    });

    if (!response.output) {
      throw new Error('No document scan output received');
    }

    const result = response.output;

    MollyLogger.info(
      'Document scanned',
      'vision-tools',
      {
        documentType: result.documentType,
        fieldCount: result.fields.length,
        tableCount: result.tables.length,
        textLength: result.fullText.length,
      },
      traceId
    );

    return {
      ...result,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    MollyLogger.error(
      'Document scanning failed',
      'vision-tools',
      {},
      error,
      traceId
    );

    return {
      documentType: 'other',
      fullText: '',
      fields: [],
      tables: [],
      signatures: 0,
      stamps: 0,
      language: 'unknown',
      confidence: 0,
      summary: 'Failed to scan document.',
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Extract just the text from a document (simple OCR).
 */
export async function extractText(imageUri: string): Promise<string> {
  const traceId = generateTraceId();

  try {
    const result = await scanDocument(imageUri);
    return result.fullText;
  } catch (error) {
    MollyLogger.error(
      'Text extraction failed',
      'vision-tools',
      {},
      error,
      traceId
    );
    return '';
  }
}

/**
 * Extract structured fields from a form.
 */
export async function extractFormFields(
  imageUri: string
): Promise<DocumentField[]> {
  const traceId = generateTraceId();

  try {
    const result = await scanDocument(imageUri, 'form');
    return result.fields;
  } catch (error) {
    MollyLogger.error(
      'Form field extraction failed',
      'vision-tools',
      {},
      error,
      traceId
    );
    return [];
  }
}

// ============================================================
// QUICK ANALYSIS HELPERS
// ============================================================

/**
 * Quick image description without structured extraction.
 */
export async function describeImage(imageUri: string): Promise<string> {
  const traceId = generateTraceId();

  try {
    const response = await molly.generate(TaskType.VISION, {
      system: 'Describe this image concisely but completely.',
      prompt: 'What do you see in this image?',
      images: [imageUri],
    });

    return response.text;
  } catch (error) {
    MollyLogger.error(
      'Image description failed',
      'vision-tools',
      {},
      error,
      traceId
    );
    return 'Unable to describe image.';
  }
}

/**
 * Check if an image contains specific content.
 */
export async function imageContains(
  imageUri: string,
  query: string
): Promise<{ found: boolean; confidence: number; details: string }> {
  const traceId = generateTraceId();

  try {
    const response = await molly.generate(TaskType.VISION, {
      system: `You are checking if an image contains specific content.
Return a JSON object with:
- found: boolean
- confidence: number (0-1)
- details: string explaining what you found or didn't find`,
      prompt: `Does this image contain: "${query}"?`,
      images: [imageUri],
    });

    // Parse the response
    const text = response.text;
    const foundMatch = /found["\s:]+true/i.test(text);
    const confidenceMatch = text.match(/confidence["\s:]+(\d+\.?\d*)/i);
    const confidence = confidenceMatch
      ? parseFloat(confidenceMatch[1])
      : foundMatch
        ? 0.8
        : 0.2;

    return {
      found: foundMatch,
      confidence: Math.min(1, confidence),
      details: text,
    };
  } catch (error) {
    MollyLogger.error(
      'Image contains check failed',
      'vision-tools',
      { query },
      error,
      traceId
    );
    return { found: false, confidence: 0, details: 'Check failed.' };
  }
}

// ============================================================
// FORMATTING
// ============================================================

/**
 * Format comparison result for display.
 */
export function formatComparisonResult(result: ImageComparisonResult): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║               IMAGE COMPARISON RESULTS                       ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `Similarity: ${Math.round(result.similarity * 100)}%`,
    `Comparison Type: ${result.comparisonType.replace('_', ' ')}`,
    `Processing Time: ${result.processingTimeMs}ms`,
    '',
  ];

  if (result.differences.length > 0) {
    lines.push('DIFFERENCES FOUND:');
    result.differences.forEach((diff, i) => {
      const sig = Math.round(diff.significance * 100);
      lines.push(
        `  ${i + 1}. [${diff.type.toUpperCase()}] ${diff.description} (${sig}% significant)`
      );
    });
    lines.push('');
  }

  if (result.commonElements.length > 0) {
    lines.push('COMMON ELEMENTS:');
    result.commonElements.forEach((elem) => {
      lines.push(`  • ${elem}`);
    });
    lines.push('');
  }

  lines.push('SUMMARY:');
  lines.push(`  ${result.summary}`);

  return lines.join('\n');
}

/**
 * Format screenshot analysis for display.
 */
export function formatScreenshotAnalysis(result: ScreenshotAnalysis): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║               SCREENSHOT ANALYSIS                            ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `Screen Type: ${result.screenType}`,
  ];

  if (result.os) lines.push(`OS: ${result.os}`);
  if (result.application) lines.push(`Application: ${result.application}`);
  lines.push(`Processing Time: ${result.processingTimeMs}ms`);
  lines.push('');

  if (result.errorsDetected.length > 0) {
    lines.push('⚠️  ERRORS DETECTED:');
    result.errorsDetected.forEach((err) => {
      lines.push(`  [${err.type.toUpperCase()}] ${err.message}`);
      if (err.possibleCause) lines.push(`    Cause: ${err.possibleCause}`);
      if (err.suggestedFix) lines.push(`    Fix: ${err.suggestedFix}`);
    });
    lines.push('');
  }

  if (result.extractedText.length > 0) {
    lines.push('EXTRACTED TEXT:');
    result.extractedText.slice(0, 10).forEach((text) => {
      lines.push(`  "${text}"`);
    });
    if (result.extractedText.length > 10) {
      lines.push(`  ... and ${result.extractedText.length - 10} more`);
    }
    lines.push('');
  }

  if (result.suggestedActions.length > 0) {
    lines.push('SUGGESTED ACTIONS:');
    result.suggestedActions.forEach((action, i) => {
      lines.push(`  ${i + 1}. ${action}`);
    });
    lines.push('');
  }

  lines.push('DESCRIPTION:');
  lines.push(`  ${result.description}`);

  return lines.join('\n');
}

/**
 * Format document scan for display.
 */
export function formatDocumentScan(result: DocumentScan): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║               DOCUMENT SCAN RESULTS                          ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `Document Type: ${result.documentType}`,
    `Language: ${result.language}`,
    `Confidence: ${Math.round(result.confidence * 100)}%`,
    `Processing Time: ${result.processingTimeMs}ms`,
    '',
  ];

  if (result.fields.length > 0) {
    lines.push('EXTRACTED FIELDS:');
    result.fields.forEach((field) => {
      const conf = Math.round(field.confidence * 100);
      lines.push(`  ${field.name}: ${field.value} [${field.type}] (${conf}%)`);
    });
    lines.push('');
  }

  if (result.tables.length > 0) {
    lines.push(`TABLES FOUND: ${result.tables.length}`);
    result.tables.forEach((table, i) => {
      lines.push(
        `  Table ${i + 1}: ${table.headers.join(' | ')} (${table.rows.length} rows)`
      );
    });
    lines.push('');
  }

  if (result.signatures > 0 || result.stamps > 0) {
    lines.push(
      `Signatures: ${result.signatures}, Stamps/Seals: ${result.stamps}`
    );
    lines.push('');
  }

  lines.push('SUMMARY:');
  lines.push(`  ${result.summary}`);

  if (result.fullText) {
    lines.push('');
    lines.push('FULL TEXT:');
    const preview = result.fullText.substring(0, 500);
    lines.push(`  ${preview}${result.fullText.length > 500 ? '...' : ''}`);
  }

  return lines.join('\n');
}
