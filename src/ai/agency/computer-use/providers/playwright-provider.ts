/**
 * @fileOverview Playwright Provider for Molly's Computer Use
 *
 * Implements both ScreenCaptureProvider and ActionExecutorProvider
 * to give Molly an isolated Chromium browser environment she can
 * control autonomously.
 */

import { chromium, Browser, Page, BrowserContext } from '@playwright/test';
import { MollyLogger, generateTraceId } from '../../../logger';
import {
  ComputerAction,
  ScreenDimensions,
  Environment,
  Screenshot,
} from '../types';
import type { ActionExecutorProvider, ActionResult } from '../action-executor';
import type { ScreenCaptureProvider } from '../screen-capture';

export class PlaywrightComputerUseProvider
  implements ScreenCaptureProvider, ActionExecutorProvider
{
  readonly environment: Environment = 'browser';
  
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isInitializing = false;
  
  // Standard 1080p desktop size
  private dimensions: ScreenDimensions = { width: 1920, height: 1080 };

  async initialize(): Promise<void> {
    if (this.browser || this.isInitializing) return;
    
    this.isInitializing = true;
    const traceId = generateTraceId();
    MollyLogger.info('Initializing Playwright browser for Computer Use', 'computer-use', {}, traceId);
    
    try {
      this.browser = await chromium.launch({
        headless: true, // Keep hidden in server environment
        args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for Docker/Codespaces
      });
      
      this.context = await this.browser.newContext({
        viewport: this.dimensions,
        deviceScaleFactor: 1,
      });
      
      this.page = await this.context.newPage();
      
      // Navigate to a blank page to start
      await this.page.goto('about:blank');
      
      MollyLogger.info('Playwright browser initialized successfully', 'computer-use', {}, traceId);
    } catch (error) {
      MollyLogger.error('Failed to initialize Playwright', 'computer-use', {}, error, traceId);
      await this.cleanup();
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
    } catch (error) {
      console.error('Error during Playwright cleanup:', error);
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.browser && !this.isInitializing) {
      try {
        await this.initialize();
      } catch {
        return false;
      }
    }
    return !!this.page && !this.page.isClosed();
  }

  // --- Screen Capture Implementation ---

  async capture(): Promise<Screenshot> {
    if (!this.page) throw new Error('Browser not initialized');
    
    // Gemini Computer Use relies heavily on seeing the cursor to know where it is.
    // Playwright doesn't render the OS cursor in screenshots, so we must inject a visual indicator
    // if Molly recently clicked or hovered somewhere (not strictly necessary for this v1, but good for future).

    const buffer = await this.page.screenshot({ 
      type: 'jpeg', 
      quality: 80, // High enough for OCR, low enough to keep base64 size manageable
      fullPage: false // Only capture the viewport
    });

    return {
      data: buffer,
      mimeType: 'image/jpeg',
      dimensions: this.dimensions,
      url: this.page.url(),
      timestamp: Date.now(),
    };
  }

  async getDimensions(): Promise<ScreenDimensions> {
    return this.dimensions;
  }

  async getCurrentUrl(): Promise<string | undefined> {
    return this.page?.url();
  }

  // --- Action Executor Implementation ---

  async execute(action: ComputerAction, _dimensions: ScreenDimensions): Promise<ActionResult> {
    if (!this.page) throw new Error('Browser not initialized');
    
    const startTime = performance.now();
    const args = action.args as Record<string, unknown>;
    
    try {
      switch (action.name) {
        case 'navigate':
          if (!args.url) throw new Error('Missing url argument');
          await this.page.goto(args.url as string, { waitUntil: 'domcontentloaded' });
          break;

        case 'click_at':
          if (args.x === undefined || args.y === undefined) throw new Error('Missing x, y arguments');
          // Important: we don't await navigation here because a click MIGHT cause navigation, or it might just open a menu.
          // Playwright handles this gracefully.
          await this.page.mouse.click(args.x, args.y);
          // Small delay to allow UI to react
          await this.page.waitForTimeout(500); 
          break;

        case 'type_text_at':
          if (args.x === undefined || args.y === undefined || args.text === undefined) {
            throw new Error('Missing x, y, or text arguments');
          }
          await this.page.mouse.click(args.x, args.y);
          await this.page.keyboard.type(args.text as string, { delay: 50 }); // Human-like typing speed
          break;

        case 'key_combination':
          if (!args.keys) throw new Error('Missing keys argument');
          // Gemini outputs keys like "Control+A" or "Enter"
          const keyStr = (args.keys as string).replace(/Control/i, 'Control').replace(/Alt/i, 'Alt');
          await this.page.keyboard.press(keyStr);
          await this.page.waitForTimeout(500);
          break;

        case 'scroll_document':
          const dir = args.direction || 'down';
          const distance = 500;
          await this.page.mouse.wheel(0, dir === 'down' ? distance : -distance);
          await this.page.waitForTimeout(500);
          break;

        case 'scroll_at':
          if (args.x === undefined || args.y === undefined) throw new Error('Missing x, y arguments');
          await this.page.mouse.move(args.x, args.y);
          await this.page.mouse.wheel(0, args.direction === 'down' ? 300 : -300);
          await this.page.waitForTimeout(500);
          break;

        case 'go_back':
          await this.page.goBack({ waitUntil: 'domcontentloaded' });
          break;

        case 'go_forward':
          await this.page.goForward({ waitUntil: 'domcontentloaded' });
          break;

        case 'hover_at':
          if (args.x === undefined || args.y === undefined) throw new Error('Missing x, y arguments');
          await this.page.mouse.move(args.x, args.y);
          await this.page.waitForTimeout(300);
          break;

        case 'drag_and_drop':
          if (args.x === undefined || args.y === undefined || args.destination_x === undefined || args.destination_y === undefined) {
            throw new Error('Missing drag coordinates');
          }
          await this.page.mouse.move(args.x, args.y);
          await this.page.mouse.down();
          await this.page.mouse.move(args.destination_x, args.destination_y, { steps: 10 });
          await this.page.mouse.up();
          await this.page.waitForTimeout(500);
          break;

        case 'wait_5_seconds':
          await this.page.waitForTimeout(5000);
          break;

        default:
          throw new Error(`Unsupported action: ${action.name}`);
      }

      return {
        success: true,
        executionTimeMs: performance.now() - startTime,
        newUrl: this.page.url(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: performance.now() - startTime,
        newUrl: this.page.url(),
      };
    }
  }
}
