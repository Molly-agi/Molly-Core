/**
 * @fileOverview Tests for Vision Tools
 *
 * Tests multi-image comparison, screenshot parsing, and document scanning.
 */

import * as visionTools from '../vision-tools';

// Mock dependencies
jest.mock('../../rogue-generate', () => ({
  molly: {
    generate: jest.fn(),
  },
}));

jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
  generateTraceId: () => 'test-trace-id',
}));

const { molly } = jest.requireMock('../../rogue-generate');

describe('Vision Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('compareImages', () => {
    it('should compare two images and return differences', async () => {
      molly.generate.mockResolvedValue({
        output: {
          similarity: 0.75,
          differences: [
            {
              type: 'added',
              description: 'New button in top right',
              significance: 0.8,
            },
            {
              type: 'changed',
              description: 'Header color changed from blue to green',
              significance: 0.6,
            },
          ],
          commonElements: ['Logo', 'Navigation menu', 'Footer'],
          comparisonType: 'before_after',
          summary: 'UI update with new button and color scheme change.',
        },
      });

      const result = await visionTools.compareImages(
        'data:image/png;base64,image1',
        'data:image/png;base64,image2',
        'Comparing UI before and after redesign'
      );

      expect(result.similarity).toBe(0.75);
      expect(result.differences).toHaveLength(2);
      expect(result.differences[0].type).toBe('added');
      expect(result.commonElements).toContain('Logo');
      expect(result.comparisonType).toBe('before_after');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle comparison failure gracefully', async () => {
      molly.generate.mockRejectedValue(new Error('Vision API failed'));

      const result = await visionTools.compareImages(
        'data:image/png;base64,image1',
        'data:image/png;base64,image2'
      );

      expect(result.similarity).toBe(0);
      expect(result.differences).toHaveLength(0);
      expect(result.summary).toContain('Failed');
    });

    it('should handle missing output', async () => {
      molly.generate.mockResolvedValue({ output: null });

      const result = await visionTools.compareImages(
        'data:image/png;base64,image1',
        'data:image/png;base64,image2'
      );

      expect(result.similarity).toBe(0);
    });
  });

  describe('parseScreenshot', () => {
    it('should parse a terminal screenshot', async () => {
      molly.generate.mockResolvedValue({
        output: {
          screenType: 'terminal',
          os: 'linux',
          application: 'bash',
          extractedText: ['npm test', 'PASS src/ai/vision', '714 tests passed'],
          uiElements: [
            {
              type: 'text',
              label: 'Terminal output',
              position: { x: 0.5, y: 0.5 },
              confidence: 0.95,
            },
          ],
          errorsDetected: [],
          suggestedActions: ['Tests passed, ready to commit'],
          description: 'Terminal showing successful test run.',
        },
      });

      const result = await visionTools.parseScreenshot(
        'data:image/png;base64,screenshot'
      );

      expect(result.screenType).toBe('terminal');
      expect(result.os).toBe('linux');
      expect(result.extractedText).toContain('npm test');
      expect(result.errorsDetected).toHaveLength(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should detect errors in a screenshot', async () => {
      molly.generate.mockResolvedValue({
        output: {
          screenType: 'code_editor',
          os: 'macos',
          application: 'VS Code',
          extractedText: ['TypeError: Cannot read property of undefined'],
          uiElements: [],
          errorsDetected: [
            {
              type: 'exception',
              message: 'TypeError: Cannot read property of undefined',
              possibleCause: 'Accessing property on null object',
              suggestedFix: 'Add null check before accessing property',
            },
          ],
          suggestedActions: ['Fix the null reference error'],
          description: 'VS Code showing a TypeError.',
        },
      });

      const result = await visionTools.parseScreenshot(
        'data:image/png;base64,error_screenshot'
      );

      expect(result.screenType).toBe('code_editor');
      expect(result.errorsDetected).toHaveLength(1);
      expect(result.errorsDetected[0].type).toBe('exception');
      expect(result.errorsDetected[0].suggestedFix).toContain('null check');
    });

    it('should handle parsing failure gracefully', async () => {
      molly.generate.mockRejectedValue(new Error('Parse failed'));

      const result = await visionTools.parseScreenshot(
        'data:image/png;base64,bad'
      );

      expect(result.screenType).toBe('other');
      expect(result.extractedText).toHaveLength(0);
      expect(result.description).toContain('Failed');
    });
  });

  describe('detectScreenErrors', () => {
    it('should return errors from a screenshot', async () => {
      molly.generate.mockResolvedValue({
        output: {
          screenType: 'web',
          extractedText: [],
          uiElements: [],
          errorsDetected: [
            { type: 'error', message: '404 Not Found' },
            { type: 'warning', message: 'Deprecated API usage' },
          ],
          suggestedActions: [],
          description: 'Web page with errors.',
        },
      });

      const errors = await visionTools.detectScreenErrors(
        'data:image/png;base64,error_page'
      );

      expect(errors).toHaveLength(2);
      expect(errors[0].message).toBe('404 Not Found');
    });
  });

  describe('scanDocument', () => {
    it('should scan an invoice', async () => {
      molly.generate.mockResolvedValue({
        output: {
          documentType: 'invoice',
          fullText: 'Invoice #12345\nDate: 2026-03-19\nTotal: $150.00',
          fields: [
            {
              name: 'Invoice Number',
              value: '12345',
              type: 'text',
              confidence: 0.95,
            },
            {
              name: 'Date',
              value: '2026-03-19',
              type: 'date',
              confidence: 0.92,
            },
            {
              name: 'Total',
              value: '$150.00',
              type: 'currency',
              confidence: 0.98,
            },
          ],
          tables: [
            {
              headers: ['Item', 'Qty', 'Price'],
              rows: [['Widget', '3', '$50.00']],
              position: { x: 0.2, y: 0.4 },
            },
          ],
          signatures: 0,
          stamps: 1,
          language: 'en',
          confidence: 0.94,
          summary: 'Invoice for widgets totaling $150.',
        },
      });

      const result = await visionTools.scanDocument(
        'data:image/png;base64,invoice',
        'invoice'
      );

      expect(result.documentType).toBe('invoice');
      expect(result.fields).toHaveLength(3);
      expect(result.fields[0].name).toBe('Invoice Number');
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].headers).toContain('Item');
      expect(result.stamps).toBe(1);
      expect(result.confidence).toBe(0.94);
    });

    it('should scan a form with checkboxes', async () => {
      molly.generate.mockResolvedValue({
        output: {
          documentType: 'form',
          fullText: 'Application Form\nName: John Smith\nAccept Terms: [X]',
          fields: [
            {
              name: 'Name',
              value: 'John Smith',
              type: 'text',
              confidence: 0.9,
            },
            {
              name: 'Accept Terms',
              value: 'checked',
              type: 'checkbox',
              confidence: 0.85,
            },
          ],
          tables: [],
          signatures: 1,
          stamps: 0,
          language: 'en',
          confidence: 0.88,
          summary: 'Application form filled out by John Smith.',
        },
      });

      const result = await visionTools.scanDocument(
        'data:image/png;base64,form'
      );

      expect(result.documentType).toBe('form');
      expect(result.fields.find((f) => f.type === 'checkbox')?.value).toBe(
        'checked'
      );
      expect(result.signatures).toBe(1);
    });

    it('should handle scan failure gracefully', async () => {
      molly.generate.mockRejectedValue(new Error('OCR failed'));

      const result = await visionTools.scanDocument(
        'data:image/png;base64,bad'
      );

      expect(result.documentType).toBe('other');
      expect(result.fullText).toBe('');
      expect(result.confidence).toBe(0);
    });
  });

  describe('extractText', () => {
    it('should extract text from document', async () => {
      molly.generate.mockResolvedValue({
        output: {
          documentType: 'printed',
          fullText: 'Hello World\nThis is a test document.',
          fields: [],
          tables: [],
          signatures: 0,
          stamps: 0,
          language: 'en',
          confidence: 0.9,
          summary: 'Simple text document.',
        },
      });

      const text = await visionTools.extractText('data:image/png;base64,doc');

      expect(text).toContain('Hello World');
      expect(text).toContain('test document');
    });
  });

  describe('extractFormFields', () => {
    it('should extract form fields', async () => {
      molly.generate.mockResolvedValue({
        output: {
          documentType: 'form',
          fullText: 'Registration Form',
          fields: [
            {
              name: 'Email',
              value: 'test@example.com',
              type: 'email',
              confidence: 0.95,
            },
            {
              name: 'Phone',
              value: '+1-555-1234',
              type: 'phone',
              confidence: 0.9,
            },
          ],
          tables: [],
          signatures: 0,
          stamps: 0,
          language: 'en',
          confidence: 0.92,
          summary: 'Registration form.',
        },
      });

      const fields = await visionTools.extractFormFields(
        'data:image/png;base64,form'
      );

      expect(fields).toHaveLength(2);
      expect(fields[0].type).toBe('email');
      expect(fields[1].type).toBe('phone');
    });
  });

  describe('describeImage', () => {
    it('should describe an image', async () => {
      molly.generate.mockResolvedValue({
        text: 'A sunset over the ocean with orange and purple clouds.',
      });

      const description = await visionTools.describeImage(
        'data:image/png;base64,sunset'
      );

      expect(description).toContain('sunset');
      expect(description).toContain('ocean');
    });

    it('should handle description failure', async () => {
      molly.generate.mockRejectedValue(new Error('Failed'));

      const description = await visionTools.describeImage(
        'data:image/png;base64,bad'
      );

      expect(description).toContain('Unable to describe');
    });
  });

  describe('imageContains', () => {
    it('should check if image contains specific content', async () => {
      molly.generate.mockResolvedValue({
        text: '{"found": true, "confidence": 0.92, "details": "A cat is visible in the center of the image."}',
      });

      const result = await visionTools.imageContains(
        'data:image/png;base64,pets',
        'a cat'
      );

      expect(result.found).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return false when content not found', async () => {
      molly.generate.mockResolvedValue({
        text: '{"found": false, "confidence": 0.1, "details": "No cat visible, only dogs."}',
      });

      const result = await visionTools.imageContains(
        'data:image/png;base64,dogs',
        'a cat'
      );

      expect(result.found).toBe(false);
    });
  });

  describe('formatComparisonResult', () => {
    it('should format comparison result for display', () => {
      const result: visionTools.ImageComparisonResult = {
        similarity: 0.8,
        differences: [
          { type: 'added', description: 'New header', significance: 0.7 },
        ],
        commonElements: ['Footer', 'Sidebar'],
        comparisonType: 'version_compare',
        summary: 'Minor UI update.',
        processingTimeMs: 250,
      };

      const formatted = visionTools.formatComparisonResult(result);

      expect(formatted).toContain('80%');
      expect(formatted).toContain('ADDED');
      expect(formatted).toContain('New header');
      expect(formatted).toContain('Footer');
      expect(formatted).toContain('250ms');
    });
  });

  describe('formatScreenshotAnalysis', () => {
    it('should format screenshot analysis for display', () => {
      const result: visionTools.ScreenshotAnalysis = {
        screenType: 'terminal',
        os: 'linux',
        extractedText: ['npm test', 'All tests passed'],
        uiElements: [],
        errorsDetected: [],
        suggestedActions: ['Commit the code'],
        description: 'Successful test run.',
        processingTimeMs: 180,
      };

      const formatted = visionTools.formatScreenshotAnalysis(result);

      expect(formatted).toContain('terminal');
      expect(formatted).toContain('linux');
      expect(formatted).toContain('npm test');
      expect(formatted).toContain('Commit the code');
    });

    it('should format with errors', () => {
      const result: visionTools.ScreenshotAnalysis = {
        screenType: 'web',
        extractedText: [],
        uiElements: [],
        errorsDetected: [
          {
            type: 'error',
            message: '500 Internal Server Error',
            possibleCause: 'Backend crash',
          },
        ],
        suggestedActions: [],
        description: 'Server error page.',
        processingTimeMs: 100,
      };

      const formatted = visionTools.formatScreenshotAnalysis(result);

      expect(formatted).toContain('ERROR');
      expect(formatted).toContain('500 Internal Server Error');
      expect(formatted).toContain('Backend crash');
    });
  });

  describe('formatDocumentScan', () => {
    it('should format document scan for display', () => {
      const result: visionTools.DocumentScan = {
        documentType: 'invoice',
        fullText: 'Invoice #123',
        fields: [
          { name: 'Total', value: '$100', type: 'currency', confidence: 0.95 },
        ],
        tables: [],
        signatures: 1,
        stamps: 0,
        language: 'en',
        confidence: 0.9,
        summary: 'Simple invoice.',
        processingTimeMs: 300,
      };

      const formatted = visionTools.formatDocumentScan(result);

      expect(formatted).toContain('invoice');
      expect(formatted).toContain('Total: $100');
      expect(formatted).toContain('currency');
      expect(formatted).toContain('Signatures: 1');
    });
  });

  describe('configureVisionTools', () => {
    it('should allow configuration updates', () => {
      expect(() => {
        visionTools.configureVisionTools({
          maxImageSizeMB: 50,
          defaultConfidenceThreshold: 0.8,
        });
      }).not.toThrow();
    });
  });
});

describe('Type interfaces', () => {
  it('should have correct ImageComparisonResult structure', () => {
    const result: visionTools.ImageComparisonResult = {
      similarity: 0.5,
      differences: [],
      commonElements: [],
      comparisonType: 'scene_change',
      summary: 'Test',
      processingTimeMs: 0,
    };
    expect(result.comparisonType).toBe('scene_change');
  });

  it('should have correct ScreenshotAnalysis structure', () => {
    const result: visionTools.ScreenshotAnalysis = {
      screenType: 'mobile',
      os: 'ios',
      application: 'Safari',
      extractedText: [],
      uiElements: [],
      errorsDetected: [],
      suggestedActions: [],
      description: 'Test',
      processingTimeMs: 0,
    };
    expect(result.os).toBe('ios');
  });

  it('should have correct DocumentScan structure', () => {
    const result: visionTools.DocumentScan = {
      documentType: 'receipt',
      fullText: 'Receipt',
      fields: [],
      tables: [],
      signatures: 0,
      stamps: 0,
      language: 'en',
      confidence: 1,
      summary: 'Test',
      processingTimeMs: 0,
    };
    expect(result.documentType).toBe('receipt');
  });
});
